const LONG_THINKING_THRESHOLD_MS = 3000

export interface DocumentInfo {
  id: string;
  title: string;
  filename: string;
  url: string;
  content?: string;
  format?: string;
}

export interface DocumentDraftInfo {
  draftId: string;
  title: string;
  format: string;
  preview: string;
  previewAvailable: boolean;
  done: boolean;
}

export function createAssistantPlaceholder(overrides: Record<string, unknown> = {}) {
  return {
    role: 'assistant',
    content: '',
    _streamStartedAt: Date.now(),
    _firstContentAt: null,
    _didLongThinking: false,
    ...overrides,
  }
}

export function assistantHadLongThinking(message: any): boolean {
  if (!message) return false
  if (message._didLongThinking) return true
  return (
    typeof message._streamStartedAt === 'number' &&
    typeof message._firstContentAt === 'number' &&
    message._firstContentAt - message._streamStartedAt >= LONG_THINKING_THRESHOLD_MS
  )
}

export function applyAssistantTextUpdate(message: any, full: string) {
  if (!message) return
  const now = Date.now()
  if (typeof message._streamStartedAt !== 'number') {
    message._streamStartedAt = now
  }
  if (typeof message._firstContentAt !== 'number') {
    message._firstContentAt = now
    if (now - message._streamStartedAt >= LONG_THINKING_THRESHOLD_MS) {
      message._didLongThinking = true
    }
  }
  message.content = full
  message.isThinking = false
}

export function applyAssistantThinkingUpdate(message: any, thinkingFull: string) {
  if (!message) return
  const now = Date.now()
  if (typeof message._streamStartedAt !== 'number') {
    message._streamStartedAt = now
  }
  if (now - message._streamStartedAt >= LONG_THINKING_THRESHOLD_MS) {
    message._didLongThinking = true
  }
  message.thinking = thinkingFull
  message.isThinking = true
  delete message.searchStatus
}

export function normalizeMessageDocuments(message: any): DocumentInfo[] {
  const raw = Array.isArray(message?.documents)
    ? message.documents
    : (message?.document ? [message.document] : [])
  const docs: DocumentInfo[] = []
  const seen = new Set<string>()

  for (const doc of raw) {
    if (!doc || typeof doc !== 'object') continue
    const key = doc.id || doc.url || doc.filename || `${doc.title || 'doc'}-${docs.length}`
    if (seen.has(key)) continue
    seen.add(key)
    docs.push(doc as DocumentInfo)
  }

  const previewExts = ['md', 'txt', 'html', 'json', 'xml', 'yaml', 'yml', 'csv']
  if (Array.isArray(message?.toolCalls)) {
    const fileContents = new Map<string, string>()
    const fileOrder: string[] = []
    for (const toolCall of message.toolCalls) {
      if (toolCall.name === 'Write' && toolCall.input?.file_path && toolCall.input?.content) {
        const filePath = toolCall.input.file_path as string
        fileContents.set(filePath, toolCall.input.content)
        if (!fileOrder.includes(filePath)) fileOrder.push(filePath)
      }
    }
    for (const toolCall of message.toolCalls) {
      if ((toolCall.name === 'Edit' || toolCall.name === 'MultiEdit') && toolCall.input?.file_path && toolCall.input?.old_string != null && toolCall.input?.new_string != null) {
        const filePath = toolCall.input.file_path as string
        const current = fileContents.get(filePath)
        if (current != null) {
          fileContents.set(filePath, current.replaceAll(toolCall.input.old_string, toolCall.input.new_string))
        }
      }
    }
    for (const filePath of fileOrder) {
      const fileName = filePath.split(/[/\\]/).pop() || filePath
      const ext = fileName.split('.').pop()?.toLowerCase() || ''
      if (!previewExts.includes(ext)) continue
      const key = `write-${filePath}`
      if (seen.has(key)) continue
      seen.add(key)
      docs.push({
        id: key,
        title: fileName,
        filename: fileName,
        url: '',
        content: fileContents.get(filePath) || '',
        format: ext === 'md' ? 'markdown' : 'text',
      })
    }
  }

  return docs
}

export function parseInlineArtifactDisplay(content: any): { cleanedContent: string; draft: DocumentDraftInfo | null } | null {
  if (typeof content !== 'string' || !content.includes('<cp_artifact')) return null

  const openMatch = content.match(/<cp_artifact\s+([^>]*)>/i)
  if (!openMatch || openMatch.index === undefined) return null

  const attrsRaw = openMatch[1] || ''
  const title = (attrsRaw.match(/title="([^"]*)"/i)?.[1] || '').trim() || 'Untitled document'
  const format = (attrsRaw.match(/format="([^"]*)"/i)?.[1] || 'markdown').trim() || 'markdown'
  const bodyStart = openMatch.index + openMatch[0].length
  const closeTag = '</cp_artifact>'
  const closeIdx = content.indexOf(closeTag, bodyStart)

  if (closeIdx === -1) {
    const preview = content.slice(bodyStart).replace(/^\n/, '')
    return {
      cleanedContent: content.slice(0, openMatch.index).trim().replace(/\n{3,}/g, '\n\n'),
      draft: {
        draftId: `inline-${title}-${format}`,
        title,
        format,
        preview,
        previewAvailable: preview.length > 0,
        done: false,
      },
    }
  }

  const preview = content.slice(bodyStart, closeIdx).replace(/^\n/, '')
  const before = content.slice(0, openMatch.index)
  const after = content.slice(closeIdx + closeTag.length)
  return {
    cleanedContent: `${before}${after}`.trim().replace(/\n{3,}/g, '\n\n'),
    draft: {
      draftId: `inline-${title}-${format}`,
      title,
      format,
      preview,
      previewAvailable: preview.length > 0,
      done: true,
    },
  }
}

