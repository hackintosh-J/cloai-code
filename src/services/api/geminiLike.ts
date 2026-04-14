import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  getActiveProviderConfig,
  readCustomApiStorage,
  writeCustomApiStorage,
  type ProviderConfig,
} from '../../utils/customApiStorage.js'
import { ensureToolResultPairing } from '../../utils/messages.js'
import { refreshAntigravityTokens } from '../oauth/antigravity.js'
import { refreshGeminiCliTokens } from '../oauth/geminiCli.js'

const GEMINI_CLI_HEADERS = {
  'User-Agent': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'X-Goog-Api-Client': 'gl-node/22.17.0',
  'Client-Metadata': JSON.stringify({
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
  }),
} as const

const GEMINI_CLI_ENDPOINT_FALLBACKS = [
  'https://cloudcode-pa.googleapis.com',
] as const

const ANTIGRAVITY_DAILY_ENDPOINT = 'https://daily-cloudcode-pa.sandbox.googleapis.com'
const ANTIGRAVITY_ENDPOINT_FALLBACKS = [
  ANTIGRAVITY_DAILY_ENDPOINT,
  'https://cloudcode-pa.googleapis.com',
] as const
const DEFAULT_ANTIGRAVITY_VERSION = '1.18.4'
const CLAUDE_THINKING_BETA_HEADER = 'interleaved-thinking-2025-05-14'
const ANTIGRAVITY_SYSTEM_INSTRUCTION =
  'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.' +
  'You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.' +
  '**Absolute paths only**' +
  '**Proactiveness**'

function getAntigravityHeaders(): Record<string, string> {
  return {
    'User-Agent': `antigravity/${process.env.PI_AI_ANTIGRAVITY_VERSION || DEFAULT_ANTIGRAVITY_VERSION} darwin/arm64`,
  }
}

function needsAntigravityClaudeThinkingHeader(model: string): boolean {
  return model.startsWith('claude-')
}

function applyAntigravityRequestShape(
  request: GeminiGenerateContentRequest,
  model: string,
): GeminiGenerateContentRequest {
  const nextSystemParts = request.systemInstruction?.parts ?? []
  return {
    ...request,
    systemInstruction: {
      role: 'user',
      parts: [
        { text: ANTIGRAVITY_SYSTEM_INSTRUCTION },
        {
          text: `Please ignore following [ignore]${ANTIGRAVITY_SYSTEM_INSTRUCTION}[/ignore]`,
        },
        ...nextSystemParts,
      ],
    },
    generationConfig: {
      ...(request.generationConfig ?? {}),
      ...(model.startsWith('claude-')
        ? {
            thinkingConfig: {
              includeThoughts: true,
              ...((request.generationConfig as Record<string, unknown> | undefined)?.thinkingConfig as Record<string, unknown> | undefined),
            },
          }
        : {}),
    },
  }
}
const MAX_RETRIES = 2
const BASE_DELAY_MS = 1000
const MAX_EMPTY_STREAM_RETRIES = 2
const EMPTY_STREAM_BASE_DELAY_MS = 500
const GEMINI_EMPTY_RESPONSE_ERROR = 'Gemini-compatible API returned an empty response'
const GEMINI_UNRECOGNIZED_RESPONSE_PREFIX =
  'Gemini-compatible API returned an unrecognized response:'
const GEMINI_UNPARSEABLE_RESPONSE_PREFIX =
  'Gemini-compatible response contained unparseable JSON:'
const SKIP_THOUGHT_SIGNATURE = 'skip_thought_signature_validator'

type AnyBlock = Record<string, unknown>

type GeminiToolChoice = 'AUTO' | 'NONE' | 'ANY'

type GeminiPart = {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  inlineData?: {
    mimeType: string
    data: string
  }
  functionCall?: {
    name?: string
    args?: Record<string, unknown>
    id?: string
  }
  functionResponse?: {
    name?: string
    response?: Record<string, unknown>
    id?: string
  }
}

type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiGenerateContentRequest = {
  contents: GeminiContent[]
  systemInstruction?: {
    parts: Array<{ text: string }>
  }
  generationConfig?: {
    temperature?: number
    maxOutputTokens?: number
  }
  tools?: Array<{
    functionDeclarations: Array<{
      name: string
      description?: string
      parameters?: unknown
      parametersJsonSchema?: unknown
    }>
  }>
  toolConfig?: {
    functionCallingConfig: {
      mode: GeminiToolChoice
    }
  }
}

type GeminiCliRequest = {
  project: string
  model: string
  request: GeminiGenerateContentRequest
  requestType?: 'agent'
  userAgent: string
  requestId: string
}


type GeminiUsageMetadata = {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  totalTokenCount?: number
  cachedContentTokenCount?: number
}

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[]
  }
  finishReason?: string
}

