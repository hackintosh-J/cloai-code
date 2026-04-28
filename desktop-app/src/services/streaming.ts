import { listen } from '@tauri-apps/api/event'
import type { StreamCallbacks } from '../types/api'
import { invokeTauri, isDesktopApp } from '../platform/tauriClient'
import { API_BASE, getToken, getUserProfilePayload, resolveEnvCreds } from './http/apiClient'

interface StreamState {
  fullText: string;
  thinkingText: string;
}

type StreamEventResult = 'continue' | 'done' | 'error'
type DesktopStreamEventKind = 'event' | 'done' | 'error'

interface DesktopStreamPayload {
  conversationId?: string;
  conversation_id?: string;
  streamId?: string;
  stream_id?: string;
  event?: any;
  error?: any;
}

interface DesktopStreamStartResult {
  streamId?: string;
}

interface DesktopStreamReconnectResult extends DesktopStreamStartResult {
  events?: any[];
  done?: boolean;
}

interface PendingFlush {
  textDelta: string;
  thinkingDelta: string;
  scheduled: boolean;
}

function resolveDesktopConversationId(payload: DesktopStreamPayload) {
  return payload.conversationId || payload.conversation_id || ''
}

function resolveDesktopStreamId(payload: DesktopStreamPayload) {
  return payload.streamId || payload.stream_id || ''
}

function processStreamEvent(
  parsed: any,
  state: StreamState,
  pending: PendingFlush,
  callbacks: StreamCallbacks,
  processInlineArtifactText: ReturnType<typeof createInlineArtifactProcessor>,
  completeWithCurrent: () => void,
  failWithMessage: (message: string) => void
): StreamEventResult {
  if (dispatchCommonEvent(parsed, state, callbacks)) {
    return 'continue'
  }

  if (parsed.type === 'content_block_delta' && parsed.delta) {
    if (parsed.delta.type === 'text_delta' && parsed.delta.text) {
      const textChunk = parsed.delta.text
      if (textChunk.includes('<thinking>') || textChunk.includes('</thinking>')) {
        const thinkRegex = /<thinking>([\s\S]*?)<\/thinking>/g
        let match
        while ((match = thinkRegex.exec(textChunk)) !== null) {
          appendThinking(match[1], state, pending, callbacks)
        }
        const cleaned = textChunk.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
        if (cleaned) processInlineArtifactText(cleaned)
      } else {
        processInlineArtifactText(textChunk)
      }
    }
    if (parsed.delta.type === 'thinking_delta' && parsed.delta.thinking) {
      appendThinking(parsed.delta.thinking, state, pending, callbacks)
    }
    return 'continue'
  }

  if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'thinking' && callbacks.onThinking) {
    state.thinkingText = ''
    return 'continue'
  }

  if (parsed.type === 'message_stop') {
    processInlineArtifactText('', true)
    flushPending(state, pending, callbacks)
    return 'continue'
  }

  if (parsed.type === 'error') {
    const detail = parsed.detail ? `\n${parsed.detail}` : ''
    failWithMessage((parsed.error || '未知错误') + detail)
    return 'error'
  }

  return 'continue'
}

function finishDesktopStream(
  state: StreamState,
  pending: PendingFlush,
  callbacks: StreamCallbacks,
  processInlineArtifactText: ReturnType<typeof createInlineArtifactProcessor>,
  onDone: (full: string) => void
) {
  processInlineArtifactText('', true)
  flushPending(state, pending, callbacks)
  onDone(state.fullText)
}

