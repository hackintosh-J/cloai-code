import { describe, expect, test } from 'bun:test'

import { buildOpenAIOAuthInstallState } from './auth.js'

describe('buildOpenAIOAuthInstallState', () => {
  test('does not overwrite github-copilot provider when installing openai oauth', () => {
    const previousStorage = {
      activeProvider: 'github-copilot',
      providerId: 'github-copilot',
      providerKind: 'openai-like',
      authMode: 'oauth',
      variant: 'github-copilot-oauth',
      activeModel: 'gpt-5',
      providers: [
        {
          id: 'github-copilot',
          kind: 'openai-like',
          variant: 'github-copilot-oauth',
          authMode: 'oauth',
          baseURL: 'https://api.githubcopilot.com',
          apiKey: 'copilot-token',
          models: ['gpt-5', 'gpt-4.1'],
          oauth: {
            accessToken: 'copilot-token',
            refreshToken: 'copilot-refresh',
            expiresAt: 100,
          },
        },
      ],
    } as any

    const { normalizedStorage, nextProvider } = buildOpenAIOAuthInstallState({
      previousStorage,
      accessToken: 'openai-token',
      refreshToken: 'openai-refresh',
      expiresAt: 200,
      accountId: 'acct_123',
      fetchedModels: ['codex-mini-latest', 'gpt-5-codex'],
    })

    const copilotProvider = normalizedStorage.providers?.find(
      provider => provider.id === 'github-copilot',
    )
    const openaiProvider = normalizedStorage.providers?.find(
      provider => provider.variant === 'openai-oauth',
    )

    expect(nextProvider.variant).toBe('openai-oauth')
    expect(nextProvider.id).toBe('openai')
    expect(nextProvider.apiKey).toBe('openai-token')

    expect(copilotProvider).toBeDefined()
    expect(copilotProvider?.variant).toBe('github-copilot-oauth')
    expect(copilotProvider?.baseURL).toBe('https://api.githubcopilot.com')
    expect(copilotProvider?.apiKey).toBe('copilot-token')
    expect(copilotProvider?.models).toEqual(['gpt-5', 'gpt-4.1'])

    expect(openaiProvider).toBeDefined()
    expect(openaiProvider?.apiKey).toBe('openai-token')
    expect(openaiProvider?.models).toEqual(['codex-mini-latest', 'gpt-5-codex'])

    expect(normalizedStorage.activeProvider).toBe('openai')
    expect(normalizedStorage.variant).toBe('openai-oauth')
    expect(normalizedStorage.providerId).toBe('openai')
    expect(normalizedStorage.authMode).toBe('oauth')
  })

  test('updates existing openai oauth provider instead of modifying copilot entry', () => {
    const previousStorage = {
      activeProvider: 'github-copilot',
      providerId: 'github-copilot',
      providerKind: 'openai-like',
      authMode: 'oauth',
      variant: 'github-copilot-oauth',
      providers: [
        {
          id: 'github-copilot',
          kind: 'openai-like',
          variant: 'github-copilot-oauth',
          authMode: 'oauth',
          baseURL: 'https://api.githubcopilot.com',
          apiKey: 'copilot-token',
          models: ['gpt-5'],
        },
        {
          id: 'openai',
          kind: 'openai-like',
          variant: 'openai-oauth',
          authMode: 'oauth',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'old-openai-token',
          models: ['old-model'],
        },
      ],
    } as any

    const { normalizedStorage } = buildOpenAIOAuthInstallState({
      previousStorage,
      accessToken: 'new-openai-token',
      fetchedModels: ['gpt-5-codex'],
    })

    const copilotProvider = normalizedStorage.providers?.find(
      provider => provider.id === 'github-copilot',
    )
    const openaiProvider = normalizedStorage.providers?.find(
      provider => provider.id === 'openai' && provider.variant === 'openai-oauth',
    )

    expect(copilotProvider?.apiKey).toBe('copilot-token')
    expect(copilotProvider?.baseURL).toBe('https://api.githubcopilot.com')
    expect(copilotProvider?.variant).toBe('github-copilot-oauth')

    expect(openaiProvider?.apiKey).toBe('new-openai-token')
    expect(openaiProvider?.models).toEqual(['gpt-5-codex'])
    expect(openaiProvider?.baseURL).toBe('https://api.openai.com/v1')

    expect(normalizedStorage.providers?.length).toBe(2)
  })
})
