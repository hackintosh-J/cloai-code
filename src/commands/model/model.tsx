import { c as _c } from "react/compiler-runtime";
import chalk from 'chalk';
import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { ModelPicker } from '../../components/ModelPicker.js';
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../../services/analytics/index.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import type { Message } from '../../types/message.js';
import { isBilledAsExtraUsage } from '../../utils/extraUsage.js';
import { clearFastModeCooldown, isFastModeAvailable, isFastModeEnabled, isFastModeSupportedByModel } from '../../utils/fastMode.js';
import { MODEL_ALIASES } from '../../utils/model/aliases.js';
import { checkOpus1mAccess, checkSonnet1mAccess } from '../../utils/model/check1mAccess.js';
import {
  getProviderKeyFromConfig,
  readCustomApiStorage,
  writeCustomApiStorage,
  type ProviderAuthMode,
  type ProviderConfig,
} from '../../utils/customApiStorage.js';
import {
  type ReasoningSelection,
  getReasoningMode,
} from '../../utils/modelReasoning.js';
import { getDefaultMainLoopModelSetting, isOpus1mMergeEnabled, renderDefaultModelSetting } from '../../utils/model/model.js';
import { isModelAllowed } from '../../utils/model/modelAllowlist.js';
import { stripSignatureBlocks } from '../../utils/messages.js';
import { saveSessionModel } from '../../utils/sessionStorage.js';

function extractAccountName(baseURL: string | undefined, providerId: string): string {
  if (providerId === 'anthropic-like') {
    return baseURL ? tryExtractHost(baseURL) : 'Anthropic';
  }
  if (!baseURL) return providerId === 'gemini-like' ? 'Gemini-compatible' : 'OpenAI-compatible';
  return tryExtractHost(baseURL);
}

function tryExtractHost(url: string): string {
  try {
    const u = new URL(url);
    let host = u.hostname
      .replace(/^api[.-]/, '')
      .replace(/^openai[.-]/, '')
      .replace(/^claude[.-]/, '');
    if (host.includes('.')) {
      const parts = host.split('.');
      host = parts[0];
    }
    return host || url;
  } catch {
    return url;
  }
}

type ConfiguredModelOption = {
  value: string;
  label: string;
  description: string;
  model: string;
  providerId: string;
  providerKind: 'anthropic-like' | 'openai-like' | 'gemini-like';
  authMode: ProviderAuthMode;
  reasoning?: ProviderConfig['reasoning'];
  isCurrent?: boolean;
};

function makeConfiguredOptionValue(
  providerKind: 'anthropic-like' | 'openai-like' | 'gemini-like',
  providerId: string,
  baseURL: string | undefined,
  authMode: ProviderAuthMode,
  model: string,
): string {
  return `${providerKind}::${providerId}::${baseURL ?? ''}::${authMode}::${model}`;
}

function getConfiguredModelOptions(
  currentSessionModel: string | null,
): ConfiguredModelOption[] {
  const storage = readCustomApiStorage();
  const activeProviderId = storage.activeProvider ?? storage.providerId;
  const providers = storage.providers ?? [];
  return providers.flatMap(provider => {
    const providerLabel = provider.variant === 'gemini-ai-studio'
      ? 'Google AI Studio'
      : provider.variant === 'gemini-antigravity-oauth'
        ? 'Antigravity'
        : provider.kind === 'openai-like'
          ? 'OpenAI-compatible'
          : provider.kind === 'gemini-like'
            ? 'Gemini-compatible'
            : 'Anthropic-compatible';
    const authLabel = provider.variant === 'gemini-ai-studio'
      ? 'API key'
      : provider.variant === 'gemini-antigravity-oauth'
        ? 'OAuth'
        : provider.authMode === 'api-key'
          ? 'API key'
          : provider.authMode === 'chat-completions'
            ? 'chat-completions'
            : provider.authMode === 'responses'
              ? 'responses'
              : provider.authMode === 'oauth'
                ? 'OAuth'
                : provider.authMode === 'vertex-compatible'
                  ? 'Vertex-compatible'
                  : provider.authMode === 'gemini-cli-oauth'
                    ? 'Gemini CLI OAuth'
                    : provider.kind === 'openai-like'
                      ? 'chat-completions'
                      : provider.kind === 'gemini-like'
                        ? 'Vertex-compatible'
                        : 'API key';
    const accountName = provider.id || extractAccountName(provider.baseURL, provider.kind);
    return provider.models.map(model => ({
      value: makeConfiguredOptionValue(provider.kind, provider.id, provider.baseURL, provider.authMode, model),
      label: `${model} (${accountName})`,
      description: `${providerLabel} · ${authLabel}`,
      model,
      providerId: provider.id,
      providerKind: provider.kind,
      authMode: provider.authMode,
      reasoning: provider.reasoning,
      isCurrent:
        currentSessionModel !== null
          ? model === currentSessionModel
          : (
              provider.kind === storage.providerKind &&
              provider.id === activeProviderId &&
              (provider.baseURL ?? undefined) === (storage.baseURL ?? undefined) &&
              provider.authMode === (storage.activeAuthMode ?? storage.authMode) &&
              model === storage.activeModel
            ),
    }));
  });
}