type GeminiChunk = {
  responseId?: string
  candidates?: GeminiCandidate[]
  usageMetadata?: GeminiUsageMetadata
}

type GeminiCliChunkEnvelope = {
  response?: GeminiChunk
}

function toBlocks(content: BetaMessageParam['content']): AnyBlock[] {
  return Array.isArray(content)
    ? (content as unknown as AnyBlock[])
    : [{ type: 'text', text: content }]
}

function mapAnthropicUserBlocksToGeminiParts(blocks: AnyBlock[]): GeminiPart[] {
  return blocks.flatMap(block => {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      return [{ text: sanitizeText(block.text) }]
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
        inlineData: {
          mimeType: String((block.source as Record<string, unknown>).media_type),
          data: String((block.source as Record<string, unknown>).data),
        },
      }]
    }
    return []
  })
}

function sanitizeText(text: string): string {
  return text
}

function normalizeModel(model: string): string {
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim()
  return configuredModel || model
}

function requiresLegacyParameters(model: string): boolean {
  return model.startsWith('claude-')
}

function sanitizeGeminiToolSchema(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map(item => sanitizeGeminiToolSchema(item))
  }

  const record = value as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(record)) {
    if (
      key === '$schema' ||
      key === 'additionalProperties' ||
      key === 'exclusiveMinimum' ||
      key === 'exclusiveMaximum' ||
      key === 'patternProperties' ||
      key === 'unevaluatedProperties' ||
      key === 'propertyNames' ||
      key === 'minContains' ||
      key === 'maxContains' ||
      key === 'contains' ||
      key === 'const' ||
      key === 'if' ||
      key === 'then' ||
      key === 'else' ||
      key === 'dependentRequired' ||
      key === 'dependentSchemas'
    ) {
      continue
    }
    next[key] = sanitizeGeminiToolSchema(child)
  }
  return next
}


function convertTools(
  tools?: BetaToolUnion[],
  useParameters = false,
): GeminiGenerateContentRequest['tools'] {
  if (!tools || tools.length === 0) return undefined
  const functionDeclarations = tools.flatMap(tool => {
    const record = tool as unknown as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : undefined
    if (!name) return []
    const inputSchema = sanitizeGeminiToolSchema(record.input_schema)
    return [{
      name,
      description:
        typeof record.description === 'string' ? record.description : undefined,
      ...(useParameters
        ? { parameters: inputSchema }
        : { parametersJsonSchema: inputSchema }),
    }]
  })
  return functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined
}
function mapToolChoice(
  toolChoice?: BetaToolChoiceAuto | BetaToolChoiceTool,
): GeminiToolChoice | undefined {
  if (!toolChoice) return undefined
  if (toolChoice.type === 'auto') return 'AUTO'
  if (toolChoice.type === 'tool') return 'ANY'
  return undefined
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

export function convertAnthropicRequestToGemini(input: {
  model: string
  system?: string | Array<{ type?: string; text?: string }>
  messages: BetaMessageParam[]
  tools?: BetaToolUnion[]
  tool_choice?: BetaToolChoiceAuto | BetaToolChoiceTool
  temperature?: number
  max_tokens?: number
}): GeminiGenerateContentRequest {
  const targetModel = normalizeModel(input.model)
  const contents: GeminiContent[] = []
  const sanitizedMessages = stripAnthropicSignatureBlocks(input.messages)
  const pairedMessages = ensureToolResultPairing(sanitizedMessages)
  const toolNameByUseId = new Map<string, string>()

  for (const message of pairedMessages) {
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)
      const toolParts = blocks
        .filter(block => block.type === 'tool_result')
        .map(block => {
          const toolUseId =
            typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
          const toolName =
            (typeof block.tool_name === 'string' ? block.tool_name : undefined) ??
            (toolUseId ? toolNameByUseId.get(toolUseId) : undefined) ??
            'tool'

          return {
            functionResponse: {
              name: toolName,
              id: toolUseId,
              response:
                block.is_error === true
                  ? {
                      error:
                        typeof block.content === 'string'
                          ? block.content
                          : JSON.stringify(block.content),
                    }
                  : {
                      output:
                        typeof block.content === 'string'
                          ? block.content
                          : JSON.stringify(block.content),
                    },
            },
          }
        })

      const userParts = mapAnthropicUserBlocksToGeminiParts(
        blocks.filter(block => block.type !== 'tool_result') as AnyBlock[],
      )
      if (toolParts.length > 0) {
        contents.push({ role: 'user', parts: toolParts })
      }
      if (userParts.length > 0) {
        contents.push({ role: 'user', parts: userParts })
      }
      continue
    }

    if (message.role === 'assistant') {
      const blocks = Array.isArray(message.content)
        ? (message.content as unknown as AnyBlock[])
        : []
      const parts: GeminiPart[] = []

      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text) {
          parts.push({ text: sanitizeText(block.text) })
        }
        if (
          block.type === 'thinking' &&
          typeof block.thinking === 'string' &&
          block.thinking &&
          typeof block.signature === 'string' &&
          block.signature.length > 0
        ) {
          parts.push({
            text: sanitizeText(block.thinking),
            thought: true,
            thoughtSignature: block.signature,
          })
        }
        if (block.type === 'tool_use') {
          const toolName = typeof block.name === 'string' ? block.name : ''
          const toolUseId = typeof block.id === 'string' ? block.id : undefined
          const thoughtSignature =
            typeof block.signature === 'string' && block.signature.length > 0
              ? block.signature
              : undefined
          const effectiveThoughtSignature =
            thoughtSignature ??
            (targetModel.toLowerCase().includes('gemini-3')
              ? SKIP_THOUGHT_SIGNATURE
              : undefined)
          if (toolUseId && toolName) {
            toolNameByUseId.set(toolUseId, toolName)
          }
          parts.push({
            functionCall: {
              name: toolName,
              args:
                typeof block.input === 'object' && block.input !== null
                  ? (block.input as Record<string, unknown>)
                  : {},
              id: toolUseId,
            },
            ...(effectiveThoughtSignature
              ? { thoughtSignature: effectiveThoughtSignature }
              : {}),
          })
        }
      }

      if (parts.length > 0) {
        contents.push({ role: 'model', parts })
      }
    }
  }

  const systemText = Array.isArray(input.system)
    ? input.system.map(block => block.text ?? '').join('\n')
    : input.system

  const tools = convertTools(input.tools, requiresLegacyParameters(targetModel))
  const toolChoice = mapToolChoice(input.tool_choice)

  return {
    contents,
    ...(systemText
      ? { systemInstruction: { parts: [{ text: sanitizeText(systemText) }] } }
      : {}),
    ...((input.temperature !== undefined || input.max_tokens !== undefined)
      ? {
          generationConfig: {
            ...(input.temperature !== undefined
              ? { temperature: input.temperature }
              : {}),
            ...(input.max_tokens !== undefined
              ? { maxOutputTokens: input.max_tokens }
              : {}),
          },
        }
      : {}),
    ...(tools ? { tools } : {}),
    ...(toolChoice
      ? {
          toolConfig: {
            functionCallingConfig: {
              mode: toolChoice,
            },
          },
        }
      : {}),
  }
}

