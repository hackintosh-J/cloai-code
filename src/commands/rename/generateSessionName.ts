import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import { queryHaiku, queryWithModel } from '../../services/api/claude.js'
import type { Message } from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { safeParseJSON } from '../../utils/json.js'
import { extractTextContent } from '../../utils/messages.js'
import {
  extractConversationText,
  getActiveConfiguredTitleModel,
} from '../../utils/sessionTitle.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'

export async function generateSessionName(
  messages: Message[],
  signal: AbortSignal,
): Promise<string | null> {
  const conversationText = extractConversationText(messages)
  if (!conversationText) {
    return null
  }

  try {
    const query = {
      systemPrompt: asSystemPrompt([
        'Generate a short kebab-case name (2-4 words) that captures the main topic of this conversation. Use lowercase words separated by hyphens. Examples: "fix-login-bug", "add-auth-feature", "refactor-api-client", "debug-test-failures". Return JSON with a "name" field.',
      ]),
      userPrompt: conversationText,
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
      signal,
    } as const
    const baseOptions = {
      querySource: 'rename_generate_name',
      agents: [],
      isNonInteractiveSession: getIsNonInteractiveSession(),
      hasAppendSystemPrompt: false,
      mcpTools: [],
      enablePromptCaching: false,
      maxOutputTokensOverride: 80,
      temperatureOverride: 0,
    }
    const model = getActiveConfiguredTitleModel()
    const result = model
      ? await queryWithModel({
          ...query,
          options: {
            ...baseOptions,
            model,
          },
        })
      : await queryHaiku({
          ...query,
          options: baseOptions,
        })

    const content = extractTextContent(result.message.content)

    const response = safeParseJSON(content)
    if (
      response &&
      typeof response === 'object' &&
      'name' in response &&
      typeof (response as { name: unknown }).name === 'string'
    ) {
      return (response as { name: string }).name
    }
    return null
  } catch (error) {
    // Small title-model timeout/rate-limit/network failures are expected operational failures —
    // logForDebugging, not logError. Called automatically on every 3rd bridge
    // message (initReplBridge.ts), so errors here would flood the error file.
    logForDebugging(`generateSessionName failed: ${errorMessage(error)}`, {
      level: 'error',
    })
    return null
  }
}
