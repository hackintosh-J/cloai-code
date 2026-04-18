import { describe, expect, test } from 'bun:test'
import { APIConnectionError, APIError } from '@anthropic-ai/sdk'
import {
  convertAnthropicRequestToOpenAICodex,
  convertAnthropicRequestToOpenAIResponses,
  createAnthropicStreamFromOpenAI,
  createAnthropicStreamFromOpenAIResponses,
  createAnthropicStreamFromOpenAIWithEmptyRetry,
  createOpenAICompatStream,
  createOpenAIResponsesStream,
  createOpenAICodexStream,
  createCopilotChatStream,
} from './openaiCompat.js'

function readAllFromGenerator<T>(generator: AsyncGenerator<T, any, void>) {
  return (async () => {
    while (true) {
      const next = await generator.next()
      if (next.done) return next.value
    }
  })()
}

describe('OpenAI compat APIError conversion', () => {
  test('createOpenAICompatStream converts failed response to APIError', async () => {
    try {
      await createOpenAICompatStream(
        {
          apiKey: 'test',
          baseURL: 'https://test.local',
          fetch: async () =>
            new Response('Bad Gateway', {
              status: 502,
              statusText: 'Bad Gateway',
            }),
        },
        { model: 'gpt-4', messages: [] } as any,
      )
      expect().fail('Should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(APIError)
      expect((e as APIError).status).toBe(502)
      expect((e as APIError).message).toContain('OpenAI compatible request failed')
      expect((e as APIError).message).toContain('Bad Gateway')
    }
  })

  test('createOpenAIResponsesStream converts failed response to APIError', async () => {
    try {
      await createOpenAIResponsesStream(
        {
          apiKey: 'test',
          baseURL: 'https://test.local',
          fetch: async () =>
            new Response('Internal Server Error', { status: 500 }),
        },
        { model: 'gpt-4', input: [], store: false, stream: true } as any,
      )
      expect().fail('Should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(APIError)
      expect((e as APIError).status).toBe(500)
    }
  })

  test('createOpenAIResponsesStream retries retryable HTTP errors', async () => {
    let attempts = 0

    const reader = await createOpenAIResponsesStream(
      {
        apiKey: 'test',
        baseURL: 'https://test.local',
        fetch: async () => {
          attempts += 1
          if (attempts < 3) {
            return new Response('Upstream unavailable', { status: 503 })
          }
          return new Response('data: [DONE]\n\n', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        },
      },
      { model: 'gpt-4', input: [], store: false, stream: true } as any,
    )

    expect(attempts).toBe(3)
    expect(await reader.read()).toEqual({
      done: false,
      value: new TextEncoder().encode('data: [DONE]\n\n'),
    })
  })

  test('createOpenAIResponsesStream converts fetch connection errors to APIConnectionError', async () => {
    await expect(
      createOpenAIResponsesStream(
        {
          apiKey: 'test',
          baseURL: 'https://test.local',
          fetch: async () => {
            throw new Error(
              'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
            )
          },
        },
        { model: 'gpt-4', input: [], store: false, stream: true } as any,
      ),
    ).rejects.toBeInstanceOf(APIConnectionError)
  })

  test('createOpenAICodexStream converts failed response to APIError', async () => {
    try {
      await createOpenAICodexStream(
        {
          apiKey: 'test',
          baseURL: 'https://test.local',
          fetch: async () => new Response('Timeout', { status: 408 }),
        },
        { model: 'gpt-4', input: [], store: false, stream: true } as any,
      )
      expect().fail('Should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(APIError)
      expect((e as APIError).status).toBe(408)
    }
  })

  test('createCopilotChatStream retries retryable HTTP errors', async () => {
    let attempts = 0

    const reader = await createCopilotChatStream(
      {
        apiKey: 'test',
        baseURL: 'https://test.local',
        fetch: async () => {
          attempts += 1
          if (attempts < 3) {
            return new Response('Gateway timeout', { status: 504 })
          }
          return new Response('data: [DONE]\n\n', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        },
      },
      { model: 'gpt-4', messages: [] } as any,
    )

    expect(attempts).toBe(3)
    expect(await reader.read()).toEqual({
      done: false,
      value: new TextEncoder().encode('data: [DONE]\n\n'),
    })
  })

  test('createCopilotChatStream converts failed response to APIError', async () => {
    try {
      await createCopilotChatStream(
        {
          apiKey: 'test',
          baseURL: 'https://test.local',
          fetch: async () => new Response('Rate limit', { status: 429 }),
        },
        { model: 'gpt-4', messages: [] } as any,
      )
      expect().fail('Should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(APIError)
      expect((e as APIError).status).toBe(429)
    }
  })
})

describe('OpenAI compat stream parse errors', () => {
  test('createAnthropicStreamFromOpenAI throws specific error on malformed JSON', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {malformed json}\n\n'))
        controller.close()
      },
    })

    const generator = createAnthropicStreamFromOpenAI({
      reader: stream.getReader(),
      model: 'gpt-4',
    })

    try {
      await generator.next()
      expect().fail('Should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('[openaiCompat] failed to parse JSON')
    }
  })

  test('createAnthropicStreamFromOpenAIResponses routes interleaved parallel tool deltas to the correct tool blocks', async () => {
    const encoder = new TextEncoder()
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'first_tool',
        },
      },
      {
        type: 'response.output_item.added',
        output_index: 1,
        item: {
          type: 'function_call',
          id: 'fc_2',
          call_id: 'call_2',
          name: 'second_tool',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        item_id: 'fc_1',
        call_id: 'call_1',
        delta: '{"a":',
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 1,
        item_id: 'fc_2',
        call_id: 'call_2',
        delta: '{"b":',
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'first_tool',
          arguments: '{"a":1}',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 1,
        item_id: 'fc_2',
        call_id: 'call_2',
        delta: '2}',
      },
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: {
          type: 'function_call',
          id: 'fc_2',
          call_id: 'call_2',
          name: 'second_tool',
          arguments: '{"b":2}',
        },
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp_123',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
        },
      },
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')),
        )
        controller.close()
      },
    })

    const generator = createAnthropicStreamFromOpenAIResponses({
      reader: stream.getReader(),
      model: 'gpt-4',
    })

    const emittedEvents: any[] = []
    let finalMessage: any
    while (true) {
      const result = await generator.next()
      if (result.done) {
        finalMessage = result.value
        break
      }
      emittedEvents.push(result.value)
    }

    const toolStarts = emittedEvents.filter(
      event =>
        event.type === 'content_block_start' &&
        event.content_block?.type === 'tool_use',
    )
    expect(toolStarts).toHaveLength(2)

    const firstToolIndex = toolStarts.find(
      event => event.content_block.name === 'first_tool',
    )?.index
    const secondToolIndex = toolStarts.find(
      event => event.content_block.name === 'second_tool',
    )?.index

    expect(firstToolIndex).toBeDefined()
    expect(secondToolIndex).toBeDefined()
    expect(firstToolIndex).not.toBe(secondToolIndex)

    const collectToolJson = (index: number) =>
      emittedEvents
        .filter(
          event =>
            event.type === 'content_block_delta' &&
            event.index === index &&
            event.delta?.type === 'input_json_delta',
        )
        .map(event => event.delta.partial_json)
        .join('')

    expect(collectToolJson(firstToolIndex!)).toBe('{"a":1}')
    expect(collectToolJson(secondToolIndex!)).toBe('{"b":2}')
    expect(finalMessage?.stop_reason).toBe('tool_use')
  })
})

