import { exportDesktopWorkspace, isDesktopApp } from '../desktop'
import { invokeTauri } from '../platform/tauriClient'
import type { ConversationWorkspaceConfig } from '../types/api'
import {
  API_BASE,
  getToken,
  jsonRequest,
  redirectToLogin,
  request,
  resolveEnvCreds,
  getUserProfilePayload,
} from './http/apiClient'

export type { ConversationWorkspaceConfig }

export async function getConversations() {
  if (isDesktopApp()) {
    return invokeTauri('get_conversations')
  }
  return jsonRequest('/conversations')
}

export async function getUserArtifacts() {
  if (isDesktopApp()) {
    return invokeTauri('get_artifacts')
  }
  return jsonRequest('/artifacts')
}

export async function getArtifactContent(filePath: string) {
  if (isDesktopApp()) {
    return invokeTauri('get_artifact_content', { filePath })
  }
  return jsonRequest('/artifacts/content?path=' + encodeURIComponent(filePath))
}

export async function createConversation(
  title?: string,
  model?: string,
  extras?: {
    research_mode?: boolean;
    project_id?: string | null;
    workspace?: ConversationWorkspaceConfig;
  }
) {
  const body: any = { model }
  if (title !== undefined) body.title = title
  if (extras?.research_mode !== undefined) body.research_mode = extras.research_mode
  if (extras?.project_id !== undefined) body.project_id = extras.project_id
  if (extras?.workspace) body.workspace = extras.workspace

  if (isDesktopApp()) {
    return invokeTauri('create_conversation', { payload: body })
  }

  return jsonRequest('/conversations', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getConversation(id: string) {
  if (isDesktopApp()) {
    return invokeTauri('get_conversation', { id })
  }
  return jsonRequest(`/conversations/${id}`)
}

function buildConversationMarkdown(conversation: any) {
  const lines = [`# ${conversation.title || 'Conversation Snapshot'}\n`]
  if (conversation.messages && conversation.messages.length > 0) {
    conversation.messages.forEach((message: any) => {
      const role = message.role === 'user' ? '用户 (User)' : '助手 (Assistant)'
      lines.push(`## ${role} - ${new Date(message.created_at).toLocaleString()}`)
      lines.push(`${message.content}\n`)
      if (message.toolCalls && message.toolCalls.length > 0) {
        lines.push(`> [Tool Executions] ${message.toolCalls.map((tc: any) => tc.name).join(', ')}\n`)
      }
    })
  }
  return lines.join('\n')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function parseDownloadFilename(disposition: string, fallback: string) {
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const plainMatch = disposition.match(/filename="?([^"]+)"?/i)
  return utf8Match ? decodeURIComponent(utf8Match[1]) : (plainMatch ? plainMatch[1] : fallback)
}

export async function exportConversation(id: string): Promise<void> {
  const defaultFilename = `conversation-${id.slice(0, 8)}.zip`

  if (isDesktopApp()) {
    try {
      const conversation = await getConversation(id)
      const result = await exportDesktopWorkspace(id, buildConversationMarkdown(conversation), defaultFilename) as any
      if (result?.success) return
      if (result && !result.success && result.reason !== 'canceled') {
        throw new Error('Local Export Failed')
      }
    } catch (err: any) {
      console.warn('Desktop native export failed, falling back to HTTP download:', err)
    }
  }

  const token = getToken()
  const res = await fetch(`${API_BASE}/conversations/${id}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (res.status === 401) {
    redirectToLogin()
    throw new Error('认证失效')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || '导出失败')
  }
  const filename = parseDownloadFilename(res.headers.get('content-disposition') || '', defaultFilename)
  downloadBlob(await res.blob(), filename)
}

export async function deleteConversation(id: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('conversationDeleting', { detail: { id } }))
  }

  try {
    if (!isDesktopApp()) {
      try {
        await request(`/conversations/${id}/stop-generation`, { method: 'POST' })
      } catch {}
    }

    const result = isDesktopApp()
      ? await invokeTauri('delete_conversation', { id })
      : await request(`/conversations/${id}`, { method: 'DELETE' }).then((res) => res.json())
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('conversationDeleted', { detail: { id } }))
    }
    return result
  } catch (err) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('conversationDeleteFailed', { detail: { id } }))
    }
    throw err
  }
}

export async function updateConversation(id: string, data: any) {
  if (isDesktopApp()) {
    return invokeTauri('update_conversation', { id, payload: data })
  }
  return jsonRequest(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function generateConversationTitle(id: string): Promise<{ ok: boolean; title: string }> {
  if (isDesktopApp()) {
    return invokeTauri('generate_conversation_title', {
      conversationId: id,
      payload: {
        ...resolveEnvCreds(),
      },
    })
  }
  throw new Error('Manual title generation is only available in the desktop app')
}

export async function getGenerationStatus(conversationId: string) {
  if (isDesktopApp()) {
    return invokeTauri('get_generation_status', { conversationId })
  }
  return jsonRequest(`/conversations/${conversationId}/generation-status`)
}

export async function stopGeneration(conversationId: string) {
  if (isDesktopApp()) {
    return invokeTauri('stop_generation', { conversationId })
  }
  return jsonRequest(`/conversations/${conversationId}/stop-generation`, { method: 'POST' })
}

export async function getContextSize(conversationId: string): Promise<{ tokens: number; limit: number }> {
  if (isDesktopApp()) {
    return invokeTauri('get_context_size', { conversationId })
  }
  return jsonRequest(`/conversations/${conversationId}/context-size`)
}

export async function compactConversation(
  id: string,
  instruction?: string
): Promise<{ summary: string; tokensSaved: number; messagesCompacted: number }> {
  if (isDesktopApp()) {
    return invokeTauri('compact_conversation', {
      conversationId: id,
      payload: {
        instruction,
        ...resolveEnvCreds(),
      },
    })
  }
  return jsonRequest(`/conversations/${id}/compact`, {
    method: 'POST',
    body: JSON.stringify({
      instruction,
      ...resolveEnvCreds(),
    }),
  })
}

export async function answerUserQuestion(
  conversationId: string,
  requestId: string,
  toolUseId: string,
  answers: Record<string, string>
): Promise<{ ok: boolean }> {
  if (isDesktopApp()) {
    return invokeTauri('answer_user_question', {
      conversationId,
      payload: {
        requestId,
        toolUseId,
        answers,
      },
    })
  }
  return jsonRequest(`/conversations/${conversationId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ request_id: requestId, tool_use_id: toolUseId, answers }),
  })
}

