import React, { useState } from 'react';
import { X, ChevronRight, Check } from 'lucide-react';
import { createProvider, Provider, ProviderModel, startOpenAIOAuthProvider } from '@/src/services';

type ProviderSelectionGroup = 'openai' | 'gemini' | 'custom';

type ProviderRootOption =
  | 'claude-official'
  | 'openai-group'
  | 'gemini-ai-studio'
  | 'gemini-antigravity-oauth'
  | 'github-copilot-oauth'
  | 'custom-group';

type ProviderVariant =
  | 'claude-official'
  | 'openai-official-responses'
  | 'openai-oauth'
  | 'gemini-cli-oauth'
  | 'gemini-antigravity-oauth'
  | 'gemini-ai-studio'
  | 'github-copilot-oauth'
  | 'custom-anthropic-like'
  | 'custom-openai-chat'
  | 'custom-openai-responses'
  | 'custom-google-vertex-like';

type CompatibleApiProvider = 'anthropic-like' | 'openai-like' | 'gemini-like';
type CompatibleAuthMode = 'api-key' | 'chat-completions' | 'responses' | 'oauth' | 'vertex-compatible' | 'gemini-cli-oauth';
type CustomConfigStep = 'authMode' | 'baseURL' | 'apiKey' | 'models' | 'copilotEnterprise';

type DialogState =
  | { state: 'provider_select' }
  | { state: 'provider_variant_select'; group: ProviderSelectionGroup }
  | {
      state: 'custom_config';
      provider: CompatibleApiProvider;
      authMode: CompatibleAuthMode;
      step: CustomConfigStep;
      variant?: ProviderVariant;
    }
  | { state: 'oauth_flow'; variant: ProviderVariant }
  | { state: 'success'; provider: Provider }
  | { state: 'error'; message: string };

interface Props {
  onClose: () => void;
  onSuccess: (provider: Provider) => void;
}

