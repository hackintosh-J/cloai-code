import { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { createHash } from 'crypto'
import { type ProviderConfig, getActiveProviderConfig, readCustomApiStorage, writeCustomApiStorage } from '../../utils/customApiStorage.js'
import { logEvent } from '../analytics/index.js'
import { splitSysPromptPrefix } from '../../utils/api.js'
import { getOpenAIReasoningConfig } from '../../utils/modelReasoning.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { ensureToolResultPairing } from '../../utils/messages.js'
import {
  enableAllGitHubCopilotModels,
  getGitHubCopilotBaseUrl,
  refreshGitHubCopilotToken,
} from '../oauth/githubCopilot.js'

import { fetchOpenAICodexModels, refreshOpenAIOAuthToken } from '../oauth/client.js'

export async function refreshOpenAIProviderOAuthIfNeeded(): Promise<ProviderConfig> {
  const storage = readCustomApiStorage()
  const provider = getActiveProviderConfig(storage)
  if (
    !provider ||
    provider.kind !== 'openai-like' ||
    (provider.variant !== 'openai-oauth' && provider.authMode !== 'oauth')
  ) {
    throw new Error('Active OpenAI OAuth provider not found')
  }
  const oauth = provider.oauth as { accessToken?: string; refreshToken?: string; expiresAt?: number; accountId?: string } | undefined
  // No oauth metadata stored (legacy) — use apiKey as-is
  if (!oauth?.accessToken) {
    return provider
  }
  // Token still valid
  if (!oauth.expiresAt || oauth.expiresAt > Date.now()) {
    return provider
  }
  // Expired but no refresh token — use apiKey as-is (will likely 401)
  if (!oauth.refreshToken) {
    return provider
  }

  const refreshed = await refreshOpenAIOAuthToken({
    refreshToken: oauth.refreshToken,
  })

  // Also refresh the model list (non-fatal if it fails)
  let freshModels: string[] | undefined
  if (oauth.accountId) {
    try {
      freshModels = await fetchOpenAICodexModels({
        accessToken: refreshed.accessToken,
        accountId: oauth.accountId,
      })
    } catch {
      // Keep existing models
    }
  }

  const providers = (storage.providers ?? []).map(item =>
    item.kind === provider.kind &&
    item.id === provider.id &&
    item.authMode === provider.authMode &&
    item.variant === provider.variant
      ? {
          ...item,
          apiKey: refreshed.accessToken,
          models: freshModels ?? item.models,
          oauth: {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: refreshed.expiresAt,
            accountId: oauth.accountId,
          },
        }
      : item,
  )

  writeCustomApiStorage({
    ...storage,
    apiKey: refreshed.accessToken,
    savedModels: freshModels ?? storage.savedModels,
    providers,
  })

  // Update process env so downstream code picks up the new token
  process.env.CLOAI_API_KEY = refreshed.accessToken

  const nextProvider = providers.find(item =>
    item.kind === provider.kind &&
    item.id === provider.id &&
    item.authMode === provider.authMode &&
    item.variant === provider.variant,
  )
  if (!nextProvider) {
    throw new Error('Failed to persist refreshed OpenAI OAuth tokens')
  }
  return nextProvider
}



export async function refreshCopilotProviderIfNeeded(): Promise<ProviderConfig> {
  const storage = readCustomApiStorage()
  const provider = getActiveProviderConfig(storage)
  if (!provider || provider.variant !== 'github-copilot-oauth') {
    throw new Error('Active GitHub Copilot provider not found')
  }
  const oauth = provider.oauth as {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    enterpriseDomain?: string
  } | undefined
  if (!oauth?.accessToken) {
    return provider
  }
  if (!oauth.expiresAt || oauth.expiresAt > Date.now()) {
    return provider
  }
  if (!oauth.refreshToken) {
    return provider
  }

  const refreshed = await refreshGitHubCopilotToken(
    oauth.refreshToken,
    oauth.enterpriseDomain,
  )
  const nextBaseURL = getGitHubCopilotBaseUrl(
    refreshed.accessToken,
    oauth.enterpriseDomain,
  )
  const freshModels = await enableAllGitHubCopilotModels(
    refreshed.accessToken,
    oauth.enterpriseDomain,
  ).catch(() => provider.models)

  const providers = (storage.providers ?? []).map(item =>
    item.kind === provider.kind &&
    item.id === provider.id &&
    item.authMode === provider.authMode &&
    item.variant === provider.variant
      ? {
          ...item,
          apiKey: refreshed.accessToken,
          baseURL: nextBaseURL,
          models: freshModels ?? item.models,
          oauth: {
            ...item.oauth,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: refreshed.expiresAt,
            enterpriseDomain: oauth.enterpriseDomain,
          },
        }
      : item,
  )

  writeCustomApiStorage({
    ...storage,
    apiKey: refreshed.accessToken,
    baseURL: nextBaseURL,
    savedModels: freshModels ?? storage.savedModels,
    providers,
  })
  process.env.CLOAI_API_KEY = refreshed.accessToken
  process.env.ANTHROPIC_BASE_URL = nextBaseURL

  const nextProvider = providers.find(item =>
    item.kind === provider.kind &&
    item.id === provider.id &&
    item.authMode === provider.authMode &&
    item.variant === provider.variant,
  )
  if (!nextProvider) {
    throw new Error('Failed to persist refreshed GitHub Copilot tokens')
  }
  return nextProvider
}

type OpenAICompatConfig = {
  apiKey: string
  baseURL: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

type OpenAICodexConfig = {
  apiKey: string
  baseURL?: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type OpenAIChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | OpenAIChatContentPart[] | null
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
}

type OpenAIChatReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type OpenAIChatRequest = {
  model: string
  messages: OpenAIChatMessage[]
  stream?: boolean
  stream_options?: {
    include_usage?: boolean
  }
  temperature?: number
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters?: unknown
    }
  }>
  tool_choice?: 'auto' | { type: 'function'; function: { name: string } }
  max_tokens?: number
  reasoning_effort?: OpenAIChatReasoningEffort
}

type OpenAICodexInputItem =
  | {
      role: 'user'
      content: OpenAIUserInputPart[]
    }
  | {
      role: 'assistant'
      content: Array<{
        type: 'output_text'
        text: string
      }>
    }
  | {
      type: 'function_call'
      call_id: string
      name: string
      arguments: string
    }
  | {
      type: 'function_call_output'
      call_id: string
      output: string
    }

type OpenAIResponsesInputItem =
  | {
      role: 'user'
      content: OpenAIUserInputPart[]
    }
  | {
      role: 'assistant'
      content: Array<{
        type: 'output_text'
        text: string
      }>
    }
  | {
      type: 'function_call'
      call_id: string
      name: string
      arguments: string
    }
  | {
      type: 'function_call_output'
      call_id: string
      output: string
    }

export type OpenAIResponsesRequest = {
  model: string
  instructions?: string
  input: OpenAIResponsesInputItem[]
  store: false
  stream: true
  prompt_cache_key?: string
  tools?: Array<{
    type: 'function'
    name: string
    description?: string
    parameters?: unknown
  }>
  tool_choice?: 'auto'
  parallel_tool_calls?: boolean
  temperature?: number
  max_output_tokens?: number
  include?: ['reasoning.encrypted_content']
  reasoning?: {
    effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    summary?: 'auto' | 'detailed' | 'concise' | null
  }
}

type OpenAIUserInputPart =
  | {
      type: 'input_text'
      text: string
    }
  | {
      type: 'input_image'
      image_url: string
    }

type ResponsesStreamEvent =
  | CodexResponseCompletedEvent
  | CodexOutputItemAddedEvent
  | CodexOutputTextDeltaEvent
  | CodexReasoningDeltaEvent
  | CodexReasoningDoneEvent
  | CodexFunctionCallArgumentsDeltaEvent
  | CodexFunctionCallArgumentsDoneEvent
  | CodexOutputItemDoneEvent
  | CodexErrorEvent
  | { type: string; [key: string]: unknown }

