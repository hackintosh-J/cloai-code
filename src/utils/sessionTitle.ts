/**
 * Session title generation through the configured model route.
 *
 * Standalone module with minimal dependencies so it can be imported from
 * print.ts (SDK control request handler) without pulling in the React/chalk/
 * git dependency chain that teleport.tsx carries.
 *
 * This is the single source of truth for AI-generated session titles across
 * all surfaces. Previously there were separate small-model title generators:
 * - teleport.tsx generateTitleAndBranch (6-word title + branch for CCR)
 * - rename/generateSessionName.ts (kebab-case name for /rename)
 * Each remains for backwards compat; new callers should use this module.
 */

import { z } from 'zod/v4'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { logEvent } from '../services/analytics/index.js'
import { queryHaiku, queryWithModel } from '../services/api/claude.js'
import type { Message } from '../types/message.js'
import {
  getActiveProviderConfig,
  readCustomApiStorage,
} from './customApiStorage.js'
import { logForDebugging } from './debug.js'
import { safeParseJSON } from './json.js'
import { lazySchema } from './lazySchema.js'
import { extractTextContent } from './messages.js'
import { asSystemPrompt } from './systemPromptType.js'

const MAX_CONVERSATION_TEXT = 1000

/**
 * Flatten a message array into a single text string for title input.
 * Skips meta/non-human messages. Tail-slices to the last 1000 chars so
 * recent context wins when the conversation is long.
 */
export function extractConversationText(messages: Message[]): string {
  const parts: string[] = []
  for (const msg of messages) {
    if (msg.type !== 'user' && msg.type !== 'assistant') continue
    if ('isMeta' in msg && msg.isMeta) continue
    if ('origin' in msg && msg.origin && msg.origin.kind !== 'human') continue
    const content = msg.message.content
    if (typeof content === 'string') {
      parts.push(content)
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if ('type' in block && block.type === 'text' && 'text' in block) {
          parts.push(block.text as string)
        }
      }
    }
  }
  const text = parts.join('\n')
  return text.length > MAX_CONVERSATION_TEXT
    ? text.slice(-MAX_CONVERSATION_TEXT)
    : text
}

const SESSION_TITLE_PROMPT = `Generate a concise, sentence-case title (3-7 words) that captures the main topic or goal of this coding session. The title should be clear enough that the user recognizes the session in a list. Use sentence case: capitalize only the first word and proper nouns.

Return JSON with a single "title" field.

Good examples:
{"title": "Fix login button on mobile"}
{"title": "Add OAuth authentication"}
{"title": "Debug failing CI tests"}
{"title": "Refactor API client error handling"}

Bad (too vague): {"title": "Code changes"}
Bad (too long): {"title": "Investigate and fix the issue where the login button does not respond on mobile devices"}
Bad (wrong case): {"title": "Fix Login Button On Mobile"}`

const titleSchema = lazySchema(() => z.object({ title: z.string() }))

type GenerateSessionTitleOptions = {
  model?: string
  querySource?: string
}

function cleanTitleCandidate(value: string): string | null {
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return null
  }
  const title = trimmed
    .replace(/^title:\s*/i, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .split(/\r?\n/)[0]
    ?.trim()
    .replace(/\.$/, '')
  return title ? title.slice(0, 80) : null
}

function resolveProviderModel(
  providerModels: string[],
  model: string | undefined,
): string | null {
  const trimmed = model?.trim()
  if (!trimmed) {
    return null
  }
  if (providerModels.includes(trimmed)) {
    return trimmed
  }
  const scopedModel = trimmed.includes(':')
    ? trimmed.slice(trimmed.indexOf(':') + 1)
    : ''
  return scopedModel && providerModels.includes(scopedModel)
    ? scopedModel
    : null
}

export function getActiveConfiguredTitleModel(): string | null {
  const storage = readCustomApiStorage()
  const provider = getActiveProviderConfig(storage)
  if (!provider) {
    return null
  }
  const model = resolveProviderModel(
    provider.models,
    storage.activeModel ?? storage.model,
  )
  if (model) {
    return model
  }
  return provider.models[0] ?? null
}

/**
 * Generate a sentence-case session title from a description or first message.
 * Returns null on error or if the model returns an unparseable response.
 *
 * @param description - The user's first message or a description of the session
 * @param signal - Abort signal for cancellation
 */
export async function generateSessionTitle(
  description: string,
  signal: AbortSignal,
  options: GenerateSessionTitleOptions = {},
): Promise<string | null> {
  const trimmed = description.trim()
  if (!trimmed) return null

  try {
    const model =
      options.model?.trim() || getActiveConfiguredTitleModel() || null
    const querySource = options.querySource ?? 'generate_session_title'
    const baseOptions = {
      querySource,
      agents: [],
      // Reflect the actual session mode — this module is called from
      // both the SDK print path (non-interactive) and the CCR remote
      // session path via useRemoteSession (interactive).
      isNonInteractiveSession: getIsNonInteractiveSession(),
      hasAppendSystemPrompt: false,
      mcpTools: [],
      enablePromptCaching: false,
      maxOutputTokensOverride: 200,
      temperatureOverride: 0,
    }
    const query = {
      systemPrompt: asSystemPrompt([SESSION_TITLE_PROMPT]),
      userPrompt: trimmed,
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      signal,
    } as const
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

    const text = extractTextContent(result.message.content)

    const parsed = titleSchema().safeParse(safeParseJSON(text))
    const title = parsed.success
      ? parsed.data.title.trim() || null
      : cleanTitleCandidate(text)

    logEvent('tengu_session_title_generated', { success: title !== null })

    return title
  } catch (error) {
    logForDebugging(`generateSessionTitle failed: ${error}`, {
      level: 'error',
    })
    logEvent('tengu_session_title_generated', { success: false })
    return null
  }
}
