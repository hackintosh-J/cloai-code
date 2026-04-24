import { c as _c } from "react/compiler-runtime";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from 'src/services/analytics/index.js';
import { installOAuthTokens } from '../cli/handlers/auth.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { setClipboard } from '../ink/termio/osc.js';
import { useTerminalNotification } from '../ink/useTerminalNotification.js';
import { Box, Link, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { getSSLErrorHint } from '../services/api/errorUtils.js';
import { sendNotification } from '../services/notifier.js';
import { AntigravityOAuthService } from '../services/oauth/antigravity.js';
import {
  enableAllGitHubCopilotModels,
  GITHUB_COPILOT_MODEL_IDS,
  getGitHubCopilotBaseUrl,
  GitHubCopilotOAuthService,
  normalizeGitHubEnterpriseDomain,
} from '../services/oauth/githubCopilot.js';
import { GeminiOAuthService } from '../services/oauth/geminiCli.js';
import { OAuthService } from '../services/oauth/index.js';
import {
  ANTIGRAVITY_OFFICIAL_MODELS,
  fetchGoogleAiStudioModels,
  fetchOpenAIOfficialModels,
  GEMINI_AI_STUDIO_BASE_URL,
  GEMINI_CLI_OFFICIAL_MODELS,
  OPENAI_OFFICIAL_BASE_URL,
} from '../services/oauth/officialModels.js';
import { getOauthAccountInfo, validateForceLoginOrg } from '../utils/auth.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import { normalizeApiKeyForConfig } from '../utils/authPortable.js';
import {
  type ProviderConfig,
  type ProviderVariant,
  deriveProviderId,
  getProviderKeyFromConfig,
  inferProviderVariant,
  normalizeCompatibleBaseURL,
  readCustomApiStorage,
  writeCustomApiStorage,
} from '../utils/customApiStorage.js';
import { logError } from '../utils/log.js';
import { getSettings_DEPRECATED } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/select.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import { Spinner } from './Spinner.js';
import TextInput from './TextInput.js';
type Props = {
  onDone(): void;
  startingMessage?: string;
  mode?: 'login' | 'setup-token';
  forceLoginMethod?: 'claudeai' | 'console';
  onTextInputActiveChange?: (active: boolean) => void;
};
type CompatibleApiProvider = 'anthropic-like' | 'openai-like' | 'gemini-like';
type OpenAICompatibleAuthMode = 'chat-completions' | 'responses' | 'oauth';
type GeminiCompatibleAuthMode = 'vertex-compatible' | 'gemini-cli-oauth';
type CompatibleAuthMode = 'api-key' | OpenAICompatibleAuthMode | GeminiCompatibleAuthMode;
type CustomConfigStep = 'authMode' | 'baseURL' | 'oauthBaseURL' | 'apiKey' | 'models' | 'copilotEnterprise';
type ProviderSelectionGroup = 'openai' | 'gemini' | 'custom';
type ProviderRootOption =
  | 'claude-official'
  | 'openai-group'
  | 'gemini-ai-studio'
  | 'gemini-antigravity-oauth'
  | 'github-copilot-oauth'
  | 'custom-group';
type ProviderRecordKey = {
  kind: CompatibleApiProvider;
  id: string;
  authMode: CompatibleAuthMode;
  baseURL?: string;
  variant?: ProviderVariant;
};
type OAuthStatus = {
  state: 'idle';
} // Initial state, waiting to select login method
| {
  state: 'manage_accounts';
} // Show existing saved accounts
| {
  state: 'provider_actions';
  providerId: string;
} // Submenu for a selected saved provider
| {
  state: 'provider_select';
} // Select provider group
| {
  state: 'provider_variant_select';
  group: ProviderSelectionGroup;
} // Select specific provider variant
| {
  state: 'custom_config';
  provider: CompatibleApiProvider;
  authMode: CompatibleAuthMode;
  step: CustomConfigStep;
  variant?: ProviderVariant;
} // Collect provider config
| {
  state: 'platform_setup';
} // Show platform setup info (Bedrock/Vertex/Foundry)
| {
  state: 'ready_to_start';
} // Flow started, waiting for browser to open
| {
  state: 'waiting_for_login';
  url: string;
  instructions?: string;
} // Browser/device flow opened, waiting for user to login
| {
  state: 'creating_api_key';
} // Got access token, creating API key
| {
  state: 'about_to_retry';
  nextState: OAuthStatus;
} | {
  state: 'success';
  token?: string;
} | {
  state: 'confirm_delete';
  providerId: string;
  accountName: string;
} | {
  state: 'error';
  message: string;
  toRetry?: OAuthStatus;
};

function getDefaultAuthMode(provider: CompatibleApiProvider): CompatibleAuthMode {
  return provider === 'openai-like'
    ? 'chat-completions'
    : provider === 'gemini-like'
      ? 'vertex-compatible'
      : 'api-key';
}

function isOpenAIOAuthMode(authMode: CompatibleAuthMode): authMode is 'oauth' {
  return authMode === 'oauth';
}

function isGeminiOAuthMode(authMode: CompatibleAuthMode): authMode is 'gemini-cli-oauth' {
  return authMode === 'gemini-cli-oauth';
}

function isBrowserOAuthAuthMode(
  authMode: CompatibleAuthMode,
): authMode is 'oauth' | 'gemini-cli-oauth' {
  return isOpenAIOAuthMode(authMode) || isGeminiOAuthMode(authMode);
}

function getCustomVariant(
  provider: CompatibleApiProvider,
  authMode: CompatibleAuthMode,
): ProviderVariant {
  if (provider === 'anthropic-like') {
    return 'custom-anthropic-like';
  }
  if (provider === 'gemini-like') {
    return 'custom-google-vertex-like';
  }
  return authMode === 'responses' ? 'custom-openai-responses' : 'custom-openai-chat';
}

function getProviderIdForVariant(
  variant: ProviderVariant | undefined,
  provider: CompatibleApiProvider,
  baseURL?: string,
): string {
  switch (variant) {
    case 'claude-official':
      return 'anthropic';
    case 'openai-official-responses':
    case 'openai-oauth':
      return 'openai';
    case 'gemini-cli-oauth':
      return 'gemini';
    case 'gemini-ai-studio':
      return 'gemini-ai-studio';
    case 'gemini-antigravity-oauth':
      return 'antigravity';
    case 'github-copilot-oauth':
      return 'github-copilot';
    default:
      return deriveProviderId(baseURL, provider);
  }
}

function getPresetBaseURLForVariant(variant: ProviderVariant | undefined): string | undefined {
  switch (variant) {
    case 'openai-official-responses':
      return OPENAI_OFFICIAL_BASE_URL;
    case 'gemini-ai-studio':
      return GEMINI_AI_STUDIO_BASE_URL;
    default:
      return undefined;
  }
}

function hasVersionPathSegment(baseURL: string | undefined): boolean {
  if (!baseURL?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(baseURL.trim());
    return /\/v\d+[a-z0-9-]*(?:\/|$)/i.test(parsed.pathname.replace(/\/+$/, ''));
  } catch {
    return /\/v\d+[a-z0-9-]*(?:\/|$)/i.test(baseURL.trim().replace(/\/+$/, ''));
  }
}

function getDefaultModelsForVariant(variant: ProviderVariant | undefined): string[] {
  switch (variant) {
    case 'gemini-cli-oauth':
      return [...GEMINI_CLI_OFFICIAL_MODELS];
    case 'gemini-antigravity-oauth':
      return [...ANTIGRAVITY_OFFICIAL_MODELS];
    case 'github-copilot-oauth':
      return [...GITHUB_COPILOT_MODEL_IDS];
    default:
      return [];
  }
}

function getSelectionGroupForVariant(
  variant: ProviderVariant | undefined,
): ProviderSelectionGroup | undefined {
  switch (variant) {
    case 'openai-official-responses':
    case 'openai-oauth':
      return 'openai';
    case 'gemini-cli-oauth':
    case 'gemini-ai-studio':
      return 'gemini';
    case 'custom-anthropic-like':
    case 'custom-openai-chat':
    case 'custom-openai-responses':
    case 'custom-google-vertex-like':
      return 'custom';
    default:
      return undefined;
  }
}

/**
 * Extracts a short account/provider name from a baseURL for display in the UI.
 * e.g. "https://sub2api.hackins.club/v1" → "sub2api"
 *       "https://api.anthropic.com" → "Anthropic"
 */
function extractAccountNameFromUrl(baseURL: string | undefined, providerId: string): string {
  if (providerId === 'anthropic-like') {
    return baseURL ? extractHost(baseURL) : 'Anthropic';
  }
  if (providerId === 'gemini-like') {
    return baseURL ? extractHost(baseURL) : 'Gemini-compatible';
  }
  if (!baseURL) return 'OpenAI-compatible';
  return extractHost(baseURL);
}

function buildProviderDisplayName(provider: Pick<ProviderConfig, 'kind' | 'authMode' | 'baseURL' | 'variant' | 'id'>): string {
  switch (provider.variant) {
    case 'claude-official':
      return 'Claude';
    case 'openai-official-responses':
      return 'OpenAI';
    case 'openai-oauth':
      return 'OpenAI OAuth';
    case 'gemini-cli-oauth':
      return 'Google Gemini CLI OAuth';
    case 'gemini-ai-studio':
      return 'Google AI Studio';
    case 'gemini-antigravity-oauth':
      return 'Antigravity';
    case 'github-copilot-oauth':
      return 'GitHub Copilot';
    default:
      return provider.id || extractAccountNameFromUrl(provider.baseURL, provider.kind);
  }
}

function buildProviderTypeLabel(provider: Pick<ProviderConfig, 'kind' | 'authMode' | 'variant'>): string {
  switch (provider.variant) {
    case 'claude-official':
      return 'Official Claude';
    case 'openai-official-responses':
      return 'Official OpenAI Responses';
    case 'openai-oauth':
      return 'Official OpenAI OAuth';
    case 'gemini-cli-oauth':
      return 'Official Gemini CLI OAuth';
    case 'gemini-ai-studio':
      return 'Official Google AI Studio';
    case 'gemini-antigravity-oauth':
      return 'Official Antigravity OAuth';
    case 'github-copilot-oauth':
      return 'Official GitHub Copilot OAuth';
    case 'custom-openai-chat':
      return 'Custom OpenAI chat/completions';
    case 'custom-openai-responses':
      return 'Custom OpenAI Responses';
    case 'custom-google-vertex-like':
      return 'Custom Google-Vertex-Like';
    case 'custom-anthropic-like':
      return 'Custom Anthropic-Like';
    default:
      return provider.kind === 'openai-like'
        ? provider.authMode === 'responses'
          ? 'Custom OpenAI Responses'
          : 'Custom OpenAI chat/completions'
        : provider.kind === 'gemini-like'
          ? 'Custom Google-Vertex-Like'
          : 'Custom Anthropic-Like';
  }
}

function extractHost(url: string): string {
  try {
    const u = new URL(url);
    let host = u.hostname
      .replace(/^api[.-]/, '')
      .replace(/^openai[.-]/, '')
      .replace(/^claude[.-]/, '');
    if (host.includes('.')) {
      host = host.split('.')[0]!;
    }
    return host || url;
  } catch {
    return url;
  }
}

function normalizeModelsInput(value: string): string[] {
  return [...new Set(value.split(/\s+/).map(item => item.trim()).filter(Boolean))];
}

function formatModelsInput(models: string[] | undefined, fallback?: string): string {
  if (models && models.length > 0) {
    return models.join(' ');
  }
  return fallback ?? '';
}

function getProviderKey(provider: ProviderRecordKey): string {
  return `${provider.kind}::${provider.variant ?? ''}::${provider.id}::${provider.authMode}::${provider.baseURL ?? ''}`;
}

function findProviderByKey(
  providers: ProviderConfig[],
  key: ProviderRecordKey | undefined,
): ProviderConfig | undefined {
  if (!key) return undefined;
  return providers.find(provider => getProviderKeyFromConfig(provider) === getProviderKey(key));
}

function getProviderModelsInput(
  providers: ProviderConfig[] | undefined,
  key: ProviderRecordKey | undefined,
  fallback?: string,
): string {
  if (!providers || providers.length === 0) {
    return fallback ?? '';
  }
  const provider = findProviderByKey(providers, key);
  return formatModelsInput(provider?.models, fallback);
}

function buildActiveSnapshot(
  provider: ProviderConfig | undefined,
  activeModel: string | undefined,
): {
  kind?: CompatibleApiProvider;
  variant?: ProviderVariant;
  provider?: 'anthropic' | 'openai' | 'gemini';
  providerId?: string;
  authMode?: CompatibleAuthMode;
  baseURL?: string;
  apiKey?: string;
  model?: string;
  savedModels?: string[];
} {
  return {
    kind: provider?.kind,
    variant: provider?.variant,
    provider:
      provider?.kind === 'openai-like'
        ? 'openai'
        : provider?.kind === 'anthropic-like'
          ? 'anthropic'
          : provider?.kind === 'gemini-like'
            ? 'gemini'
            : undefined,
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
  };
}

function parseManualOAuthInput(value: string): {
  authorizationCode: string;
  state: string;
} | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const authorizationCode = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (authorizationCode && state) {
      return { authorizationCode, state };
    }
  } catch {
    // Fall through to raw code parsing.
  }

  const [authorizationCode, state] = trimmed.split('#');
  if (!authorizationCode || !state) {
    return null;
  }
  return { authorizationCode, state };
}