function shouldDisableParallelToolCalls(): boolean {
  const raw = process.env.CLOAI_OPENAI_PARALLEL_TOOL_CALLS?.trim().toLowerCase()
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
    return false
  }
  return true
}

export type OpenAICodexRequest = {
  model: string
  instructions?: string
  input: OpenAICodexInputItem[]
  store: false
  stream: true
  text: { verbosity: 'low' | 'medium' | 'high' }
  include: ['reasoning.encrypted_content']
  tool_choice: 'auto'
  temperature?: number
  tools?: Array<{
    type: 'function'
    name: string
    description?: string
    parameters?: unknown
  }>
  reasoning?: {
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    summary?: 'auto' | 'concise' | 'detailed' | 'off' | 'on' | null
  }
}

type OpenAIStreamChunk = {
  id?: string
  model?: string
  choices?: Array<{
    index?: number
    delta?: {
      role?: 'assistant'
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      reasoning_text?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
    input_tokens_details?: {
      cached_tokens?: number
    }
  }
}

type OpenAIPrefixFingerprint = {
  requestShape: 'chat' | 'responses' | 'codex'
  model: string
  instructionsHash: string
  instructionsLength: number
  toolsHash: string
  inputPrefixHash: string
  messagesPrefixHash: string
  sharedPrefixItems: number
  totalItems: number
  firstDivergenceIndex: number
  itemSummaries: Array<{
    index: number
    kind: string
    textLength: number
    preview: string
  }>
  promptCacheKey?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    hasInputTokensDetails: boolean
    hasPromptTokensDetails: boolean
  }
}

const pendingPrefixDebugAttachments: OpenAIPrefixFingerprint[] = []
const previousPrefixInputs = new Map<string, string[]>()

function hashStableJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)
}

function serializePrefixItems(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => JSON.stringify(item))
}

function compareWithPreviousPrefix(input: {
  requestShape: 'chat' | 'responses' | 'codex'
  model: string
  items?: unknown
}): {
  sharedPrefixItems: number
  totalItems: number
  firstDivergenceIndex: number
} {
  const serializedItems = serializePrefixItems(input.items)
  const key = `${input.requestShape}:${input.model}`
  const previousItems = previousPrefixInputs.get(key) ?? []
  let sharedPrefixItems = 0

  while (
    sharedPrefixItems < previousItems.length &&
    sharedPrefixItems < serializedItems.length &&
    previousItems[sharedPrefixItems] === serializedItems[sharedPrefixItems]
  ) {
    sharedPrefixItems++
  }

  previousPrefixInputs.set(key, serializedItems)

  return {
    sharedPrefixItems,
    totalItems: serializedItems.length,
    firstDivergenceIndex:
      sharedPrefixItems < serializedItems.length ||
      sharedPrefixItems < previousItems.length
        ? sharedPrefixItems
        : -1,
  }
}

function splitOpenAISystemPrompt(system?: string | Array<{ type?: string; text?: string }>): {
  instructions?: string
  dynamicInstructions?: string
} {
  if (!system) return {}

  const rawBlocks = Array.isArray(system)
    ? system.map(block => block.text ?? '')
    : [system]
  const blocks = splitSysPromptPrefix(asSystemPrompt(rawBlocks))

  const instructions = blocks
    .filter(block => block.cacheScope !== null)
    .map(block => block.text)
    .filter(Boolean)
    .join('\n\n')

  const dynamicInstructions = blocks
    .filter(block => block.cacheScope === null)
    .map(block => block.text)
    .filter(
      block =>
        block &&
        !block.startsWith('x-anthropic-billing-header') &&
        !block.startsWith('You are Claude Code'),
    )
    .join('\n\n')

  return {
    ...(instructions ? { instructions } : {}),
    ...(dynamicInstructions ? { dynamicInstructions } : {}),
  }
}

function appendDynamicInstructionsToTextParts(
  parts: OpenAIUserInputPart[],
  dynamicInstructions?: string,
): void {
  if (!dynamicInstructions) return
  parts.push({
    type: 'input_text',
    text: `<dynamic_system_context>\n${dynamicInstructions}\n</dynamic_system_context>`,
  })
}

function appendDynamicInstructionsToChatMessage(
  messages: OpenAIChatMessage[],
  dynamicInstructions?: string,
): void {
  if (!dynamicInstructions) return

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue
    const part = {
      type: 'text' as const,
      text: `<dynamic_system_context>\n${dynamicInstructions}\n</dynamic_system_context>`,
    }
    if (!message.content) {
      message.content = [part]
    } else if (typeof message.content === 'string') {
      message.content = [{ type: 'text', text: message.content }, part]
    } else {
      message.content.push(part)
    }
    return
  }

  messages.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: `<dynamic_system_context>\n${dynamicInstructions}\n</dynamic_system_context>`,
      },
    ],
  })
}

function appendDynamicInstructionsToResponsesInput(
  input: OpenAIResponsesInputItem[],
  dynamicInstructions?: string,
): void {
  if (!dynamicInstructions) return

  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i]
    if ('role' in item && item.role === 'user') {
      appendDynamicInstructionsToTextParts(item.content, dynamicInstructions)
      return
    }
  }

  input.push({
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: `<dynamic_system_context>\n${dynamicInstructions}\n</dynamic_system_context>`,
      },
    ],
  })
}

function appendDynamicInstructionsToCodexInput(
  input: OpenAICodexInputItem[],
  dynamicInstructions?: string,
): void {
  if (!dynamicInstructions) return

  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i]
    if ('role' in item && item.role === 'user') {
      appendDynamicInstructionsToTextParts(item.content, dynamicInstructions)
      return
    }
  }

  input.push({
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: `<dynamic_system_context>\n${dynamicInstructions}\n</dynamic_system_context>`,
      },
    ],
  })
}

function logOpenAIPrefixFingerprint(input: {
  requestShape: 'chat' | 'responses' | 'codex'
  model: string
  instructions?: string
  tools?: unknown
  inputItems?: unknown
  messages?: unknown
  promptCacheKey?: string
}): void {
  const items = Array.isArray(input.inputItems)
    ? input.inputItems
    : Array.isArray(input.messages)
      ? input.messages
      : []
  const compared = compareWithPreviousPrefix({
    requestShape: input.requestShape,
    model: input.model,
    items,
  })
  const fingerprint: OpenAIPrefixFingerprint = {
    requestShape: input.requestShape,
    model: input.model,
    instructionsHash: input.instructions ? hashStableJson(input.instructions) : '',
    instructionsLength: input.instructions?.length ?? 0,
    toolsHash: input.tools ? hashStableJson(input.tools) : '',
    inputPrefixHash: input.inputItems ? hashStableJson(input.inputItems) : '',
    messagesPrefixHash: input.messages ? hashStableJson(input.messages) : '',
    sharedPrefixItems: compared.sharedPrefixItems,
    totalItems: compared.totalItems,
    firstDivergenceIndex: compared.firstDivergenceIndex,
    itemSummaries: buildPrefixItemSummaries(items),
    promptCacheKey: input.promptCacheKey,
  }
  pendingPrefixDebugAttachments.push(fingerprint)
  logEvent('tengu_openai_prefix_fingerprint', {
    request_shape: fingerprint.requestShape,
    model: fingerprint.model,
    instructions_hash: fingerprint.instructionsHash,
    instructions_length: fingerprint.instructionsLength,
    tools_hash: fingerprint.toolsHash,
    input_prefix_hash: fingerprint.inputPrefixHash,
    messages_prefix_hash: fingerprint.messagesPrefixHash,
    prompt_cache_key: fingerprint.promptCacheKey,
    shared_prefix_items: fingerprint.sharedPrefixItems,
    total_items: fingerprint.totalItems,
    first_divergence_index: fingerprint.firstDivergenceIndex,
  })
}

function summarizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 80)
}

function extractResponsesItemTextLength(item: unknown): {
  kind: string
  textLength: number
  preview: string
} {
  if (!item || typeof item !== 'object') {
    return { kind: typeof item, textLength: 0, preview: '' }
  }

  const record = item as Record<string, unknown>
  if (record.type === 'function_call') {
    const name = typeof record.name === 'string' ? record.name : 'function_call'
    const args = typeof record.arguments === 'string' ? record.arguments : ''
    return {
      kind: `function_call:${name}`,
      textLength: args.length,
      preview: summarizeText(args),
    }
  }

  if (record.type === 'function_call_output') {
    const output = typeof record.output === 'string' ? record.output : ''
    return {
      kind: 'function_call_output',
      textLength: output.length,
      preview: summarizeText(output),
    }
  }

  if (record.role === 'assistant' && Array.isArray(record.content)) {
    const text = record.content
      .flatMap(part => {
        if (!part || typeof part !== 'object') return []
        const typedPart = part as Record<string, unknown>
        return typedPart.type === 'output_text' && typeof typedPart.text === 'string'
          ? [typedPart.text]
          : []
      })
      .join('')
    return {
      kind: 'assistant',
      textLength: text.length,
      preview: summarizeText(text),
    }
  }

  if (record.role === 'user' && Array.isArray(record.content)) {
    const text = record.content
      .flatMap(part => {
        if (!part || typeof part !== 'object') return []
        const typedPart = part as Record<string, unknown>
        return typedPart.type === 'input_text' && typeof typedPart.text === 'string'
          ? [typedPart.text]
          : []
      })
      .join('')
    const imageCount = record.content.filter(part => {
      if (!part || typeof part !== 'object') return false
      return (part as Record<string, unknown>).type === 'input_image'
    }).length
    return {
      kind: imageCount > 0 ? `user(+${imageCount}img)` : 'user',
      textLength: text.length,
      preview: summarizeText(text),
    }
  }

  return {
    kind: 'unknown',
    textLength: 0,
    preview: summarizeText(JSON.stringify(item)),
  }
}

function buildPrefixItemSummaries(items: unknown): OpenAIPrefixFingerprint['itemSummaries'] {
  if (!Array.isArray(items)) return []
  return items.slice(0, 5).map((item, index) => ({
    index,
    ...extractResponsesItemTextLength(item),
  }))
}

export function consumeOpenAIPrefixDebugAttachments(): OpenAIPrefixFingerprint[] {
  return pendingPrefixDebugAttachments.splice(0, pendingPrefixDebugAttachments.length)
}

function attachOpenAIResponsesUsageDebug(usage?: {
  input_tokens?: number
  output_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  input_tokens_details?: {
    cached_tokens?: number
  }
  prompt_tokens_details?: {
    cached_tokens?: number
  }
}): void {
  for (let i = pendingPrefixDebugAttachments.length - 1; i >= 0; i--) {
    const attachment = pendingPrefixDebugAttachments[i]
    if (attachment.requestShape !== 'responses') continue
    attachment.usage = {
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens ?? 0,
      cachedTokens:
        usage?.input_tokens_details?.cached_tokens ??
        usage?.prompt_tokens_details?.cached_tokens ??
        0,
      hasInputTokensDetails: usage?.input_tokens_details !== undefined,
      hasPromptTokensDetails: usage?.prompt_tokens_details !== undefined,
    }
    return
  }
}

type CodexResponseUsage = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  input_tokens_details?: {
    cached_tokens?: number
  }
}

type CodexResponseCompletedEvent = {
  type: 'response.completed'
  response?: {
    id?: string
    status?: string
    usage?: CodexResponseUsage
  }
}

type CodexOutputItemAddedEvent = {
  type: 'response.output_item.added'
  output_index?: number
  item: {
    type: 'message' | 'function_call'
    id?: string
    call_id?: string
    name?: string
    arguments?: string
  }
}

type CodexOutputTextDeltaEvent = {
  type: 'response.output_text.delta'
  delta: string
}
type CodexReasoningDeltaEvent = {
  type: 'response.reasoning_summary_text.delta' | 'response.reasoning_text.delta'
  delta: string
}

type CodexReasoningDoneEvent = {
  type: 'response.reasoning_summary_text.done' | 'response.reasoning_text.done'
}

type CodexFunctionCallArgumentsDeltaEvent = {
  type: 'response.function_call_arguments.delta'
  delta: string
  output_index?: number
  item_id?: string
  id?: string
  call_id?: string
}

type CodexFunctionCallArgumentsDoneEvent = {
  type: 'response.function_call_arguments.done'
  arguments: string
  output_index?: number
  item_id?: string
  id?: string
  call_id?: string
}

type CodexOutputItemDoneEvent = {
  type: 'response.output_item.done'
  output_index?: number
  item: {
    type: 'message' | 'function_call'
    id?: string
    call_id?: string
    name?: string
    arguments?: string
    content?: Array<{
      type?: 'output_text' | 'refusal'
      text?: string
      refusal?: string
    }>
  }
}

type CodexStreamEvent =
  | CodexResponseCompletedEvent
  | CodexOutputItemAddedEvent
  | CodexOutputTextDeltaEvent
  | CodexReasoningDeltaEvent
  | CodexReasoningDoneEvent
  | CodexFunctionCallArgumentsDeltaEvent
  | CodexFunctionCallArgumentsDoneEvent
  | CodexOutputItemDoneEvent
  | CodexErrorEvent
  | { type: string; [key: string]: unknown }

function joinBaseUrl(baseURL: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const normalizedBaseURL = baseURL.trim()
  try {
    return new URL(normalizedPath, `${normalizedBaseURL.replace(/\/$/, '')}/`).toString()
  } catch {
    throw new Error(`Invalid OpenAI-compatible base URL: ${normalizedBaseURL}`)
  }
}


function resolveCodexUrl(baseURL?: string): string {
  const raw = baseURL?.trim() ? baseURL : 'https://chatgpt.com/backend-api'
  const normalized = raw.replace(/\/+$/, '')
  if (normalized.endsWith('/codex/responses')) return normalized
  if (normalized.endsWith('/codex')) return `${normalized}/responses`
  return `${normalized}/codex/responses`
}

function getActiveReasoningConfig(model: string) {
  const storage = readCustomApiStorage()
  const activeProviderId = storage.activeProvider ?? storage.providerId
  return getOpenAIReasoningConfig(
    storage.providerKind,
    storage.activeAuthMode ?? storage.authMode,
    model,
    storage.providers?.find(provider =>
      provider.kind === storage.providerKind &&
      provider.id === activeProviderId &&
      provider.authMode === (storage.activeAuthMode ?? storage.authMode) &&
      provider.variant === storage.variant,
    )?.reasoning,
  )
}

function toBlocks(content: BetaMessageParam['content']): AnyBlock[] {
  return Array.isArray(content)
    ? (content as unknown as AnyBlock[])
    : [{ type: 'text', text: content }]
}

function toDataUrl(mediaType: string, data: string): string {
  return `data:${mediaType};base64,${data}`
}

function mapAnthropicUserBlocksToOpenAIChatContent(
  blocks: AnyBlock[],
): OpenAIChatContentPart[] {
  return blocks.flatMap(block => {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      return [{ type: 'text', text: block.text }]
    }
    if (
      block.type === 'image' &&
      block.source &&
      typeof block.source === 'object' &&
      (block.source as Record<string, unknown>).type === 'base64' &&
      typeof (block.source as Record<string, unknown>).media_type === 'string' &&
      typeof (block.source as Record<string, unknown>).data === 'string'
    ) {
      return [{
        type: 'image_url',
        image_url: {
          url: toDataUrl(
            String((block.source as Record<string, unknown>).media_type),
            String((block.source as Record<string, unknown>).data),
          ),
        },
      }]
    }
    return []
  })
}

