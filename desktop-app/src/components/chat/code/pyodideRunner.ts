import { isDesktopApp } from '@/src/desktop';
import { invokeTauri } from '@/src/platform/tauriClient';
import { safeGetStorageItem } from '@/src/utils/safeStorage';

const API_BASE = '/api';
const WORKER_URL = '/runtime/pyodide-worker.js';
const EXECUTION_TIMEOUT_MS = 60_000;

interface CodeResult {
  stdout: string;
  stderr: string;
  images: string[];
  error: string | null;
}

interface PendingExecution {
  resolve: (result: CodeResult) => void;
  reject: (err: Error) => void;
}

type WorkerPayload = {
  type?: string;
  id?: string;
  status?: string;
  stdout?: string;
  stderr?: string;
  images?: string[];
  error?: string | null;
};

let worker: Worker | null = null;
const pendingExecutions = new Map<string, PendingExecution>();
let onStatusChange: ((status: string) => void) | null = null;

function normalizeResult(payload: WorkerPayload): CodeResult {
  return {
    stdout: payload.stdout || '',
    stderr: payload.stderr || '',
    images: payload.images || [],
    error: payload.error || null,
  };
}

function notifyStatus(status?: string) {
  onStatusChange?.(status === 'loading' ? '正在初始化 Python 环境...' : '');
}

function settleAllAsFailed(error: Error) {
  for (const [id, pending] of pendingExecutions) {
    pending.reject(error);
    pendingExecutions.delete(id);
  }
}

function handleWorkerMessage(event: MessageEvent<WorkerPayload>) {
  const payload = event.data;

  if (payload.type === 'status') {
    notifyStatus(payload.status);
    return;
  }

  if (payload.type !== 'result' || !payload.id) return;
  const pending = pendingExecutions.get(payload.id);
  if (!pending) return;

  pendingExecutions.delete(payload.id);
  pending.resolve(normalizeResult(payload));
}

function resetWorkerAfterFailure(event: ErrorEvent) {
  console.error('[PyodideRunner] Worker error:', event);
  settleAllAsFailed(new Error('Worker 崩溃'));
  worker = null;
}

function getWorker(): Worker {
  if (worker) return worker;

  const nextWorker = new Worker(WORKER_URL);
  nextWorker.onmessage = handleWorkerMessage;
  nextWorker.onerror = resetWorkerAfterFailure;
  worker = nextWorker;
  return nextWorker;
}

export function setStatusCallback(cb: (status: string) => void) {
  onStatusChange = cb;
}

export async function executeCode(
  code: string,
  files: Array<{ name: string; url: string }>,
  executionId: string,
): Promise<CodeResult> {
  const activeWorker = getWorker();

  return new Promise<CodeResult>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingExecutions.delete(executionId);
      resolve({ stdout: '', stderr: '代码执行超时（60秒）', images: [], error: 'timeout' });
    }, EXECUTION_TIMEOUT_MS);

    pendingExecutions.set(executionId, {
      resolve: (result) => {
        window.clearTimeout(timer);
        resolve(result);
      },
      reject: (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    });

    activeWorker.postMessage({ type: 'execute', code, files, id: executionId });
  });
}

async function sendNativeCodeResult(executionId: string, result: CodeResult, conversationId?: string) {
  if (!conversationId) {
    console.error('[PyodideRunner] Missing active conversation id for native code result');
    return;
  }

  try {
    await invokeTauri('submit_code_result', {
      conversationId,
      payload: {
        executionId,
        stdout: result.stdout,
        stderr: result.stderr,
        images: result.images,
        error: result.error,
      },
    });
  } catch (err) {
    console.error('[PyodideRunner] Failed to send native code result:', err);
  }
}

async function sendWebCodeResult(executionId: string, result: CodeResult) {
  const token = safeGetStorageItem('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${API_BASE}/code-result`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        executionId,
        stdout: result.stdout,
        stderr: result.stderr,
        images: result.images,
        error: result.error,
      }),
    });
    if (!response.ok) {
      console.error(`[PyodideRunner] Code result upload failed: HTTP ${response.status}`);
    }
  } catch (err) {
    console.error('[PyodideRunner] Failed to send code result:', err);
  }
}

export async function sendCodeResult(executionId: string, result: CodeResult, conversationId?: string): Promise<void> {
  if (isDesktopApp()) {
    await sendNativeCodeResult(executionId, result, conversationId);
    return;
  }

  await sendWebCodeResult(executionId, result);
}