async function trySendMessageViaDesktopStream(
  conversationId: string,
  message: string,
  attachments: any[] | null,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<boolean> {
  if (!isDesktopApp()) return false

  const state: StreamState = { fullText: '', thinkingText: '' }
  const pending: PendingFlush = { textDelta: '', thinkingDelta: '', scheduled: false }
  const processInlineArtifactText = createInlineArtifactProcessor(state, pending, callbacks)

  try {
    const startResult = await invokeTauri<DesktopStreamStartResult>('start_chat_stream', {
      payload: {
        conversationId,
        message,
        attachments: attachments || undefined,
        ...resolveEnvCreds(),
        user_profile: getUserProfilePayload(),
      },
    })
    const streamId = startResult.streamId || ''

    let finished = false
    let unlistenEvent: (() => void) | null = null
    let unlistenDone: (() => void) | null = null
    let unlistenError: (() => void) | null = null

    const cleanup = () => {
      unlistenEvent?.()
      unlistenDone?.()
      unlistenError?.()
      unlistenEvent = null
      unlistenDone = null
      unlistenError = null
    }

    const completeWithCurrent = () => {
      if (finished) return
      finished = true
      cleanup()
      finishDesktopStream(state, pending, callbacks, processInlineArtifactText, callbacks.onDone)
    }

    const failWithMessage = (message: string) => {
      if (finished) return
      finished = true
      cleanup()
      processInlineArtifactText('', true)
      flushPending(state, pending, callbacks)
      callbacks.onError(message)
    }

    const matchesPayload = (payload: DesktopStreamPayload) => {
      if (resolveDesktopConversationId(payload) !== conversationId) return false
      const payloadStreamId = resolveDesktopStreamId(payload)
      return !streamId || !payloadStreamId || payloadStreamId === streamId
    }

    const handleDesktopEventPayload = (payload: DesktopStreamPayload) => {
      if (!matchesPayload(payload) || finished || !payload.event) return
      const result = processStreamEvent(
        payload.event,
        state,
        pending,
        callbacks,
        processInlineArtifactText,
        completeWithCurrent,
        failWithMessage
      )
      if (result !== 'continue') {
        return
      }
    }

    unlistenEvent = await listen<DesktopStreamPayload>('chat_stream_event', ({ payload }) => {
      handleDesktopEventPayload(payload)
    })
    unlistenDone = await listen<DesktopStreamPayload>('chat_stream_done', ({ payload }) => {
      if (!matchesPayload(payload) || finished) return
      completeWithCurrent()
    })
    unlistenError = await listen<DesktopStreamPayload>('chat_stream_error', ({ payload }) => {
      if (!matchesPayload(payload) || finished) return
      failWithMessage(String(payload.error || 'Stream error'))
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        if (finished) return
        completeWithCurrent()
      }, { once: true })
    }

    return await new Promise<boolean>((resolve) => {
      const finishResolve = () => resolve(true)
      const originalDone = callbacks.onDone
      const originalError = callbacks.onError

      callbacks.onDone = (full) => {
        originalDone(full)
        finishResolve()
      }
      callbacks.onError = (err) => {
        originalError(err)
        finishResolve()
      }
    })
  } catch {
    return false
  }
}

