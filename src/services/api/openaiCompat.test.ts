import { describe, expect, test } from 'bun:test'
import { APIConnectionError, APIError } from '@anthropic-ai/sdk'
import {
  createAnthropicStreamFromOpenAI,
  createAnthropicStreamFromOpenAIResponses,
  createAnthropicStreamFromOpenAIWithEmptyRetry,
  createOpenAICompatStream,
  createOpenAIResponsesStream,
  createOpenAICodexStream,
  createCopilotChatStream,
} from './openaiCompat.js'

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