function parseSSEChunk(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''
  return { events: parts, remainder }
}

function getGeminiEventPayloads(rawEvent: string): string[] {
  const dataLines = rawEvent
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5))
  if (dataLines.length > 0) {
    const joined = dataLines.join('\n').trim()
    return joined ? [joined] : []
  }

  const trimmed = rawEvent.trim()
  if (!trimmed) {
    return []
  }

  const jsonLines = trimmed
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  if (
    jsonLines.length > 1 &&
    jsonLines.every(line => line.startsWith('{') || line.startsWith('['))
  ) {
    return jsonLines
  }

  return trimmed.startsWith('{') || trimmed.startsWith('[') ? [trimmed] : []
}

function parseGeminiJsonPayloads(payload: string): unknown[] {
  const trimmed = payload.trim()
  if (!trimmed || trimmed === '[DONE]') {
    return []
  }

  try {
    return [JSON.parse(trimmed)]
  } catch {
    const lines = trimmed
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
    if (
      lines.length > 1 &&
      lines.every(line => line.startsWith('{') || line.startsWith('['))
    ) {
      try {
        return lines.map(line => JSON.parse(line))
      } catch {
        return []
      }
    }
    return []
  }
}

function createReaderFromGeminiPayload(
  payload: unknown,
): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder()
  const body = JSON.stringify(payload)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  })
  return stream.getReader()
}

function mapFinishReason(reason: string | undefined): BetaMessage['stop_reason'] {
  if (reason === 'MAX_TOKENS') return 'max_tokens'
  return 'end_turn'
}

function joinBaseUrl(baseURL: string, path: string): string {
  const normalizedBaseURL = baseURL.trim().replace(/\/+$/, '')
  const normalizedPath = path.replace(/^\/+/, '')
  try {
    return new URL(normalizedPath, `${normalizedBaseURL}/`).toString()
  } catch {
    throw new Error(`Invalid Gemini-compatible base URL: ${normalizedBaseURL}`)
  }
}

function buildGeminiVertexBaseUrl(baseURL: string): string {
  const normalizedBaseURL = baseURL.trim().replace(/\/+$/, '')
  if (!normalizedBaseURL) {
    return normalizedBaseURL
  }

  try {
    const parsed = new URL(normalizedBaseURL)
    const normalizedPathname = parsed.pathname.replace(/\/+$/, '')
    if (/\/v\d+[a-z0-9-]*(?:\/|$)/i.test(normalizedPathname)) {
      return normalizedBaseURL
    }
  } catch {
    return normalizedBaseURL
  }

  return `${normalizedBaseURL}/v1beta`
}