const PASTE_HERE_MSG = 'Paste full link from browser here > ';
export function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode = 'login',
  forceLoginMethod: forceLoginMethodProp,
  onTextInputActiveChange,
}: Props): React.ReactNode {
  const settings = getSettings_DEPRECATED() || {};
  const forceLoginMethod = forceLoginMethodProp ?? settings.forceLoginMethod;
  const orgUUID = settings.forceLoginOrgUUID;
  const forcedMethodMessage = forceLoginMethod === 'claudeai' ? 'Login method pre-selected: Subscription Plan (Claude Pro/Max)' : forceLoginMethod === 'console' ? 'Login method pre-selected: API Usage Billing (Anthropic Console)' : null;
  const readPersistedCustomApiEndpoint = useCallback(() => ({
    ...(getGlobalConfig().customApiEndpoint ?? {}),
    ...readCustomApiStorage()
  }), []);
  const [persistedCustomApiEndpoint, setPersistedCustomApiEndpoint] = useState(readPersistedCustomApiEndpoint);
  const persistedProviders = persistedCustomApiEndpoint.providers ?? [];
  const persistedActiveProvider = persistedCustomApiEndpoint.activeProvider ?? persistedCustomApiEndpoint.providerId;
  const persistedProviderConfig = persistedProviders.find(provider =>
    provider.id === persistedActiveProvider &&
    provider.authMode === (persistedCustomApiEndpoint.activeAuthMode ?? persistedCustomApiEndpoint.authMode),
  ) ?? persistedProviders.find(provider => provider.id === persistedActiveProvider) ?? persistedProviders[0];
  const persistedActiveProviderKey = persistedProviderConfig
    ? getProviderKeyFromConfig(persistedProviderConfig)
    : undefined;
  const persistedProviderKind = persistedProviderConfig?.kind ?? persistedCustomApiEndpoint.kind ?? (persistedCustomApiEndpoint.provider === 'openai'
    ? 'openai-like'
    : persistedCustomApiEndpoint.provider === 'gemini'
      ? 'gemini-like'
      : 'anthropic-like');
  const persistedAuthMode = persistedProviderConfig?.authMode ?? getDefaultAuthMode(persistedProviderKind);
  const persistedVariant =
    persistedProviderConfig?.variant ??
    inferProviderVariant({
      kind: persistedProviderKind,
      authMode: persistedAuthMode,
      baseURL: persistedProviderConfig?.baseURL ?? persistedCustomApiEndpoint.baseURL,
      id: persistedProviderConfig?.id ?? persistedCustomApiEndpoint.providerId,
      provider: persistedCustomApiEndpoint.provider,
    });
  const persistedProviderKey = persistedProviderConfig ? {
    kind: persistedProviderConfig.kind,
    id: persistedProviderConfig.id,
    authMode: persistedProviderConfig.authMode,
    baseURL: persistedProviderConfig.baseURL,
    variant: persistedProviderConfig.variant,
  } : undefined;
  const persistedModelsInput = getProviderModelsInput(
    persistedProviders,
    persistedProviderKey,
    persistedCustomApiEndpoint.model ?? process.env.ANTHROPIC_MODEL ?? '',
  );
  const terminal = useTerminalNotification();
  const [selectedProviderKey, setSelectedProviderKey] = useState<ProviderRecordKey | undefined>(persistedProviderKey);
  const [selectedProviderVariant, setSelectedProviderVariant] = useState<ProviderVariant | undefined>(persistedVariant);
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>(() => {
    if (mode === 'setup-token') {
      return {
        state: 'ready_to_start'
      };
    }
    if (forceLoginMethod === 'claudeai' || forceLoginMethod === 'console') {
      return {
        state: 'ready_to_start'
      };
    }
    // Show account management if providers are already configured
    if (persistedProviders.length > 0) {
      return {
        state: 'manage_accounts'
      };
    }
    return {
      state: 'provider_select'
    };
  });
  const safeOauthStatus = oauthStatus ?? {
    state: 'provider_select' as const
  };
  const [compatibleApiProvider, setCompatibleApiProvider] = useState<CompatibleApiProvider>(persistedProviderKind);
  const [compatibleAuthMode, setCompatibleAuthMode] = useState<CompatibleAuthMode>(persistedAuthMode);
  const [pastedCode, setPastedCode] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const [customBaseURL, setCustomBaseURL] = useState(persistedProviderConfig?.baseURL ?? persistedCustomApiEndpoint.baseURL ?? process.env.ANTHROPIC_BASE_URL ?? '');
  const [customApiKey, setCustomApiKey] = useState(persistedProviderConfig?.apiKey ?? persistedCustomApiEndpoint.apiKey ?? process.env.CLOAI_API_KEY ?? '');
  const [customModels, setCustomModels] = useState(persistedModelsInput);
  const [copilotEnterpriseDomain, setCopilotEnterpriseDomain] = useState(
    typeof (persistedProviderConfig?.oauth as { enterpriseDomain?: string } | undefined)?.enterpriseDomain === 'string'
      ? (persistedProviderConfig?.oauth as { enterpriseDomain?: string } | undefined)?.enterpriseDomain ?? ''
      : '',
  );
  const [oauthService] = useState(() => new OAuthService());
  const [geminiOAuthService] = useState(() => new GeminiOAuthService());
  const [antigravityOAuthService] = useState(() => new AntigravityOAuthService());
  const [githubCopilotOAuthService] = useState(() => new GitHubCopilotOAuthService());
  const [loginWithClaudeAi, setLoginWithClaudeAi] = useState(() => {
    // Use Claude AI auth for setup-token mode to support user:inference scope
    return mode === 'setup-token' || forceLoginMethod === 'claudeai';
  });
  // After a few seconds we suggest the user to copy/paste url if the
  // browser did not open automatically. In this flow we expect the user to
  // copy the code from the browser and paste it in the terminal
  const [showPastePrompt, setShowPastePrompt] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [isCustomInputPasting, setIsCustomInputPasting] = useState(false);
  const isEditingTextInput = safeOauthStatus.state === 'custom_config' || (safeOauthStatus.state === 'waiting_for_login' && showPastePrompt && !safeOauthStatus.instructions);
  const textInputColumns = useTerminalSize().columns - PASTE_HERE_MSG.length - 1;
  const refreshPersistedCustomApiEndpoint = useCallback(() => {
    setPersistedCustomApiEndpoint(readPersistedCustomApiEndpoint());
  }, [readPersistedCustomApiEndpoint]);
  useEffect(() => {
    onTextInputActiveChange?.(isEditingTextInput);
  }, [isEditingTextInput, onTextInputActiveChange]);
  const startCompatibleApiConfig = useCallback((provider: CompatibleApiProvider) => {
    const nextAuthMode = getDefaultAuthMode(provider);
    const nextVariant = getCustomVariant(provider, nextAuthMode);
    const nextProviderKey = {
      kind: provider,
      id: getProviderIdForVariant(nextVariant, provider),
      authMode: nextAuthMode,
      baseURL: undefined,
      variant: nextVariant,
    };
    setCompatibleApiProvider(provider);
    setCompatibleAuthMode(nextAuthMode);
    setSelectedProviderVariant(nextVariant);
    setSelectedProviderKey(undefined);
    setCustomBaseURL('');
    setCustomApiKey('');
    setCopilotEnterpriseDomain('');
    setCustomModels(getProviderModelsInput(persistedProviders, nextProviderKey));
    setOAuthStatus({
      state: 'custom_config',
      provider,
      authMode: nextAuthMode,
      step: provider === 'openai-like' ? 'authMode' : 'baseURL',
      variant: nextVariant,
    });
  }, [persistedProviders]);

  const startOfficialProviderConfig = useCallback((variant: ProviderVariant) => {
    let provider: CompatibleApiProvider = 'anthropic-like';
    let authMode: CompatibleAuthMode = 'api-key';
    switch (variant) {
      case 'openai-official-responses':
        provider = 'openai-like';
        authMode = 'responses';
        break;
      case 'openai-oauth':
        provider = 'openai-like';
        authMode = 'oauth';
        break;
      case 'gemini-cli-oauth':
      case 'gemini-antigravity-oauth':
        provider = 'gemini-like';
        authMode = 'gemini-cli-oauth';
        break;
      case 'gemini-ai-studio':
        provider = 'gemini-like';
        authMode = 'vertex-compatible';
        break;
      case 'github-copilot-oauth':
        provider = 'openai-like';
        authMode = 'oauth';
        break;
      case 'claude-official':
      default:
        provider = 'anthropic-like';
        authMode = 'api-key';
        break;
    }

    const presetBaseURL = getPresetBaseURLForVariant(variant);
    const providerId = getProviderIdForVariant(variant, provider, presetBaseURL);
    const providerKey = {
      kind: provider,
      id: providerId,
      authMode,
      baseURL: presetBaseURL,
      variant,
    };

    setCompatibleApiProvider(provider);
    setCompatibleAuthMode(authMode);
    setSelectedProviderVariant(variant);
    setSelectedProviderKey(undefined);
    setCustomBaseURL(presetBaseURL ?? '');
    setCustomApiKey('');
    setCopilotEnterpriseDomain('');
    setCustomModels(formatModelsInput(getDefaultModelsForVariant(variant)));
    setCursorOffset(0);

    if (variant === 'claude-official' || variant === 'openai-oauth' || variant === 'gemini-cli-oauth' || variant === 'gemini-antigravity-oauth') {
      setLoginWithClaudeAi(variant === 'claude-official');
      setOAuthStatus({ state: 'ready_to_start' });
      return;
    }

    if (variant === 'github-copilot-oauth') {
      setOAuthStatus({
        state: 'custom_config',
        provider,
        authMode,
        step: 'copilotEnterprise',
        variant,
      });
      return;
    }

    setCustomModels(getProviderModelsInput(persistedProviders, providerKey, formatModelsInput(getDefaultModelsForVariant(variant))));
    setOAuthStatus({
      state: 'custom_config',
      provider,
      authMode,
      step: 'apiKey',
      variant,
    });
  }, [persistedProviders]);
  const handleOpenProviderActions = useCallback((providerId: string) => {
    const provider =
      persistedProviders.find(
        p => getProviderKeyFromConfig(p) === providerId || p.id === providerId,
      ) ?? persistedProviders[0];
    if (provider) {
      setSelectedProviderKey({
        kind: provider.kind,
        id: provider.id,
        authMode: provider.authMode,
        baseURL: provider.baseURL,
        variant: provider.variant,
      });
      setCompatibleApiProvider(provider.kind);
      setCompatibleAuthMode(provider.authMode);
      setCustomBaseURL(provider.baseURL ?? '');
      setCustomApiKey(provider.apiKey ?? '');
      setCustomModels(formatModelsInput(provider.models));
      if (provider.variant) {
        setSelectedProviderVariant(provider.variant);
      }
    }
    setOAuthStatus({
      state: 'provider_actions',
      providerId,
    });
  }, [persistedProviders]);
  // Account management: confirm deletion of an existing provider
  const handleDeleteAccountRequest = useCallback((providerId: string) => {
    const provider =
      persistedProviders.find(
        p => getProviderKeyFromConfig(p) === providerId || p.id === providerId,
      ) ?? persistedProviders[0];
    const accountName = provider?.id ?? extractAccountNameFromUrl(provider?.baseURL, provider?.kind ?? 'openai-like');
    if (provider) {
      setSelectedProviderKey({
        kind: provider.kind,
        id: provider.id,
        authMode: provider.authMode,
        baseURL: provider.baseURL,
        variant: provider.variant,
      });
      if (provider.variant) {
        setSelectedProviderVariant(provider.variant);
      }
    }
    setOAuthStatus({
      state: 'confirm_delete',
      providerId,
      accountName,
    });
  }, [persistedProviders]);

  // Account management: confirm deletion and remove provider
  const handleDeleteAccountConfirm = useCallback(() => {
    if (safeOauthStatus.state !== 'confirm_delete') return;
    const { providerId, accountName } = safeOauthStatus;
    const currentStorage = readCustomApiStorage();
    const currentProviders = currentStorage.providers ?? [];
    const providerToDelete =
      findProviderByKey(currentProviders, selectedProviderKey) ??
      currentProviders.find(
        p => getProviderKeyFromConfig(p) === providerId || p.id === providerId,
      );
    if (!providerToDelete) {
      setOAuthStatus({ state: 'manage_accounts' });
      return;
    }
    const remainingProviders = currentProviders.filter(
      p => getProviderKeyFromConfig(p) !== getProviderKeyFromConfig(providerToDelete),
    );
    const activeProvider = currentProviders.find(
      p => p.id === currentStorage.activeProvider,
    );
    const next =
      activeProvider &&
      getProviderKeyFromConfig(activeProvider) !== getProviderKeyFromConfig(providerToDelete)
        ? remainingProviders.find(
            p => getProviderKeyFromConfig(p) === getProviderKeyFromConfig(activeProvider),
          )
        : remainingProviders[0];
    const nextSnapshot = buildActiveSnapshot(next, next?.models[0]);
    if (next) {
      const providerKey = {
        kind: next.kind,
        id: next.id,
        authMode: next.authMode,
        baseURL: next.baseURL,
        variant: next.variant,
      };
      setSelectedProviderKey(providerKey);
      if (next.variant) {
        setSelectedProviderVariant(next.variant);
      }
      setCompatibleApiProvider(next.kind);
      setCompatibleAuthMode(next.authMode);
      setCustomBaseURL(next.baseURL ?? '');
      setCustomApiKey(next.apiKey ?? '');
      setCustomModels(formatModelsInput(next.models));
    } else {
      setSelectedProviderKey(undefined);
      setCompatibleApiProvider('openai-like');
      setCompatibleAuthMode('chat-completions');
      setCustomBaseURL('');
      setCustomApiKey('');
      setCustomModels('');
    }
    writeCustomApiStorage({
      ...currentStorage,
      activeProviderKey: next ? getProviderKeyFromConfig(next) : undefined,
      providers: remainingProviders.length > 0 ? remainingProviders : undefined,
      activeProvider: next?.id,
      activeModel: next?.models[0],
      ...nextSnapshot,
    });
    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: next ? nextSnapshot : undefined,
    }));
    refreshPersistedCustomApiEndpoint();
    if (nextSnapshot.baseURL) {
      process.env.ANTHROPIC_BASE_URL = nextSnapshot.baseURL;
    } else {
      delete process.env.ANTHROPIC_BASE_URL;
    }
    if (nextSnapshot.apiKey) {
      process.env.CLOAI_API_KEY = nextSnapshot.apiKey;
    } else {
      delete process.env.CLOAI_API_KEY;
    }
    if (nextSnapshot.model) {
      process.env.ANTHROPIC_MODEL = nextSnapshot.model;
    } else {
      delete process.env.ANTHROPIC_MODEL;
    }
    setOAuthStatus(
      remainingProviders.length > 0
        ? { state: 'manage_accounts' }
        : { state: 'provider_select' },
    );
    void sendNotification(
      {
        message: `Removed account: ${accountName}`,
        notificationType: 'auth_success',
      },
      terminal,
    );
  }, [safeOauthStatus, selectedProviderKey, terminal, refreshPersistedCustomApiEndpoint]);

  // Log forced login method on mount
  useEffect(() => {
    if (forceLoginMethod === 'claudeai') {
      logEvent('tengu_oauth_claudeai_forced', {});
    } else if (forceLoginMethod === 'console') {
      logEvent('tengu_oauth_console_forced', {});
    }
  }, [forceLoginMethod]);

  // Retry logic
  useEffect(() => {
    if (safeOauthStatus.state === 'about_to_retry') {
      const timer = setTimeout(setOAuthStatus, 1000, safeOauthStatus.nextState);
      return () => clearTimeout(timer);
    }
  }, [safeOauthStatus]);

  // Handle Enter to continue on success state
  useKeybinding('confirm:yes', () => {
    logEvent('tengu_oauth_success', {
      loginWithClaudeAi
    });
    onDone();
  }, {
    context: 'Confirmation',
    isActive: safeOauthStatus.state === 'success' && mode !== 'setup-token'
  });

  // Handle Enter to continue from platform setup
  useKeybinding('confirm:yes', () => {
    setOAuthStatus({
      state: 'idle'
    });
  }, {
    context: 'Confirmation',
    isActive: safeOauthStatus.state === 'platform_setup'
  });

  // Handle Enter to retry on error state
  useKeybinding('confirm:yes', () => {
    if (safeOauthStatus.state === 'error' && safeOauthStatus.toRetry) {
      setPastedCode('');
      setOAuthStatus({
        state: 'about_to_retry',
        nextState: safeOauthStatus.toRetry
      });
    }
  }, {
    context: 'Confirmation',
    isActive: safeOauthStatus.state === 'error' && !!safeOauthStatus.toRetry
  });

  // Handle Escape to go back from provider submenu
  useKeybinding('select:cancel', () => {
    if (safeOauthStatus.state === 'provider_actions') {
      setOAuthStatus({ state: 'manage_accounts' });
    }
  }, {
    context: 'Select',
    isActive: safeOauthStatus.state === 'provider_actions'
  });

  useEffect(() => {
    if (pastedCode === 'c' && safeOauthStatus.state === 'waiting_for_login' && showPastePrompt && !urlCopied) {
      void setClipboard(safeOauthStatus.url).then(raw => {
        if (raw) process.stdout.write(raw);
        setUrlCopied(true);
        setTimeout(setUrlCopied, 2000, false);
      });
      setPastedCode('');
    }
  }, [pastedCode, safeOauthStatus, showPastePrompt, urlCopied]);
  const persistCustomEndpoint = useCallback((input?: {
    models?: string;
    baseURL?: string;
    apiKey?: string;
    provider?: CompatibleApiProvider;
    authMode?: CompatibleAuthMode;
    variant?: ProviderVariant;
    providerId?: string;
    oauth?: ProviderConfig['oauth'];
  }) => {
    const providerKind = input?.provider ?? compatibleApiProvider;
    const authMode = input?.authMode ?? compatibleAuthMode;
    const variant = input?.variant ?? selectedProviderVariant;
    const nextBaseURL = normalizeCompatibleBaseURL(
      input?.baseURL ?? customBaseURL ?? getPresetBaseURLForVariant(variant),
    );
    const nextApiKey = (input?.apiKey ?? customApiKey).trim();
    const nextModels = normalizeModelsInput(input?.models ?? customModels);
    const nextActiveModel = nextModels[0];
    const normalizedKey = nextApiKey ? normalizeApiKeyForConfig(nextApiKey) : null;
    const providerId =
      input?.providerId ??
      getProviderIdForVariant(variant, providerKind, nextBaseURL || undefined);
    const shouldClearEndpointCredentials =
      providerKind === 'gemini-like' && authMode === 'gemini-cli-oauth';
    const shouldPersistOAuthAccessToken = variant === 'github-copilot-oauth';
    const providerConfig = {
      id: providerId,
      kind: providerKind,
      variant,
      authMode,
      baseURL: shouldClearEndpointCredentials ? nextBaseURL : nextBaseURL,
      apiKey:
        shouldClearEndpointCredentials
          ? undefined
          : shouldPersistOAuthAccessToken
            ? nextApiKey || undefined
            : isBrowserOAuthAuthMode(authMode)
              ? undefined
              : nextApiKey || undefined,
      models: nextModels,
      ...(input?.oauth ? { oauth: input.oauth } : {}),
    } satisfies ProviderConfig;
    const existingProviders = persistedCustomApiEndpoint.providers ?? [];
    const exactKey = getProviderKeyFromConfig(providerConfig);
    const providers = [
      ...existingProviders.filter(provider => getProviderKeyFromConfig(provider) !== exactKey),
      providerConfig,
    ];
    const activeSnapshot = buildActiveSnapshot(providerConfig, nextActiveModel);
    setSelectedProviderKey({
      kind: providerConfig.kind,
      id: providerConfig.id,
      authMode: providerConfig.authMode,
      baseURL: providerConfig.baseURL,
      variant: providerConfig.variant,
    });
    setSelectedProviderVariant(providerConfig.variant);
    if (providerConfig.baseURL) {
      process.env.ANTHROPIC_BASE_URL = providerConfig.baseURL;
    } else {
      delete process.env.ANTHROPIC_BASE_URL;
    }
    if (providerConfig.apiKey) {
      process.env.CLOAI_API_KEY = providerConfig.apiKey;
    } else {
      delete process.env.CLOAI_API_KEY;
    }
    if (nextActiveModel) {
      process.env.ANTHROPIC_MODEL = nextActiveModel;
    } else {
      delete process.env.ANTHROPIC_MODEL;
    }
    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: activeSnapshot,
      customApiKeyResponses: normalizedKey
        ? {
            approved: [
              ...new Set([...(current.customApiKeyResponses?.approved ?? []), normalizedKey]),
            ],
            rejected: (current.customApiKeyResponses?.rejected ?? []).filter(
              key => key !== normalizedKey,
            ),
          }
        : current.customApiKeyResponses,
    }));
    writeCustomApiStorage({
      activeProviderKey: getProviderKeyFromConfig(providerConfig),
      activeProvider: providerConfig.id,
      activeModel: nextActiveModel,
      activeAuthMode: providerConfig.authMode,
      providers,
      ...activeSnapshot,
    });
    refreshPersistedCustomApiEndpoint();
    return providerConfig;
  }, [
    compatibleApiProvider,
    compatibleAuthMode,
    customApiKey,
    customBaseURL,
    customModels,
    persistedCustomApiEndpoint.providers,
    refreshPersistedCustomApiEndpoint,
    selectedProviderVariant,
  ]);

  const handleSubmitCustomConfig = useCallback(async (value: string) => {
    if (safeOauthStatus.state !== 'custom_config') {
      return;
    }

    const variant = safeOauthStatus.variant;

    if (safeOauthStatus.step === 'authMode') {
      const nextAuthMode = value as CompatibleAuthMode;
      const nextBaseURL = normalizeCompatibleBaseURL(customBaseURL);
      const nextVariant = getCustomVariant(safeOauthStatus.provider, nextAuthMode);
      const nextProviderKey = {
        kind: safeOauthStatus.provider,
        id: getProviderIdForVariant(nextVariant, safeOauthStatus.provider, nextBaseURL),
        authMode: nextAuthMode,
        baseURL:
          nextAuthMode === 'oauth' || nextAuthMode === 'gemini-cli-oauth'
            ? undefined
            : nextBaseURL,
        variant: nextVariant,
      };
      setCompatibleAuthMode(nextAuthMode);
      setSelectedProviderVariant(nextVariant);
      setCustomApiKey('');
      setCustomModels(
        getProviderModelsInput(persistedCustomApiEndpoint.providers, nextProviderKey),
      );
      setCursorOffset(0);
      if (nextAuthMode === 'oauth' && safeOauthStatus.provider === 'openai-like') {
        setLoginWithClaudeAi(false);
        setOAuthStatus({ state: 'ready_to_start' });
        return;
      }
      setOAuthStatus({
        state: 'custom_config',
        provider: safeOauthStatus.provider,
        authMode: nextAuthMode,
        step: 'baseURL',
        variant: nextVariant,
      });
      return;
    }

    if (safeOauthStatus.step === 'copilotEnterprise') {
      const normalizedDomain = normalizeGitHubEnterpriseDomain(value);
      if (value.trim() && !normalizedDomain) {
        setOAuthStatus({
          state: 'error',
          message: 'GitHub Enterprise domain is invalid',
          toRetry: {
            state: 'custom_config',
            provider: safeOauthStatus.provider,
            authMode: safeOauthStatus.authMode,
            step: 'copilotEnterprise',
            variant,
          },
        });
        return;
      }
      setCopilotEnterpriseDomain(normalizedDomain ?? '');
      setLoginWithClaudeAi(false);
      setOAuthStatus({ state: 'ready_to_start' });
      return;
    }

    if (safeOauthStatus.step === 'baseURL') {
      const nextValue = normalizeCompatibleBaseURL(value) ?? getPresetBaseURLForVariant(variant);
      if (!nextValue) {
        setOAuthStatus({
          state: 'error',
          message: 'Compatible API base URL is required',
          toRetry: {
            state: 'custom_config',
            provider: safeOauthStatus.provider,
            authMode: safeOauthStatus.authMode,
            step: 'baseURL',
            variant,
          },
        });
        return;
      }
      setCustomBaseURL(nextValue);
      setCursorOffset(0);
      setOAuthStatus({
        state: 'custom_config',
        provider: safeOauthStatus.provider,
        authMode: safeOauthStatus.authMode,
        step: 'apiKey',
        variant,
      });
      return;
    }

    if (safeOauthStatus.step === 'oauthBaseURL') {
      const nextValue = value.trim();
      if (!nextValue) {
        setOAuthStatus({
          state: 'error',
          message: 'OAuth base URL is required for OIDC discovery',
          toRetry: {
            state: 'custom_config',
            provider: safeOauthStatus.provider,
            authMode: safeOauthStatus.authMode,
            step: 'oauthBaseURL',
            variant,
          },
        });
        return;
      }
      setCustomBaseURL(nextValue);
      setCursorOffset(0);
      setOAuthStatus({
        state: 'custom_config',
        provider: safeOauthStatus.provider,
        authMode: safeOauthStatus.authMode,
        step: 'models',
        variant,
      });
      return;
    }

    if (safeOauthStatus.step === 'apiKey') {
      const nextValue = value.trim();
      if (!nextValue) {
        setOAuthStatus({
          state: 'error',
          message: 'API key is required',
          toRetry: {
            state: 'custom_config',
            provider: safeOauthStatus.provider,
            authMode: safeOauthStatus.authMode,
            step: 'apiKey',
            variant,
          },
        });
        return;
      }
      setCustomApiKey(nextValue);
      setCursorOffset(0);

      if (variant === 'openai-official-responses') {
        try {
          const fetchedModels = await fetchOpenAIOfficialModels(nextValue);
          persistCustomEndpoint({
            provider: safeOauthStatus.provider,
            authMode: safeOauthStatus.authMode,
            variant,
            providerId: getProviderIdForVariant(variant, safeOauthStatus.provider),
            apiKey: nextValue,
            baseURL: OPENAI_OFFICIAL_BASE_URL,
            models: fetchedModels.join(' '),
          });
          setCustomModels(fetchedModels.join(' '));
          setOAuthStatus({ state: 'success' });
          void sendNotification({
            message: 'OpenAI official API key saved',
            notificationType: 'auth_success',
          }, terminal);
          return;
        } catch (err) {
          logError(err);
          setOAuthStatus({
            state: 'error',
            message: (err as Error).message,
            toRetry: {
              state: 'custom_config',
              provider: safeOauthStatus.provider,
              authMode: safeOauthStatus.authMode,
              step: 'apiKey',
              variant,
            },
          });
          return;
        }
      }

      if (variant === 'gemini-ai-studio') {
        try {
          const fetchedModels = await fetchGoogleAiStudioModels(nextValue);
          persistCustomEndpoint({
            provider: safeOauthStatus.provider,
            authMode: safeOauthStatus.authMode,
            variant,
            providerId: getProviderIdForVariant(variant, safeOauthStatus.provider),
            apiKey: nextValue,
            baseURL: GEMINI_AI_STUDIO_BASE_URL,
            models: fetchedModels.join(' '),
          });
          setCustomModels(fetchedModels.join(' '));
          setOAuthStatus({ state: 'success' });
          void sendNotification({
            message: 'Google AI Studio API key saved',
            notificationType: 'auth_success',
          }, terminal);
          return;
        } catch (err) {
          logError(err);
          setOAuthStatus({
            state: 'error',
            message: (err as Error).message,
            toRetry: {
              state: 'custom_config',
              provider: safeOauthStatus.provider,
              authMode: safeOauthStatus.authMode,
              step: 'apiKey',
              variant,
            },
          });
          return;
        }
      }

      setOAuthStatus({
        state: 'custom_config',
        provider: safeOauthStatus.provider,
        authMode: safeOauthStatus.authMode,
        step: 'models',
        variant,
      });
      return;
    }

    const nextValue = value.trim();
    if (normalizeModelsInput(nextValue).length === 0) {
      setOAuthStatus({
        state: 'error',
        message: 'At least one model is required',
        toRetry: {
          state: 'custom_config',
          provider: safeOauthStatus.provider,
          authMode: safeOauthStatus.authMode,
          step: 'models',
          variant,
        },
      });
      return;
    }
    setCustomModels(nextValue);
    persistCustomEndpoint({ models: nextValue, variant });
    if (isBrowserOAuthAuthMode(safeOauthStatus.authMode)) {
      setLoginWithClaudeAi(false);
      setOAuthStatus({ state: 'ready_to_start' });
    } else {
      setOAuthStatus({ state: 'success' });
      void sendNotification({
        message:
          variant === 'openai-official-responses'
            ? 'OpenAI official endpoint saved'
            : variant === 'gemini-ai-studio'
              ? 'Google AI Studio endpoint saved'
              : safeOauthStatus.provider === 'openai-like'
                ? `OpenAI-compatible ${safeOauthStatus.authMode} endpoint saved`
                : safeOauthStatus.provider === 'gemini-like'
                  ? `Gemini-compatible ${safeOauthStatus.authMode} endpoint saved`
                  : 'Anthropic-compatible endpoint saved',
        notificationType: 'auth_success',
      }, terminal);
    }
  }, [
    safeOauthStatus,
    customBaseURL,
    customModels,
    compatibleApiProvider,
    compatibleAuthMode,
    persistedCustomApiEndpoint.providers,
    persistCustomEndpoint,
    terminal,
    setLoginWithClaudeAi,
  ]);
  async function handleSubmitCode(value: string, url: string) {
    try {
      const parsedInput = parseManualOAuthInput(value);
      if (!parsedInput) {
        setOAuthStatus({
          state: 'error',
          message: 'Invalid input. Paste the full link from the browser exactly as-is — usually the localhost callback URL — or paste code#state.',
          toRetry: {
            state: 'waiting_for_login',
            url
          }
        });
        return;
      }
      const { authorizationCode, state } = parsedInput;

      // Track which path the user is taking (manual code entry)
      logEvent('tengu_oauth_manual_entry', {});
      if (selectedProviderVariant === 'gemini-antigravity-oauth') {
        antigravityOAuthService.handleManualAuthCodeInput({
          authorizationCode,
          state,
        });
      } else if (compatibleApiProvider === 'gemini-like') {
        geminiOAuthService.handleManualAuthCodeInput({
          authorizationCode,
          state,
        });
      } else {
        oauthService.handleManualAuthCodeInput({
          authorizationCode,
          state,
        });
      }
    } catch (err: unknown) {
      logError(err);
      setOAuthStatus({
        state: 'error',
        message: (err as Error).message,
        toRetry: {
          state: 'waiting_for_login',
          url
        }
      });
    }
  }
  const startOAuth = useCallback(async () => {
    try {
      const activeVariant = selectedProviderVariant;
      const isOpenAIOAuth = activeVariant === 'openai-oauth';
      const isGeminiCliOAuth = activeVariant === 'gemini-cli-oauth';
      const isAntigravityOAuth = activeVariant === 'gemini-antigravity-oauth';
      const isCopilotOAuth = activeVariant === 'github-copilot-oauth';
      logEvent('tengu_oauth_flow_start', {
        loginWithClaudeAi:
          isOpenAIOAuth || isGeminiCliOAuth || isAntigravityOAuth || isCopilotOAuth
            ? false
            : loginWithClaudeAi,
        oauthProvider: isCopilotOAuth
          ? 'openai'
          : isOpenAIOAuth
            ? 'openai'
            : isGeminiCliOAuth || isAntigravityOAuth
              ? 'gemini'
              : 'anthropic',
      });

      const result = isAntigravityOAuth
        ? await antigravityOAuthService.startOAuthFlow(async url_0 => {
            setOAuthStatus({
              state: 'waiting_for_login',
              url: url_0,
            });
            setTimeout(setShowPastePrompt, 3000, true);
          })
        : isCopilotOAuth
          ? await githubCopilotOAuthService.startOAuthFlow({
              enterpriseDomain: copilotEnterpriseDomain || undefined,
              onAuth: async (url_0, instructions) => {
                setOAuthStatus({
                  state: 'waiting_for_login',
                  url: url_0,
                  instructions,
                });
                setShowPastePrompt(true);
              },
            })
          : isGeminiCliOAuth
            ? await geminiOAuthService.startOAuthFlow(async url_0 => {
                setOAuthStatus({
                  state: 'waiting_for_login',
                  url: url_0,
                });
                setTimeout(setShowPastePrompt, 3000, true);
              })
            : await oauthService
                .startOAuthFlow(
                  async url_0 => {
                    setOAuthStatus({
                      state: 'waiting_for_login',
                      url: url_0,
                    });
                    setTimeout(setShowPastePrompt, 3000, true);
                  },
                  {
                    loginWithClaudeAi: isOpenAIOAuth ? false : loginWithClaudeAi,
                    oauthProvider: isOpenAIOAuth ? 'openai' : 'anthropic',
                    openaiClientId: undefined,
                    inferenceOnly: mode === 'setup-token',
                    expiresIn: mode === 'setup-token' ? 365 * 24 * 60 * 60 : undefined,
                    orgUUID,
                  },
                )
                .catch(err_1 => {
                  const isTokenExchangeError = err_1.message.includes('Token exchange failed');
                  const sslHint_0 = getSSLErrorHint(err_1);
                  setOAuthStatus({
                    state: 'error',
                    message:
                      sslHint_0 ??
                      (isTokenExchangeError
                        ? 'Failed to exchange authorization code for access token. Please try again.'
                        : err_1.message),
                    toRetry: mode === 'setup-token' ? { state: 'ready_to_start' } : { state: 'idle' },
                  });
                  logEvent('tengu_oauth_token_exchange_error', {
                    error: err_1.message,
                    ssl_error: sslHint_0 !== null,
                  });
                  throw err_1;
                });

      if (mode === 'setup-token') {
        setOAuthStatus({
          state: 'success',
          token: result.accessToken,
        });
        return;
      }

      if (isCopilotOAuth) {
        const copilotAccessToken = result.accessToken ?? '';
        const copilotBaseURL = getGitHubCopilotBaseUrl(
          copilotAccessToken,
          typeof result.enterpriseDomain === 'string' ? result.enterpriseDomain : undefined,
        );
        const models = await enableAllGitHubCopilotModels(
          copilotAccessToken,
          typeof result.enterpriseDomain === 'string' ? result.enterpriseDomain : undefined,
        ).catch(() => [...GITHUB_COPILOT_MODEL_IDS]);
        persistCustomEndpoint({
          provider: 'openai-like',
          authMode: 'oauth',
          variant: 'github-copilot-oauth',
          providerId: 'github-copilot',
          baseURL: copilotBaseURL,
          apiKey: copilotAccessToken,
          models: models.join(' '),
          oauth: {
            accessToken: copilotAccessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
            enterpriseDomain:
              typeof result.enterpriseDomain === 'string' ? result.enterpriseDomain : undefined,
          },
        });
      } else if (isAntigravityOAuth) {
        persistCustomEndpoint({
          provider: 'gemini-like',
          authMode: 'gemini-cli-oauth',
          variant: 'gemini-antigravity-oauth',
          providerId: 'antigravity',
          baseURL: undefined,
          apiKey: undefined,
          models: [...ANTIGRAVITY_OFFICIAL_MODELS].join(' '),
          oauth: {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
            projectId: typeof result.projectId === 'string' ? result.projectId : undefined,
            email: typeof result.email === 'string' ? result.email : undefined,
          },
        });
      } else {
        await installOAuthTokens(
          result,
          isGeminiCliOAuth ? 'gemini' : isOpenAIOAuth ? 'openai' : 'anthropic',
        );
      }

      const updatedStorage = readCustomApiStorage();
      const updatedProvider = updatedStorage.providers?.find(p =>
        p.id === updatedStorage.activeProvider &&
        p.authMode === (updatedStorage.activeAuthMode ?? updatedStorage.authMode),
      ) ?? updatedStorage.providers?.find(p => p.id === updatedStorage.activeProvider) ?? updatedStorage.providers?.[0];
      if (updatedProvider) {
        const updatedProviderKey = {
          kind: updatedProvider.kind,
          id: updatedProvider.id,
          authMode: updatedProvider.authMode,
          baseURL: updatedProvider.baseURL,
          variant: updatedProvider.variant,
        };
        setSelectedProviderKey(updatedProviderKey);
        setSelectedProviderVariant(updatedProvider.variant);
        setCompatibleApiProvider(updatedProvider.kind);
        setCompatibleAuthMode(updatedProvider.authMode);
        setCustomBaseURL(updatedProvider.baseURL ?? '');
        setCustomApiKey(updatedProvider.apiKey ?? '');
        setCustomModels(getProviderModelsInput(updatedStorage.providers, updatedProviderKey));
      }
      if (!isOpenAIOAuth && !isGeminiCliOAuth && !isAntigravityOAuth && !isCopilotOAuth) {
        const orgResult = await validateForceLoginOrg();
        if (!orgResult.valid) {
          throw new Error('Forced login organization validation failed');
        }
      }
      setOAuthStatus({ state: 'success' });
      void sendNotification({
        message: isCopilotOAuth
          ? 'GitHub Copilot OAuth successful'
          : isAntigravityOAuth
            ? 'Antigravity OAuth successful'
            : isGeminiCliOAuth
              ? 'Gemini CLI OAuth successful'
              : isOpenAIOAuth
                ? 'OpenAI OAuth successful'
                : 'Claude Code login successful',
        notificationType: 'auth_success',
      }, terminal);
    } catch (err_0) {
      const errorMessage = (err_0 as Error).message;
      const sslHint = getSSLErrorHint(err_0);
      setOAuthStatus({
        state: 'error',
        message: sslHint ?? errorMessage,
        toRetry: {
          state: mode === 'setup-token' ? 'ready_to_start' : 'idle',
        },
      });
      logEvent('tengu_oauth_error', {
        error: errorMessage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ssl_error: sslHint !== null,
      });
    }
  }, [
    antigravityOAuthService,
    compatibleAuthMode,
    compatibleApiProvider,
    copilotEnterpriseDomain,
    githubCopilotOAuthService,
    geminiOAuthService,
    loginWithClaudeAi,
    mode,
    oauthService,
    orgUUID,
    persistCustomEndpoint,
    selectedProviderVariant,
    terminal,
  ]);
  const pendingOAuthStartRef = useRef(false);
  useEffect(() => {
    if (safeOauthStatus.state === 'ready_to_start' && !pendingOAuthStartRef.current) {
      pendingOAuthStartRef.current = true;
      process.nextTick((startOAuth_0: () => Promise<void>, pendingOAuthStartRef_0: React.MutableRefObject<boolean>) => {
        void startOAuth_0();
        pendingOAuthStartRef_0.current = false;
      }, startOAuth, pendingOAuthStartRef);
    }
  }, [safeOauthStatus.state, startOAuth]);

  useEffect(() => {
    if (mode === 'setup-token' && safeOauthStatus.state === 'success') {
      const timer_0 = setTimeout((loginWithClaudeAi_0, onDone_0) => {
        logEvent('tengu_oauth_success', {
          loginWithClaudeAi: loginWithClaudeAi_0,
        });
        onDone_0();
      }, 500, loginWithClaudeAi, onDone);
      return () => clearTimeout(timer_0);
    }
  }, [mode, safeOauthStatus, loginWithClaudeAi, onDone]);

  useEffect(() => {
    return () => {
      oauthService.cleanup();
      geminiOAuthService.cleanup();
      antigravityOAuthService.cleanup();
      githubCopilotOAuthService.cleanup();
    };
  }, [oauthService, geminiOAuthService, antigravityOAuthService, githubCopilotOAuthService]);

  return <Box flexDirection="column" gap={1}>
      {safeOauthStatus.state === 'waiting_for_login' && showPastePrompt && <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
          <Box paddingX={1}>
            <Text dimColor>
              Browser didn&apos;t open? Use the url below to sign in{' '}
            </Text>
            {urlCopied ? <Text color="success">(Copied!)</Text> : <Text dimColor>
                <KeyboardShortcutHint shortcut="c" action="copy" parens />
              </Text>}
          </Box>
          <Link url={safeOauthStatus.url}>
            <Text dimColor>{safeOauthStatus.url}</Text>
          </Link>
        </Box>}
      {mode === 'setup-token' && safeOauthStatus.state === 'success' && safeOauthStatus.token && <Box key="tokenOutput" flexDirection="column" gap={1} paddingTop={1}>
            <Text color="success">
              ✓ Long-lived authentication token created successfully!
            </Text>
            <Box flexDirection="column" gap={1}>
              <Text>Your OAuth token (valid for 1 year):</Text>
              <Text color="warning">{safeOauthStatus.token}</Text>
              <Text dimColor>
                Store this token securely. You won&apos;t be able to see it again.
              </Text>
              <Text dimColor>
                Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=&lt;token&gt;
              </Text>
            </Box>
          </Box>}
      <Box paddingLeft={1} flexDirection="column" gap={1}>
        <OAuthStatusMessage oauthStatus={safeOauthStatus} mode={mode} startingMessage={startingMessage} forcedMethodMessage={forcedMethodMessage} showPastePrompt={showPastePrompt} pastedCode={pastedCode} setPastedCode={setPastedCode} cursorOffset={cursorOffset} setCursorOffset={setCursorOffset} textInputColumns={textInputColumns} handleSubmitCode={handleSubmitCode} setOAuthStatus={setOAuthStatus} setLoginWithClaudeAi={setLoginWithClaudeAi} customBaseURL={customBaseURL} customApiKey={customApiKey} customModels={customModels} setCustomBaseURL={setCustomBaseURL} setCustomApiKey={setCustomApiKey} setCustomModels={setCustomModels} copilotEnterpriseDomain={copilotEnterpriseDomain} setCopilotEnterpriseDomain={setCopilotEnterpriseDomain} isCustomInputPasting={isCustomInputPasting} setIsCustomInputPasting={setIsCustomInputPasting} handleSubmitCustomConfig={handleSubmitCustomConfig} startCompatibleApiConfig={startCompatibleApiConfig} startOfficialProviderConfig={startOfficialProviderConfig} compatibleApiProvider={compatibleApiProvider} persistedProviders={persistedProviders} persistedActiveProviderKey={persistedActiveProviderKey} handleOpenProviderActions={handleOpenProviderActions} handleDeleteAccountRequest={handleDeleteAccountRequest} handleDeleteAccountConfirm={handleDeleteAccountConfirm} onDone={onDone} />
      </Box>
    </Box>;
}

