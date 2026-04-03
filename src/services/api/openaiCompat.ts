import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

type AnyBlock = Record<string, unknown>

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

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
}

export type OpenAIChatRequest = {
  model: string
  messages: OpenAIChatMessage[]
  stream?: boolean
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
}

type OpenAICodexInputItem =
  | {
      role: 'user'
      content: Array<{
        type: 'input_text'
        text: string
      }>
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
      content: Array<{
        type: 'input_text'
        text: string
      }>
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
  tools?: Array<{
    type: 'function'
    name: string
    description?: string
    parameters?: unknown
  }>
  tool_choice?: 'auto'
  parallel_tool_calls?: true
  temperature?: number
  max_output_tokens?: number
  include?: ['reasoning.encrypted_content']
}

type ResponsesStreamEvent =
  | CodexResponseCompletedEvent
  | CodexOutputItemAddedEvent
  | CodexOutputTextDeltaEvent
  | CodexReasoningDeltaEvent
  | CodexReasoningDoneEvent
  | CodexFunctionCallArgumentsDeltaEvent
  | CodexOutputItemDoneEvent
  | CodexErrorEvent
  | { type: string; [key: string]: unknown }


export type OpenAICodexRequest = {
  model: string
  instructions?: string
  input: OpenAICodexInputItem[]
  store: false
  stream: true
  text: { verbosity: 'medium' }
  include: ['reasoning.encrypted_content']
  tool_choice: 'auto'
  parallel_tool_calls: true
  temperature?: number
  tools?: Array<{
    type: 'function'
    name: string
    description?: string
    parameters?: unknown
  }>
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
}