function findConfiguredValueForSessionModel(
  options: ConfiguredModelOption[],
  model: string | null,
): string | null {
  if (model === null) {
    return null
  }
  return (
    options.find(option => option.model === model)?.value ??
    null
  )
}

function parseConfiguredOptionValue(value: string): {
  providerKind: 'anthropic-like' | 'openai-like' | 'gemini-like';
  providerId: string;
  baseURL: string | undefined;
  authMode: ProviderAuthMode;
  model: string;
} | null {
  const first = value.indexOf('::');
  const second = value.indexOf('::', first + 2);
  const third = value.indexOf('::', second + 2);
  const fourth = value.indexOf('::', third + 2);
  if (first === -1 || second === -1 || third === -1 || fourth === -1) return null;
  const providerKind = value.slice(0, first);
  if (
    providerKind !== 'anthropic-like' &&
    providerKind !== 'openai-like' &&
    providerKind !== 'gemini-like'
  ) return null;
  const providerId = value.slice(first + 2, second);
  if (!providerId) return null;
  const baseURL = value.slice(second + 2, third) || undefined;
  const authMode = value.slice(third + 2, fourth);
  if (
    authMode !== 'api-key' &&
    authMode !== 'chat-completions' &&
    authMode !== 'responses' &&
    authMode !== 'oauth' &&
    authMode !== 'vertex-compatible' &&
    authMode !== 'gemini-cli-oauth'
  ) return null;
  const model = value.slice(fourth + 2);
  if (!model) return null;
  return { providerKind, providerId, baseURL, authMode, model };
}

function persistSelectedConfiguredModel(
  value: string | null,
  reasoning?: ReasoningSelection,
): string | null {
  if (!value) {
    return value;
  }
  const parsed = parseConfiguredOptionValue(value);
  if (!parsed) {
    return value;
  }
  const storage = readCustomApiStorage();
  const providers = storage.providers ?? [];
  const providerIndex = providers.findIndex(provider =>
    provider.kind === parsed.providerKind &&
    provider.id === parsed.providerId &&
    (provider.baseURL ?? undefined) === parsed.baseURL &&
    provider.authMode === parsed.authMode &&
    provider.models.includes(parsed.model),
  );
  const providerForModel = providerIndex >= 0 ? providers[providerIndex] : undefined;
  if (!providerForModel) {
    return parsed.model;
  }

  const nextProviders = [...providers];
  if (
    reasoning?.mode === 'openai-chat-completions' ||
    reasoning?.mode === 'openai-responses' ||
    reasoning?.mode === 'openai-codex-oauth'
  ) {
    nextProviders[providerIndex] = {
      ...providerForModel,
      reasoning: {
        ...providerForModel.reasoning,
        reasoningEffort: reasoning.effort,
        ...(reasoning.mode === 'openai-chat-completions'
          ? {}
          : { reasoningSummary: reasoning.summary }),
      },
    };
  }

  writeCustomApiStorage({
    ...storage,
    providers: nextProviders,
    activeProviderKey: getProviderKeyFromConfig(providerForModel),
    activeProvider: providerForModel.id,
    activeModel: parsed.model,
    activeAuthMode: providerForModel.authMode,
    provider:
      providerForModel.kind === 'openai-like'
        ? 'openai'
        : providerForModel.kind === 'gemini-like'
          ? 'gemini'
          : 'anthropic',
    providerKind: providerForModel.kind,
    providerId: providerForModel.id,
    authMode: providerForModel.authMode,
    baseURL: providerForModel.baseURL,
    apiKey: providerForModel.apiKey,
    model: parsed.model,
    savedModels: providerForModel.models,
  });
  if (
    providerForModel.kind === 'gemini-like' &&
    providerForModel.authMode === 'gemini-cli-oauth'
  ) {
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.CLOAI_API_KEY;
  } else {
    process.env.ANTHROPIC_BASE_URL = providerForModel.baseURL ?? '';
    process.env.CLOAI_API_KEY = providerForModel.apiKey ?? '';
  }
  process.env.ANTHROPIC_MODEL = parsed.model;
  return parsed.model;
}