type OAuthStatusMessageProps = {
  oauthStatus: OAuthStatus;
  mode: 'login' | 'setup-token';
  startingMessage: string | undefined;
  forcedMethodMessage: string | null;
  showPastePrompt: boolean;
  pastedCode: string;
  setPastedCode: (value: string) => void;
  cursorOffset: number;
  setCursorOffset: (offset: number) => void;
  textInputColumns: number;
  handleSubmitCode: (value: string, url: string) => void;
  setOAuthStatus: (status: OAuthStatus) => void;
  setLoginWithClaudeAi: (value: boolean) => void;
  customBaseURL: string;
  customApiKey: string;
  customModels: string;
  setCustomBaseURL: (value: string) => void;
  setCustomApiKey: (value: string) => void;
  setCustomModels: (value: string) => void;
  isCustomInputPasting: boolean;
  setIsCustomInputPasting: (value: boolean) => void;
  copilotEnterpriseDomain: string;
  setCopilotEnterpriseDomain: (value: string) => void;
  handleSubmitCustomConfig: (value: string) => Promise<void> | void;
  startCompatibleApiConfig: (provider: CompatibleApiProvider) => void;
  startOfficialProviderConfig: (variant: ProviderVariant) => void;
  compatibleApiProvider: CompatibleApiProvider;
  persistedProviders: ProviderConfig[];
  persistedActiveProviderKey: string | undefined;
  handleOpenProviderActions: (providerId: string) => void;
  handleDeleteAccountRequest: (providerId: string) => void;
  handleDeleteAccountConfirm: () => void;
  onDone: () => void;
};