const ProviderAddDialog: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [dialogState, setDialogState] = useState<DialogState>({ state: 'provider_select' });
  const [customBaseURL, setCustomBaseURL] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModels, setCustomModels] = useState('');
  const [copilotEnterpriseDomain, setCopilotEnterpriseDomain] = useState('');
  const [oauthStatusMessage, setOauthStatusMessage] = useState('');
  const [oauthBusy, setOauthBusy] = useState(false);

  const getDefaultAuthMode = (provider: CompatibleApiProvider): CompatibleAuthMode => {
    return provider === 'openai-like'
      ? 'chat-completions'
      : provider === 'gemini-like'
        ? 'vertex-compatible'
        : 'api-key';
  };

  const getCustomVariant = (provider: CompatibleApiProvider, authMode: CompatibleAuthMode): ProviderVariant => {
    if (provider === 'anthropic-like') return 'custom-anthropic-like';
    if (provider === 'gemini-like') return 'custom-google-vertex-like';
    return authMode === 'responses' ? 'custom-openai-responses' : 'custom-openai-chat';
  };

  const getProviderIdForVariant = (variant: ProviderVariant | undefined, provider: CompatibleApiProvider, baseURL?: string): string => {
    switch (variant) {
      case 'claude-official': return 'anthropic';
      case 'openai-official-responses':
      case 'openai-oauth': return 'openai';
      case 'gemini-cli-oauth': return 'gemini';
      case 'gemini-ai-studio': return 'gemini-ai-studio';
      case 'gemini-antigravity-oauth': return 'antigravity';
      case 'github-copilot-oauth': return 'github-copilot';
      default: return deriveProviderId(baseURL, provider);
    }
  };

  const deriveProviderId = (baseURL: string | undefined, kind: CompatibleApiProvider): string => {
    if (!baseURL) {
      return kind === 'openai-like' ? 'openai' : kind === 'gemini-like' ? 'gemini' : 'anthropic';
    }
    try {
      const url = new URL(baseURL);
      let host = url.hostname
        .replace(/^api[.-]/, '')
        .replace(/^openai[.-]/, '')
        .replace(/^claude[.-]/, '')
        .replace(/^www\./, '');
      const parts = host.split('.').filter(Boolean);
      return parts[0]?.toLowerCase() || (kind === 'openai-like' ? 'openai' : kind === 'gemini-like' ? 'gemini' : 'anthropic');
    } catch {
      return (baseURL.replace(/^https?:\/\//, '').replace(/[:/].*$/, '').split('.')[0] || 'custom').toLowerCase();
    }
  };

  const startOfficialProviderConfig = (variant: ProviderVariant) => {
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

    const presetBaseURL = variant === 'openai-official-responses' ? 'https://api.openai.com' : variant === 'gemini-ai-studio' ? 'https://generativelanguage.googleapis.com' : undefined;

    setCustomBaseURL(presetBaseURL || '');
    setCustomApiKey('');
    setCustomModels('');

    if (variant === 'claude-official' || variant === 'openai-oauth' || variant === 'gemini-cli-oauth' || variant === 'gemini-antigravity-oauth') {
      setDialogState({ state: 'oauth_flow', variant });
      return;
    }

    if (variant === 'github-copilot-oauth') {
      setDialogState({ state: 'custom_config', provider, authMode, step: 'copilotEnterprise', variant });
      return;
    }

    setDialogState({ state: 'custom_config', provider, authMode, step: 'apiKey', variant });
  };

  const startCompatibleApiConfig = (provider: CompatibleApiProvider) => {
    const authMode = getDefaultAuthMode(provider);
    const variant = getCustomVariant(provider, authMode);

    setCustomBaseURL('');
    setCustomApiKey('');
    setCustomModels('');

    setDialogState({
      state: 'custom_config',
      provider,
      authMode,
      step: provider === 'openai-like' ? 'authMode' : 'baseURL',
      variant,
    });
  };

  const handleSubmitCustomConfig = async (value: string) => {
    if (dialogState.state !== 'custom_config') return;

    const { provider, authMode, step, variant } = dialogState;

    if (step === 'authMode') {
      const nextAuthMode = value as CompatibleAuthMode;
      const nextVariant = getCustomVariant(provider, nextAuthMode);
      setDialogState({
        state: 'custom_config',
        provider,
        authMode: nextAuthMode,
        step: 'baseURL',
        variant: nextVariant,
      });
      return;
    }

    if (step === 'baseURL') {
      const trimmed = value.trim();
      if (!trimmed) {
        setDialogState({ state: 'error', message: 'Base URL is required' });
        return;
      }
      setCustomBaseURL(trimmed);
      setDialogState({ state: 'custom_config', provider, authMode, step: 'apiKey', variant });
      return;
    }

    if (step === 'apiKey') {
      const trimmed = value.trim();
      if (!trimmed) {
        setDialogState({ state: 'error', message: 'API key is required' });
        return;
      }
      setCustomApiKey(trimmed);
      setDialogState({ state: 'custom_config', provider, authMode, step: 'models', variant });
      return;
    }

    if (step === 'models') {
      const models = value.trim().split(/\s+/).filter(Boolean);
      if (models.length === 0) {
        setDialogState({ state: 'error', message: 'At least one model is required' });
        return;
      }
      setCustomModels(value.trim());

      // Create provider
      try {
        const providerId = getProviderIdForVariant(variant, provider, customBaseURL);
        const created = await createProvider({
          id: providerId,
          name: extractProviderName(customBaseURL, providerId),
          baseUrl: customBaseURL,
          apiKey: customApiKey,
          format: provider === 'anthropic-like' ? 'anthropic' : 'openai',
          kind: provider,
          authMode,
          variant,
          models: models.map(id => ({ id, name: id, enabled: true })),
          enabled: true,
        });
        setDialogState({ state: 'success', provider: created });
        onSuccess(created);
      } catch (err: any) {
        setDialogState({ state: 'error', message: err.message || 'Failed to create provider' });
      }
      return;
    }
  };

  const handleStartOAuthFlow = async (variant: ProviderVariant) => {
    if (oauthBusy) return;
    if (variant !== 'openai-oauth') {
      setDialogState({ state: 'error', message: '该 OAuth 流程还未接入桌面重构版。' });
      return;
    }

    setOauthBusy(true);
    setOauthStatusMessage('正在启动 OpenAI OAuth 授权...');
    try {
      const result = await startOpenAIOAuthProvider();
      setOauthStatusMessage('浏览器授权已完成，正在写入 provider 配置...');
      setDialogState({ state: 'success', provider: result.provider });
      onSuccess(result.provider);
    } catch (err: any) {
      setDialogState({ state: 'error', message: err?.message || 'OAuth 登录失败' });
    } finally {
      setOauthBusy(false);
    }
  };

  const extractProviderName = (url: string, id: string): string => {
    if (id === 'anthropic') return 'Anthropic';
    if (id === 'openai') return 'OpenAI';
    if (id === 'gemini') return 'Google Gemini';
    try {
      const host = new URL(url).hostname;
      const parts = host.split('.');
      if (parts.length >= 3) return parts[parts.length - 3].charAt(0).toUpperCase() + parts[parts.length - 3].slice(1);
      if (parts.length >= 2) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      return host;
    } catch {
      return id.charAt(0).toUpperCase() + id.slice(1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-[#2B2A29] rounded-2xl w-full max-w-2xl shadow-xl border border-claude-border animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-claude-border">
          <h3 className="text-[18px] font-semibold text-claude-text">添加模型供应商</h3>
          <button onClick={onClose} className="p-1 text-claude-textSecondary hover:text-claude-text transition-colors rounded-lg hover:bg-claude-hover">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );

  function renderContent() {
    switch (dialogState.state) {
      case 'provider_select':
        return (
          <div className="space-y-4">
            <p className="text-[14px] text-claude-textSecondary">选择官方供应商或配置自定义兼容端点</p>
            <div className="space-y-2">
              {[
                { label: 'Claude', desc: 'Official Anthropic login', value: 'claude-official' as const },
                { label: 'OpenAI →', desc: 'Official Responses API or OAuth', value: 'openai-group' as const },
                { label: 'Google Gemini', desc: 'Google AI Studio API key', value: 'gemini-ai-studio' as const },
                { label: 'Antigravity', desc: 'Official OAuth', value: 'gemini-antigravity-oauth' as const },
                { label: 'GitHub Copilot OAuth', desc: 'Official OAuth', value: 'github-copilot-oauth' as const },
                { label: 'Custom →', desc: 'Manual BaseURL', value: 'custom-group' as const },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (opt.value === 'openai-group') {
                      setDialogState({ state: 'provider_variant_select', group: 'openai' });
                    } else if (opt.value === 'custom-group') {
                      setDialogState({ state: 'provider_variant_select', group: 'custom' });
                    } else {
                      startOfficialProviderConfig(opt.value as ProviderVariant);
                    }
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-claude-border hover:border-[#387ee0]/40 hover:bg-claude-hover/50 transition-all text-left group"
                >
                  <div>
                    <div className="text-[14px] font-medium text-claude-text">{opt.label}</div>
                    <div className="text-[12px] text-claude-textSecondary">{opt.desc}</div>
                  </div>
                  <ChevronRight size={16} className="text-claude-textSecondary group-hover:text-[#387ee0] transition-colors" />
                </button>
              ))}
            </div>
          </div>
        );

      case 'provider_variant_select': {
        const { group } = dialogState;
        const options = group === 'openai'
          ? [
              { label: 'Official Responses API', desc: 'Preset api.openai.com', value: 'openai-official-responses' as const },
              { label: 'OAuth', desc: 'Official browser login', value: 'openai-oauth' as const },
            ]
          : group === 'gemini'
            ? [
                { label: 'Google AI Studio API key', desc: 'Preset generativelanguage.googleapis.com', value: 'gemini-ai-studio' as const },
              ]
            : [
                { label: 'Anthropic-Like', desc: 'Compatible with Anthropic API', value: 'anthropic-like' as const },
                { label: 'OpenAI-Like', desc: 'Compatible with OpenAI API', value: 'openai-like' as const },
                { label: 'Google-Vertex-Like', desc: 'Compatible with Google Vertex API', value: 'gemini-like' as const },
              ];

        return (
          <div className="space-y-4">
            <button onClick={() => setDialogState({ state: 'provider_select' })} className="text-[13px] text-claude-textSecondary hover:text-claude-text transition-colors flex items-center gap-1">
              ← 返回
            </button>
            <h4 className="text-[16px] font-semibold text-claude-text">
              {group === 'openai' ? 'OpenAI' : group === 'gemini' ? 'Google Gemini' : 'Custom'}
            </h4>
            <div className="space-y-2">
              {options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (group === 'custom') {
                      startCompatibleApiConfig(opt.value as CompatibleApiProvider);
                    } else {
                      startOfficialProviderConfig(opt.value as ProviderVariant);
                    }
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-claude-border hover:border-[#387ee0]/40 hover:bg-claude-hover/50 transition-all text-left group"
                >
                  <div>
                    <div className="text-[14px] font-medium text-claude-text">{opt.label}</div>
                    <div className="text-[12px] text-claude-textSecondary">{opt.desc}</div>
                  </div>
                  <ChevronRight size={16} className="text-claude-textSecondary group-hover:text-[#387ee0] transition-colors" />
                </button>
              ))}
            </div>
          </div>
        );
      }

      case 'custom_config': {
        const { provider, authMode, step, variant } = dialogState;
        const isOfficial = Boolean(variant && !variant.startsWith('custom-'));

        const providerLabel =
          variant === 'claude-official' ? 'Claude'
          : variant === 'openai-official-responses' ? 'OpenAI Official Responses API'
          : variant === 'openai-oauth' ? 'OpenAI OAuth'
          : variant === 'gemini-ai-studio' ? 'Google AI Studio'
          : variant === 'gemini-antigravity-oauth' ? 'Antigravity'
          : variant === 'github-copilot-oauth' ? 'GitHub Copilot OAuth'
          : provider === 'openai-like' ? 'OpenAI-compatible API'
          : provider === 'gemini-like' ? 'Google-Vertex-Like API'
          : 'Anthropic-compatible API';

        if (step === 'authMode') {
          return (
            <div className="space-y-4">
              <button onClick={() => setDialogState({ state: 'provider_variant_select', group: 'custom' })} className="text-[13px] text-claude-textSecondary hover:text-claude-text transition-colors flex items-center gap-1">
                ← 返回
              </button>
              <div>
                <h4 className="text-[16px] font-semibold text-claude-text mb-1">{isOfficial ? 'Configure official provider' : 'Configure custom provider'}</h4>
                <p className="text-[14px] text-claude-textSecondary">{providerLabel}</p>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-claude-textSecondary mb-2">Select auth mode:</label>
                <div className="space-y-2">
                  {(provider === 'openai-like'
                    ? [
                        { label: 'chat/completions', desc: 'API key auth', value: 'chat-completions' },
                        { label: 'Responses API', desc: 'API key auth', value: 'responses' },
                      ]
                    : [
                        { label: 'API key', desc: 'Manual BaseURL + API key', value: provider === 'gemini-like' ? 'vertex-compatible' : 'api-key' },
                      ]
                  ).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleSubmitCustomConfig(opt.value)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-claude-border hover:border-[#387ee0]/40 hover:bg-claude-hover/50 transition-all text-left"
                    >
                      <div>
                        <div className="text-[14px] font-medium text-claude-text">{opt.label}</div>
                        <div className="text-[12px] text-claude-textSecondary">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        const label = step === 'baseURL'
          ? isOfficial
            ? 'Using preset endpoint:'
            : provider === 'openai-like'
              ? authMode === 'responses'
                ? 'Enter the OpenAI-compatible Responses base URL:'
                : 'Enter the OpenAI-compatible Chat Completions base URL:'
              : provider === 'gemini-like'
                ? 'Enter the Google-Vertex-Like base URL:'
                : 'Enter the Anthropic-compatible Messages base URL:'
          : step === 'apiKey'
            ? variant === 'gemini-ai-studio'
              ? 'Enter Google AI Studio API key:'
              : variant === 'openai-official-responses'
                ? 'Enter OpenAI API key:'
                : 'Enter API key:'
            : 'Enter one or more model names separated by spaces:';

        const value = step === 'baseURL' ? customBaseURL : step === 'apiKey' ? customApiKey : customModels;
        const placeholder = step === 'baseURL'
          ? provider === 'openai-like'
            ? 'https://api.openai.com'
            : provider === 'gemini-like'
              ? 'https://generativelanguage.googleapis.com'
              : 'https://api.anthropic.com'
          : step === 'apiKey'
            ? 'sk-...'
            : provider === 'openai-like'
              ? 'gpt-4o gpt-4o-mini'
              : provider === 'gemini-like'
                ? 'gemini-2.5-pro gemini-2.5-flash'
                : 'claude-opus-4-6 claude-sonnet-4-6';

        return (
          <div className="space-y-4">
            <div>
              <h4 className="text-[16px] font-semibold text-claude-text mb-1">{isOfficial ? 'Configure official provider' : 'Configure custom provider'}</h4>
              <p className="text-[14px] text-claude-textSecondary">{providerLabel}</p>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-claude-textSecondary mb-2">{label}</label>
              <input
                type={step === 'apiKey' ? 'password' : 'text'}
                value={value}
                onChange={e => {
                  if (step === 'baseURL') setCustomBaseURL(e.target.value);
                  else if (step === 'apiKey') setCustomApiKey(e.target.value);
                  else setCustomModels(e.target.value);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSubmitCustomConfig(value);
                }}
                placeholder={placeholder}
                className="w-full px-3 py-2.5 bg-claude-input border border-claude-border rounded-lg text-[14px] text-claude-text outline-none focus:border-[#387ee0]/60 transition-colors placeholder:text-claude-textSecondary/40"
                autoFocus
              />
              <p className="mt-2 text-[12px] text-claude-textSecondary">
                {step === 'baseURL' && !isOfficial
                  ? 'Base URL only; route suffix is appended automatically. Press Enter to continue.'
                  : step === 'models'
                    ? 'Press Enter to save the models.'
                    : 'Press Enter to continue.'}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleSubmitCustomConfig(value)}
                className="px-4 py-2 bg-[#333] text-white text-[14px] font-medium rounded-lg hover:bg-[#1a1a1a] dark:bg-white dark:text-black dark:hover:bg-[#e5e5e5] transition-colors"
              >
                {step === 'models' ? '完成' : '继续'}
              </button>
              <button
                onClick={() => {
                  if (step === 'models') setDialogState({ state: 'custom_config', provider, authMode, step: 'apiKey', variant });
                  else if (step === 'apiKey') setDialogState({ state: 'custom_config', provider, authMode, step: 'baseURL', variant });
                  else if (step === 'baseURL') setDialogState({ state: 'provider_variant_select', group: 'custom' });
                  else setDialogState({ state: 'provider_select' });
                }}
                className="px-4 py-2 text-[14px] font-medium text-claude-text border border-claude-border hover:bg-claude-hover rounded-lg transition-colors"
              >
                返回
              </button>
            </div>
          </div>
        );
      }

      case 'oauth_flow':
        return (
          <div className="space-y-4 text-center py-8">
            <div className="text-[16px] font-semibold text-claude-text">OAuth 登录</div>
            <p className="text-[14px] text-claude-textSecondary">
              {dialogState.variant === 'openai-oauth'
                ? '将打开浏览器完成 OpenAI 官方 OAuth 授权，成功后自动创建并启用 OpenAI OAuth provider。'
                : '该 OAuth 流程正在迁移到桌面原生实现，当前版本尚未接入。'}
            </p>
            {oauthStatusMessage ? (
              <div className="text-[12px] text-claude-textSecondary bg-claude-hover/30 rounded-lg px-3 py-2">
                {oauthStatusMessage}
              </div>
            ) : null}
            <div className="flex gap-3 justify-center">
              {dialogState.variant === 'openai-oauth' ? (
                <button
                  onClick={() => handleStartOAuthFlow(dialogState.variant)}
                  disabled={oauthBusy}
                  className="px-4 py-2 bg-[#333] text-white text-[14px] font-medium rounded-lg hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-[#e5e5e5] transition-colors"
                >
                  {oauthBusy ? '正在处理...' : '开始授权'}
                </button>
              ) : null}
              <button
                onClick={() => setDialogState({ state: 'provider_select' })}
                className="px-4 py-2 text-[14px] font-medium text-claude-text border border-claude-border hover:bg-claude-hover rounded-lg transition-colors"
              >
                返回
              </button>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="space-y-4 text-center py-8">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <Check size={24} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="text-[16px] font-semibold text-claude-text">供应商添加成功！</div>
            <button onClick={onClose} className="px-4 py-2 bg-[#333] text-white text-[14px] font-medium rounded-lg hover:bg-[#1a1a1a] dark:bg-white dark:text-black dark:hover:bg-[#e5e5e5] transition-colors">
              完成
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="space-y-4 text-center py-8">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <X size={24} className="text-red-600 dark:text-red-400" />
            </div>
            <div className="text-[16px] font-semibold text-claude-text">添加失败</div>
            <p className="text-[14px] text-claude-textSecondary">{dialogState.message}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDialogState({ state: 'provider_select' })} className="px-4 py-2 text-[14px] font-medium text-claude-text border border-claude-border hover:bg-claude-hover rounded-lg transition-colors">
                重试
              </button>
              <button onClick={onClose} className="px-4 py-2 text-[14px] font-medium text-claude-text border border-claude-border hover:bg-claude-hover rounded-lg transition-colors">
                关闭
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  }
};

export default ProviderAddDialog;