function mapAnthropicUserBlocksToOpenAIInputContent(
  blocks: AnyBlock[],
): OpenAIUserInputPart[] {
  return blocks.flatMap(block => {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      return [{ type: 'input_text', text: block.text }]
    }
    if (
      block.type === 'image' &&
      block.source &&
      typeof block.source === 'object' &&
      (block.source as Record<string, unknown>).type === 'base64' &&
      typeof (block.source as Record<string, unknown>).media_type === 'string' &&
      typeof (block.source as Record<string, unknown>).data === 'string'
    ) {
      return [{
        type: 'input_image',
        image_url: toDataUrl(
          String((block.source as Record<string, unknown>).media_type),
          String((block.source as Record<string, unknown>).data),
        ),
      }]
    }
    return []
  })
}

function getToolDefinitions(tools?: BetaToolUnion[]): OpenAIChatRequest['tools'] {
  if (!tools || tools.length === 0) return undefined
  const mapped = tools.flatMap(tool => {
    const record = tool as unknown as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : undefined
    if (!name) return []
    return [{
      type: 'function' as const,
      function: {
        name,
        description:
          typeof record.description === 'string' ? record.description : undefined,
        parameters: record.input_schema,
      },
    }]
  })
  return mapped.length > 0 ? mapped : undefined
}

function getCodexToolDefinitions(tools?: BetaToolUnion[]): OpenAICodexRequest['tools'] {
  if (!tools || tools.length === 0) return undefined
  const mapped = tools.flatMap(tool => {
    const record = tool as unknown as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : undefined
    if (!name) return []
    return [{
      type: 'function' as const,
      name,
      description:
        typeof record.description === 'string' ? record.description : undefined,
      parameters: record.input_schema,
    }]
  })
  return mapped.length > 0 ? mapped : undefined
}

function stripAnthropicSignatureBlocks(
  messages: BetaMessageParam[],
): BetaMessageParam[] {
  let changed = false
  const result = messages.map(message => {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      return message
    }

    const filtered = message.content.filter(block => {
      if (!block || typeof block !== 'object') return true
      const type = 'type' in block ? block.type : undefined
      return (
        type !== 'thinking' &&
        type !== 'redacted_thinking' &&
        type !== 'connector_text'
      )
    })

    if (filtered.length === message.content.length) return message
    changed = true
    return { ...message, content: filtered }
  })

  return changed ? result : messages
}

export function convertAnthropicRequestToOpenAI(input: {
  model: string
  system?: string | Array<{ type?: string; text?: string }>
  messages: BetaMessageParam[]
  tools?: BetaToolUnion[]
  tool_choice?: BetaToolChoiceAuto | BetaToolChoiceTool
  temperature?: number
  max_tokens?: number
}): OpenAIChatRequest {
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim()
  const targetModel = configuredModel || input.model
  const reasoning = getActiveReasoningConfig(targetModel)
  const messages: OpenAIChatMessage[] = []
  const sanitizedMessages = stripAnthropicSignatureBlocks(input.messages)
  const pairedMessages = ensureToolResultPairing(sanitizedMessages)
  const { instructions, dynamicInstructions } = splitOpenAISystemPrompt(
    input.system,
  )
  const toolDefinitions = getToolDefinitions(input.tools)

  if (instructions) {
    messages.push({ role: 'system', content: instructions })
  }

  for (const message of pairedMessages) {
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)

      const toolResults = blocks.filter(block => block.type === 'tool_result')
      for (const result of toolResults) {
        const toolUseId =
          typeof result.tool_use_id === 'string' ? result.tool_use_id : undefined
        const content = result.content
        messages.push({
          role: 'tool',
          tool_call_id: toolUseId,
          content: typeof content === 'string' ? content : JSON.stringify(content),
        })
      }

      const userContent = mapAnthropicUserBlocksToOpenAIChatContent(
        blocks.filter(block => block.type !== 'tool_result') as AnyBlock[],
      )
      if (userContent.length > 0) messages.push({ role: 'user', content: userContent })
      continue
    }

    if (message.role === 'assistant') {
      const blocks = Array.isArray(message.content)
        ? (message.content as unknown as AnyBlock[])
        : []
      const text = blocks
        .filter(block => block.type === 'text')
        .map(block => (typeof block.text === 'string' ? block.text : ''))
        .join('')

      const toolCalls = blocks
        .filter(block => block.type === 'tool_use')
        .map(block => ({
          id: String(block.id),
          type: 'function' as const,
          function: {
            name: String(block.name),
            arguments:
              typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input ?? {}),
          },
        }))

      messages.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
    }
  }

  appendDynamicInstructionsToChatMessage(messages, dynamicInstructions)
  logOpenAIPrefixFingerprint({
    requestShape: 'chat',
    model: targetModel,
    instructions,
    tools: toolDefinitions,
    messages,
  })

  return {
    model: targetModel,
    messages,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    stream_options: { include_usage: true },
    ...(reasoning?.reasoningEffort
      ? {
          reasoning_effort:
            reasoning.reasoningEffort as OpenAIChatRequest['reasoning_effort'],
        }
      : {}),
    ...(toolDefinitions
      ? { tools: toolDefinitions }
      : {}),
    ...(input.tool_choice?.type === 'tool'
      ? {
          tool_choice: {
            type: 'function' as const,
            function: { name: input.tool_choice.name },
          },
        }
      : input.tool_choice?.type === 'auto'
        ? { tool_choice: 'auto' as const }
        : {}),
  }
}

export function convertAnthropicRequestToOpenAICodex(input: {
  model: string
  system?: string | Array<{ type?: string; text?: string }>
  messages: BetaMessageParam[]
  tools?: BetaToolUnion[]
  temperature?: number
}): OpenAICodexRequest {
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim()
  const targetModel = configuredModel || input.model
  const reasoning = getActiveReasoningConfig(targetModel)
  const { instructions, dynamicInstructions } = splitOpenAISystemPrompt(
    input.system,
  )
  const codexInput: OpenAICodexInputItem[] = []
  const sanitizedMessages = stripAnthropicSignatureBlocks(input.messages)
  const pairedMessages = ensureToolResultPairing(sanitizedMessages)
  const toolDefinitions = getCodexToolDefinitions(input.tools)

  for (const message of pairedMessages) {
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)
      let pendingUserContent: OpenAIUserInputPart[] = []
      for (const block of blocks) {
        if (block.type === 'tool_result') {
          pushCodexUserContent(codexInput, pendingUserContent)
          pendingUserContent = []
          const toolUseId =
            typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
          if (!toolUseId) continue
          const content = block.content
          codexInput.push({
            type: 'function_call_output',
            call_id: toolUseId,
            output:
              typeof content === 'string' ? content : JSON.stringify(content),
          })
          continue
        }
        pendingUserContent.push(
          ...mapAnthropicUserBlocksToOpenAIInputContent([block] as AnyBlock[]),
        )
      }
      pushCodexUserContent(codexInput, pendingUserContent)
      continue
    }

    if (message.role === 'assistant') {
      const blocks = Array.isArray(message.content)
        ? (message.content as unknown as AnyBlock[])
        : []
      let pendingText = ''
      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string') {
          pendingText += block.text
          continue
        }
        if (block.type === 'tool_use') {
          pushCodexAssistantContent(codexInput, pendingText)
          pendingText = ''
          codexInput.push({
            type: 'function_call',
            call_id: String(block.id),
            name: String(block.name),
            arguments:
              typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input ?? {}),
          })
        }
      }
      pushCodexAssistantContent(codexInput, pendingText)
    }
  }

  appendDynamicInstructionsToCodexInput(codexInput, dynamicInstructions)

  return {
    model: targetModel,
    ...(instructions ? { instructions } : {}),
    input: codexInput,
    store: false,
    stream: true,
    text: { verbosity: reasoning?.textVerbosity === 'low' || reasoning?.textVerbosity === 'high' ? reasoning.textVerbosity : 'medium' },
    include: ['reasoning.encrypted_content'],
    tool_choice: 'auto',
    ...(reasoning?.reasoningEffort
      ? {
          reasoning: {
            effort: reasoning.reasoningEffort as OpenAICodexRequest['reasoning']['effort'],
            summary: (reasoning.reasoningSummary ?? 'detailed') as OpenAICodexRequest['reasoning']['summary'],
          },
        }
      : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(toolDefinitions
      ? { tools: toolDefinitions }
      : {}),
  }
}