function formatReasoningMessage(model: string | null, reasoning: ReasoningSelection | undefined): string {
  let message = `Set model to ${chalk.bold(renderModelLabel(model))}`;
  if (!reasoning) return message;
  if (reasoning.mode === 'anthropic-effort') {
    return `${message} with ${chalk.bold(reasoning.effort)} effort`;
  }
  if (
    reasoning.mode === 'openai-chat-completions' ||
    reasoning.mode === 'openai-responses' ||
    reasoning.mode === 'openai-codex-oauth'
  ) {
    return `${message} with ${chalk.bold(reasoning.effort)} reasoning`;
  }
  return message;
}

function filterMessagesAfterModelSwitch(prev: Message[]): Message[] {
  return stripSignatureBlocks(prev)
}

function ModelPickerWrapper({
  onDone,
  setMessages,
}: {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  setMessages: (updater: (prev: Message[]) => Message[]) => void
}): React.ReactNode {
  const mainLoopModel = useAppState(s => s.mainLoopModel);
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession);
  const isFastMode = useAppState(s => s.fastMode);
  const setAppState = useSetAppState();
  const configuredOptions = getConfiguredModelOptions(mainLoopModel);
  const currentConfiguredValue =
    findConfiguredValueForSessionModel(
      configuredOptions,
      mainLoopModel,
    ) ??
    configuredOptions.find(option => option.isCurrent)?.value ??
    mainLoopModel;

  function handleCancel(): void {
    logEvent('tengu_model_command_menu', {
      action: 'cancel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    const displayModel = renderModelLabel(mainLoopModel);
    onDone(`Kept model as ${chalk.bold(displayModel)}`, {
      display: 'system',
    });
  }

  function handleSelect(model: string | null, reasoning: ReasoningSelection | undefined): void {
    const persistedModel = persistSelectedConfiguredModel(model, reasoning);
    const selectedModel = persistedModel ?? model;
    logEvent('tengu_model_command_menu', {
      action: selectedModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      from_model:
        mainLoopModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      to_model: selectedModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    setAppState(prev => ({
      ...prev,
      mainLoopModel: selectedModel,
      mainLoopModelForSession: null,
    }));
    saveSessionModel(selectedModel);
    setMessages(filterMessagesAfterModelSwitch);
    let message = formatReasoningMessage(selectedModel, reasoning);

    let wasFastModeToggledOn = undefined;
    if (isFastModeEnabled()) {
      clearFastModeCooldown();
      if (!isFastModeSupportedByModel(selectedModel) && isFastMode) {
        setAppState(prev => ({
          ...prev,
          fastMode: false,
        }));
        wasFastModeToggledOn = false;
      } else if (
        isFastModeSupportedByModel(selectedModel) &&
        isFastModeAvailable() &&
        isFastMode
      ) {
        message += ' · Fast mode ON';
        wasFastModeToggledOn = true;
      }
    }

    if (
      isBilledAsExtraUsage(
        selectedModel,
        wasFastModeToggledOn === true,
        isOpus1mMergeEnabled(),
      )
    ) {
      message += ' · Billed as extra usage';
    }
    if (wasFastModeToggledOn === false) {
      message += ' · Fast mode OFF';
    }
    onDone(message);
  }

  const showFastModeNotice =
    isFastModeEnabled() &&
    isFastMode &&
    isFastModeSupportedByModel(mainLoopModel) &&
    isFastModeAvailable();

  return (
    <ModelPicker
      initial={currentConfiguredValue}
      sessionModel={mainLoopModelForSession}
      onSelect={handleSelect}
      onCancel={handleCancel}
      isStandaloneCommand={true}
      showFastModeNotice={showFastModeNotice}
      headerText={
        configuredOptions.length > 0
          ? 'Switch between all configured models. Selecting one also switches the active provider for this session and future Cloai sessions.'
          : undefined
      }
      customOptions={configuredOptions.length > 0 ? configuredOptions : undefined}
      skipSettingsWrite={false}
    />
  );
}

function SetModelAndClose({
  args,
  onDone,
  setMessages,
}: {
  args: string;
  onDone: (result?: string, options?: {
    display?: CommandResultDisplay;
  }) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
}): React.ReactNode {
  const isFastMode = useAppState(s => s.fastMode);
  const setAppState = useSetAppState();
  const model = args === 'default' ? null : args;
  React.useEffect(() => {
    async function handleModelChange(): Promise<void> {
      if (model && !isModelAllowed(model)) {
        onDone(`Model '${model}' is not available. Your organization restricts model selection.`, {
          display: 'system'
        });
        return;
      }

      if (model && isOpus1mUnavailable(model)) {
        onDone(`Opus 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m`, {
          display: 'system'
        });
        return;
      }
      if (model && isSonnet1mUnavailable(model)) {
        onDone(`Sonnet 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m`, {
          display: 'system'
        });
        return;
      }

      if (!model) {
        setModel(null);
        return;
      }

      if (isKnownAlias(model)) {
        setModel(model);
        return;
      }

      try {
        const {
          valid,
          error: error_0
        } = await validateModel(model);
        if (valid) {
          setModel(model);
        } else {
          onDone(error_0 || `Model '${model}' not found`, {
            display: 'system'
          });
        }
      } catch (error) {
        onDone(`Failed to validate model: ${(error as Error).message}`, {
          display: 'system'
        });
      }
    }
    function setModel(modelValue: string | null): void {
      persistSelectedConfiguredModel(modelValue);
      setAppState(prev => ({
        ...prev,
        mainLoopModel: modelValue,
        mainLoopModelForSession: null
      }));
      saveSessionModel(modelValue);
      setMessages(filterMessagesAfterModelSwitch);
      let message = `Set model to ${chalk.bold(renderModelLabel(modelValue))}`;
      let wasFastModeToggledOn = undefined;
      if (isFastModeEnabled()) {
        clearFastModeCooldown();
        if (!isFastModeSupportedByModel(modelValue) && isFastMode) {
          setAppState(prev_0 => ({
            ...prev_0,
            fastMode: false
          }));
          wasFastModeToggledOn = false;
        } else if (isFastModeSupportedByModel(modelValue) && isFastMode) {
          message += ` · Fast mode ON`;
          wasFastModeToggledOn = true;
        }
      }
      if (isBilledAsExtraUsage(modelValue, wasFastModeToggledOn === true, isOpus1mMergeEnabled())) {
        message += ` · Billed as extra usage`;
      }
      if (wasFastModeToggledOn === false) {
        message += ` · Fast mode OFF`;
      }
      onDone(message);
    }
    void handleModelChange();
  }, [model, onDone, setAppState, setMessages]);
  return null;
}


function isKnownAlias(model: string): boolean {
  return (MODEL_ALIASES as readonly string[]).includes(model.toLowerCase().trim());
}

function isOpus1mUnavailable(model: string): boolean {
  const m = model.toLowerCase();
  return !checkOpus1mAccess() && !isOpus1mMergeEnabled() && m.includes('opus') && m.includes('[1m]');
}

function isSonnet1mUnavailable(model: string): boolean {
  const m = model.toLowerCase();
  return !checkSonnet1mAccess() && (m.includes('sonnet[1m]') || m.includes('sonnet-4-6[1m]'));
}

function ShowModelAndClose({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const mainLoopModel = useAppState(s => s.mainLoopModel);
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession);
  const effortValue = useAppState(s => s.effortValue);
  const displayModel = renderModelLabel(mainLoopModel);
  const effortInfo = effortValue !== undefined ? ` (effort: ${effortValue})` : '';

  if (mainLoopModelForSession) {
    onDone(
      `Current model: ${chalk.bold(renderModelLabel(mainLoopModelForSession))} (session override from plan mode)
Base model: ${displayModel}${effortInfo}`,
    );
  } else {
    onDone(`Current model: ${displayModel}${effortInfo}`);
  }
  return null;
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  args = args?.trim() || '';
  if (COMMON_INFO_ARGS.includes(args)) {
    logEvent('tengu_model_command_inline_help', {
      args: args as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    return <ShowModelAndClose onDone={onDone} />;
  }
  if (COMMON_HELP_ARGS.includes(args)) {
    onDone('Run /model to open the model selection menu, or /model [modelName] to set the model.', {
      display: 'system',
    });
    return;
  }
  if (args) {
    logEvent('tengu_model_command_inline', {
      args: args as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    return <SetModelAndClose args={args} onDone={onDone} setMessages={context.setMessages} />;
  }
  return <ModelPickerWrapper onDone={onDone} setMessages={context.setMessages} />;
};

function renderModelLabel(model: string | null): string {
  const persistedCustomModel = readCustomApiStorage().model?.trim();
  if (model === null && persistedCustomModel) {
    return persistedCustomModel;
  }
  const rendered = renderDefaultModelSetting(model ?? getDefaultMainLoopModelSetting());
  return model === null ? `${rendered} (default)` : rendered;
}
