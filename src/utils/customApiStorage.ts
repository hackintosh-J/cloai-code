import { getSecureStorage } from './secureStorage/index.js'

export type CompatibleProviderKind =
  | 'anthropic-like'
  | 'openai-like'
  | 'gemini-like'
export type OpenAIAuthMode = 'chat-completions' | 'responses' | 'oauth'
export type AnthropicAuthMode = 'api-key'
export type GeminiAuthMode = 'vertex-compatible' | 'gemini-cli-oauth'
export type ProviderAuthMode = AnthropicAuthMode | OpenAIAuthMode | GeminiAuthMode

export type GeminiOAuthConfig = {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  projectId?: string
  email?: string
}

export type OpenAIOAuthConfig = {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  accountId?: string
}

export type ActiveCustomApiEndpoint = {
  kind?: CompatibleProviderKind
  providerId?: string
  authMode?: ProviderAuthMode
  baseURL?: string
  apiKey?: string
  model?: string
  savedModels?: string[]
}

export type ProviderReasoningConfig = {
  reasoningEffort?: string
  reasoningSummary?: string | null
  textVerbosity?: string | null
}

export type ProviderConfig = {
  id: string
  kind: CompatibleProviderKind
  authMode: ProviderAuthMode
  baseURL?: string
  apiKey?: string
  models: string[]
  reasoning?: ProviderReasoningConfig
  oauth?: GeminiOAuthConfig | OpenAIOAuthConfig
}

export type CustomApiStorageData = {
  activeProviderKey?: string
  activeProvider?: string
  activeModel?: string
  activeAuthMode?: ProviderAuthMode
  providers?: ProviderConfig[]
  provider?: 'anthropic' | 'openai' | 'gemini'
  providerKind?: CompatibleProviderKind
  providerId?: string
  authMode?: ProviderAuthMode
  baseURL?: string
  apiKey?: string
  model?: string
  savedModels?: string[]
}

const CUSTOM_API_STORAGE_KEY = 'customApiEndpoint'

export function getProviderKeyFromConfig(
  provider:
    | ProviderConfig
    | Pick<ProviderConfig, 'id' | 'kind' | 'authMode' | 'baseURL'>,
): string {
  return `${provider.kind}::${provider.id}::${provider.authMode}::${provider.baseURL ?? ''}`
}

function dedupeModels(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  return [...new Set(models.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
}

export function deriveProviderId(
  baseURL: string | undefined,
  kind: CompatibleProviderKind,
): string {
  if (!baseURL) {
    return kind === 'openai-like'
      ? 'openai'
      : kind === 'gemini-like'
        ? 'gemini'
        : 'anthropic'
  }

  try {
    const url = new URL(baseURL)
    let host = url.hostname
      .replace(/^api[.-]/, '')
      .replace(/^openai[.-]/, '')
      .replace(/^claude[.-]/, '')
      .replace(/^generativelanguage[.-]/, '')
      .replace(/^googleapis[.-]/, '')
      .replace(/^www\./, '')

    const parts = host.split('.').filter(Boolean)
    const providerId = parts[0]?.toLowerCase()

    return providerId || (kind === 'openai-like' ? 'openai' : kind === 'gemini-like' ? 'gemini' : 'anthropic')
  } catch {
    return (baseURL
      .replace(/^https?:\/\//, '')
      .replace(/[:/].*$/, '')
      .replace(/^api[.-]/, '')
      .replace(/^openai[.-]/, '')
      .replace(/^claude[.-]/, '')
      .replace(/^generativelanguage[.-]/, '')
      .replace(/^googleapis[.-]/, '')
      .replace(/^www\./, '')
      .split('.')[0] ||
      (kind === 'openai-like' ? 'openai' : kind === 'gemini-like' ? 'gemini' : 'anthropic'))
      .toLowerCase()
  }
}

function normalizeProviderKind(value: unknown): CompatibleProviderKind | null {
  return value === 'anthropic-like' || value === 'openai-like' || value === 'gemini-like' ? value : null
}

function normalizeLegacyProviderKind(value: unknown): CompatibleProviderKind {
  return value === 'openai' ? 'openai-like' : value === 'gemini' ? 'gemini-like' : 'anthropic-like'
}

function normalizeProviderReasoning(value: unknown): ProviderReasoningConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const reasoningEffort = typeof record.reasoningEffort === 'string' ? record.reasoningEffort : undefined
  const reasoningSummary =
    typeof record.reasoningSummary === 'string' || record.reasoningSummary === null
      ? (record.reasoningSummary as string | null)
      : undefined
  const textVerbosity =
    typeof record.textVerbosity === 'string' || record.textVerbosity === null
      ? (record.textVerbosity as string | null)
      : undefined
  if (
    reasoningEffort === undefined &&
    reasoningSummary === undefined &&
    textVerbosity === undefined
  ) {
    return undefined
  }
  return {
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    ...(reasoningSummary !== undefined ? { reasoningSummary } : {}),
    ...(textVerbosity !== undefined ? { textVerbosity } : {}),
  }
}

function normalizeGeminiOAuth(value: unknown): GeminiOAuthConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const accessToken =
    typeof record.accessToken === 'string' ? record.accessToken : undefined
  const refreshToken =
    typeof record.refreshToken === 'string' ? record.refreshToken : undefined
  const expiresAt =
    typeof record.expiresAt === 'number' ? record.expiresAt : undefined
  const projectId =
    typeof record.projectId === 'string' ? record.projectId : undefined
  const email = typeof record.email === 'string' ? record.email : undefined
  if (
    accessToken === undefined &&
    refreshToken === undefined &&
    expiresAt === undefined &&
    projectId === undefined &&
    email === undefined
  ) {
    return undefined
  }
  return {
    ...(accessToken !== undefined ? { accessToken } : {}),
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(email !== undefined ? { email } : {}),
  }
}

function normalizeOpenAIOAuth(value: unknown): OpenAIOAuthConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const accessToken =
    typeof record.accessToken === 'string' ? record.accessToken : undefined
  const refreshToken =
    typeof record.refreshToken === 'string' ? record.refreshToken : undefined
  const expiresAt =
    typeof record.expiresAt === 'number' ? record.expiresAt : undefined
  const accountId =
    typeof record.accountId === 'string' ? record.accountId : undefined
  if (
    accessToken === undefined &&
    refreshToken === undefined &&
    expiresAt === undefined &&
    accountId === undefined
  ) {
    return undefined
  }
  return {
    ...(accessToken !== undefined ? { accessToken } : {}),
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(accountId !== undefined ? { accountId } : {}),
  }
}