function getResponsesToolDefinitions(
  tools?: BetaToolUnion[],
): OpenAIResponsesRequest['tools'] {
  if (!tools || tools.length === 0) return undefined
  const mapped = tools.flatMap(tool => {
    const record = tool as unknown as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : undefined
    if (!name) return []
    return [{
      type: 'function' as const,
      name,
      description:
        typeof record.description === 'string' ? record.description : undefined,
      parameters: record.input_schema,
    }]
  })
  return mapped.length > 0 ? mapped : undefined
}

function pushResponsesUserContent(
  items: OpenAIResponsesInputItem[],
  parts: OpenAIUserInputPart[],
): void {
  if (parts.length === 0) return
  items.push({
    role: 'user',
    content: parts,
  })
}

function pushCodexUserContent(
  items: OpenAICodexInputItem[],
  parts: OpenAIUserInputPart[],
): void {
  if (parts.length === 0) return
  items.push({
    role: 'user',
    content: parts,
  })
}

function pushResponsesAssistantContent(
  items: OpenAIResponsesInputItem[],
  text: string,
): void {
  if (text.length === 0) return
  items.push({
    role: 'assistant',
    content: [{ type: 'output_text', text }],
  })
}

function pushCodexAssistantContent(
  items: OpenAICodexInputItem[],
  text: string,
): void {
  if (text.length === 0) return
  items.push({
    role: 'assistant',
    content: [{ type: 'output_text', text }],
  })
}

export function convertAnthropicRequestToOpenAIResponses(input: {
  model: string
  system?: string | Array<{ type?: string; text?: string }>
  messages: BetaMessageParam[]
  tools?: BetaToolUnion[]
  tool_choice?: BetaToolChoiceAuto | BetaToolChoiceTool
  temperature?: number
  max_tokens?: number
}): OpenAIResponsesRequest {
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim()
  const targetModel = configuredModel || input.model
  const reasoning = getActiveReasoningConfig(targetModel)
  const { instructions, dynamicInstructions } = splitOpenAISystemPrompt(
    input.system,
  )
  const responseInput: OpenAIResponsesInputItem[] = []
  const sanitizedMessages = stripAnthropicSignatureBlocks(input.messages)
  const pairedMessages = ensureToolResultPairing(sanitizedMessages)
  const toolDefinitions = getResponsesToolDefinitions(input.tools)

  for (const message of pairedMessages) {
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)
      let pendingUserContent: OpenAIUserInputPart[] = []
      for (const block of blocks) {
        if (block.type === 'tool_result') {
          pushResponsesUserContent(responseInput, pendingUserContent)
          pendingUserContent = []
          const toolUseId =
            typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
          if (!toolUseId) continue
          const content = block.content
          responseInput.push({
            type: 'function_call_output',
            call_id: toolUseId,
            output:
              typeof content === 'string' ? content : JSON.stringify(content),
          })
          continue
        }
        pendingUserContent.push(
          ...mapAnthropicUserBlocksToOpenAIInputContent([block] as AnyBlock[]),
        )
      }
      pushResponsesUserContent(responseInput, pendingUserContent)
      continue
    }

    if (message.role === 'assistant') {
      const blocks = Array.isArray(message.content)
        ? (message.content as unknown as AnyBlock[])
        : []
      let pendingText = ''
      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string') {
          pendingText += block.text
          continue
        }
        if (block.type === 'tool_use') {
          pushResponsesAssistantContent(responseInput, pendingText)
          pendingText = ''
          responseInput.push({
            type: 'function_call',
            call_id: String(block.id),
            name: String(block.name),
            arguments:
              typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input ?? {}),
          })
        }
      }
      pushResponsesAssistantContent(responseInput, pendingText)
    }
  }

  appendDynamicInstructionsToResponsesInput(responseInput, dynamicInstructions)
  const promptCacheKey = hashStableJson({
    model: targetModel,
    instructions: instructions ?? '',
    tools: toolDefinitions ?? [],
  })
  logOpenAIPrefixFingerprint({
    requestShape: 'responses',
    model: targetModel,
    instructions,
    tools: toolDefinitions,
    inputItems: responseInput,
    promptCacheKey,
  })

  return {
    model: targetModel,
    ...(instructions ? { instructions } : {}),
    input: responseInput,
    store: false,
    stream: true,
    prompt_cache_key: promptCacheKey,
    ...(reasoning?.reasoningEffort
      ? {
          reasoning: {
            effort: reasoning.reasoningEffort as OpenAIResponsesRequest['reasoning']['effort'],
            summary: (reasoning.reasoningSummary ?? 'detailed') as OpenAIResponsesRequest['reasoning']['summary'],
          },
        }
      : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(toolDefinitions
      ? {
          tools: toolDefinitions,
          tool_choice: 'auto' as const,
          parallel_tool_calls: !shouldDisableParallelToolCalls(),
          include: ['reasoning.encrypted_content'] as const,
        }
      : {
          include: ['reasoning.encrypted_content'] as const,
        }),
  }
}

const MAX_STREAM_REQUEST_RETRIES = 2
const STREAM_REQUEST_BASE_DELAY_MS = 1000

function getRetryAfterDelayMs(headers?: Headers): number | undefined {
  const retryAfter = headers?.get('retry-after')
  if (!retryAfter) return undefined
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000)
  }
  return undefined
}

function isRetryableOpenAIRequestError(error: unknown): boolean {
  if (error instanceof APIConnectionError) {
    return true
  }
  if (!(error instanceof APIError)) {
    return false
  }
  return (
    error.status === 403 ||
    error.status === 408 ||
    error.status === 409 ||
    error.status === 429 ||
    error.status === 500 ||
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504
  )
}

function normalizeOpenAIRequestError(error: unknown): Error {
  if (error instanceof APIUserAbortError || error instanceof APIError) {
    return error
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new APIUserAbortError()
  }
  return new APIConnectionError({
    cause: error instanceof Error ? error : new Error(String(error)),
  })
}

