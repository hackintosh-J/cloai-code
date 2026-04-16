import { describe, expect, test } from 'bun:test'

import { APIConnectionError } from '@anthropic-ai/sdk'

import {
  convertAnthropicRequestToGemini,
  createAnthropicStreamFromGemini,
  createGeminiVertexStream,
  fetchGeminiVertexResponse,
} from './geminiLike.js'

describe('Gemini AI Studio URL joining', () => {
  test('preserves /v1beta for streamGenerateContent requests', async () => {
    let requestedUrl = ''

    const reader = await createGeminiVertexStream({
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-flash-latest',
      request: { contents: [] },
      fetch: async input => {
        requestedUrl = String(input)
        return new Response('data: {}\n\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
          },
        })
      },
    })

    expect(requestedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse',
    )
    expect(await reader.read()).toEqual({
      done: false,
      value: new TextEncoder().encode('data: {}\n\n'),
    })
  })

  test('preserves /v1beta for generateContent requests', async () => {
    let requestedUrl = ''

    const response = await fetchGeminiVertexResponse({
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-flash-latest',
      request: { contents: [] },
      fetch: async input => {
        requestedUrl = String(input)
        return new Response(JSON.stringify({ candidates: [] }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },
    })

    expect(requestedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    )
    expect(response).toEqual({ candidates: [] })
  })
})

describe('Gemini Vertex-compatible base URL defaults', () => {
  test('defaults streamGenerateContent requests to /v1beta', async () => {
    let requestedUrl = ''
    let requestCount = 0

    const reader = await createGeminiVertexStream({
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.googleapis.com',
      model: 'gemini-flash-latest',
      request: { contents: [] },
      fetch: async input => {
        requestCount += 1
        requestedUrl = String(input)
        return new Response('data: {}\n\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
          },
        })
      },
    })

    expect(requestCount).toBe(1)
    expect(requestedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse',
    )
    expect(await reader.read()).toEqual({
      done: false,
      value: new TextEncoder().encode('data: {}\n\n'),
    })
  })

  test('defaults generateContent requests to /v1beta', async () => {
    let requestedUrl = ''
    let requestCount = 0

    const response = await fetchGeminiVertexResponse({
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.googleapis.com',
      model: 'gemini-flash-latest',
      request: { contents: [] },
      fetch: async input => {
        requestCount += 1
        requestedUrl = String(input)
        return new Response(JSON.stringify({ candidates: [] }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },
    })

    expect(requestCount).toBe(1)
    expect(requestedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    )
    expect(response).toEqual({ candidates: [] })
  })
})

describe('Gemini transport error conversion', () => {
  test('createGeminiVertexStream converts fetch connection errors to APIConnectionError', async () => {
    await expect(
      createGeminiVertexStream({
        apiKey: 'test-key',
        baseURL: 'https://generativelanguage.googleapis.com',
        model: 'gemini-flash-latest',
        request: { contents: [] },
        fetch: async () => {
          throw new Error(
            'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
          )
        },
      }),
    ).rejects.toBeInstanceOf(APIConnectionError)
  })

  test('fetchGeminiVertexResponse retries retryable HTTP errors', async () => {
    let requestCount = 0

    const response = await fetchGeminiVertexResponse({
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.googleapis.com',
      model: 'gemini-flash-latest',
      request: { contents: [] },
      fetch: async () => {
        requestCount += 1
        if (requestCount < 3) {
          return new Response('Service Unavailable', { status: 503 })
        }
        return new Response(JSON.stringify({ candidates: [] }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },
    })

    expect(requestCount).toBe(3)
    expect(response).toEqual({ candidates: [] })
  })
})

describe('Gemini tool call thought signature forwarding', () => {
  test('forwards tool_use signature into functionCall thoughtSignature', () => {
    const request = convertAnthropicRequestToGemini({
      model: 'gemini-2.5-pro',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'default_api:EnterPlanMode',
              input: {},
              signature: 'c2lnX2FiYzEyMw==',
            } as any,
          ],
        } as any,
      ],
    })

    const part = request.contents?.[0]?.parts?.[0]
    expect(part?.functionCall?.name).toBe('default_api:EnterPlanMode')
    expect(part?.thoughtSignature).toBe('c2lnX2FiYzEyMw==')
  })

  test('uses skip validator signature for unsigned gemini-3 tool calls', () => {
    const previousModel = process.env.ANTHROPIC_MODEL
    delete process.env.ANTHROPIC_MODEL

    try {
      const request = convertAnthropicRequestToGemini({
        model: 'gemini-3-pro',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'default_api:Bash',
                input: { command: 'pwd' },
              } as any,
            ],
          } as any,
        ],
      })

      const part = request.contents?.[0]?.parts?.[0]
      expect(part?.thoughtSignature).toBe('skip_thought_signature_validator')
    } finally {
      if (previousModel === undefined) {
        delete process.env.ANTHROPIC_MODEL
      } else {
        process.env.ANTHROPIC_MODEL = previousModel
      }
    }
  })

  test('splits tool_result and following user text into separate Gemini user turns', () => {
    const request = convertAnthropicRequestToGemini({
      model: 'gemini-3-pro',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'default_api:LS',
              input: {},
            } as any,
          ],
        } as any,
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: '/Users/luc/Projects/cloai-code',
            } as any,
            {
              type: 'text',
              text: 'src',
            } as any,
          ],
        } as any,
      ],
    })

    expect(request.contents?.[1]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'default_api:LS',
            id: 'toolu_1',
            response: {
              output: '/Users/luc/Projects/cloai-code',
            },
          },
        },
      ],
    })
    expect(request.contents?.[2]).toEqual({
      role: 'user',
      parts: [{ text: 'src' }],
    })
  })

  test('preserves functionCall thoughtSignature when converting stream output back', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"default_api:EnterPlanMode","args":{},"id":"toolu_1"},"thoughtSignature":"sig_from_gemini"}]}}]}\n\n',
          ),
        )
        controller.close()
      },
    })

    const events: any[] = []
    for await (const event of createAnthropicStreamFromGemini({
      reader: stream.getReader(),
      model: 'gemini-3-pro',
    })) {
      events.push(event)
    }

    const toolUseStart = events.find(
      event =>
        event.type === 'content_block_start' &&
        event.content_block?.type === 'tool_use',
    )
    expect(toolUseStart?.content_block?.signature).toBe('sig_from_gemini')
  })
})