type CodexOutputItemDoneEvent = {
  type: 'response.output_item.done'
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
  | CodexFunctionCallArgumentsDeltaEvent
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

function contentToText(content: BetaMessageParam['content']): string {
  if (typeof content === 'string') return content
  return content
    .map(block => {
      if (block.type === 'text') return typeof block.text === 'string' ? block.text : ''
      if (block.type === 'tool_result') {
        return typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content)
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function toBlocks(content: BetaMessageParam['content']): AnyBlock[] {
  return Array.isArray(content)
    ? (content as unknown as AnyBlock[])
    : [{ type: 'text', text: content }]
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
  const messages: OpenAIChatMessage[] = []

  if (input.system) {
    const systemText = Array.isArray(input.system)
      ? input.system.map(block => block.text ?? '').join('\n')
      : input.system
    if (systemText) messages.push({ role: 'system', content: systemText })
  }

  for (const message of input.messages) {
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

      const text = contentToText(
        blocks.filter(block => block.type !== 'tool_result') as unknown as BetaMessageParam['content'],
      )
      if (text) messages.push({ role: 'user', content: text })
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

  return {
    model: targetModel,
    messages,
    temperature: input.temperature,
    max_tokens: input.max_tokens,
    ...(getToolDefinitions(input.tools)
      ? { tools: getToolDefinitions(input.tools) }
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
  const instructions = Array.isArray(input.system)
    ? input.system.map(block => block.text ?? '').join('\n')
    : input.system
  const codexInput: OpenAICodexInputItem[] = []

  for (const message of input.messages) {
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)
      const toolResults = blocks.filter(block => block.type === 'tool_result')
      for (const result of toolResults) {
        const toolUseId =
          typeof result.tool_use_id === 'string' ? result.tool_use_id : undefined
        if (!toolUseId) continue
        const content = result.content
        codexInput.push({
          type: 'function_call_output',
          call_id: toolUseId,
          output:
            typeof content === 'string' ? content : JSON.stringify(content),
        })
      }

      const text = contentToText(
        blocks.filter(block => block.type !== 'tool_result') as unknown as BetaMessageParam['content'],
      )
      if (text) {
        codexInput.push({
          role: 'user',
          content: [{ type: 'input_text', text }],
        })
      }
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
      if (text) {
        codexInput.push({
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        })
      }
      for (const block of blocks.filter(item => item.type === 'tool_use')) {
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
  }

  return {
    model: targetModel,
    ...(instructions ? { instructions } : {}),
    input: codexInput,
    store: false,
    stream: true,
    text: { verbosity: 'medium' },
    include: ['reasoning.encrypted_content'],
    tool_choice: 'auto',
    parallel_tool_calls: true,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(getCodexToolDefinitions(input.tools)
      ? { tools: getCodexToolDefinitions(input.tools) }
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
  const instructions = Array.isArray(input.system)
    ? input.system.map(block => block.text ?? '').join('\n')
    : input.system
  const responseInput: OpenAIResponsesInputItem[] = []

  for (const message of input.messages) {
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)
      const toolResults = blocks.filter(block => block.type === 'tool_result')
      for (const result of toolResults) {
        const toolUseId =
          typeof result.tool_use_id === 'string' ? result.tool_use_id : undefined
        if (!toolUseId) continue
        const content = result.content
        responseInput.push({
          type: 'function_call_output',
          call_id: toolUseId,
          output: typeof content === 'string' ? content : JSON.stringify(content),
        })
      }

      const text = contentToText(
        blocks.filter(block => block.type !== 'tool_result') as unknown as BetaMessageParam['content'],
      )
      if (text) {
        responseInput.push({
          role: 'user',
          content: [{ type: 'input_text', text }],
        })
      }
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
      if (text) {
        responseInput.push({
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        })
      }
      for (const block of blocks.filter(item => item.type === 'tool_use')) {
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
  }

  return {
    model: targetModel,
    ...(instructions ? { instructions } : {}),
    input: responseInput,
    store: false,
    stream: true,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.max_tokens !== undefined
      ? { max_output_tokens: input.max_tokens }
      : {}),
    ...(getResponsesToolDefinitions(input.tools)
      ? {
          tools: getResponsesToolDefinitions(input.tools),
          tool_choice: 'auto' as const,
          parallel_tool_calls: true as const,
          include: ['reasoning.encrypted_content'] as const,
        }
      : {
          include: ['reasoning.encrypted_content'] as const,
        }),
  }
}

export async function createOpenAICompatStream(
  config: OpenAICompatConfig,
  request: OpenAIChatRequest,
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await (config.fetch ?? globalThis.fetch)(
    joinBaseUrl(config.baseURL, '/v1/chat/completions'),
    {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
        ...config.headers,
      },
      body: JSON.stringify({ ...request, stream: true }),
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
      `OpenAI compatible request failed with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
    )
  }

  return response.body.getReader()
}

export async function createOpenAICodexStream(
  config: OpenAICodexConfig,
  request: OpenAICodexRequest,
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await (config.fetch ?? globalThis.fetch)(
    resolveCodexUrl(config.baseURL),
    {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
        ...config.headers,
      },
      body: JSON.stringify(request),
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
      `OpenAI Codex request failed with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
    )
  }

  return response.body.getReader()
}


export async function createOpenAIResponsesStream(
  config: OpenAICompatConfig,
  request: OpenAIResponsesRequest,
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await (config.fetch ?? globalThis.fetch)(
    joinBaseUrl(config.baseURL, '/v1/responses'),
    {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
        ...config.headers,
      },
      body: JSON.stringify(request),
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
      `OpenAI Responses request failed with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
    )
  }

  return response.body.getReader()
}

function parseSSEChunk(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''
  return { events: parts, remainder }
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
        const chunk = JSON.parse(data) as OpenAIStreamChunk
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
          promptTokens = chunk.usage?.prompt_tokens ?? 0
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
              usage: {
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

        if (delta?.reasoning_content) {
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
              thinking: delta.reasoning_content,
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
          completionTokens = chunk.usage?.completion_tokens ?? completionTokens
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
            usage: {
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
            usage: {
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
  let currentToolIndex: number | null = null
  let promptTokens = 0
  let completionTokens = 0
  let stopReason: BetaMessage['stop_reason'] = 'end_turn'
  const allocator = createContentIndexAllocator()

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
        const event = JSON.parse(data) as ResponsesStreamEvent
        if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
          continue
        }

        if (event.type === 'error') {
          throw new Error(
            `OpenAI Responses error: ${event.message || event.code || JSON.stringify(event)}`,
          )
        }
        if (event.type === 'response.failed') {
          throw new Error(
            event.response?.error?.message || event.message || 'OpenAI Responses failed',
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
            currentToolIndex = allocator.allocate()
            allocator.markOpen(currentToolIndex)
            yield {
              type: 'content_block_start',
              index: currentToolIndex,
              content_block: {
                type: 'tool_use',
                id: event.item.call_id ?? event.item.id ?? 'toolu_openai',
                name: event.item.name ?? '',
                input: '',
              },
            } as BetaRawMessageStreamEvent
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

        if (
          event.type === 'response.function_call_arguments.delta' &&
          currentToolIndex !== null
        ) {
          yield {
            type: 'content_block_delta',
            index: currentToolIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: event.delta,
            },
          } as BetaRawMessageStreamEvent
          stopReason = 'tool_use'
          continue
        }

        if (event.type === 'response.output_item.done') {
          if (event.item.type === 'message') {
            currentTextIndex = null
          }
          if (event.item.type === 'function_call') {
            currentToolIndex = null
          }
          continue
        }

        if (event.type === 'response.completed') {
          promptTokens = event.response?.usage?.input_tokens ?? 0
          completionTokens = event.response?.usage?.output_tokens ?? 0
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
            usage: {
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
            usage: {
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
export function mapOpenAIUsageToAnthropic(usage?: {
  prompt_tokens?: number
  completion_tokens?: number
}): BetaUsage | undefined {
  if (!usage) return undefined
  return {
    input_tokens: usage.prompt_tokens ?? 0,
    output_tokens: usage.completion_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  } as BetaUsage
}