function buildProviderSummary(
  provider: ProviderConfig | undefined,
  activeModel: string | undefined,
): Pick<
  CustomApiStorageData,
  'provider' | 'providerKind' | 'providerId' | 'authMode' | 'baseURL' | 'apiKey' | 'model' | 'savedModels'
> {
  return {
    provider:
      provider?.kind === 'openai-like'
        ? 'openai'
        : provider?.kind === 'anthropic-like'
          ? 'anthropic'
          : provider?.kind === 'gemini-like'
            ? 'gemini'
            : undefined,
    providerKind: provider?.kind,
    providerId: provider?.id,
    authMode: provider?.authMode,
    baseURL: provider?.baseURL,
    apiKey:
      provider?.kind === 'gemini-like' &&
      provider?.authMode === 'gemini-cli-oauth'
        ? undefined
        : provider?.apiKey,
    model: activeModel,
    savedModels: provider?.models,
  }
}

function normalizeProviderConfig(value: Record<string, unknown>): ProviderConfig | null {
  const kind = normalizeProviderKind(value.kind) ?? normalizeProviderKind(value.id)
  if (!kind) return null
  const baseURL = typeof value.baseURL === 'string' ? value.baseURL : undefined
  const authMode =
    typeof value.authMode === 'string'
      ? value.authMode
      : kind === 'openai-like'
        ? 'chat-completions'
        : kind === 'gemini-like'
          ? 'vertex-compatible'
          : 'api-key'
  const id = typeof value.id === 'string' && value.id !== kind ? value.id : deriveProviderId(baseURL, kind)
  return {
    id,
    kind,
    authMode: authMode as ProviderAuthMode,
    baseURL,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    models: dedupeModels(value.models),
    reasoning: normalizeProviderReasoning(value.reasoning),
    oauth:
      kind === 'openai-like'
        ? normalizeOpenAIOAuth(value.oauth)
        : kind === 'gemini-like'
          ? normalizeGeminiOAuth(value.oauth)
          : undefined,
  }
}

function migrateLegacyShape(value: Record<string, unknown>): CustomApiStorageData {
  const kind = normalizeLegacyProviderKind(value.provider)
  const baseURL = typeof value.baseURL === 'string' ? value.baseURL : undefined
  const providerId = deriveProviderId(baseURL, kind)
  const legacyModel = typeof value.model === 'string' ? value.model : undefined
  const legacySaved = dedupeModels(value.savedModels)
  const models = [...new Set([...(legacyModel ? [legacyModel] : []), ...legacySaved])]
  const provider = {
    id: providerId,
    kind,
    authMode: kind === 'openai-like' ? 'chat-completions' : kind === 'gemini-like' ? 'vertex-compatible' : 'api-key',
    baseURL,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    models,
  }
  return {
    activeProvider: providerId,
    activeModel: legacyModel,
    activeAuthMode: provider.authMode,
    providers: [provider],
    ...buildProviderSummary(provider, legacyModel),
  }
}

