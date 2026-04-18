/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handler intentionally exits */

import {
  clearAuthRelatedCaches,
  performLogout,
} from '../../commands/logout/logout.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { getSSLErrorHint } from '../../services/api/errorUtils.js'
import { fetchAndStoreClaudeCodeFirstTokenDate } from '../../services/api/firstTokenDate.js'
import {
  createAndStoreApiKey,
  extractAccountIdFromToken,
  fetchAndStoreUserRoles,
  fetchOpenAICodexModels,
  refreshOAuthToken,
  shouldUseClaudeAIAuth,
  storeOAuthAccountInfo,
} from '../../services/oauth/client.js'
import { getOauthProfileFromOauthToken } from '../../services/oauth/getOauthProfile.js'
import { OAuthService } from '../../services/oauth/index.js'
import type { OAuthTokens } from '../../services/oauth/types.js'
import {
  clearOAuthTokenCache,
  getAnthropicApiKeyWithSource,
  getAuthTokenSource,
  getOauthAccountInfo,
  getSubscriptionType,
  hasGeminiCustomAuth,
  isUsing3PServices,
  saveOAuthTokensIfNeeded,
  validateForceLoginOrg,
} from '../../utils/auth.js'
import { saveGlobalConfig } from '../../utils/config.js'
import {
  type CustomApiStorageData,
  getActiveProviderConfig,
  getProviderKeyFromConfig,
  inferProviderVariant,
  readCustomApiStorage,
  type ProviderConfig,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'
import { normalizeApiKeyForConfig } from '../../utils/authPortable.js'
import { logForDebugging } from '../../utils/debug.js'
import { isRunningOnHomespace } from '../../utils/envUtils.js'
import { errorMessage } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  buildAccountProperties,
  buildAPIProviderProperties,
} from '../../utils/status.js'

function isOpenAIOAuthProvider(
  provider: ProviderConfig | undefined,
): provider is ProviderConfig & { kind: 'openai-like'; authMode: 'oauth' } {
  return !!provider &&
    provider.kind === 'openai-like' &&
    provider.authMode === 'oauth' &&
    provider.id !== 'github-copilot' &&
    provider.variant !== 'github-copilot-oauth'
}

function canReuseOpenAIActiveModel(
  storage: CustomApiStorageData,
  provider: ProviderConfig,
  models: string[] | undefined,
): boolean {
  const activeModel = storage.activeModel
  if (!activeModel || !models?.includes(activeModel)) {
    return false
  }

  const activeAuthMode = storage.activeAuthMode ?? storage.authMode
  if (
    storage.activeProvider === provider.id &&
    activeAuthMode === provider.authMode &&
    storage.providerKind === provider.kind &&
    (storage.variant === undefined || provider.variant === undefined || storage.variant === provider.variant)
  ) {
    return true
  }

  if (storage.activeProviderKey) {
    return storage.activeProviderKey === getProviderKeyFromConfig(provider)
  }

  return false
}

function buildOpenAIOAuthProvider(input: {
  targetProvider?: ProviderConfig
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  accountId?: string
  fetchedModels?: string[]
}): ProviderConfig {
  const oauthData = {
    accessToken: input.accessToken,
    refreshToken:
      input.refreshToken ??
      (input.targetProvider?.oauth as { refreshToken?: string } | undefined)
        ?.refreshToken,
    expiresAt:
      input.expiresAt ??
      (input.targetProvider?.oauth as { expiresAt?: number } | undefined)?.expiresAt,
    accountId:
      input.accountId ??
      (input.targetProvider?.oauth as { accountId?: string } | undefined)?.accountId,
  }

  return {
    id: input.targetProvider?.id ?? 'openai',
    kind: 'openai-like',
    variant: 'openai-oauth',
    authMode: 'oauth',
    baseURL: input.targetProvider?.baseURL,
    apiKey: input.accessToken,
    models: input.fetchedModels ?? input.targetProvider?.models ?? [],
    oauth: oauthData,
  }
}

