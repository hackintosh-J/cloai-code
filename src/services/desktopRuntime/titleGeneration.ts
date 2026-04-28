import { setClientType, setIsInteractive } from '../../bootstrap/state.js'
import { applyExtraCACertsFromConfig } from '../../utils/caCertsConfig.js'
import { enableConfigs } from '../../utils/config.js'
import { errorMessage } from '../../utils/errors.js'
import {
  applyConfigEnvironmentVariables,
  applySafeConfigEnvironmentVariables,
} from '../../utils/managedEnv.js'
import { configureGlobalMTLS } from '../../utils/mtls.js'
import { generateSessionTitle } from '../../utils/sessionTitle.js'

type DesktopTitleRequest = {
  description?: unknown
  model?: unknown
  timeoutMs?: unknown
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

async function readStdin(): Promise<string> {
  let content = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    content += chunk
  }
  return content
}

function parseTimeoutMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, 60_000)
    : 30_000
}

function configureDesktopTitleRuntime(): void {
  process.env.CLAUDE_CODE_ENTRYPOINT ??= 'claude-desktop'
  process.env.NoDefaultCurrentDirectoryInExePath = '1'
  setIsInteractive(false)
  setClientType('claude-desktop')

  enableConfigs()
  applySafeConfigEnvironmentVariables()
  applyExtraCACertsFromConfig()
  configureGlobalMTLS()
  applyConfigEnvironmentVariables()
}

export async function runDesktopTitleGeneration(): Promise<void> {
  try {
    const request = JSON.parse(await readStdin()) as DesktopTitleRequest
    const description =
      typeof request.description === 'string' ? request.description : ''
    const model = typeof request.model === 'string' ? request.model.trim() : ''
    if (!description.trim()) {
      writeJson({
        ok: false,
        title: null,
        error: 'Missing title description',
      })
      process.exitCode = 1
      return
    }

    configureDesktopTitleRuntime()

    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      parseTimeoutMs(request.timeoutMs),
    )
    try {
      const title = await generateSessionTitle(description, controller.signal, {
        ...(model ? { model } : {}),
        querySource: 'desktop_generate_conversation_title',
      })
      writeJson({ ok: true, title })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    writeJson({ ok: false, title: null, error: errorMessage(error) })
    process.exitCode = 1
  }
}