describe('convertAnthropicRequestToOpenAIResponses', () => {
  test('preserves tool results when a later user turn mixes tool_result and text', () => {
    const request = convertAnthropicRequestToOpenAIResponses({
      model: 'gpt-5.4',
      system: [
        { text: 'Static instructions' },
        { text: '<system-reminder>Dynamic instructions</system-reminder>' },
      ],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First prompt' }],
        } as any,
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'First answer' }],
        } as any,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_123', content: 'ok' },
            { type: 'text', text: 'Second prompt' },
          ],
        } as any,
      ],
    })

    expect(request.input.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: 'Second prompt',
        },
      ],
    })

    expect(request.input).toContainEqual({
      type: 'function_call_output',
      call_id: 'call_123',
      output: 'ok',
    })
  })

  test('scopes prompt_cache_key by cacheScopeKey while remaining stable within that scope', () => {
    const baseInput = {
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First prompt' }],
        } as any,
      ],
    }

    const requestA1 = convertAnthropicRequestToOpenAIResponses({
      ...baseInput,
      cacheScopeKey: 'session-a:repl_main_thread',
    })
    const requestA2 = convertAnthropicRequestToOpenAIResponses({
      ...baseInput,
      cacheScopeKey: 'session-a:repl_main_thread',
    })
    const requestB = convertAnthropicRequestToOpenAIResponses({
      ...baseInput,
      cacheScopeKey: 'session-b:repl_main_thread',
    })

    expect(requestA1.prompt_cache_key).toBe(requestA2.prompt_cache_key)
    expect(requestA1.prompt_cache_key).not.toBe(requestB.prompt_cache_key)
  })

  test('further scopes prompt_cache_key by first user turn within the same cache scope', () => {
    const shared = {
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      cacheScopeKey: 'session-a:repl_main_thread',
    }

    const requestA1 = convertAnthropicRequestToOpenAIResponses({
      ...shared,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses in responses api' }],
        } as any,
      ],
    })
    const requestA2 = convertAnthropicRequestToOpenAIResponses({
      ...shared,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses in responses api' }],
        } as any,
      ],
    })
    const requestB = convertAnthropicRequestToOpenAIResponses({
      ...shared,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Help me refactor the settings page' }],
        } as any,
      ],
    })

    expect(requestA1.prompt_cache_key).toBe(requestA2.prompt_cache_key)
    expect(requestA1.prompt_cache_key).not.toBe(requestB.prompt_cache_key)
  })

  test('normalizes responses tool definitions before hashing and sending', () => {
    const request = convertAnthropicRequestToOpenAIResponses({
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First prompt' }],
        } as any,
      ],
      tools: [
        {
          name: 'zetaTool',
          description: 'zeta',
          input_schema: {
            type: 'object',
            required: ['b', 'a'],
            properties: {
              z: { type: 'string' },
              a: { type: 'number' },
            },
          },
        } as any,
        {
          name: 'alphaTool',
          description: 'alpha',
          input_schema: {
            properties: {
              beta: { type: 'boolean' },
              alpha: { type: 'string' },
            },
            type: 'object',
          },
        } as any,
      ],
    })

    expect(request.tools?.map(tool => tool.name)).toEqual([
      'alphaTool',
      'zetaTool',
    ])
    expect(
      Object.keys(
        (request.tools?.[0]?.parameters ?? {}) as Record<string, unknown>,
      ),
    ).toEqual(['properties', 'type'])
    expect(
      Object.keys(
        ((request.tools?.[0]?.parameters ?? {}) as Record<string, unknown>)
          .properties as Record<string, unknown>,
      ),
    ).toEqual(['alpha', 'beta'])
  })

  test('preserves append-only responses order for assistant text plus later tool results', () => {
    const request = convertAnthropicRequestToOpenAIResponses({
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses' }],
        } as any,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_1',
              name: 'TaskCreate',
              input: { title: 'task 1' },
            },
            {
              type: 'tool_use',
              id: 'call_2',
              name: 'TaskCreate',
              input: { title: 'task 2' },
            },
            {
              type: 'tool_use',
              id: 'call_3',
              name: 'TaskCreate',
              input: { title: 'task 3' },
            },
            {
              type: 'text',
              text: '我先查代码路径和缓存实现，再跑复现实验。',
            },
            {
              type: 'tool_use',
              id: 'call_4',
              name: 'Grep',
              input: { pattern: 'prompt_cache_key' },
            },
            {
              type: 'tool_use',
              id: 'call_5',
              name: 'Read',
              input: { file_path: 'src/services/api/openaiCompat.ts' },
            },
          ],
        } as any,
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_1',
              content: 'task 1 done',
            },
            {
              type: 'tool_result',
              tool_use_id: 'call_2',
              content: 'task 2 done',
            },
            {
              type: 'tool_result',
              tool_use_id: 'call_3',
              content: 'task 3 done',
            },
            {
              type: 'tool_result',
              tool_use_id: 'call_4',
              content: 'grep output',
            },
            {
              type: 'tool_result',
              tool_use_id: 'call_5',
              content: 'read output',
            },
          ],
        } as any,
      ],
      tools: [
        {
          name: 'TaskCreate',
          input_schema: { type: 'object' },
        } as any,
        {
          name: 'Grep',
          input_schema: { type: 'object' },
        } as any,
        {
          name: 'Read',
          input_schema: { type: 'object' },
        } as any,
      ],
    })

    expect(request.input.map(item => ('role' in item ? item.role : item.type))).toEqual([
      'user',
      'function_call',
      'function_call_output',
      'function_call',
      'function_call_output',
      'function_call',
      'function_call_output',
      'assistant',
      'function_call',
      'function_call_output',
      'function_call',
      'function_call_output',
    ])

    expect(request.input[7]).toEqual({
      role: 'assistant',
      content: [{ type: 'output_text', text: '我先查代码路径和缓存实现，再跑复现实验。' }],
    })
  })

  test('keeps prior tool call outputs in prefix when a later turn adds one new tool call', () => {
    const requestA = convertAnthropicRequestToOpenAIResponses({
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses' }],
        } as any,
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_1', name: 'TaskCreate', input: { title: 'a' } },
            { type: 'tool_use', id: 'call_2', name: 'TaskCreate', input: { title: 'b' } },
          ],
        } as any,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: 'task a done' },
            { type: 'tool_result', tool_use_id: 'call_2', content: 'task b done' },
          ],
        } as any,
      ],
      tools: [{ name: 'TaskCreate', input_schema: { type: 'object' } } as any],
    })

    const requestB = convertAnthropicRequestToOpenAIResponses({
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses' }],
        } as any,
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_1', name: 'TaskCreate', input: { title: 'a' } },
            { type: 'tool_use', id: 'call_2', name: 'TaskCreate', input: { title: 'b' } },
          ],
        } as any,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: 'task a done' },
            { type: 'tool_result', tool_use_id: 'call_2', content: 'task b done' },
          ],
        } as any,
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_3', name: 'Read', input: { file_path: 'src/services/api/openaiCompat.ts' } },
          ],
        } as any,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_3', content: 'read output' },
          ],
        } as any,
      ],
      tools: [
        { name: 'TaskCreate', input_schema: { type: 'object' } } as any,
        { name: 'Read', input_schema: { type: 'object' } } as any,
      ],
    })

    expect(requestA.input).toEqual(requestB.input.slice(0, requestA.input.length))
    expect(requestB.input.map(item => ('role' in item ? item.role : item.type))).toEqual([
      'user',
      'function_call',
      'function_call_output',
      'function_call',
      'function_call_output',
      'function_call',
      'function_call_output',
    ])
  })

  test('scopes codex prompt_cache_key by cacheScopeKey while remaining stable within that scope', () => {
    const baseInput = {
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First prompt' }],
        } as any,
      ],
    }

    const requestA1 = convertAnthropicRequestToOpenAICodex({
      ...baseInput,
      cacheScopeKey: 'session-a:repl_main_thread',
    } as any)
    const requestA2 = convertAnthropicRequestToOpenAICodex({
      ...baseInput,
      cacheScopeKey: 'session-a:repl_main_thread',
    } as any)
    const requestB = convertAnthropicRequestToOpenAICodex({
      ...baseInput,
      cacheScopeKey: 'session-b:repl_main_thread',
    } as any)

    expect(typeof requestA1.prompt_cache_key).toBe('string')
    expect(requestA1.prompt_cache_key).toBe(requestA2.prompt_cache_key)
    expect(requestA1.prompt_cache_key).not.toBe(requestB.prompt_cache_key)
  })

  test('further scopes codex prompt_cache_key by first user turn within the same cache scope', () => {
    const shared = {
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      cacheScopeKey: 'session-a:repl_main_thread',
    }

    const requestA1 = convertAnthropicRequestToOpenAICodex({
      ...shared,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses in responses api' }],
        } as any,
      ],
    } as any)
    const requestA2 = convertAnthropicRequestToOpenAICodex({
      ...shared,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses in responses api' }],
        } as any,
      ],
    } as any)
    const requestB = convertAnthropicRequestToOpenAICodex({
      ...shared,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Help me refactor the settings page' }],
        } as any,
      ],
    } as any)

    expect(typeof requestA1.prompt_cache_key).toBe('string')
    expect(requestA1.prompt_cache_key).toBe(requestA2.prompt_cache_key)
    expect(requestA1.prompt_cache_key).not.toBe(requestB.prompt_cache_key)
  })

  test('keeps codex append-only prefix behavior after adding prompt_cache_key', () => {
    const requestA = convertAnthropicRequestToOpenAICodex({
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      cacheScopeKey: 'session-a:repl_main_thread',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses' }],
        } as any,
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_1', name: 'TaskCreate', input: { title: 'a' } },
            { type: 'tool_use', id: 'call_2', name: 'TaskCreate', input: { title: 'b' } },
          ],
        } as any,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: 'task a done' },
            { type: 'tool_result', tool_use_id: 'call_2', content: 'task b done' },
          ],
        } as any,
      ],
      tools: [{ name: 'TaskCreate', input_schema: { type: 'object' } } as any],
    } as any)

    const requestB = convertAnthropicRequestToOpenAICodex({
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      cacheScopeKey: 'session-a:repl_main_thread',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses' }],
        } as any,
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_1', name: 'TaskCreate', input: { title: 'a' } },
            { type: 'tool_use', id: 'call_2', name: 'TaskCreate', input: { title: 'b' } },
          ],
        } as any,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: 'task a done' },
            { type: 'tool_result', tool_use_id: 'call_2', content: 'task b done' },
          ],
        } as any,
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_3', name: 'Read', input: { file_path: 'src/services/api/openaiCompat.ts' } },
          ],
        } as any,
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_3', content: 'read output' }],
        } as any,
      ],
      tools: [
        { name: 'TaskCreate', input_schema: { type: 'object' } } as any,
        { name: 'Read', input_schema: { type: 'object' } } as any,
      ],
    } as any)

    expect(typeof requestA.prompt_cache_key).toBe('string')
    expect(typeof requestB.prompt_cache_key).toBe('string')
    expect(requestA.input).toEqual(requestB.input.slice(0, requestA.input.length))
    expect(requestB.input.map(item => ('role' in item ? item.role : item.type))).toEqual([
      'user',
      'function_call',
      'function_call_output',
      'function_call',
      'function_call_output',
      'function_call',
      'function_call_output',
    ])
  })

  test('keeps prior tool call outputs in prefix for codex requests too', () => {
    const requestA = convertAnthropicRequestToOpenAICodex({
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses' }],
        } as any,
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_1', name: 'TaskCreate', input: { title: 'a' } },
            { type: 'tool_use', id: 'call_2', name: 'TaskCreate', input: { title: 'b' } },
          ],
        } as any,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: 'task a done' },
            { type: 'tool_result', tool_use_id: 'call_2', content: 'task b done' },
          ],
        } as any,
      ],
      tools: [{ name: 'TaskCreate', input_schema: { type: 'object' } } as any],
    })

    const requestB = convertAnthropicRequestToOpenAICodex({
      model: 'gpt-5.4',
      system: [{ text: 'Static instructions' }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Investigate cache misses' }],
        } as any,
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_1', name: 'TaskCreate', input: { title: 'a' } },
            { type: 'tool_use', id: 'call_2', name: 'TaskCreate', input: { title: 'b' } },
          ],
        } as any,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: 'task a done' },
            { type: 'tool_result', tool_use_id: 'call_2', content: 'task b done' },
          ],
        } as any,
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_3', name: 'Read', input: { file_path: 'src/services/api/openaiCompat.ts' } },
          ],
        } as any,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_3', content: 'read output' },
          ],
        } as any,
      ],
      tools: [
        { name: 'TaskCreate', input_schema: { type: 'object' } } as any,
        { name: 'Read', input_schema: { type: 'object' } } as any,
      ],
    })

    expect(requestA.input).toEqual(requestB.input.slice(0, requestA.input.length))
    expect(requestB.input.map(item => ('role' in item ? item.role : item.type))).toEqual([
      'user',
      'function_call',
      'function_call_output',
      'function_call',
      'function_call_output',
      'function_call',
      'function_call_output',
    ])
  })
})