async function tryReconnectViaDesktopStream(
  conversationId: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<boolean> {
  if (!isDesktopApp()) return false

  const state: StreamState = { fullText: '', thinkingText: '' }
  const pending: PendingFlush = { textDelta: '', thinkingDelta: '', scheduled: false }
  const processInlineArtifactText = createInlineArtifactProcessor(state, pending, callbacks)

  try {
    const reconnect = await invokeTauri<DesktopStreamReconnectResult>('reconnect_chat_stream', {
      conversationId,
    })
    const streamId = reconnect.streamId || ''

    const completeWithCurrent = () => {
      finishDesktopStream(state, pending, callbacks, processInlineArtifactText, callbacks.onDone)
    }
    const failWithMessage = (message: string) => {
      processInlineArtifactText('', true)
      flushPending(state, pending, callbacks)
      callbacks.onError(message)
    }

    for (const event of reconnect.events || []) {
      const result = processStreamEvent(
        event,
        state,
        pending,
        callbacks,
        processInlineArtifactText,
        completeWithCurrent,
        failWithMessage
      )
      if (result !== 'continue') {
        return true
      }
    }

    if (reconnect.done) {
      completeWithCurrent()
      return true
    }

    let finished = false
    let unlistenEvent: (() => void) | null = null
    let unlistenDone: (() => void) | null = null
    let unlistenError: (() => void) | null = null

    const cleanup = () => {
      unlistenEvent?.()
      unlistenDone?.()
      unlistenError?.()
      unlistenEvent = null
      unlistenDone = null
      unlistenError = null
    }

    const matchesPayload = (payload: DesktopStreamPayload) => {
      if (resolveDesktopConversationId(payload) !== conversationId) return false
      const payloadStreamId = resolveDesktopStreamId(payload)
      return !streamId || !payloadStreamId || payloadStreamId === streamId
    }

    const complete = () => {
      if (finished) return
      finished = true
      cleanup()
      completeWithCurrent()
    }

    const fail = (message: string) => {
      if (finished) return
      finished = true
      cleanup()
      failWithMessage(message)
    }

    unlistenEvent = await listen<DesktopStreamPayload>('chat_stream_event', ({ payload }) => {
      if (!matchesPayload(payload) || finished || !payload.event) return
      const result = processStreamEvent(
        payload.event,
        state,
        pending,
        callbacks,
        processInlineArtifactText,
        complete,
        fail
      )
      if (result === 'done' || result === 'error') {
        return
      }
    })
    unlistenDone = await listen<DesktopStreamPayload>('chat_stream_done', ({ payload }) => {
      if (!matchesPayload(payload) || finished) return
      complete()
    })
    unlistenError = await listen<DesktopStreamPayload>('chat_stream_error', ({ payload }) => {
      if (!matchesPayload(payload) || finished) return
      fail(String(payload.error || 'Reconnect failed'))
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        if (finished) return
        complete()
      }, { once: true })
    }

    return true
  } catch {
    return false
  }
}

function schedulePendingFlush(
  state: StreamState,
  pending: PendingFlush,
  callbacks: StreamCallbacks
) {
  if (pending.scheduled) return
  pending.scheduled = true
  const run = () => flushPending(state, pending, callbacks)
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(run)
  } else {
    setTimeout(run, 16)
  }
}

function flushPending(state: StreamState, pending: PendingFlush, callbacks: StreamCallbacks) {
  pending.scheduled = false
  if (pending.thinkingDelta && callbacks.onThinking) {
    const delta = pending.thinkingDelta
    pending.thinkingDelta = ''
    callbacks.onThinking(delta, state.thinkingText)
  }
  if (pending.textDelta) {
    const delta = pending.textDelta
    pending.textDelta = ''
    callbacks.onDelta(delta, state.fullText)
  }
}

function createInlineArtifactProcessor(
  state: StreamState,
  pending: PendingFlush,
  callbacks: StreamCallbacks
) {
  const openTag = '<cp_artifact'
  const closeTag = '</cp_artifact>'
  let buffer = ''
  let sequence = 0
  let active: null | {
    draft_id: string;
    title: string;
    format: string;
    preview: string;
  } = null

  const appendVisibleText = (text: string) => {
    if (!text) return
    state.fullText += text
    pending.textDelta += text
    schedulePendingFlush(state, pending, callbacks)
  }

  const emitDraft = (done = false) => {
    if (!active || !callbacks.onDocumentDraft) return
    callbacks.onDocumentDraft({
      draft_id: active.draft_id,
      title: active.title,
      format: active.format,
      preview: active.preview,
      preview_available: active.preview.length > 0,
      done,
    })
  }

  const appendPreview = (text: string) => {
    if (!text || !active) return
    active.preview += text
    emitDraft(false)
  }

  const parseAttrs = (tagText: string) => {
    const titleMatch = tagText.match(/title="([^"]*)"/i)
    const formatMatch = tagText.match(/format="([^"]*)"/i)
    return {
      title: (titleMatch?.[1] || '').trim() || 'Untitled document',
      format: (formatMatch?.[1] || 'markdown').trim() || 'markdown',
    }
  }

  return (chunk: string, flushAll = false) => {
    if (!chunk && !flushAll) return
    buffer += chunk

    while (buffer) {
      if (!active) {
        const startIdx = buffer.indexOf(openTag)
        if (startIdx === -1) {
          if (flushAll) {
            appendVisibleText(buffer)
            buffer = ''
          } else {
            const keep = Math.min(buffer.length, openTag.length - 1)
            const emit = buffer.slice(0, buffer.length - keep)
            if (emit) appendVisibleText(emit)
            buffer = buffer.slice(buffer.length - keep)
          }
          break
        }

        if (startIdx > 0) {
          appendVisibleText(buffer.slice(0, startIdx))
          buffer = buffer.slice(startIdx)
        }

        const tagEndIdx = buffer.indexOf('>')
        if (tagEndIdx === -1) {
          if (flushAll) {
            appendVisibleText(buffer)
            buffer = ''
          }
          break
        }

        const attrs = parseAttrs(buffer.slice(0, tagEndIdx + 1))
        sequence += 1
        active = {
          draft_id: `inline-artifact-${sequence}`,
          title: attrs.title,
          format: attrs.format,
          preview: '',
        }
        emitDraft(false)
        buffer = buffer.slice(tagEndIdx + 1)
        continue
      }

      const closeIdx = buffer.indexOf(closeTag)
      if (closeIdx === -1) {
        if (flushAll) {
          appendPreview(buffer)
          buffer = ''
          emitDraft(true)
          active = null
        } else {
          const keep = Math.min(buffer.length, closeTag.length - 1)
          const emit = buffer.slice(0, buffer.length - keep)
          if (emit) appendPreview(emit)
          buffer = buffer.slice(buffer.length - keep)
        }
        break
      }

      if (closeIdx > 0) {
        appendPreview(buffer.slice(0, closeIdx))
      }
      buffer = buffer.slice(closeIdx + closeTag.length)
      emitDraft(true)
      active = null
    }
  }
}