export function readCustomApiStorage(): CustomApiStorageData {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const data = storage.read?.() ?? {}
  const raw = data[CUSTOM_API_STORAGE_KEY]
  if (!raw || typeof raw !== 'object') return {}
  const value = raw as Record<string, unknown>
  if (!Array.isArray(value.providers)) {
    return migrateLegacyShape(value)
  }
  const providers = value.providers.map(item => item && typeof item === 'object' ? normalizeProviderConfig(item as Record<string, unknown>) : null).filter((item): item is ProviderConfig => item !== null)
  const activeProviderKey =
    typeof value.activeProviderKey === 'string' ? value.activeProviderKey : undefined
  const activeProvider = typeof value.activeProvider === 'string' ? value.activeProvider : typeof value.providerId === 'string' ? value.providerId : providers[0]?.id
  const activeModel = typeof value.activeModel === 'string' ? value.activeModel : typeof value.model === 'string' ? value.model : undefined
  const activeAuthMode = typeof value.activeAuthMode === 'string'
    ? value.activeAuthMode as ProviderAuthMode
    : typeof value.authMode === 'string'
      ? value.authMode as ProviderAuthMode
      : undefined
  const matchesActiveProvider = (provider: ProviderConfig) =>
    provider.id === activeProvider
  const matchesActiveAuthMode = (provider: ProviderConfig) =>
    activeAuthMode === undefined || provider.authMode === activeAuthMode
  const matchesActiveModel = (provider: ProviderConfig) =>
    activeModel === undefined || provider.models.includes(activeModel)
  const currentProvider = providers.find(provider =>
    activeProviderKey !== undefined &&
    getProviderKeyFromConfig(provider) === activeProviderKey,
  ) ?? providers.find(provider =>
    matchesActiveProvider(provider) &&
    matchesActiveAuthMode(provider) &&
    matchesActiveModel(provider),
  ) ?? providers.find(provider =>
    matchesActiveProvider(provider) &&
    matchesActiveAuthMode(provider),
  ) ?? providers.find(provider =>
    matchesActiveProvider(provider) &&
    matchesActiveModel(provider),
  ) ?? providers.find(provider => matchesActiveProvider(provider))
    ?? providers.find(provider => matchesActiveModel(provider))
    ?? providers[0]
  return {
    activeProviderKey:
      currentProvider !== undefined
        ? getProviderKeyFromConfig(currentProvider)
        : activeProviderKey,
    activeProvider: currentProvider?.id ?? activeProvider,
    activeModel,
    activeAuthMode: currentProvider?.authMode ?? activeAuthMode,
    providers,
    ...buildProviderSummary(currentProvider, activeModel),
  }
}

export function getActiveProviderConfig(
  storage: CustomApiStorageData,
): ProviderConfig | undefined {
  const providers = storage.providers ?? []
  if (storage.activeProviderKey) {
    const exact = providers.find(
      provider => getProviderKeyFromConfig(provider) === storage.activeProviderKey,
    )
    if (exact) return exact
  }

  const activeProviderId = storage.activeProvider ?? storage.providerId
  const activeAuthMode = storage.activeAuthMode ?? storage.authMode
  const activeModel = storage.activeModel ?? storage.model
  const activeKind = storage.providerKind

  return providers.find(
    provider =>
      provider.id === activeProviderId &&
      (activeKind === undefined || provider.kind === activeKind) &&
      (activeAuthMode === undefined || provider.authMode === activeAuthMode) &&
      (activeModel === undefined || provider.models.includes(activeModel)),
  ) ?? providers.find(
    provider =>
      provider.id === activeProviderId &&
      (activeKind === undefined || provider.kind === activeKind) &&
      (activeAuthMode === undefined || provider.authMode === activeAuthMode),
  ) ?? providers.find(
    provider =>
      provider.id === activeProviderId &&
      (activeKind === undefined || provider.kind === activeKind),
  ) ?? providers[0]
}

export function writeCustomApiStorage(next: CustomApiStorageData): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  storage.update?.({
    ...current,
    customApiEndpoint: next,
  })
}

export function clearCustomApiStorage(): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  const { customApiEndpoint: _, ...rest } = current
  storage.update?.(rest)
}