describe('createAnthropicStreamFromOpenAIWithEmptyRetry', () => {
  test.each([
    '[openaiCompat] invalid stream chunk: bad payload',
    '[openaiCompat] chunk missing choices[0]: {}',
    '[openaiCompat] stream ended unexpectedly before message_stop for model=gpt-4',
    '[openaiCompat] responses stream ended unexpectedly before message_stop for model=gpt-4',
    '[openaiCompat] retryable responses error: OpenAI Responses request failed with status 503',
  ])('retries transient compat stream error %s', async message => {
    let recreateCalls = 0
    const firstReader = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    }).getReader()
    const secondReader = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    }).getReader()

    const generator = createAnthropicStreamFromOpenAIWithEmptyRetry({
      reader: firstReader,
      recreateReader: async () => {
        recreateCalls += 1
        return secondReader
      },
      generatorFactory: async function* (reader) {
        if (reader === firstReader) {
          throw new Error(message)
        }
        return {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          model: 'gpt-4',
          content: [],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        }
      },
      model: 'gpt-4',
    })

    const result = await generator.next()
    expect(result.done).toBe(true)
    expect(result.value?.id).toBe('msg_123')
    expect(recreateCalls).toBe(1)
  })

  test('does not retry non-retryable errors', async () => {
    let recreateCalls = 0
    const reader = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    }).getReader()

    const generator = createAnthropicStreamFromOpenAIWithEmptyRetry({
      reader,
      recreateReader: async () => {
        recreateCalls += 1
        return reader
      },
      generatorFactory: async function* () {
        throw new APIConnectionError({ cause: new Error('socket hang up') })
      },
      model: 'gpt-4',
    })

    await expect(generator.next()).rejects.toBeInstanceOf(APIConnectionError)
    expect(recreateCalls).toBe(0)
  })
})