function buildGeminiVertexEndpoint(baseURL: string, path: string): string {
  return joinBaseUrl(buildGeminiVertexBaseUrl(baseURL), path)
}

function extractRetryDelay(errorText: string, response?: Response | Headers): number | undefined {
  const headers = response instanceof Headers ? response : response?.headers
  const retryAfter = headers?.get('retry-after')
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter)
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.ceil(retryAfterSeconds * 1000 + 1000)
    }
  }
  const retryDelayMatch = errorText.match(/"retryDelay":\s*"([0-9.]+)(ms|s)"/i)
  if (retryDelayMatch?.[1]) {
    const value = parseFloat(retryDelayMatch[1])
    if (!Number.isNaN(value) && value > 0) {
      return Math.ceil((retryDelayMatch[2] === 'ms' ? value : value * 1000) + 1000)
    }
  }
  return undefined
}

function isRetryableError(status: number, errorText: string): boolean {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true
  }
  return /resource.?exhausted|rate.?limit|overloaded|service.?unavailable|other.?side.?closed/i.test(errorText)
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

export async function createGeminiVertexStream(input: {
  apiKey: string
  baseURL: string
  model: string
  request: GeminiGenerateContentRequest
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await (input.fetch ?? globalThis.fetch)(
    buildGeminiVertexEndpoint(
      input.baseURL,
      `/models/${encodeURIComponent(input.model)}:streamGenerateContent?alt=sse`,
    ),
    {
      method: 'POST',
      signal: input.signal,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': input.apiKey,
        accept: 'text/event-stream',
        ...input.headers,
      },
      body: JSON.stringify(input.request),
    },
  )

  if (!response.ok || !response.body) {
    let responseText = ''
    try {
      responseText = await response.text()
    } catch {
      responseText = ''
    }
    throw new Error(
      `Gemini Vertex-compatible request failed with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
    )
  }

  return response.body.getReader()
}

export async function fetchGeminiVertexResponse(input: {
  apiKey: string
  baseURL: string
  model: string
  request: GeminiGenerateContentRequest
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<unknown> {
  const response = await (input.fetch ?? globalThis.fetch)(
    buildGeminiVertexEndpoint(
      input.baseURL,
      `/models/${encodeURIComponent(input.model)}:generateContent`,
    ),
    {
      method: 'POST',
      signal: input.signal,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': input.apiKey,
        accept: 'application/json',
        ...input.headers,
      },
      body: JSON.stringify(input.request),
    },
  )

  if (!response.ok) {
    let responseText = ''
    try {
      responseText = await response.text()
    } catch {
      responseText = ''
    }
    throw new Error(
      `Gemini Vertex-compatible request failed with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
    )
  }

  return response.json()
}

function isAntigravityProvider(provider: ProviderConfig): boolean {
  return provider.variant === 'gemini-antigravity-oauth'
}

function getActiveGeminiProvider(): ProviderConfig | undefined {
  const storage = readCustomApiStorage()
  const provider = getActiveProviderConfig(storage)
  return provider?.kind === 'gemini-like' ? provider : undefined
}

export async function refreshGeminiProviderOAuthIfNeeded(): Promise<ProviderConfig> {
  const storage = readCustomApiStorage()
  const provider = getActiveGeminiProvider()
  if (
    !provider ||
    (provider.variant !== 'gemini-cli-oauth' &&
      provider.variant !== 'gemini-antigravity-oauth' &&
      provider.authMode !== 'gemini-cli-oauth')
  ) {
    throw new Error('Active Gemini OAuth provider not found')
  }
  const oauth = provider.oauth
  if (!oauth?.accessToken || !oauth.projectId) {
    throw new Error('Gemini OAuth provider is missing access token or project ID')
  }
  if (!oauth.expiresAt || oauth.expiresAt > Date.now()) {
    return provider
  }
  if (!oauth.refreshToken) {
    throw new Error('Gemini OAuth provider is missing refresh token')
  }

  const refreshed = isAntigravityProvider(provider)
    ? await refreshAntigravityTokens({
        refreshToken: oauth.refreshToken,
        projectId: oauth.projectId,
      })
    : await refreshGeminiCliTokens({
        refreshToken: oauth.refreshToken,
        projectId: oauth.projectId,
      })

  const providers = (storage.providers ?? []).map(item =>
    item.kind === provider.kind &&
    item.id === provider.id &&
    item.authMode === provider.authMode &&
    item.variant === provider.variant
      ? {
          ...item,
          oauth: {
            ...item.oauth,
            accessToken:
              typeof refreshed.accessToken === 'string'
                ? refreshed.accessToken
                : item.oauth?.accessToken,
            refreshToken:
              typeof refreshed.refreshToken === 'string'
                ? refreshed.refreshToken
                : item.oauth?.refreshToken,
            expiresAt:
              typeof refreshed.expiresAt === 'number'
                ? refreshed.expiresAt
                : item.oauth?.expiresAt,
            projectId:
              typeof refreshed.projectId === 'string'
                ? refreshed.projectId
                : item.oauth?.projectId,
            ...(typeof refreshed.email === 'string'
              ? { email: refreshed.email }
              : {}),
          },
        }
      : item,
  )

  writeCustomApiStorage({
    ...storage,
    providers,
  })

  const nextProvider = providers.find(item =>
    item.kind === provider.kind &&
    item.id === provider.id &&
    item.authMode === provider.authMode &&
    item.variant === provider.variant,
  )
  if (!nextProvider) {
    throw new Error('Failed to persist refreshed Gemini OAuth tokens')
  }
  return nextProvider
}