function appendThinking(
  text: string,
  state: StreamState,
  pending: PendingFlush,
  callbacks: StreamCallbacks
) {
  if (!text) return
  state.thinkingText += text
  if (callbacks.onThinking) {
    pending.thinkingDelta += text
    schedulePendingFlush(state, pending, callbacks)
  }
}

function dispatchCommonEvent(parsed: any, state: StreamState, callbacks: StreamCallbacks): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  if (parsed.type === 'system') {
    callbacks.onSystem?.(parsed.event, parsed.message, parsed)
    return true
  }
  if (parsed.type === 'status') {
    callbacks.onSystem?.('status', parsed.message, parsed)
    return true
  }
  if (parsed.type === 'thinking_summary' && parsed.summary) {
    callbacks.onSystem?.('thinking_summary', parsed.summary, parsed)
    return true
  }
  if (parsed.type === 'search_sources') {
    if (callbacks.onCitations && Array.isArray(parsed.sources)) {
      callbacks.onCitations(parsed.sources, parsed.query, parsed.tokens)
    }
    return true
  }
  if (parsed.type === 'document_created' || parsed.type === 'document_updated') {
    if (callbacks.onDocument && parsed.document) {
      callbacks.onDocument(parsed.document)
    }
    return true
  }
  if (parsed.type === 'document_draft') {
    callbacks.onDocumentDraft?.(parsed)
    return true
  }
  if (parsed.type === 'code_execution' || parsed.type === 'code_result') {
    if (!parsed.executionId && parsed.execution_id) parsed.executionId = parsed.execution_id
    callbacks.onCodeExecution?.(parsed)
    return true
  }
  if (parsed.type === 'compact_boundary') {
    callbacks.onSystem?.('compact_boundary', '', parsed)
    return true
  }
  if (parsed.type === 'ask_user') {
    callbacks.onSystem?.('ask_user', '', parsed)
    return true
  }
  if (parsed.type === 'task_event') {
    callbacks.onSystem?.('task_event', '', parsed)
    return true
  }
  if (parsed.type === 'tool_text_offset') {
    callbacks.onSystem?.('tool_text_offset', '', parsed)
    return true
  }
  if (parsed.type === 'tool_use_start') {
    callbacks.onToolUse?.({
      type: 'start',
      tool_use_id: parsed.tool_use_id,
      tool_name: parsed.tool_name,
      tool_input: parsed.tool_input,
      textBefore: parsed.textBefore || '',
    })
    return false
  }
  if (parsed.type === 'tool_use_input') {
    callbacks.onToolUse?.({
      type: 'input',
      tool_use_id: parsed.tool_use_id,
      tool_input: parsed.tool_input,
    })
    return false
  }
  if (parsed.type === 'tool_use_done') {
    callbacks.onToolUse?.({
      type: 'done',
      tool_use_id: parsed.tool_use_id,
      content: parsed.content,
      is_error: parsed.is_error,
    })
    return false
  }
  if (parsed.type && parsed.type.startsWith('research_') && callbacks.onSystem) {
    callbacks.onSystem(parsed.type, '', parsed)
    if (parsed.type === 'research_report_delta' && parsed.text) {
      state.fullText += parsed.text
      callbacks.onDelta(parsed.text, state.fullText)
    }
    return true
  }
  return false
}

