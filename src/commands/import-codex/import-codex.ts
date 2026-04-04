import * as fs from 'node:fs'
import * as path from 'node:path'
import type { LocalCommandCall } from '../../types/command.js'
import { saveGlobalConfig } from '../../utils/config.js'
import {
  getProviderKeyFromConfig,
  readCustomApiStorage,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'
import {
  extractAccountIdFromToken,
  fetchOpenAICodexModels,
} from '../../services/oauth/client.js'

type CodexAuthJson = {
  auth_mode?: string
  tokens?: {
    access_token?: string
    refresh_token?: string
    id_token?: string
    account_id?: string
  }
}

function findCodexAuthJson(): string | null {
  const homeCandidates = [
    process.env.HOME,
    process.env.USERPROFILE,
    process.env.HOMEDRIVE && process.env.HOMEPATH
      ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
      : undefined,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)
  const candidates = [...new Set(homeCandidates)].map(home =>
    path.join(home, '.codex', 'auth.json'),
  )
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function decodeJwtExp(token: string): number | undefined {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return undefined
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf-8'),
    )
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined
  } catch {
    return undefined
  }
}

export const call: LocalCommandCall = async (_args, _context) => {
  const authPath = findCodexAuthJson()
  if (!authPath) {
    return {
      type: 'text',
      value: 'Codex credentials not found. Expected ~/.codex/auth.json',
    }
  }

  let codexAuth: CodexAuthJson
  try {
    codexAuth = JSON.parse(fs.readFileSync(authPath, 'utf-8'))
  } catch {
    return {
      type: 'text',
      value: `Failed to read ${authPath}`,
    }
  }

  const tokens = codexAuth.tokens
  if (!tokens?.access_token || !tokens.refresh_token) {
    return {
      type: 'text',
      value: 'Codex auth.json is missing access_token or refresh_token. Run `codex login` first.',
    }
  }

  const accessToken = tokens.access_token
  const refreshToken = tokens.refresh_token
  const expiresAt = decodeJwtExp(accessToken)
  const accountId =
    tokens.account_id ?? extractAccountIdFromToken(accessToken)

  // Fetch models dynamically
  let models: string[] = []
  if (accountId) {
    try {
      models = await fetchOpenAICodexModels({ accessToken, accountId })
    } catch {
      // Fall back to empty — user can add manually
    }
  }

  const defaultModel = models[0]

  // Build provider config
  const providerConfig = {
    id: 'openai',
    kind: 'openai-like' as const,
    authMode: 'oauth' as const,
    apiKey: accessToken,
    models,
    oauth: {
      accessToken,
      refreshToken,
      expiresAt,
      accountId,
    },
  }

  // Update secure storage
  const storage = readCustomApiStorage()
  const existingProviders = storage.providers ?? []
  const providerKey = getProviderKeyFromConfig(providerConfig)
  const providers = [
    ...existingProviders.filter(
      p => getProviderKeyFromConfig(p) !== providerKey,
    ),
    providerConfig,
  ]

  writeCustomApiStorage({
    ...storage,
    activeProviderKey: providerKey,
    activeProvider: 'openai',
    activeModel: defaultModel,
    activeAuthMode: 'oauth',
    providers,
    provider: 'openai',
    providerKind: 'openai-like',
    providerId: 'openai',
    authMode: 'oauth',
    apiKey: accessToken,
    model: defaultModel,
    savedModels: models,
  })

  // Update global config
  saveGlobalConfig(current => ({
    ...current,
    customApiEndpoint: {
      ...(current.customApiEndpoint ?? {}),
      kind: 'openai-like',
      providerId: 'openai',
      provider: 'openai',
      apiKey: undefined,
      model: defaultModel,
      savedModels: models,
    },
  }))

  // Apply to current process
  process.env.CLOAI_API_KEY = accessToken
  process.env.ANTHROPIC_MODEL = defaultModel ?? ''

  const expiryInfo = expiresAt
    ? ` (expires ${new Date(expiresAt).toLocaleDateString()})`
    : ''

  return {
    type: 'text',
    value: [
      `Imported Codex credentials from ${authPath}`,
      `Provider: openai (OAuth)${expiryInfo}`,
      `Models: ${models.length > 0 ? models.join(', ') : '(none fetched)'}`,
      defaultModel ? `Active model: ${defaultModel}` : '',
    ].filter(Boolean).join('\n'),
  }
}