export function sanitizeInlineArtifactMessage(message: any) {
  if (!message || message.role !== 'assistant') return message
  const parsed = parseInlineArtifactDisplay(message.content)
  if (!parsed) return message

  let next = { ...message, content: parsed.cleanedContent }
  if (parsed.draft && normalizeMessageDocuments(next).length === 0) {
    next = mergeDocumentDraftIntoMessage(next, parsed.draft)
  }
  return next
}

export function mergeDocumentsIntoMessage(message: any, incomingDoc?: DocumentInfo | null, incomingDocs?: DocumentInfo[] | null) {
  const merged = [...normalizeMessageDocuments(message)]
  const queue = [
    ...(Array.isArray(incomingDocs) ? incomingDocs : []),
    ...(incomingDoc ? [incomingDoc] : []),
  ]

  for (const doc of queue) {
    if (!doc || typeof doc !== 'object') continue
    const key = doc.id || doc.url || doc.filename || doc.title
    if (!key) continue
    const index = merged.findIndex(item => (item.id || item.url || item.filename || item.title) === key)
    if (index >= 0) merged[index] = doc
    else merged.push(doc)
  }

  if (merged.length === 0) return message
  return { ...message, document: merged[merged.length - 1], documents: merged }
}

export function normalizeDocumentDrafts(message: any): DocumentDraftInfo[] {
  const raw = Array.isArray(message?.documentDrafts) ? message.documentDrafts : []
  const last = raw[raw.length - 1]
  if (!last || typeof last !== 'object') return []
  const key = last.draftId || last.draft_id || last.title || 'draft'
  return [{
    draftId: key,
    title: last.title,
    format: last.format,
    preview: last.preview,
    previewAvailable: last.previewAvailable ?? last.preview_available,
    done: !!last.done,
  }]
}

export function mergeDocumentDraftIntoMessage(message: any, incomingDraft: any) {
  if (!incomingDraft || typeof incomingDraft !== 'object') return message
  const draftId = incomingDraft.draftId || incomingDraft.draft_id || incomingDraft.title
  if (!draftId) return message

  const current = normalizeDocumentDrafts(message)[0] || null
  const nextDraft: DocumentDraftInfo = {
    draftId,
    title: incomingDraft.title,
    format: incomingDraft.format,
    preview: incomingDraft.preview ?? incomingDraft.document?.content,
    previewAvailable: incomingDraft.previewAvailable ?? incomingDraft.preview_available ?? !!incomingDraft.document?.content,
    done: !!incomingDraft.done,
  }
  const merged: DocumentDraftInfo = current
    ? {
      ...current,
      ...nextDraft,
      draftId: current.draftId || nextDraft.draftId,
      title: nextDraft.title || current.title,
      format: nextDraft.format || current.format,
      preview: nextDraft.preview ?? current.preview,
      previewAvailable: nextDraft.previewAvailable ?? current.previewAvailable,
      done: typeof incomingDraft.done === 'boolean' ? incomingDraft.done : current.done,
    }
    : nextDraft

  return { ...message, documentDrafts: [merged] }
}

export function applyGenerationState(message: any, state: any) {
  const toolCalls = Array.isArray(state.tool_calls)
    ? state.tool_calls
    : (Array.isArray(state.toolCalls) ? state.toolCalls : [])
  const toolOrder = Array.isArray(state.tool_order)
    ? state.tool_order
    : (Array.isArray(state.toolOrder) ? state.toolOrder : toolCalls.map((tc: any) => tc?.id).filter(Boolean))
  const lastToolTextOffset = state.last_tool_text_offset ?? state.lastToolTextOffset ?? 0
  const base = {
    ...message,
    content: state.text || message.content,
    thinking: state.thinking || message.thinking,
    thinkingSummary: state.thinkingSummary || state.thinking_summary || message.thinkingSummary,
    citations: state.citations?.length ? state.citations : message.citations,
    searchLogs: state.searchLogs?.length ? state.searchLogs : message.searchLogs,
    isThinking: !state.text && !!state.thinking,
    ...(toolOrder.length ? {
      toolCalls: toolOrder
        .map((id: string) => toolCalls.find((tc: any) => tc?.id === id))
        .filter(Boolean),
      ...(lastToolTextOffset > 0 ? { toolTextEndOffset: lastToolTextOffset } : {}),
    } : {}),
  }
  const withDocuments = mergeDocumentsIntoMessage(base, state.document, state.documents)
  const drafts = Array.isArray(state?.documentDrafts) ? state.documentDrafts : []
  const withDrafts = drafts.length === 0
    ? withDocuments
    : drafts.reduce((acc, draft) => mergeDocumentDraftIntoMessage(acc, draft), withDocuments)
  return sanitizeInlineArtifactMessage(withDrafts)
}