function createStreamRuntime(callbacks: StreamCallbacks) {
  const state: StreamState = { fullText: '', thinkingText: '' }
  const pending: PendingFlush = { textDelta: '', thinkingDelta: '', scheduled: false }
  const processInlineArtifactText = createInlineArtifactProcessor(state, pending, callbacks)
  return { state, pending, processInlineArtifactText }
}

function toErrorMessage(err: any, fallback: string) {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (typeof err.message === 'string') return err.message
  if (typeof err.error === 'string') return err.error
  if (typeof err.detail === 'string') return err.detail
  try {
    return JSON.stringify(err)
  } catch {
    return fallback
  }
}

function finishWithDone(
  state: StreamState,
  pending: PendingFlush,
  callbacks: StreamCallbacks,
  processInlineArtifactText: (chunk: string, flushAll?: boolean) => void
) {
  processInlineArtifactText('', true)
  flushPending(state, pending, callbacks)
  callbacks.onDone(state.fullText)
}

function finishWithError(
  parsed: any,
  state: StreamState,
  pending: PendingFlush,
  callbacks: StreamCallbacks,
  processInlineArtifactText: (chunk: string, flushAll?: boolean) => void
): StreamEventResult {
  const detail = parsed.detail ? `\n${parsed.detail}` : ''
  processInlineArtifactText('', true)
  flushPending(state, pending, callbacks)
  callbacks.onError((parsed.error || '未知错误') + detail)
  return 'error'
}

function handleSendStreamEvent(
  parsed: any,
  state: StreamState,
  pending: PendingFlush,
  callbacks: StreamCallbacks,
  processInlineArtifactText: (chunk: string, flushAll?: boolean) => void
): StreamEventResult {
  if (!parsed || typeof parsed !== 'object') return 'continue'
  if (dispatchCommonEvent(parsed, state, callbacks)) return 'continue'

  if (parsed.type === 'content_block_delta' && parsed.delta) {
    if (parsed.delta.type === 'text_delta' && parsed.delta.text) {
      const textChunk = parsed.delta.text
      if (textChunk.includes('<thinking>') || textChunk.includes('</thinking>')) {
        const thinkRegex = /<thinking>([\s\S]*?)<\/thinking>/g
        let match
        while ((match = thinkRegex.exec(textChunk)) !== null) {
          appendThinking(match[1], state, pending, callbacks)
        }
        const cleaned = textChunk.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
        if (cleaned) processInlineArtifactText(cleaned)
      } else {
        processInlineArtifactText(textChunk)
      }
    }
    if (parsed.delta.type === 'thinking_delta' && parsed.delta.thinking) {
      appendThinking(parsed.delta.thinking, state, pending, callbacks)
    }
  }

  if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'thinking' && callbacks.onThinking) {
    state.thinkingText = ''
  }

  if (parsed.type === 'message_stop') {
    processInlineArtifactText('', true)
    flushPending(state, pending, callbacks)
    return 'continue'
  }

  if (parsed.type === 'error') {
    return finishWithError(parsed, state, pending, callbacks, processInlineArtifactText)
  }

  return 'continue'
}