export async function createGeminiCliStream(input: {
  provider: ProviderConfig
  model: string
  request: GeminiGenerateContentRequest
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const oauth = input.provider.oauth
  if (!oauth?.accessToken || !oauth.projectId) {
    throw new Error('Gemini CLI OAuth provider is missing access token or project ID')
  }

  const isAntigravity = isAntigravityProvider(input.provider)
  const requestBody: GeminiCliRequest = {
    project: oauth.projectId,
    model: input.model,
    request: isAntigravity
      ? applyAntigravityRequestShape(input.request, input.model)
      : input.request,
    ...(isAntigravity ? { requestType: 'agent' as const } : {}),
    userAgent: isAntigravity ? 'antigravity' : 'pi-coding-agent',
    requestId: `${isAntigravity ? 'agent' : 'pi'}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  }
  const body = JSON.stringify(requestBody)
  const endpoints = input.provider.baseURL?.trim()
    ? [input.provider.baseURL.trim()]
    : isAntigravity
      ? [...ANTIGRAVITY_ENDPOINT_FALLBACKS]
      : [...GEMINI_CLI_ENDPOINT_FALLBACKS]
  const providerHeaders = isAntigravity
    ? getAntigravityHeaders()
    : GEMINI_CLI_HEADERS

  let response: Response | undefined
  let endpointIndex = 0
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (input.signal?.aborted) {
      throw new Error('Request was aborted')
    }
    try {
      const endpoint = endpoints[endpointIndex]!
      response = await (input.fetch ?? globalThis.fetch)(
        `${endpoint.replace(/\/+$/, '')}/v1internal:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          signal: input.signal,
          headers: {
            Authorization: `Bearer ${oauth.accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...providerHeaders,
            ...(isAntigravity && needsAntigravityClaudeThinkingHeader(input.model)
              ? { 'anthropic-beta': CLAUDE_THINKING_BETA_HEADER }
              : {}),
            ...input.headers,
          },
          body,
        },
      )

      if (response.ok && response.body) {
        return response.body.getReader()
      }

      const errorText = await response.text()
      if ((response.status === 403 || response.status === 404) && endpointIndex < endpoints.length - 1) {
        endpointIndex += 1
        continue
      }
      if (attempt < MAX_RETRIES && isRetryableError(response.status, errorText)) {
        const delayMs = extractRetryDelay(errorText, response) ?? BASE_DELAY_MS * 2 ** attempt
        await sleep(delayMs, input.signal)
        continue
      }
      throw new Error(
        `Gemini CLI request failed with status ${response.status}${errorText ? `: ${errorText}` : ''}`,
      )
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message === 'Request was aborted') {
          throw new Error('Request was aborted')
        }
        lastError = error
      } else {
        lastError = new Error(String(error))
      }
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * 2 ** attempt, input.signal)
        continue
      }
      throw lastError
    }
  }

  throw lastError ?? new Error('Failed to get Gemini CLI response')
}

export async function fetchGeminiCliResponse(input: {
  provider: ProviderConfig
  model: string
  request: GeminiGenerateContentRequest
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<unknown> {
  const oauth = input.provider.oauth
  if (!oauth?.accessToken || !oauth.projectId) {
    throw new Error('Gemini CLI OAuth provider is missing access token or project ID')
  }

  const isAntigravity = isAntigravityProvider(input.provider)
  const requestBody: GeminiCliRequest = {
    project: oauth.projectId,
    model: input.model,
    request: isAntigravity
      ? applyAntigravityRequestShape(input.request, input.model)
      : input.request,
    ...(isAntigravity ? { requestType: 'agent' as const } : {}),
    userAgent: isAntigravity ? 'antigravity' : 'pi-coding-agent',
    requestId: `${isAntigravity ? 'agent' : 'pi'}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  }
  const body = JSON.stringify(requestBody)
  const endpoints = input.provider.baseURL?.trim()
    ? [input.provider.baseURL.trim()]
    : isAntigravity
      ? [...ANTIGRAVITY_ENDPOINT_FALLBACKS]
      : [...GEMINI_CLI_ENDPOINT_FALLBACKS]
  const providerHeaders = isAntigravity
    ? getAntigravityHeaders()
    : GEMINI_CLI_HEADERS

  let response: Response | undefined
  let endpointIndex = 0
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (input.signal?.aborted) {
      throw new Error('Request was aborted')
    }
    try {
      const endpoint = endpoints[endpointIndex]!
      response = await (input.fetch ?? globalThis.fetch)(
        `${endpoint.replace(/\/+$/, '')}/v1internal:generateContent`,
        {
          method: 'POST',
          signal: input.signal,
          headers: {
            Authorization: `Bearer ${oauth.accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...providerHeaders,
            ...(isAntigravity && needsAntigravityClaudeThinkingHeader(input.model)
              ? { 'anthropic-beta': CLAUDE_THINKING_BETA_HEADER }
              : {}),
            ...input.headers,
          },
          body,
        },
      )

      if (response.ok) {
        return await response.json()
      }

      const errorText = await response.text()
      if (
        (response.status === 403 || response.status === 404) &&
        endpointIndex < endpoints.length - 1
      ) {
        endpointIndex += 1
        continue
      }
      if (attempt < MAX_RETRIES && isRetryableError(response.status, errorText)) {
        const delayMs =
          extractRetryDelay(errorText, response) ?? BASE_DELAY_MS * 2 ** attempt
        await sleep(delayMs, input.signal)
        continue
      }
      throw new Error(
        `Gemini CLI request failed with status ${response.status}${errorText ? `: ${errorText}` : ''}`,
      )
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message === 'Request was aborted') {
          throw new Error('Request was aborted')
        }
        lastError = error
      } else {
        lastError = new Error(String(error))
      }
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * 2 ** attempt, input.signal)
        continue
      }
      throw lastError
    }
  }

  throw lastError ?? new Error('Failed to get Gemini CLI response')
}

function isGeminiChunkLike(raw: unknown): raw is GeminiChunk {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    ('candidates' in raw || 'usageMetadata' in raw || 'responseId' in raw)
  )
}

function normalizeGeminiChunkLike(record: Record<string, unknown>): GeminiChunk | null {
  if ('content' in record || 'finishReason' in record) {
    return {
      candidates: [record as unknown as GeminiCandidate],
    }
  }

  if ('parts' in record && Array.isArray(record.parts)) {
    return {
      candidates: [
        {
          content: {
            parts: record.parts as GeminiPart[],
          },
        },
      ],
    }
  }

  if (
    typeof record.text === 'string' ||
    (record.functionCall && typeof record.functionCall === 'object') ||
    (record.functionResponse && typeof record.functionResponse === 'object')
  ) {
    return {
      candidates: [
        {
          content: {
            parts: [record as unknown as GeminiPart],
          },
        },
      ],
    }
  }

  return null
}

function extractGeminiErrorMessage(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const message = extractGeminiErrorMessage(item)
      if (message) return message
    }
    return undefined
  }

  const record = raw as Record<string, unknown>
  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error.trim()
  }
  if (record.error && typeof record.error === 'object') {
    const errorRecord = record.error as Record<string, unknown>
    if (typeof errorRecord.message === 'string' && errorRecord.message.trim()) {
      return errorRecord.message.trim()
    }
    if (typeof errorRecord.status === 'string' && errorRecord.status.trim()) {
      return errorRecord.status.trim()
    }
  }

  for (const key of ['response', 'result', 'data', 'chunk']) {
    const message = extractGeminiErrorMessage(record[key])
    if (message) return message
  }

  return undefined
}

function unwrapGeminiChunks(raw: unknown): GeminiChunk[] {
  if (Array.isArray(raw)) {
    return raw.flatMap(item => unwrapGeminiChunks(item))
  }
  if (!raw || typeof raw !== 'object') return []
  if (isGeminiChunkLike(raw)) {
    return [raw]
  }

  const record = raw as Record<string, unknown>
  const normalizedChunk = normalizeGeminiChunkLike(record)
  if (normalizedChunk) {
    return [normalizedChunk]
  }

  for (const key of ['response', 'result', 'data', 'chunk']) {
    const chunks = unwrapGeminiChunks(record[key])
    if (chunks.length > 0) {
      return chunks
    }
  }

  return []
}

function mapGeminiUsage(usage?: GeminiUsageMetadata) {
  return {
    input_tokens: (usage?.promptTokenCount ?? 0) - (usage?.cachedContentTokenCount ?? 0),
    output_tokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: usage?.cachedContentTokenCount ?? 0,
  }
}

function toGeminiStartUsage(usage?: GeminiUsageMetadata) {
  return mapGeminiUsage(usage)
}

export async function* createAnthropicStreamFromGemini(input: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  model: string
}): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false
  let promptTokens = 0
  let completionTokens = 0
  let stopReason: BetaMessage['stop_reason'] = 'end_turn'
  let responseId = 'gemini-compat'
  let nextContentIndex = 0
  let currentTextIndex: number | null = null
  let currentThinkingIndex: number | null = null
  const openContentIndices: number[] = []
  const toolIndices = new Set<number>()
  let empty = true
  let sawFinishReason = false
  let sawUsageMetadata = false
  let latestUsage = mapGeminiUsage()
  let lastRawGeminiPayload: string | undefined

  function allocateContentIndex(): number {
    return nextContentIndex++
  }

  function markOpen(index: number) {
    openContentIndices.push(index)
  }

  while (true) {
    const { done, value } = await input.reader.read()
    if (done) {
      buffer += decoder.decode()
    } else {
      buffer += decoder.decode(value, { stream: true })
    }

    const parsed = parseSSEChunk(buffer)
    const rawEvents =
      done && parsed.remainder.trim().length > 0
        ? [...parsed.events, parsed.remainder]
        : parsed.events
    buffer = done ? '' : parsed.remainder

    for (const rawEvent of rawEvents) {
      const dataLines = getGeminiEventPayloads(rawEvent)

      for (const data of dataLines) {
        if (!data || data === '[DONE]') continue
        lastRawGeminiPayload = data
        const parsedPayloads = parseGeminiJsonPayloads(data)
        if (parsedPayloads.length === 0) {
          throw new Error(
            `${GEMINI_UNPARSEABLE_RESPONSE_PREFIX} ${data.slice(0, 500)}`,
          )
        }

        for (const parsedPayload of parsedPayloads) {
          const chunks = unwrapGeminiChunks(parsedPayload)
          if (chunks.length === 0) {
            const errorMessage = extractGeminiErrorMessage(parsedPayload)
            if (errorMessage) {
              throw new Error(
                `Gemini-compatible request returned an error payload: ${errorMessage}`,
              )
            }
            continue
          }

          for (const chunk of chunks) {
            if (!started) {
              started = true
              const startUsage = toGeminiStartUsage(chunk.usageMetadata)
              latestUsage = startUsage
              yield {
                type: 'message_start',
                message: {
                  id: responseId,
                  type: 'message',
                  role: 'assistant',
                  model: input.model,
                  content: [],
                  stop_reason: null,
                  stop_sequence: null,
                  usage: startUsage,
                },
              } as BetaRawMessageStreamEvent
            }

            if (chunk.responseId) {
              responseId = chunk.responseId
            }

            const candidate = chunk.candidates?.[0]
            const parts = candidate?.content?.parts ?? []
            for (const part of parts) {
              if (typeof part.text === 'string' && part.text.length > 0) {
                empty = false
                const isThinking = part.thought === true
                if (isThinking) {
                  if (currentTextIndex !== null) {
                    yield { type: 'content_block_stop', index: currentTextIndex } as BetaRawMessageStreamEvent
                    currentTextIndex = null
                  }
                  if (currentThinkingIndex === null) {
                    currentThinkingIndex = allocateContentIndex()
                    markOpen(currentThinkingIndex)
                    yield {
                      type: 'content_block_start',
                      index: currentThinkingIndex,
                      content_block: {
                        type: 'thinking',
                        thinking: '',
                        signature: part.thoughtSignature ?? '',
                      },
                    } as BetaRawMessageStreamEvent
                  }
                  yield {
                    type: 'content_block_delta',
                    index: currentThinkingIndex,
                    delta: {
                      type: 'thinking_delta',
                      thinking: part.text,
                    },
                  } as BetaRawMessageStreamEvent
                  if (part.thoughtSignature) {
                    yield {
                      type: 'content_block_delta',
                      index: currentThinkingIndex,
                      delta: {
                        type: 'signature_delta',
                        signature: part.thoughtSignature,
                      },
                    } as BetaRawMessageStreamEvent
                  }
                } else {
                  if (currentThinkingIndex !== null) {
                    yield { type: 'content_block_stop', index: currentThinkingIndex } as BetaRawMessageStreamEvent
                    currentThinkingIndex = null
                  }
                  if (currentTextIndex === null) {
                    currentTextIndex = allocateContentIndex()
                    markOpen(currentTextIndex)
                    yield {
                      type: 'content_block_start',
                      index: currentTextIndex,
                      content_block: {
                        type: 'text',
                        text: '',
                      },
                    } as BetaRawMessageStreamEvent
                  }
                  yield {
                    type: 'content_block_delta',
                    index: currentTextIndex,
                    delta: {
                      type: 'text_delta',
                      text: part.text,
                    },
                  } as BetaRawMessageStreamEvent
                }
              }

              if (part.functionCall) {
                empty = false
                if (currentTextIndex !== null) {
                  yield { type: 'content_block_stop', index: currentTextIndex } as BetaRawMessageStreamEvent
                  currentTextIndex = null
                }
                if (currentThinkingIndex !== null) {
                  yield { type: 'content_block_stop', index: currentThinkingIndex } as BetaRawMessageStreamEvent
                  currentThinkingIndex = null
                }
                const toolIndex = allocateContentIndex()
                toolIndices.add(toolIndex)
                markOpen(toolIndex)
                yield {
                  type: 'content_block_start',
                  index: toolIndex,
                  content_block: {
                    type: 'tool_use',
                    id:
                      part.functionCall.id ??
                      `toolu_${part.functionCall.name ?? 'gemini'}_${toolIndex}`,
                    name: part.functionCall.name ?? '',
                    input: '',
                    signature: part.thoughtSignature ?? '',
                  },
                } as BetaRawMessageStreamEvent
                yield {
                  type: 'content_block_delta',
                  index: toolIndex,
                  delta: {
                    type: 'input_json_delta',
                    partial_json: JSON.stringify(part.functionCall.args ?? {}),
                  },
                } as BetaRawMessageStreamEvent
                stopReason = 'tool_use'
              }
            }

            if (chunk.usageMetadata) {
              sawUsageMetadata = true
              latestUsage = mapGeminiUsage(chunk.usageMetadata)
              promptTokens = latestUsage.input_tokens
              completionTokens = latestUsage.output_tokens
            }

            if (candidate?.finishReason && stopReason !== 'tool_use') {
              sawFinishReason = true
              stopReason = mapFinishReason(candidate.finishReason)
            }
          }
        }
      }
    }

    if (done) {
      break
    }
  }

  if (empty && !sawFinishReason && !sawUsageMetadata) {
    if (lastRawGeminiPayload) {
      throw new Error(
        `${GEMINI_UNRECOGNIZED_RESPONSE_PREFIX} ${lastRawGeminiPayload.slice(0, 500)}`,
      )
    }
    throw new Error(GEMINI_EMPTY_RESPONSE_ERROR)
  }

  if (!started) {
    yield {
      type: 'message_start',
      message: {
        id: responseId,
        type: 'message',
        role: 'assistant',
        model: input.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: latestUsage,
      },
    } as BetaRawMessageStreamEvent
  }

  for (const index of openContentIndices) {
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
    usage: latestUsage,
  } as BetaRawMessageStreamEvent

  yield {
    type: 'message_stop',
  } as BetaRawMessageStreamEvent

  return {
    id: responseId,
    type: 'message',
    role: 'assistant',
    model: input.model,
    content: [],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: latestUsage,
  } as BetaMessage
}

function shouldRetryGeminiStreamingParseError(message: string): boolean {
  return (
    message === GEMINI_EMPTY_RESPONSE_ERROR ||
    message.startsWith(GEMINI_UNRECOGNIZED_RESPONSE_PREFIX) ||
    message.startsWith(GEMINI_UNPARSEABLE_RESPONSE_PREFIX)
  )
}

export async function* createAnthropicStreamFromGeminiWithEmptyRetry(input: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  recreateReader?: () => Promise<ReadableStreamDefaultReader<Uint8Array>>
  fallbackPayload?: () => Promise<unknown>
  model: string
  signal?: AbortSignal
}): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  let reader = input.reader

  for (let attempt = 0; ; attempt++) {
    try {
      return yield* createAnthropicStreamFromGemini({
        reader,
        model: input.model,
      })
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error))
      const shouldRetryEmptyResponse =
        shouldRetryGeminiStreamingParseError(normalizedError.message) &&
        !!input.recreateReader &&
        attempt < MAX_EMPTY_STREAM_RETRIES

      if (shouldRetryEmptyResponse) {
        await reader.cancel().catch(() => {})
        await sleep(EMPTY_STREAM_BASE_DELAY_MS * 2 ** attempt, input.signal)
        reader = await input.recreateReader!()
        continue
      }

      if (
        shouldRetryGeminiStreamingParseError(normalizedError.message) &&
        input.fallbackPayload
      ) {
        await reader.cancel().catch(() => {})
        const payload = await input.fallbackPayload()
        return yield* createAnthropicStreamFromGemini({
          reader: createReaderFromGeminiPayload(payload),
          model: input.model,
        })
      }

      throw normalizedError
    }
  }
}

export async function createGeminiCliStreamWithEmptyRetry(input: {
  provider: ProviderConfig
  model: string
  request: GeminiGenerateContentRequest
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= MAX_EMPTY_STREAM_RETRIES; attempt++) {
    try {
      return await createGeminiCliStream(input)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < MAX_EMPTY_STREAM_RETRIES) {
        await sleep(EMPTY_STREAM_BASE_DELAY_MS * 2 ** attempt, input.signal)
      }
    }
  }
  throw lastError ?? new Error('Failed to create Gemini CLI stream')
}