async function performOpenAIStreamRequest(input: {
  apiKey: string
  baseURL: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  path: string
  body: string
  errorPrefix: string
  joinUrl?: (baseURL: string, path: string) => string
}): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const joinUrl = input.joinUrl ?? joinBaseUrl
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_STREAM_REQUEST_RETRIES; attempt++) {
    if (input.signal?.aborted) {
      throw new APIUserAbortError()
    }

    try {
      const response = await (input.fetch ?? globalThis.fetch)(
        joinUrl(input.baseURL, input.path),
        {
          method: 'POST',
          signal: input.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${input.apiKey}`,
            ...input.headers,
          },
          body: input.body,
        },
      )

      if (!response.ok || !response.body) {
        let responseText = ''
        try {
          responseText = await response.text()
        } catch {
          responseText = ''
        }
        const apiError = APIError.generate(
          response.status,
          undefined,
          `${input.errorPrefix} failed with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
          response.headers,
        )
        if (
          attempt < MAX_STREAM_REQUEST_RETRIES &&
          isRetryableOpenAIRequestError(apiError)
        ) {
          await sleep(
            getRetryAfterDelayMs(response.headers) ??
              STREAM_REQUEST_BASE_DELAY_MS * 2 ** attempt,
            input.signal,
          )
          continue
        }
        throw apiError
      }

      return response.body.getReader()
    } catch (error) {
      const normalizedError = normalizeOpenAIRequestError(error)
      lastError = normalizedError
      if (
        attempt < MAX_STREAM_REQUEST_RETRIES &&
        isRetryableOpenAIRequestError(normalizedError)
      ) {
        const delayMs =
          normalizedError instanceof APIError
            ? (getRetryAfterDelayMs(normalizedError.headers) ??
              STREAM_REQUEST_BASE_DELAY_MS * 2 ** attempt)
            : STREAM_REQUEST_BASE_DELAY_MS * 2 ** attempt
        await sleep(delayMs, input.signal)
        continue
      }
      throw normalizedError
    }
  }

  throw lastError ?? new Error('OpenAI stream request failed')
}

export async function createOpenAICompatStream(
  config: OpenAICompatConfig,
  request: OpenAIChatRequest,
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  return performOpenAIStreamRequest({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    headers: config.headers,
    fetch: config.fetch,
    signal,
    path: '/v1/chat/completions',
    body: JSON.stringify({ ...request, stream: true }),
    errorPrefix: 'OpenAI compatible request',
  })
}

export async function createOpenAICodexStream(
  config: OpenAICodexConfig,
  request: OpenAICodexRequest,
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  return performOpenAIStreamRequest({
    apiKey: config.apiKey,
    baseURL: '',
    headers: config.headers,
    fetch: config.fetch,
    signal,
    path: resolveCodexUrl(config.baseURL),
    body: JSON.stringify(request),
    errorPrefix: 'OpenAI Codex request',
    joinUrl: (_baseURL, path) => path,
  })
}

export async function createOpenAIResponsesStream(
  config: OpenAICompatConfig,
  request: OpenAIResponsesRequest,
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  return performOpenAIStreamRequest({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    headers: config.headers,
    fetch: config.fetch,
    signal,
    path: '/v1/responses',
    body: JSON.stringify(request),
    errorPrefix: 'OpenAI Responses request',
  })
}


function joinRawBaseUrl(baseURL: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const normalizedBaseURL = baseURL.trim().replace(/\/+$/, '')
  try {
    return new URL(`${normalizedBaseURL}${normalizedPath}`).toString()
  } catch {
    throw new Error(`Invalid OpenAI-compatible base URL: ${normalizedBaseURL}`)
  }
}

export async function createCopilotChatStream(
  config: OpenAICompatConfig,
  request: OpenAIChatRequest,
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  return performOpenAIStreamRequest({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    headers: config.headers,
    fetch: config.fetch,
    signal,
    path: '/chat/completions',
    body: JSON.stringify({ ...request, stream: true }),
    errorPrefix: 'GitHub Copilot chat request',
    joinUrl: joinRawBaseUrl,
  })
}

function parseSSEChunk(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''
  return { events: parts, remainder }
}

const MAX_EMPTY_STREAM_RETRIES = 2
const EMPTY_STREAM_BASE_DELAY_MS = 500
const OPENAI_STREAM_RETRYABLE_ERROR_PREFIXES = [
  '[openaiCompat] failed to parse JSON',
  '[openaiCompat] invalid stream chunk',
  '[openaiCompat] chunk missing choices[0]',
  '[openaiCompat] stream ended unexpectedly before message_stop',
  '[openaiCompat] responses stream ended unexpectedly before message_stop',
  '[openaiCompat] retryable responses error',
] as const

function shouldRetryOpenAIStreamingParseError(message: string): boolean {
  return OPENAI_STREAM_RETRYABLE_ERROR_PREFIXES.some(prefix =>
    message.includes(prefix),
  )
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Request was aborted'))
      return
    }
    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(new Error('Request was aborted'))
    })
  })
}

export async function* createAnthropicStreamFromOpenAIWithEmptyRetry(input: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  recreateReader: () => Promise<ReadableStreamDefaultReader<Uint8Array>>
  generatorFactory: (reader: ReadableStreamDefaultReader<Uint8Array>) => AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void>
  model: string
  signal?: AbortSignal
}): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  let reader = input.reader

  for (let attempt = 0; ; attempt++) {
    try {
      return yield* input.generatorFactory(reader)
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error))
      const shouldRetryEmptyResponse =
        shouldRetryOpenAIStreamingParseError(normalizedError.message) &&
        attempt < MAX_EMPTY_STREAM_RETRIES

      if (shouldRetryEmptyResponse) {
        await reader.cancel().catch(() => {})
        await sleep(EMPTY_STREAM_BASE_DELAY_MS * 2 ** attempt, input.signal)
        reader = await input.recreateReader()
        continue
      }

      throw normalizedError
    }
  }
}

function mapFinishReason(reason: string | null | undefined): BetaMessage['stop_reason'] {
  if (reason === 'tool_calls') return 'tool_use'
  if (reason === 'length') return 'max_tokens'
  return 'end_turn'
}