function handleReconnectStreamEvent(
  parsed: any,
  state: StreamState,
  callbacks: StreamCallbacks
): StreamEventResult {
  if (!parsed || typeof parsed !== 'object') return 'continue'
  dispatchCommonEvent(parsed, state, callbacks)

  if (parsed.type === 'content_block_delta' && parsed.delta) {
    if (parsed.delta.type === 'text_delta' && parsed.delta.text) {
      state.fullText += parsed.delta.text
      callbacks.onDelta(parsed.delta.text, state.fullText)
    }
    if (parsed.delta.type === 'thinking_delta' && parsed.delta.thinking && callbacks.onThinking) {
      state.thinkingText += parsed.delta.thinking
      callbacks.onThinking(parsed.delta.thinking, state.thinkingText)
    }
  }
  if (parsed.type === 'message_stop') {
    return 'continue'
  }
  if (parsed.type === 'error') {
    callbacks.onError(parsed.error || 'Stream error')
    return 'error'
  }
  return 'continue'
}

function getDesktopConversationId(payload: DesktopStreamPayload) {
  return payload.conversationId || payload.conversation_id
}

function getDesktopStreamId(payload: DesktopStreamPayload | DesktopStreamStartResult | DesktopStreamReconnectResult) {
  return payload.streamId || (payload as any).stream_id
}

function matchesDesktopStreamPayload(
  payload: DesktopStreamPayload,
  conversationId: string,
  streamId?: string
) {
  if (!payload || getDesktopConversationId(payload) !== conversationId) return false
  const payloadStreamId = getDesktopStreamId(payload)
  return !streamId || !payloadStreamId || payloadStreamId === streamId
}

async function listenDesktopStream(
  onPayload: (kind: DesktopStreamEventKind, payload: DesktopStreamPayload) => void
) {
  const unlisteners = await Promise.all([
    listen<DesktopStreamPayload>('chat_stream_event', (event) => onPayload('event', event.payload)),
    listen<DesktopStreamPayload>('chat_stream_done', (event) => onPayload('done', event.payload)),
    listen<DesktopStreamPayload>('chat_stream_error', (event) => onPayload('error', event.payload)),
  ])

  return () => {
    for (const unlisten of unlisteners) {
      unlisten()
    }
  }
}

function handleDesktopStreamTerminal(
  kind: DesktopStreamEventKind,
  payload: DesktopStreamPayload,
  state: StreamState,
  pending: PendingFlush,
  callbacks: StreamCallbacks,
  processInlineArtifactText: (chunk: string, flushAll?: boolean) => void
): StreamEventResult {
  if (kind === 'done') {
    finishWithDone(state, pending, callbacks, processInlineArtifactText)
    return 'done'
  }
  if (kind === 'error') {
    processInlineArtifactText('', true)
    flushPending(state, pending, callbacks)
    callbacks.onError(toErrorMessage(payload.error, 'Stream error'))
    return 'error'
  }
  return 'continue'
}