export function buildOpenAIOAuthInstallState(input: {
  previousStorage: CustomApiStorageData
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  accountId?: string
  fetchedModels?: string[]
}): {
  normalizedStorage: CustomApiStorageData
  nextProvider: ProviderConfig
} {
  const providers = input.previousStorage.providers ?? []
  const activeProvider = getActiveProviderConfig(input.previousStorage)
  const activeOpenAIProvider = isOpenAIOAuthProvider(activeProvider)
    ? activeProvider
    : undefined
  const activeProviderId =
    input.previousStorage.providerId ?? input.previousStorage.activeProvider
  const fallbackOpenAIProvider = providers.find(
    provider =>
      isOpenAIOAuthProvider(provider) &&
      provider.id === activeProviderId,
  )
  const targetProvider =
    activeOpenAIProvider ??
    fallbackOpenAIProvider ??
    providers.find(provider => isOpenAIOAuthProvider(provider))

  const nextProvider = buildOpenAIOAuthProvider({
    targetProvider,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
    accountId: input.accountId,
    fetchedModels: input.fetchedModels,
  })

  const updatedProviders = targetProvider
    ? providers.map(provider =>
        provider === targetProvider ? nextProvider : provider,
      )
    : [...providers, nextProvider]

  const activeModel = canReuseOpenAIActiveModel(
    input.previousStorage,
    targetProvider ?? nextProvider,
    nextProvider.models,
  )
    ? input.previousStorage.activeModel
    : nextProvider.models[0]

  return {
    nextProvider,
    normalizedStorage: {
      ...input.previousStorage,
      activeProviderKey: getProviderKeyFromConfig(nextProvider),
      providers: updatedProviders,
      activeProvider: nextProvider.id,
      activeModel,
      provider: 'openai',
      providerKind: nextProvider.kind,
      variant: nextProvider.variant,
      providerId: nextProvider.id,
      authMode: nextProvider.authMode,
      baseURL: nextProvider.baseURL,
      apiKey: input.accessToken,
      model: activeModel,
      savedModels: nextProvider.models,
    },
  }
}

/**
 * Shared post-token-acquisition logic. Saves tokens, fetches profile/roles,
 * and sets up the local auth state.
 *
 * @param oauthProvider - When 'openai' or 'gemini', skips Anthropic-specific
 *   endpoints and stores provider-specific credentials back into custom provider
 *   storage.
 */