export function warmEngine(conversationId: string): void {
  if (isDesktopApp()) {
    invokeTauri('warm_engine', {
      conversationId,
      payload: {
        ...resolveEnvCreds(),
        user_profile: getUserProfilePayload(),
      },
    }).catch(() => {})
    return
  }

  request(`/conversations/${conversationId}/warm`, {
    method: 'POST',
    body: JSON.stringify({
      ...resolveEnvCreds(),
      user_profile: getUserProfilePayload(),
    }),
  }).catch(() => {})
}

export async function getStreamStatus(conversationId: string): Promise<{ active: boolean; eventCount: number }> {
  if (isDesktopApp()) {
    return invokeTauri('get_stream_status', { conversationId })
  }
  return jsonRequest(`/conversations/${conversationId}/stream-status`)
}

export async function deleteMessagesFrom(
  conversationId: string,
  messageId: string,
  preserveAttachmentIds?: string[]
) {
  if (isDesktopApp()) {
    return invokeTauri('delete_messages_from', {
      conversationId,
      messageId,
      payload: preserveAttachmentIds && preserveAttachmentIds.length > 0
        ? { preserveAttachmentIds }
        : undefined,
    })
  }

  return jsonRequest(`/conversations/${conversationId}/messages/${messageId}`, {
    method: 'DELETE',
    body: preserveAttachmentIds && preserveAttachmentIds.length > 0
      ? JSON.stringify({ preserve_attachment_ids: preserveAttachmentIds })
      : undefined,
  })
}

export async function deleteMessagesTail(
  conversationId: string,
  count: number,
  preserveAttachmentIds?: string[]
) {
  if (isDesktopApp()) {
    return invokeTauri('delete_messages_tail', {
      conversationId,
      count,
      payload: preserveAttachmentIds && preserveAttachmentIds.length > 0
        ? { preserveAttachmentIds }
        : undefined,
    })
  }

  return jsonRequest(`/conversations/${conversationId}/messages-tail/${count}`, {
    method: 'DELETE',
    body: preserveAttachmentIds && preserveAttachmentIds.length > 0
      ? JSON.stringify({ preserve_attachment_ids: preserveAttachmentIds })
      : undefined,
  })
}