async function sendMessageViaDesktop(
  conversationId: string,
  message: string,
  attachments: any[] | null,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
) {
  const { state, pending, processInlineArtifactText } = createStreamRuntime(callbacks)
  const queuedEvents: Array<{ kind: DesktopStreamEventKind; payload: DesktopStreamPayload }> = []
  let streamId: string | undefined
  let ready = false
  let settled = false
  let cleanup = () => {}
  let cleanupAbort = () => {}
  let resolveDone = () => {}

  const finished = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const complete = (notify: () => void) => {
    if (settled) return
    settled = true
    cleanup()
    cleanupAbort()
    notify()
    resolveDone()
  }

  const handlePayload = (kind: DesktopStreamEventKind, payload: DesktopStreamPayload) => {
    if (settled || !matchesDesktopStreamPayload(payload, conversationId, streamId)) return
    if (!ready) {
      queuedEvents.push({ kind, payload })
      return
    }

    const result = kind === 'event'
      ? handleSendStreamEvent(payload.event, state, pending, callbacks, processInlineArtifactText)
      : handleDesktopStreamTerminal(kind, payload, state, pending, callbacks, processInlineArtifactText)

    if (result === 'done' || result === 'error') {
      complete(() => {})
    }
  }

  const onAbort = () => {
    void invokeTauri('stop_generation', { conversationId }).catch(() => {})
    complete(() => callbacks.onDone(state.fullText))
  }

  if (signal?.aborted) {
    onAbort()
    return finished
  }

  try {
    cleanup = await listenDesktopStream(handlePayload)
    signal?.addEventListener('abort', onAbort, { once: true })
    cleanupAbort = () => signal?.removeEventListener('abort', onAbort)
    const result = await invokeTauri<DesktopStreamStartResult>('start_chat_stream', {
      payload: {
        conversation_id: conversationId,
        message,
        attachments: attachments || undefined,
        ...resolveEnvCreds(),
        user_profile: getUserProfilePayload(),
      },
    })
    streamId = getDesktopStreamId(result)
    ready = true

    const queued = queuedEvents.splice(0)
    for (const queuedEvent of queued) {
      handlePayload(queuedEvent.kind, queuedEvent.payload)
      if (settled) break
    }
  } catch (err: any) {
    if (!ready) {
      cleanup()
      cleanupAbort()
      throw err
    }
    if (err.name === 'AbortError') {
      complete(() => callbacks.onDone(state.fullText))
    } else {
      complete(() => callbacks.onError(toErrorMessage(err, 'Stream error')))
    }
  }

  return finished
}

async function reconnectStreamViaDesktop(
  conversationId: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
) {
  const state: StreamState = { fullText: '', thinkingText: '' }
  const queuedEvents: Array<{ kind: DesktopStreamEventKind; payload: DesktopStreamPayload }> = []
  let streamId: string | undefined
  let ready = false
  let settled = false
  let cleanup = () => {}
  let cleanupAbort = () => {}
  let resolveDone = () => {}

  const finished = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const complete = (notify?: () => void) => {
    if (settled) return
    settled = true
    cleanup()
    cleanupAbort()
    notify?.()
    resolveDone()
  }

  const handlePayload = (kind: DesktopStreamEventKind, payload: DesktopStreamPayload) => {
    if (settled || !matchesDesktopStreamPayload(payload, conversationId, streamId)) return
    if (!ready) {
      queuedEvents.push({ kind, payload })
      return
    }

    let result: StreamEventResult = 'continue'
    if (kind === 'event') {
      result = handleReconnectStreamEvent(payload.event, state, callbacks)
    } else if (kind === 'done') {
      callbacks.onDone(state.fullText)
      result = 'done'
    } else {
      callbacks.onError(toErrorMessage(payload.error, 'Stream error'))
      result = 'error'
    }

    if (result === 'done' || result === 'error') {
      complete()
    }
  }

  const onAbort = () => complete()

  if (signal?.aborted) {
    onAbort()
    return finished
  }

  try {
    cleanup = await listenDesktopStream(handlePayload)
    signal?.addEventListener('abort', onAbort, { once: true })
    cleanupAbort = () => signal?.removeEventListener('abort', onAbort)
    const result = await invokeTauri<DesktopStreamReconnectResult>('reconnect_chat_stream', { conversationId })
    streamId = getDesktopStreamId(result)

    for (const event of result.events || []) {
      const eventResult = handleReconnectStreamEvent(event, state, callbacks)
      if (eventResult === 'done' || eventResult === 'error') {
        complete()
        return finished
      }
    }

    ready = true

    if (result.done) {
      complete(() => callbacks.onDone(state.fullText))
      return finished
    }

    const queued = queuedEvents.splice(0)
    for (const queuedEvent of queued) {
      handlePayload(queuedEvent.kind, queuedEvent.payload)
      if (settled) break
    }
  } catch (err: any) {
    if (!ready) {
      cleanup()
      cleanupAbort()
      throw err
    }
    if (err.name !== 'AbortError') {
      complete(() => callbacks.onError(toErrorMessage(err, 'Reconnect failed')))
    } else {
      complete()
    }
  }

  return finished
}