export async function installOAuthTokens(
  tokens: OAuthTokens,
  oauthProvider?: 'anthropic' | 'openai' | 'gemini',
): Promise<void> {
  const existingCustomApiStorage =
    oauthProvider === 'openai' || oauthProvider === 'gemini'
      ? readCustomApiStorage()
      : undefined

  // Clear old state before saving new credentials
  await performLogout({ clearOnboarding: false })

  // Handle OpenAI OAuth separately — skip Anthropic-specific endpoints
  if (oauthProvider === 'openai') {
    const previousStorage = existingCustomApiStorage ?? {}
    const normalizedToken = normalizeApiKeyForConfig(tokens.accessToken)

    // Extract account ID from JWT and fetch available models
    const accountId = extractAccountIdFromToken(tokens.accessToken ?? '')
    let fetchedModels: string[] | undefined
    if (accountId && tokens.accessToken) {
      try {
        fetchedModels = await fetchOpenAICodexModels({
          accessToken: tokens.accessToken,
          accountId,
        })
      } catch {
        // Non-fatal: fall back to existing models
      }
    }

    const { normalizedStorage: normalizedOpenAIStorage } =
      buildOpenAIOAuthInstallState({
        previousStorage,
        accessToken: tokens.accessToken,
        refreshToken:
          typeof tokens.refreshToken === 'string'
            ? tokens.refreshToken
            : undefined,
        expiresAt:
          typeof tokens.expiresAt === 'number'
            ? tokens.expiresAt
            : undefined,
        accountId,
        fetchedModels,
      })

    writeCustomApiStorage(normalizedOpenAIStorage)
    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: {
        ...(current.customApiEndpoint ?? {}),
        kind: normalizedOpenAIStorage.providerKind,
        variant: normalizedOpenAIStorage.variant,
        providerId: normalizedOpenAIStorage.providerId,
        provider: 'openai',
        baseURL: normalizedOpenAIStorage.baseURL,
        apiKey: undefined,
        model: normalizedOpenAIStorage.model,
        savedModels: normalizedOpenAIStorage.savedModels,
      },
      customApiKeyResponses: {
        approved: [
          ...new Set([
            ...(current.customApiKeyResponses?.approved ?? []),
            normalizedToken,
          ]),
        ],
        rejected: (current.customApiKeyResponses?.rejected ?? []).filter(
          key => key !== normalizedToken,
        ),
      },
    }))

    // Also apply to current process env
    process.env.CLOAI_API_KEY = tokens.accessToken
    process.env.ANTHROPIC_BASE_URL = normalizedOpenAIStorage.baseURL ?? ''
    process.env.ANTHROPIC_MODEL = normalizedOpenAIStorage.model ?? ''
    clearOAuthTokenCache()
    await clearAuthRelatedCaches()
    return
  }

  // Handle Gemini OAuth separately — skip Anthropic-specific endpoints
  if (oauthProvider === 'gemini') {
    const previousStorage = existingCustomApiStorage ?? {}
    const providers = previousStorage.providers ?? []
    const activeProvider = getActiveProviderConfig(previousStorage)
    const activeGeminiProvider =
      activeProvider?.variant === 'gemini-cli-oauth' ||
      activeProvider?.variant === 'gemini-antigravity-oauth' ||
      (activeProvider?.kind === 'gemini-like' && activeProvider.authMode === 'gemini-cli-oauth')
        ? activeProvider
        : undefined
    const fallbackGeminiProvider = providers.find(
      p =>
        (p.variant === 'gemini-cli-oauth' ||
          p.variant === 'gemini-antigravity-oauth' ||
          (p.kind === 'gemini-like' && p.authMode === 'gemini-cli-oauth')) &&
        p.id === previousStorage.providerId,
    )
    const targetProvider =
      activeGeminiProvider ??
      fallbackGeminiProvider ??
      providers.find(
        p =>
          p.variant === 'gemini-cli-oauth' ||
          p.variant === 'gemini-antigravity-oauth' ||
          (p.kind === 'gemini-like' && p.authMode === 'gemini-cli-oauth'),
      )
    const updatedProviders = targetProvider
      ? providers.map(p =>
          p === targetProvider
            ? {
                ...p,
                variant:
                  p.variant ??
                  inferProviderVariant({
                    kind: p.kind,
                    authMode: p.authMode,
                    baseURL: p.baseURL,
                    id: p.id,
                    provider: 'gemini',
                  }),
                oauth: {
                  ...p.oauth,
                  accessToken:
                    typeof tokens.accessToken === 'string'
                      ? tokens.accessToken
                      : p.oauth?.accessToken,
                  refreshToken:
                    typeof tokens.refreshToken === 'string'
                      ? tokens.refreshToken
                      : p.oauth?.refreshToken,
                  expiresAt:
                    typeof tokens.expiresAt === 'number'
                      ? tokens.expiresAt
                      : p.oauth?.expiresAt,
                  projectId:
                    typeof tokens.projectId === 'string'
                      ? tokens.projectId
                      : p.oauth?.projectId,
                  email:
                    typeof tokens.email === 'string'
                      ? tokens.email
                      : p.oauth?.email,
                },
              }
            : p,
        )
      : [
          ...providers,
          {
            id: previousStorage.providerId ?? 'gemini',
            kind: 'gemini-like' as const,
            variant: previousStorage.variant ?? 'gemini-cli-oauth',
            authMode: (previousStorage.activeAuthMode ?? previousStorage.authMode ?? 'gemini-cli-oauth') as const,
            models: previousStorage.savedModels ?? [],
            oauth: {
              accessToken:
                typeof tokens.accessToken === 'string' ? tokens.accessToken : undefined,
              refreshToken:
                typeof tokens.refreshToken === 'string' ? tokens.refreshToken : undefined,
              expiresAt:
                typeof tokens.expiresAt === 'number' ? tokens.expiresAt : undefined,
              projectId:
                typeof tokens.projectId === 'string' ? tokens.projectId : undefined,
              email: typeof tokens.email === 'string' ? tokens.email : undefined,
            },
          },
        ]
    const activeModel =
      previousStorage.activeProvider === targetProvider?.id
        ? previousStorage.activeModel
        : targetProvider?.models[0]
    const normalizedGeminiStorage = {
      ...previousStorage,
      activeProviderKey: targetProvider
        ? getProviderKeyFromConfig(targetProvider)
        : previousStorage.activeProviderKey,
      providers: updatedProviders,
      activeProvider: targetProvider?.id ?? previousStorage.activeProvider,
      activeModel,
      activeAuthMode: targetProvider?.authMode ?? previousStorage.activeAuthMode,
      provider: 'gemini' as const,
      providerKind: targetProvider?.kind ?? 'gemini-like',
      variant: targetProvider?.variant ?? previousStorage.variant,
      providerId: targetProvider?.id ?? previousStorage.providerId,
      authMode: targetProvider?.authMode ?? 'gemini-cli-oauth',
      baseURL: targetProvider?.baseURL ?? previousStorage.baseURL,
      apiKey: undefined,
      model: activeModel,
      savedModels:
        targetProvider?.models ??
        (previousStorage.activeProvider === targetProvider?.id
          ? previousStorage.savedModels
          : undefined),
    }

    writeCustomApiStorage(normalizedGeminiStorage)
    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: {
        ...(current.customApiEndpoint ?? {}),
        kind: normalizedGeminiStorage.providerKind,
        variant: normalizedGeminiStorage.variant,
        providerId: normalizedGeminiStorage.providerId,
        provider: 'gemini',
        baseURL: normalizedGeminiStorage.baseURL,
        apiKey: undefined,
        model: normalizedGeminiStorage.model,
        savedModels: normalizedGeminiStorage.savedModels,
      },
    }))

    delete process.env.CLOAI_API_KEY
    delete process.env.ANTHROPIC_BASE_URL
    process.env.ANTHROPIC_MODEL = normalizedGeminiStorage.model ?? ''
    clearOAuthTokenCache()
    await clearAuthRelatedCaches()
    return
  }

  // Anthropic OAuth flow
  // Reuse pre-fetched profile if available, otherwise fetch fresh
  const profile =
    tokens.profile ?? (await getOauthProfileFromOauthToken(tokens.accessToken))
  if (profile) {
    storeOAuthAccountInfo({
      accountUuid: profile.account.uuid,
      emailAddress: profile.account.email,
      organizationUuid: profile.organization.uuid,
      displayName: profile.account.display_name || undefined,
      hasExtraUsageEnabled:
        profile.organization.has_extra_usage_enabled ?? undefined,
      billingType: profile.organization.billing_type ?? undefined,
      subscriptionCreatedAt:
        profile.organization.subscription_created_at ?? undefined,
      accountCreatedAt: profile.account.created_at,
    })
  } else if (tokens.tokenAccount) {
    // Fallback to token exchange account data when profile endpoint fails
    storeOAuthAccountInfo({
      accountUuid: tokens.tokenAccount.uuid,
      emailAddress: tokens.tokenAccount.emailAddress,
      organizationUuid: tokens.tokenAccount.organizationUuid,
    })
  }

  const storageResult = saveOAuthTokensIfNeeded(tokens)
  clearOAuthTokenCache()

  if (storageResult.warning) {
    logEvent('tengu_oauth_storage_warning', {
      warning:
        storageResult.warning as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  // Roles and first-token-date may fail for limited-scope tokens (e.g.
  // inference-only from setup-token). They're not required for core auth.
  await fetchAndStoreUserRoles(tokens.accessToken).catch(err =>
    logForDebugging(String(err), { level: 'error' }),
  )

  if (shouldUseClaudeAIAuth(tokens.scopes)) {
    await fetchAndStoreClaudeCodeFirstTokenDate().catch(err =>
      logForDebugging(String(err), { level: 'error' }),
    )
  } else {
    // API key creation is critical for Console users — let it throw.
    const apiKey = await createAndStoreApiKey(tokens.accessToken)
    if (!apiKey) {
      throw new Error(
        'Unable to create API key. The server accepted the request but did not return a key.',
      )
    }
  }

  await clearAuthRelatedCaches()
}

export async function authLogin({
  email,
  sso,
  console: useConsole,
  claudeai,
}: {
  email?: string
  sso?: boolean
  console?: boolean
  claudeai?: boolean
}): Promise<void> {
  if (useConsole && claudeai) {
    process.stderr.write(
      'Error: --console and --claudeai cannot be used together.\n',
    )
    process.exit(1)
  }

  const settings = getInitialSettings()
  // forceLoginMethod is a hard constraint (enterprise setting) — matches ConsoleOAuthFlow behavior.
  // Without it, --console selects Console; --claudeai (or no flag) selects claude.ai.
  const loginWithClaudeAi = settings.forceLoginMethod
    ? settings.forceLoginMethod === 'claudeai'
    : !useConsole
  const orgUUID = settings.forceLoginOrgUUID

  // Fast path: if a refresh token is provided via env var, skip the browser
  // OAuth flow and exchange it directly for tokens.
  const envRefreshToken = process.env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN
  if (envRefreshToken) {
    const envScopes = process.env.CLAUDE_CODE_OAUTH_SCOPES
    if (!envScopes) {
      process.stderr.write(
        'CLAUDE_CODE_OAUTH_SCOPES is required when using CLAUDE_CODE_OAUTH_REFRESH_TOKEN.\n' +
          'Set it to the space-separated scopes the refresh token was issued with\n' +
          '(e.g. "user:inference" or "user:profile user:inference user:sessions:claude_code user:mcp_servers").\n',
      )
      process.exit(1)
    }

    const scopes = envScopes.split(/\s+/).filter(Boolean)

    try {
      logEvent('tengu_login_from_refresh_token', {})

      const tokens = await refreshOAuthToken(envRefreshToken, { scopes })
      await installOAuthTokens(tokens)

      const orgResult = await validateForceLoginOrg()
      if (!orgResult.valid) {
        process.stderr.write(orgResult.message + '\n')
        process.exit(1)
      }

      // Mark onboarding complete — interactive paths handle this via
      // the Onboarding component, but the env var path skips it.
      saveGlobalConfig(current => {
        if (current.hasCompletedOnboarding) return current
        return { ...current, hasCompletedOnboarding: true }
      })

      logEvent('tengu_oauth_success', {
        loginWithClaudeAi: shouldUseClaudeAIAuth(tokens.scopes),
      })
      process.stdout.write('Login successful.\n')
      process.exit(0)
    } catch (err) {
      logError(err)
      const sslHint = getSSLErrorHint(err)
      process.stderr.write(
        `Login failed: ${errorMessage(err)}\n${sslHint ? sslHint + '\n' : ''}`,
      )
      process.exit(1)
    }
  }

  const resolvedLoginMethod = sso ? 'sso' : undefined

  const oauthService = new OAuthService()

  try {
    logEvent('tengu_oauth_flow_start', { loginWithClaudeAi })

    const result = await oauthService.startOAuthFlow(
      async url => {
        process.stdout.write('Opening browser to sign in…\n')
        process.stdout.write(`If the browser didn't open, visit: ${url}\n`)
      },
      {
        loginWithClaudeAi,
        loginHint: email,
        loginMethod: resolvedLoginMethod,
        orgUUID,
      },
    )

    await installOAuthTokens(result)

    const orgResult = await validateForceLoginOrg()
    if (!orgResult.valid) {
      process.stderr.write(orgResult.message + '\n')
      process.exit(1)
    }

    logEvent('tengu_oauth_success', { loginWithClaudeAi })

    process.stdout.write('Login successful.\n')
    process.exit(0)
  } catch (err) {
    logError(err)
    const sslHint = getSSLErrorHint(err)
    process.stderr.write(
      `Login failed: ${errorMessage(err)}\n${sslHint ? sslHint + '\n' : ''}`,
    )
    process.exit(1)
  } finally {
    oauthService.cleanup()
  }
}

export async function authStatus(opts: {
  json?: boolean
  text?: boolean
}): Promise<void> {
  const { source: authTokenSource, hasToken } = getAuthTokenSource()
  const { source: apiKeySource } = getAnthropicApiKeyWithSource()
  const hasApiKeyEnvVar =
    !!process.env.CLOAI_API_KEY && !isRunningOnHomespace()
  const oauthAccount = getOauthAccountInfo()
  const subscriptionType = getSubscriptionType()
  const using3P = isUsing3PServices()
  const hasGeminiAuth = hasGeminiCustomAuth()
  const loggedIn =
    hasToken || apiKeySource !== 'none' || hasApiKeyEnvVar || using3P || hasGeminiAuth

  // Determine auth method
  let authMethod: string = 'none'
  if (using3P) {
    authMethod = 'third_party'
  } else if (authTokenSource === 'claude.ai') {
    authMethod = 'claude.ai'
  } else if (authTokenSource === 'apiKeyHelper') {
    authMethod = 'api_key_helper'
  } else if (authTokenSource !== 'none') {
    authMethod = 'oauth_token'
  } else if (apiKeySource === 'CLOAI_API_KEY' || hasApiKeyEnvVar) {
    authMethod = 'api_key'
  } else if (apiKeySource === '/login managed key') {
    authMethod = 'claude.ai'
  }

  if (opts.text) {
    const properties = [
      ...buildAccountProperties(),
      ...buildAPIProviderProperties(),
    ]
    let hasAuthProperty = false
    for (const prop of properties) {
      const value =
        typeof prop.value === 'string'
          ? prop.value
          : Array.isArray(prop.value)
            ? prop.value.join(', ')
            : null
      if (value === null || value === 'none') {
        continue
      }
      hasAuthProperty = true
      if (prop.label) {
        process.stdout.write(`${prop.label}: ${value}\n`)
      } else {
        process.stdout.write(`${value}\n`)
      }
    }
    if (!hasAuthProperty && hasApiKeyEnvVar) {
      process.stdout.write('API key: CLOAI_API_KEY\n')
    }
    if (!loggedIn) {
      process.stdout.write(
        'Not logged in. Run claude auth login to authenticate.\n',
      )
    }
  } else {
    const apiProvider = getAPIProvider()
    const resolvedApiKeySource =
      apiKeySource !== 'none'
        ? apiKeySource
        : hasApiKeyEnvVar
          ? 'CLOAI_API_KEY'
          : null
    const output: Record<string, string | boolean | null> = {
      loggedIn,
      authMethod,
      apiProvider,
    }
    if (resolvedApiKeySource) {
      output.apiKeySource = resolvedApiKeySource
    }
    if (authMethod === 'claude.ai') {
      output.email = oauthAccount?.emailAddress ?? null
      output.orgId = oauthAccount?.organizationUuid ?? null
      output.orgName = oauthAccount?.organizationName ?? null
      output.subscriptionType = subscriptionType ?? null
    }

    process.stdout.write(jsonStringify(output, null, 2) + '\n')
  }
  process.exit(loggedIn ? 0 : 1)
}

export async function authLogout(): Promise<void> {
  try {
    await performLogout({ clearOnboarding: false })
  } catch {
    process.stderr.write('Failed to log out.\n')
    process.exit(1)
  }
  process.stdout.write('Successfully logged out from your Anthropic account.\n')
  process.exit(0)
}