export async function* createAnthropicStreamFromOpenAI(input: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  model: string
}): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false
  let textContentIndex: number | null = null
  let thinkingContentIndex: number | null = null
  let toolIndexByOpenAIIndex = new Map<number, number>()
  let nextContentIndex = 0
  let promptTokens = 0
  let completionTokens = 0
  let emittedAnyContent = false
  const toolCallState = new Map<number, { id: string; name: string; arguments: string }>()
  const openContentIndices: number[] = []

  function allocateContentIndex(): number {
    return nextContentIndex++
  }

  function markContentIndexOpen(index: number) {
    openContentIndices.push(index)
  }

  while (true) {
    const { done, value } = await input.reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSSEChunk(buffer)
    buffer = parsed.remainder

    for (const rawEvent of parsed.events) {
      const dataLines = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const data of dataLines) {
        if (!data || data === '[DONE]') continue

        let chunk: OpenAIStreamChunk
        try {
          chunk = JSON.parse(data) as OpenAIStreamChunk
        } catch (e) {
          throw new Error(
            `[openaiCompat] failed to parse JSON from stream chunk: ${String(data).slice(0, 500)}`,
          )
        }

        if (!chunk || typeof chunk !== 'object') {
          throw new Error(
            `[openaiCompat] invalid stream chunk: ${String(data).slice(0, 500)}`,
          )
        }
        const choice = chunk.choices?.[0]
        const delta = choice?.delta

        if (!choice && data !== '[DONE]') {
          throw new Error(
            `[openaiCompat] chunk missing choices[0]: ${JSON.stringify(chunk).slice(0, 1000)}`,
          )
        }

        if (!started) {
          started = true
          const mappedUsage = mapOpenAIUsageToAnthropic(chunk.usage)
          promptTokens = mappedUsage?.input_tokens ?? chunk.usage?.prompt_tokens ?? 0
          yield {
            type: 'message_start',
            message: {
              id: chunk.id ?? 'openai-compat',
              type: 'message',
              role: 'assistant',
              model: input.model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage:
                mappedUsage ?? {
                  input_tokens: promptTokens,
                  output_tokens: 0,
                },
            },
          } as BetaRawMessageStreamEvent
        }

        if (delta?.content) {
          if (textContentIndex === null) {
            textContentIndex = allocateContentIndex()
            markContentIndexOpen(textContentIndex)
            yield {
              type: 'content_block_start',
              index: textContentIndex,
              content_block: {
                type: 'text',
                text: '',
              },
            } as BetaRawMessageStreamEvent
          }

          yield {
            type: 'content_block_delta',
            index: textContentIndex,
            delta: {
              type: 'text_delta',
              text: delta.content,
            },
          } as BetaRawMessageStreamEvent
          emittedAnyContent = true
        }

        const reasoningDelta = [
          delta?.reasoning_content,
          delta?.reasoning,
          delta?.reasoning_text,
        ].find(value => typeof value === 'string' && value.length > 0)

        if (reasoningDelta) {
          if (thinkingContentIndex === null) {
            thinkingContentIndex = allocateContentIndex()
            markContentIndexOpen(thinkingContentIndex)
            yield {
              type: 'content_block_start',
              index: thinkingContentIndex,
              content_block: {
                type: 'thinking',
                thinking: '',
                signature: '',
              },
            } as BetaRawMessageStreamEvent
          }

          yield {
            type: 'content_block_delta',
            index: thinkingContentIndex,
            delta: {
              type: 'thinking_delta',
              thinking: reasoningDelta,
            },
          } as BetaRawMessageStreamEvent
          emittedAnyContent = true
        }

        for (const toolCall of delta?.tool_calls ?? []) {
          const openAIIndex = toolCall.index ?? 0
          let anthropicIndex = toolIndexByOpenAIIndex.get(openAIIndex)
          if (anthropicIndex === undefined) {
            anthropicIndex = allocateContentIndex()
            toolIndexByOpenAIIndex.set(openAIIndex, anthropicIndex)
            markContentIndexOpen(anthropicIndex)
            const state = {
              id: toolCall.id ?? `toolu_${openAIIndex}`,
              name: toolCall.function?.name ?? '',
              arguments: '',
            }
            toolCallState.set(openAIIndex, state)
            yield {
              type: 'content_block_start',
              index: anthropicIndex,
              content_block: {
                type: 'tool_use',
                id: state.id,
                name: state.name,
                input: '',
              },
            } as BetaRawMessageStreamEvent
          }

          const state = toolCallState.get(openAIIndex)
          if (!state) continue
          if (toolCall.id) state.id = toolCall.id
          if (toolCall.function?.name) state.name = toolCall.function.name
          if (toolCall.function?.arguments) {
            state.arguments += toolCall.function.arguments
            yield {
              type: 'content_block_delta',
              index: anthropicIndex,
              delta: {
                type: 'input_json_delta',
                partial_json: toolCall.function.arguments,
              },
            } as BetaRawMessageStreamEvent
            emittedAnyContent = true
          }
        }

        if (choice?.finish_reason) {
          if (!emittedAnyContent) {
            const emptyTextIndex = allocateContentIndex()
            yield {
              type: 'content_block_start',
              index: emptyTextIndex,
              content_block: {
                type: 'text',
                text: '',
              },
            } as BetaRawMessageStreamEvent
            yield {
              type: 'content_block_stop',
              index: emptyTextIndex,
            } as BetaRawMessageStreamEvent
          }
          const mappedUsage = mapOpenAIUsageToAnthropic(chunk.usage)
          promptTokens = mappedUsage?.input_tokens ?? promptTokens
          completionTokens = mappedUsage?.output_tokens ?? chunk.usage?.completion_tokens ?? completionTokens
          for (const index of openContentIndices) {
            yield {
              type: 'content_block_stop',
              index,
            } as BetaRawMessageStreamEvent
          }

          yield {
            type: 'message_delta',
            delta: {
              stop_reason: mapFinishReason(choice.finish_reason),
              stop_sequence: null,
            },
            usage:
              mappedUsage ?? {
                output_tokens: completionTokens,
              },
          } as BetaRawMessageStreamEvent

          yield {
            type: 'message_stop',
          } as BetaRawMessageStreamEvent

          return {
            id: chunk.id ?? 'openai-compat',
            type: 'message',
            role: 'assistant',
            model: input.model,
            content: [],
            stop_reason: mapFinishReason(choice.finish_reason),
            stop_sequence: null,
            usage:
              mappedUsage ?? {
                input_tokens: promptTokens,
                output_tokens: completionTokens,
              },
          } as BetaMessage
        }
      }
    }
  }

  throw new Error(
    `[openaiCompat] stream ended unexpectedly before message_stop for model=${input.model}`,
  )
}

function createContentIndexAllocator() {
  let nextContentIndex = 0
  const openContentIndices: number[] = []

  return {
    allocate() {
      return nextContentIndex++
    },
    markOpen(index: number) {
      openContentIndices.push(index)
    },
    getOpenIndices() {
      return openContentIndices
    },
  }
}