function OAuthStatusMessage({
  oauthStatus,
  mode,
  startingMessage,
  forcedMethodMessage,
  showPastePrompt,
  pastedCode,
  setPastedCode,
  cursorOffset,
  setCursorOffset,
  textInputColumns,
  handleSubmitCode,
  setOAuthStatus,
  setLoginWithClaudeAi,
  customBaseURL,
  customApiKey,
  customModels,
  setCustomBaseURL,
  setCustomApiKey,
  setCustomModels,
  isCustomInputPasting,
  setIsCustomInputPasting,
  copilotEnterpriseDomain,
  setCopilotEnterpriseDomain,
  handleSubmitCustomConfig,
  startCompatibleApiConfig,
  startOfficialProviderConfig,
  compatibleApiProvider,
  persistedProviders,
  persistedActiveProviderKey,
  handleOpenProviderActions,
  handleDeleteAccountRequest,
  handleDeleteAccountConfirm,
  onDone,
}: OAuthStatusMessageProps) {
  void isCustomInputPasting;
  void compatibleApiProvider;

  switch (oauthStatus.state) {
    case 'manage_accounts': {
      const providers = persistedProviders ?? [];
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>

          <Text bold>Manage accounts</Text>
          <Text dimColor>Select a provider to manage it.</Text>
          <Select
            defaultValue={persistedActiveProviderKey}
            defaultFocusValue={persistedActiveProviderKey}
            options={[
              ...providers.map(provider => ({
                label: (
                  <Text>
                    <Text bold>{buildProviderDisplayName(provider)}</Text>
                    <Text dimColor>
                      {' '}
                      · {buildProviderTypeLabel(provider)} · {provider.models.length} model
                      {provider.models.length !== 1 ? 's' : ''}
                    </Text>
                  </Text>
                ),
                value: getProviderKeyFromConfig(provider),
              })),
              {
                label: <Text>Add new account →</Text>,
                value: '__add_new__' as const,
              },
              {
                label: <Text dimColor>Done →</Text>,
                value: '__done__' as const,
              },
            ]}
            onChange={value => {
              if (value === '__add_new__') {
                setOAuthStatus({ state: 'provider_select' });
                return;
              }
              if (value === '__done__') {
                onDone();
                return;
              }
              handleOpenProviderActions(value as string);
            }}
          />
        </Box>
      );
    }

    case 'provider_actions': {
      const provider = (persistedProviders ?? []).find(
        item =>
          getProviderKeyFromConfig(item) === oauthStatus.providerId || item.id === oauthStatus.providerId,
      );
      const accountName = provider ? buildProviderDisplayName(provider) : oauthStatus.providerId;
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>{accountName}</Text>
          <Text dimColor>Choose an action for this provider.</Text>
          <Select
            defaultValue="logout"
            defaultFocusValue="logout"
            options={[
              {
                label: <Text>Logout</Text>,
                value: 'logout',
              },
              {
                label: <Text dimColor>Back</Text>,
                value: 'back',
              },
            ]}
            onChange={value => {
              if (value === 'back') {
                setOAuthStatus({ state: 'manage_accounts' });
                return;
              }
              handleDeleteAccountRequest(oauthStatus.providerId);
            }}
            onCancel={() => setOAuthStatus({ state: 'manage_accounts' })}
          />
        </Box>
      );
    }

    case 'confirm_delete':
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold color="error">Remove account: {oauthStatus.accountName}?</Text>
          <Text>This will remove the saved provider configuration.</Text>
          <Select
            defaultValue="no"
            defaultFocusValue="no"
            options={[
              {
                label: <Text>Yes</Text>,
                value: 'yes',
              },
              {
                label: <Text>No</Text>,
                value: 'no',
              },
            ]}
            onChange={value => {
              if (value === 'yes') {
                handleDeleteAccountConfirm();
                return;
              }
              setOAuthStatus({ state: 'provider_actions', providerId: oauthStatus.providerId });
            }}
            onCancel={() => setOAuthStatus({ state: 'provider_actions', providerId: oauthStatus.providerId })}
          />
        </Box>
      );

    case 'provider_select':
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>Select provider</Text>
          <Text>Choose an official provider or configure a custom compatible endpoint.</Text>
          <Box>
            <Select
              options={[
                ...((persistedProviders?.length ?? 0) > 0 ? [{
                  label: <Text dimColor>← Back to accounts</Text>,
                  value: '__back__'
                }] : []),
                {
                  label: <Text>Claude <Text dimColor>Official Anthropic login</Text></Text>,
                  value: 'claude-official'
                },
                {
                  label: <Text>OpenAI → <Text dimColor>Official Responses API or OAuth</Text></Text>,
                  value: 'openai-group'
                },
                {
                  label: <Text>Google Gemini <Text dimColor>Google AI Studio API key</Text></Text>,
                  value: 'gemini-ai-studio'
                },
                {
                  label: <Text>Antigravity <Text dimColor>Official OAuth</Text></Text>,
                  value: 'gemini-antigravity-oauth'
                },
                {
                  label: <Text>GitHub Copilot OAuth <Text dimColor>Official OAuth</Text></Text>,
                  value: 'github-copilot-oauth'
                },
                {
                  label: <Text>Custom → <Text dimColor>Manual BaseURL</Text></Text>,
                  value: 'custom-group'
                }
              ]}
              onChange={value => {
                if (value === '__back__') {
                  setOAuthStatus({ state: 'manage_accounts' });
                  return;
                }
                if (value === 'openai-group') {
                  setOAuthStatus({ state: 'provider_variant_select', group: 'openai' });
                  return;
                }
                if (value === 'custom-group') {
                  setOAuthStatus({ state: 'provider_variant_select', group: 'custom' });
                  return;
                }
                startOfficialProviderConfig(value as ProviderVariant);
              }}
            />
          </Box>
        </Box>
      );

    case 'provider_variant_select': {
      const options = oauthStatus.group === 'openai'
        ? [
            {
              label: <Text>Official Responses API <Text dimColor>Preset api.openai.com</Text></Text>,
              value: 'openai-official-responses'
            },
            {
              label: <Text>OAuth <Text dimColor>Official browser login</Text></Text>,
              value: 'openai-oauth'
            },
            {
              label: <Text dimColor>← Back</Text>,
              value: '__back__'
            }
          ]
        : oauthStatus.group === 'gemini'
          ? [
              {
                label: <Text>Google AI Studio API key <Text dimColor>Preset generativelanguage.googleapis.com</Text></Text>,
                value: 'gemini-ai-studio'
              },
              {
                label: <Text dimColor>← Back</Text>,
                value: '__back__'
              }
            ]
          : [
              {
                label: <Text>Anthropic-Like</Text>,
                value: 'anthropic-like'
              },
              {
                label: <Text>OpenAI-Like</Text>,
                value: 'openai-like'
              },
              {
                label: <Text>Google-Vertex-Like</Text>,
                value: 'gemini-like'
              },
              {
                label: <Text dimColor>← Back</Text>,
                value: '__back__'
              }
            ];
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>
            {oauthStatus.group === 'openai'
              ? 'OpenAI'
              : oauthStatus.group === 'gemini'
                ? 'Google Gemini'
                : 'Custom'}
          </Text>
          <Box>
            <Select
              options={options}
              onChange={value => {
                if (value === '__back__') {
                  setOAuthStatus({ state: 'provider_select' });
                  return;
                }
                if (oauthStatus.group === 'custom') {
                  startCompatibleApiConfig(value as CompatibleApiProvider);
                  return;
                }
                startOfficialProviderConfig(value as ProviderVariant);
              }}
              onCancel={() => setOAuthStatus({ state: 'provider_select' })}
            />
          </Box>
        </Box>
      );
    }

    case 'custom_config': {
      const variant = oauthStatus.variant;
      const isOfficial = Boolean(variant && !variant.startsWith('custom-'));
      const isCopilotSetup = oauthStatus.step === 'copilotEnterprise';
      const providerLabel =
        variant === 'claude-official'
          ? 'Claude'
          : variant === 'openai-official-responses'
            ? 'OpenAI Official Responses API'
            : variant === 'openai-oauth'
              ? 'OpenAI OAuth'
              : variant === 'gemini-cli-oauth'
                ? 'Google Gemini CLI OAuth'
                : variant === 'gemini-ai-studio'
                  ? 'Google AI Studio'
                  : variant === 'gemini-antigravity-oauth'
                    ? 'Antigravity'
                    : variant === 'github-copilot-oauth'
                      ? 'GitHub Copilot OAuth'
                      : oauthStatus.provider === 'openai-like'
                        ? 'OpenAI-compatible API'
                        : oauthStatus.provider === 'gemini-like'
                          ? 'Google-Vertex-Like API'
                          : 'Anthropic-compatible API';

      if (oauthStatus.step === 'authMode') {
        return (
          <Box flexDirection="column" gap={1} marginTop={1}>
            <Text bold>{isOfficial ? 'Configure official provider' : 'Configure custom provider'}</Text>
            <Text>{providerLabel}</Text>
            <Text>Select auth mode:</Text>
            <Box>
              <Select
                options={oauthStatus.provider === 'openai-like'
                  ? [
                      {
                        label: <Text>chat/completions <Text dimColor>API key auth</Text></Text>,
                        value: 'chat-completions'
                      },
                      {
                        label: <Text>Responses API <Text dimColor>API key auth</Text></Text>,
                        value: 'responses'
                      }
                    ]
                  : [
                      {
                        label: <Text>API key <Text dimColor>Manual BaseURL + API key</Text></Text>,
                        value: oauthStatus.provider === 'gemini-like' ? 'vertex-compatible' : 'api-key'
                      }
                    ]}
                onChange={value => void handleSubmitCustomConfig(String(value))}
                onCancel={() => setOAuthStatus({ state: 'provider_variant_select', group: 'custom' })}
              />
            </Box>
          </Box>
        );
      }

      const routeSuffix = oauthStatus.provider === 'gemini-like'
        ? hasVersionPathSegment(customBaseURL)
          ? '/models/{model}:streamGenerateContent'
          : '/v1beta/models/{model}:streamGenerateContent'
        : oauthStatus.authMode === 'responses'
          ? '/v1/responses'
          : oauthStatus.provider === 'openai-like'
            ? '/v1/chat/completions'
            : '/v1/messages';
      const label = isCopilotSetup
        ? 'Enter GitHub Enterprise domain (optional):'
        : oauthStatus.step === 'baseURL'
          ? isOfficial
            ? variant === 'openai-official-responses'
              ? 'Using official OpenAI endpoint:'
              : variant === 'gemini-ai-studio'
                ? 'Using official Google AI Studio endpoint:'
                : 'Using preset endpoint:'
              : oauthStatus.provider === 'openai-like'
              ? oauthStatus.authMode === 'responses'
                ? 'Enter the OpenAI-compatible Responses base URL:'
                : 'Enter the OpenAI-compatible Chat Completions base URL:'
              : oauthStatus.provider === 'gemini-like'
                ? 'Enter the Google-Vertex-Like base URL:'
                : 'Enter the Anthropic-compatible Messages base URL:'
          : oauthStatus.step === 'apiKey'
            ? variant === 'gemini-ai-studio'
              ? 'Enter Google AI Studio API key:'
              : variant === 'openai-official-responses'
                ? 'Enter OpenAI API key:'
                : 'Enter API key:'
            : 'Enter one or more model names separated by spaces:';
      const value = isCopilotSetup
        ? copilotEnterpriseDomain
        : oauthStatus.step === 'baseURL'
          ? customBaseURL
          : oauthStatus.step === 'apiKey'
            ? customApiKey
            : customModels;
      const onChange = isCopilotSetup
        ? setCopilotEnterpriseDomain
        : oauthStatus.step === 'baseURL'
          ? setCustomBaseURL
          : oauthStatus.step === 'apiKey'
            ? setCustomApiKey
            : setCustomModels;
      const placeholder = isCopilotSetup
        ? 'github.com or ghe.example.com'
        : oauthStatus.step === 'baseURL'
          ? oauthStatus.provider === 'openai-like'
            ? 'http(s)://your-openai-compatible-endpoint.example.com'
            : oauthStatus.provider === 'gemini-like'
              ? 'https://generativelanguage.googleapis.com'
              : 'http(s)://your-anthropic-compatible-endpoint.example.com'
          : oauthStatus.step === 'apiKey'
            ? 'sk-...'
            : oauthStatus.provider === 'openai-like'
              ? 'gpt-5.4'
              : oauthStatus.provider === 'gemini-like'
                ? 'gemini-3-flash-preview gemini-3.1-pro-preview'
                : 'claude-sonnet-4-6';

      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>{isOfficial ? 'Configure official provider' : 'Configure custom provider'}</Text>
          <Text>{providerLabel}</Text>
          <Text>{label}</Text>
          <Box flexDirection="row">
            <TextInput
              value={value}
              onChange={onChange}
              onSubmit={value_0 => void handleSubmitCustomConfig(value_0)}
              onIsPastingChange={setIsCustomInputPasting}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              columns={oauthStatus.step === 'baseURL' ? Math.max(20, textInputColumns - 12) : textInputColumns}
              focus
              showCursor
              placeholder={placeholder}
              mask={oauthStatus.step === 'apiKey' ? '*' : undefined}
              dimColor={(oauthStatus.step === 'models' || isCopilotSetup) && value.length === 0}
              cancelOnEscape
              onCancel={() => {
                if (isCopilotSetup) {
                  setOAuthStatus({ state: 'provider_select' });
                  return;
                }
                if (oauthStatus.step === 'models') {
                  setOAuthStatus({
                    state: 'custom_config',
                    provider: oauthStatus.provider,
                    authMode: oauthStatus.authMode,
                    step:
                      oauthStatus.variant === 'openai-official-responses' || oauthStatus.variant === 'gemini-ai-studio'
                        ? 'apiKey'
                        : 'baseURL',
                    variant: oauthStatus.variant,
                  });
                  return;
                }
                if (oauthStatus.step === 'apiKey') {
                  if (oauthStatus.variant === 'gemini-ai-studio') {
                    setOAuthStatus({ state: 'provider_select' });
                    return;
                  }
                  if (oauthStatus.variant === 'openai-official-responses') {
                    setOAuthStatus({
                      state: 'provider_variant_select',
                      group: 'openai',
                    });
                    return;
                  }
                  setOAuthStatus({
                    state: 'custom_config',
                    provider: oauthStatus.provider,
                    authMode: oauthStatus.authMode,
                    step: 'baseURL',
                    variant: oauthStatus.variant,
                  });
                  return;
                }
                if (oauthStatus.step === 'baseURL') {
                  setOAuthStatus({ state: 'provider_variant_select', group: oauthStatus.variant ? getSelectionGroupForVariant(oauthStatus.variant) ?? 'custom' : 'custom' });
                  return;
                }
                setOAuthStatus({ state: 'provider_select' });
              }}
            />
            {oauthStatus.step === 'baseURL' && !isOfficial && !isCopilotSetup ? <Text dimColor>{routeSuffix}</Text> : null}
          </Box>
          <Text dimColor>
            {oauthStatus.step === 'baseURL' && oauthStatus.provider === 'gemini-like'
              ? hasVersionPathSegment(value)
                ? 'Base URL already includes a version segment. Press Enter to save and continue.'
                : 'If omitted, /v1beta is added automatically — do not enter it twice. Press Enter to save and continue.'
              : oauthStatus.step === 'baseURL' && !isOfficial
                ? `Base URL only; ${routeSuffix} is appended automatically. Press Enter to save and continue.`
              : oauthStatus.step === 'models'
                ? 'Press Enter to save the models.'
                : isCopilotSetup
                  ? 'Leave blank for github.com. Press Enter to continue.'
                  : oauthStatus.step === 'apiKey'
                    ? 'Press Enter to continue.'
                    : 'Press Enter to save and continue.'}
          </Text>
        </Box>
      );
    }

    case 'idle': {
      const message = startingMessage ?? 'Claude Code can use your Claude subscription or API billing through your Console account.';

      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>{message}</Text>
          <Text>Select login method:</Text>
          <Box>
            <Select
              options={[
                {
                  label: (
                    <Text>
                      Claude account with subscription · <Text dimColor>Pro, Max, Team, or Enterprise</Text>
                    </Text>
                  ),
                  value: 'claudeai'
                },
                {
                  label: (
                    <Text>
                      Anthropic Console account · <Text dimColor>API usage billing</Text>
                    </Text>
                  ),
                  value: 'console'
                },
                {
                  label: (
                    <Text>
                      3rd-party platform · <Text dimColor>Amazon Bedrock, Microsoft Foundry, or Vertex AI</Text>
                    </Text>
                  ),
                  value: 'platform'
                }
              ]}
              onChange={value => {
                if (value === 'platform') {
                  logEvent('tengu_oauth_platform_selected', {});
                  setOAuthStatus({
                    state: 'platform_setup'
                  });
                  return;
                }

                setOAuthStatus({
                  state: 'ready_to_start'
                });
                if (value === 'claudeai') {
                  logEvent('tengu_oauth_claudeai_selected', {});
                  setLoginWithClaudeAi(true);
                } else {
                  logEvent('tengu_oauth_console_selected', {});
                  setLoginWithClaudeAi(false);
                }
              }}
            />
          </Box>
        </Box>
      );
    }

    case 'platform_setup':
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>Using 3rd-party platforms</Text>
          <Box flexDirection="column" gap={1}>
            <Text>
              Claude Code supports Amazon Bedrock, Microsoft Foundry, and Vertex AI. Set the required environment variables, then restart Claude Code.
            </Text>
            <Text>If you are part of an enterprise organization, contact your administrator for setup instructions.</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Documentation:</Text>
              <Text>
                · Amazon Bedrock:{' '}
                <Link url="https://code.claude.com/docs/en/amazon-bedrock">https://code.claude.com/docs/en/amazon-bedrock</Link>
              </Text>
              <Text>
                · Microsoft Foundry:{' '}
                <Link url="https://code.claude.com/docs/en/microsoft-foundry">https://code.claude.com/docs/en/microsoft-foundry</Link>
              </Text>
              <Text>
                · Vertex AI:{' '}
                <Link url="https://code.claude.com/docs/en/google-vertex-ai">https://code.claude.com/docs/en/google-vertex-ai</Link>
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>
                Press <Text bold>Enter</Text> to go back to login options.
              </Text>
            </Box>
          </Box>
        </Box>
      );

    case 'waiting_for_login':
      return (
        <Box flexDirection="column" gap={1}>
          {forcedMethodMessage ? (
            <Box>
              <Text dimColor>{forcedMethodMessage}</Text>
            </Box>
          ) : null}
          {!showPastePrompt ? (
            <Box>
              <Spinner />
              <Text>Opening browser to sign in…</Text>
            </Box>
          ) : null}
          {oauthStatus.instructions ? <Text color="warning">{oauthStatus.instructions}</Text> : null}
          {showPastePrompt && !oauthStatus.instructions ? (
            <>
              <Box>
                <Text>{PASTE_HERE_MSG}</Text>
                <TextInput
                  value={pastedCode}
                  onChange={setPastedCode}
                  onSubmit={value => handleSubmitCode(value, oauthStatus.url)}
                  cursorOffset={cursorOffset}
                  onChangeCursorOffset={setCursorOffset}
                  columns={textInputColumns}
                  mask="*"
                  cancelOnEscape
                  onCancel={() => setOAuthStatus({ state: 'ready_to_start' })}
                />
              </Box>
              <Text dimColor>
                Paste the full link from the browser exactly as-is — usually the localhost callback URL — even if the page cannot be reached.
              </Text>
            </>
          ) : null}
        </Box>
      );

    case 'creating_api_key':
      return (
        <Box flexDirection="column" gap={1}>
          <Box>
            <Spinner />
            <Text>Creating API key for Claude Code…</Text>
          </Box>
        </Box>
      );

    case 'about_to_retry':
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="permission">Retrying…</Text>
        </Box>
      );

    case 'success':
      return (
        <Box flexDirection="column">
          {mode === 'setup-token' && oauthStatus.token ? null : (
            <>
              {getOauthAccountInfo()?.emailAddress ? (
                <Text dimColor>
                  Logged in as <Text>{getOauthAccountInfo()?.emailAddress}</Text>
                </Text>
              ) : null}
              <Text color="success">
                Login successful. Press <Text bold>Enter</Text> to continue…
              </Text>
            </>
          )}
        </Box>
      );

    case 'error':
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="error">OAuth error: {oauthStatus.message}</Text>
          {oauthStatus.toRetry ? (
            <Box marginTop={1}>
              <Text color="permission">
                Press <Text bold>Enter</Text> to retry.
              </Text>
            </Box>
          ) : null}
        </Box>
      );

    default:
      return null;
  }
}