export async function sendMessage(
  conversationId: string,
  message: string,
  attachments: any[] | null,
  onDelta: (delta: string, full: string) => void,
  onDone: (full: string) => void,
  onError: (err: string) => void,
  onThinking?: (thinking: string, full: string) => void,
  onSystem?: (event: string, message: string, data: any) => void,
  onCitations?: (citations: Array<{ url: string; title: string; cited_text?: string }>, query?: string, tokens?: number) => void,
  onDocument?: (document: { id: string; title: string; filename: string; url: string; content?: string; format?: 'markdown' | 'docx' | 'pptx'; slides?: Array<{ title: string; content: string; notes?: string }> }) => void,
  onDocumentDraft?: (draft: { draft_id: string; title?: string; format?: string; preview?: string; preview_available?: boolean; done?: boolean; document?: any }) => void,
  onCodeExecution?: (data: { type: string; executionId: string; code?: string; language?: string; files?: Array<{ id: string; name: string }>; stdout?: string; stderr?: string; images?: string[]; error?: string | null }) => void,
  onToolUse?: (event: { type: 'start' | 'input' | 'done'; tool_use_id: string; tool_name?: string; tool_input?: any; content?: string; is_error?: boolean; textBefore?: string }) => void,
  signal?: AbortSignal
) {
  const callbacks: StreamCallbacks = {
    onDelta,
    onDone,
    onError,
    onThinking,
    onSystem,
    onCitations,
    onDocument,
    onDocumentDraft,
    onCodeExecution,
    onToolUse,
  }

  if (isDesktopApp()) {
    return sendMessageViaDesktop(conversationId, message, attachments, callbacks, signal)
  }

  const { state, pending, processInlineArtifactText } = createStreamRuntime(callbacks)

  try {
    const token = getToken()
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        message,
        attachments: attachments || undefined,
        ...resolveEnvCreds(),
        user_profile: getUserProfilePayload(),
      }),
      signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '请求失败' }))
      onError(err.error || '请求失败')
      return
    }
    if (!res.body) return

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data.trim() === '[DONE]') {
          processInlineArtifactText('', true)
          flushPending(state, pending, callbacks)
          onDone(state.fullText)
          return
        }

        try {
          const parsed = JSON.parse(data)
          const result = handleSendStreamEvent(parsed, state, pending, callbacks, processInlineArtifactText)
          if (result === 'done' || result === 'error') {
            return
          }
        } catch {
          // Ignore non-JSON stream lines.
        }
      }
    }

    processInlineArtifactText('', true)
    flushPending(state, pending, callbacks)
    onDone(state.fullText || '')
  } catch (err: any) {
    if (err.name === 'AbortError') {
      onDone(state.fullText)
      return
    }
    onError(err.message || 'Network error')
  }
}

export function reconnectStream(
  conversationId: string,
  onDelta: (delta: string, full: string) => void,
  onDone: (full: string) => void,
  onError: (err: string) => void,
  onThinking?: (thinking: string, full: string) => void,
  onSystem?: (event: string, message: string, data: any) => void,
  onToolUse?: (event: { type: 'start' | 'input' | 'done'; tool_use_id: string; tool_name?: string; tool_input?: any; content?: string; is_error?: boolean; textBefore?: string }) => void,
  signal?: AbortSignal
): void {
  const callbacks: StreamCallbacks = {
    onDelta,
    onDone,
    onError,
    onThinking,
    onSystem,
    onToolUse,
  }

  if (isDesktopApp()) {
    void reconnectStreamViaDesktop(conversationId, callbacks, signal)
    return
  }

  fallbackReconnect()

  function fallbackReconnect() {
    const state: StreamState = { fullText: '', thinkingText: '' }

    fetch(`${API_BASE}/conversations/${conversationId}/reconnect`, { signal })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          onError('Reconnect failed')
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data.trim() === '[DONE]') {
              onDone(state.fullText)
              return
            }

            try {
              const parsed = JSON.parse(data)
              const result = handleReconnectStreamEvent(parsed, state, callbacks)
              if (result === 'done' || result === 'error') {
                return
              }
            } catch {}
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') onError(err.message || 'Reconnect failed')
      })
  }
}