export async function* createAnthropicStreamFromOpenAIResponses(input: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  model: string
}): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false
  let currentTextIndex: number | null = null
  let currentThinkingIndex: number | null = null
  let promptTokens = 0
  let completionTokens = 0
  let stopReason: BetaMessage['stop_reason'] = 'end_turn'
  const allocator = createContentIndexAllocator()
  type ToolCallState = {
    index: number
    id: string
    name: string
    arguments: string
  }
  const activeToolCalls = new Set<ToolCallState>()
  const toolCallStateByKey = new Map<string, ToolCallState>()

  const getToolCallKeys = (params: {
    outputIndex?: number
    itemId?: string
    id?: string
    callId?: string
  }) => {
    const keys: string[] = []
    if (params.outputIndex !== undefined) {
      keys.push(`output_index:${params.outputIndex}`)
    }
    if (params.itemId) {
      keys.push(`item_id:${params.itemId}`)
    }
    if (params.id) {
      keys.push(`id:${params.id}`)
    }
    if (params.callId) {
      keys.push(`call_id:${params.callId}`)
    }
    return keys
  }

  const registerToolCallState = (state: ToolCallState, keys: string[]) => {
    for (const key of keys) {
      toolCallStateByKey.set(key, state)
    }
  }

  const unregisterToolCallState = (state: ToolCallState) => {
    for (const [key, value] of toolCallStateByKey.entries()) {
      if (value === state) {
        toolCallStateByKey.delete(key)
      }
    }
    activeToolCalls.delete(state)
  }

  const resolveToolCallState = (keys: string[]) => {
    for (const key of keys) {
      const state = toolCallStateByKey.get(key)
      if (state) {
        return state
      }
    }
    if (activeToolCalls.size !== 1) {
      return null
    }
    return activeToolCalls.values().next().value ?? null
  }

  const appendToolCallArgumentsDelta = (state: ToolCallState, delta: string) => {
    if (!delta) {
      return null
    }
    state.arguments += delta
    return delta
  }

  const syncToolCallArguments = (state: ToolCallState, nextArguments: string) => {
    if (!nextArguments || nextArguments === state.arguments) {
      return null
    }
    const delta = nextArguments.startsWith(state.arguments)
      ? nextArguments.slice(state.arguments.length)
      : nextArguments
    state.arguments = nextArguments
    return delta
  }

  while (true) {
    const { done, value } = await input.reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSSEChunk(buffer)
    buffer = parsed.remainder

    for (const rawEvent of parsed.events) {
      const dataLines = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const data of dataLines) {
        if (!data || data === '[DONE]') continue

        let event: ResponsesStreamEvent
        try {
          event = JSON.parse(data) as ResponsesStreamEvent
        } catch (e) {
          throw new Error(
            `[openaiCompat] failed to parse JSON from stream chunk: ${String(data).slice(0, 500)}`,
          )
        }

        if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
          continue
        }

        if (event.type === 'error') {
          const errorMessage =
            event.message || event.code || JSON.stringify(event)
          const retryableStatusMatch = errorMessage.match(
            /\bstatus\s+(403|408|409|429|500|502|503|504)\b/i,
          )
          throw new Error(
            retryableStatusMatch
              ? `[openaiCompat] retryable responses error: ${errorMessage}`
              : `OpenAI Responses error: ${errorMessage}`,
          )
        }
        if (event.type === 'response.failed') {
          const failureMessage =
            event.response?.error?.message || event.message || 'OpenAI Responses failed'
          const retryableStatusMatch = failureMessage.match(
            /\bstatus\s+(403|408|409|429|500|502|503|504)\b/i,
          )
          throw new Error(
            retryableStatusMatch
              ? `[openaiCompat] retryable responses error: ${failureMessage}`
              : failureMessage,
          )
        }

        if (!started) {
          started = true
          yield {
            type: 'message_start',
            message: {
              id: 'openai-responses',
              type: 'message',
              role: 'assistant',
              model: input.model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: {
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
            },
          } as BetaRawMessageStreamEvent
        }

        if (event.type === 'response.output_item.added') {
          if (event.item.type === 'message') {
            currentTextIndex = allocator.allocate()
            allocator.markOpen(currentTextIndex)
            yield {
              type: 'content_block_start',
              index: currentTextIndex,
              content_block: {
                type: 'text',
                text: '',
              },
            } as BetaRawMessageStreamEvent
          }
          if (event.item.type === 'function_call') {
            const state: ToolCallState = {
              index: allocator.allocate(),
              id: event.item.call_id ?? event.item.id ?? 'toolu_openai',
              name: event.item.name ?? '',
              arguments: '',
            }
            allocator.markOpen(state.index)
            activeToolCalls.add(state)
            registerToolCallState(
              state,
              getToolCallKeys({
                outputIndex: event.output_index,
                itemId: event.item.id,
                id: event.item.id,
                callId: event.item.call_id,
              }),
            )
            yield {
              type: 'content_block_start',
              index: state.index,
              content_block: {
                type: 'tool_use',
                id: state.id,
                name: state.name,
                input: '',
              },
            } as BetaRawMessageStreamEvent
            const initialArgumentsDelta = syncToolCallArguments(
              state,
              event.item.arguments ?? '',
            )
            if (initialArgumentsDelta) {
              yield {
                type: 'content_block_delta',
                index: state.index,
                delta: {
                  type: 'input_json_delta',
                  partial_json: initialArgumentsDelta,
                },
              } as BetaRawMessageStreamEvent
            }
            stopReason = 'tool_use'
          }
          continue
        }

        if (event.type === 'response.output_text.delta' && currentTextIndex !== null) {
          yield {
            type: 'content_block_delta',
            index: currentTextIndex,
            delta: {
              type: 'text_delta',
              text: event.delta,
            },
          } as BetaRawMessageStreamEvent
          continue
        }

        if (
          (event.type === 'response.reasoning_summary_text.delta' ||
            event.type === 'response.reasoning_text.delta') &&
          event.delta
        ) {
          if (currentThinkingIndex === null) {
            currentThinkingIndex = allocator.allocate()
            allocator.markOpen(currentThinkingIndex)
            yield {
              type: 'content_block_start',
              index: currentThinkingIndex,
              content_block: {
                type: 'thinking',
                thinking: '',
                signature: '',
              },
            } as BetaRawMessageStreamEvent
          }
          yield {
            type: 'content_block_delta',
            index: currentThinkingIndex,
            delta: {
              type: 'thinking_delta',
              thinking: event.delta,
            },
          } as BetaRawMessageStreamEvent
          continue
        }

        if (event.type === 'response.function_call_arguments.delta') {
          const state = resolveToolCallState(
            getToolCallKeys({
              outputIndex: event.output_index,
              itemId: event.item_id,
              id: event.id,
              callId: event.call_id,
            }),
          )
          if (!state) {
            continue
          }
          const delta = appendToolCallArgumentsDelta(state, event.delta)
          if (!delta) {
            continue
          }
          yield {
            type: 'content_block_delta',
            index: state.index,
            delta: {
              type: 'input_json_delta',
              partial_json: delta,
            },
          } as BetaRawMessageStreamEvent
          stopReason = 'tool_use'
          continue
        }

        if (event.type === 'response.function_call_arguments.done') {
          const state = resolveToolCallState(
            getToolCallKeys({
              outputIndex: event.output_index,
              itemId: event.item_id,
              id: event.id,
              callId: event.call_id,
            }),
          )
          if (!state) {
            continue
          }
          const delta = syncToolCallArguments(state, event.arguments)
          if (delta) {
            yield {
              type: 'content_block_delta',
              index: state.index,
              delta: {
                type: 'input_json_delta',
                partial_json: delta,
              },
            } as BetaRawMessageStreamEvent
          }
          stopReason = 'tool_use'
          continue
        }

        if (event.type === 'response.output_item.done') {
          if (event.item.type === 'message') {
            currentTextIndex = null
          }
          if (event.item.type === 'function_call') {
            const state = resolveToolCallState(
              getToolCallKeys({
                outputIndex: event.output_index,
                itemId: event.item.id,
                id: event.item.id,
                callId: event.item.call_id,
              }),
            )
            if (state) {
              const delta = syncToolCallArguments(state, event.item.arguments ?? '')
              if (delta) {
                yield {
                  type: 'content_block_delta',
                  index: state.index,
                  delta: {
                    type: 'input_json_delta',
                    partial_json: delta,
                  },
                } as BetaRawMessageStreamEvent
              }
              unregisterToolCallState(state)
            }
          }
          continue
        }

        if (event.type === 'response.completed') {
          attachOpenAIResponsesUsageDebug(event.response?.usage)
          const mappedUsage = mapOpenAIResponsesUsageToAnthropic(event.response?.usage)
          promptTokens = mappedUsage?.input_tokens ?? event.response?.usage?.input_tokens ?? 0
          completionTokens = mappedUsage?.output_tokens ?? event.response?.usage?.output_tokens ?? 0
          for (const index of allocator.getOpenIndices()) {
            yield {
              type: 'content_block_stop',
              index,
            } as BetaRawMessageStreamEvent
          }
          yield {
            type: 'message_delta',
            delta: {
              stop_reason: stopReason,
              stop_sequence: null,
            },
            usage:
              mappedUsage ?? {
                output_tokens: completionTokens,
              },
          } as BetaRawMessageStreamEvent
          yield {
            type: 'message_stop',
          } as BetaRawMessageStreamEvent
          return {
            id: event.response?.id ?? 'openai-responses',
            type: 'message',
            role: 'assistant',
            model: input.model,
            content: [],
            stop_reason: stopReason,
            stop_sequence: null,
            usage:
              mappedUsage ?? {
                input_tokens: promptTokens,
                output_tokens: completionTokens,
              },
          } as BetaMessage
        }
      }
    }
  }

  throw new Error(
    `[openaiCompat] responses stream ended unexpectedly before message_stop for model=${input.model}`,
  )
}

export async function* createAnthropicStreamFromOpenAICodex(input: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  model: string
}): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  yield* createAnthropicStreamFromOpenAIResponses(input)
}

function mapOpenAIResponsesUsageToAnthropic(usage?: {
  input_tokens?: number
  output_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  input_tokens_details?: {
    cached_tokens?: number
  }
  prompt_tokens_details?: {
    cached_tokens?: number
  }
}): BetaUsage | undefined {
  return mapOpenAIUsageToAnthropic(usage)
}

export function mapOpenAIUsageToAnthropic(usage?: {
  prompt_tokens?: number
  completion_tokens?: number
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: {
    cached_tokens?: number
  }
  prompt_tokens_details?: {
    cached_tokens?: number
  }
}): BetaUsage | undefined {
  if (!usage) return undefined
  const totalInputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0
  const cachedTokens =
    usage.input_tokens_details?.cached_tokens ??
    usage.prompt_tokens_details?.cached_tokens ??
    0

  return {
    input_tokens: Math.max(0, totalInputTokens - cachedTokens),
    output_tokens: outputTokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cachedTokens,
  } as BetaUsage
}

