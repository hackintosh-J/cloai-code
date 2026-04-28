import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Check, Eye, EyeOff, RefreshCw, ChevronDown, ChevronRight, X, Globe } from 'lucide-react';
import { getProviders, createProvider, updateProvider, deleteProvider, testProviderWebSearch, getProviderPresets, importCloaiProviders, Provider, ProviderModel, ProviderPreset } from '@/src/services';
import ProviderAddDialog from '@/src/components/ProviderAddDialog';
import { getProviderRef, getStoredModelId } from '@/src/utils/providerIdentity';

// Auto-detect provider info from URL.
// `webSearch: 'native'` means the runtime has a dedicated native search handler for this provider.
// Anthropic-format providers implicitly support web search via the upstream API's server tool.
const KNOWN_PROVIDERS: Array<{
  match: (url: string) => boolean;
  name: string;
  format: 'anthropic' | 'openai';
  color: string;
  letter: string;
  defaultModels?: ProviderModel[];
  webSearch?: 'native';
}> = [
    {
      match: u => /anthropic\.com/i.test(u), name: 'Anthropic', format: 'anthropic', color: '#D97757', letter: 'A',
      webSearch: 'native',
      defaultModels: [{ id: 'claude-opus-4-6', name: 'Claude Opus 4.6' }, { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }, { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' }]
    },
    {
      match: u => /openai\.com/i.test(u), name: 'OpenAI', format: 'openai', color: '#10A37F', letter: 'O',
      defaultModels: [{ id: 'gpt-4o', name: 'GPT-4o' }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }, { id: 'o3-mini', name: 'o3-mini' }]
    },
    {
      match: u => /deepseek\.com/i.test(u), name: 'DeepSeek', format: 'openai', color: '#4D6BFE', letter: 'D',
      defaultModels: [{ id: 'deepseek-chat', name: 'DeepSeek V3' }, { id: 'deepseek-reasoner', name: 'DeepSeek R1' }]
    },
    {
      match: u => /bigmodel\.cn/i.test(u), name: 'GLM (Zhipu)', format: 'openai', color: '#3B68FF', letter: 'G',
      webSearch: 'native',
      defaultModels: [{ id: 'glm-5-plus', name: 'GLM-5 Plus' }, { id: 'glm-4-plus', name: 'GLM-4 Plus' }]
    },
    { match: u => /siliconflow/i.test(u), name: 'SiliconFlow', format: 'openai', color: '#7C3AED', letter: 'S' },
    {
      match: u => /minimax/i.test(u), name: 'MiniMax', format: 'openai', color: '#FF6B35', letter: 'M',
      defaultModels: [{ id: 'MiniMax-M1', name: 'MiniMax M1' }]
    },
    {
      match: u => /generativelanguage\.googleapis|gemini/i.test(u), name: 'Google Gemini', format: 'openai', color: '#4285F4', letter: 'G',
      defaultModels: [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }, { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }]
    },
    {
      match: u => /dashscope\.aliyuncs/i.test(u), name: 'Qwen (Aliyun)', format: 'openai', color: '#FF6A00', letter: 'Q',
      webSearch: 'native',
    },
    {
      match: u => /api\.moonshot\.cn/i.test(u), name: 'Moonshot (Kimi)', format: 'openai', color: '#6366F1', letter: 'K',
      defaultModels: [{ id: 'moonshot-v1-8k', name: 'Moonshot v1 8k' }, { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k' }, { id: 'moonshot-v1-128k', name: 'Moonshot v1 128k' }]
    },
    {
      match: u => /api\.baichuan-ai\.com/i.test(u), name: 'Baichuan', format: 'openai', color: '#0EA5E9', letter: 'B',
      defaultModels: [{ id: 'Baichuan4', name: 'Baichuan 4' }]
    },
    {
      match: u => /api\.stepfun\.com/i.test(u), name: 'StepFun', format: 'openai', color: '#8B5CF6', letter: 'S',
      defaultModels: [{ id: 'step-1-8k', name: 'Step-1 8k' }, { id: 'step-1-32k', name: 'Step-1 32k' }]
    },
    {
      match: u => /api\.lingyiwanwu\.com/i.test(u), name: 'Yi (01.AI)', format: 'openai', color: '#F59E0B', letter: 'Y',
      defaultModels: [{ id: 'yi-large', name: 'Yi Large' }, { id: 'yi-medium', name: 'Yi Medium' }]
    },
    {
      match: u => /spark-api\.xf-yun\.com/i.test(u), name: 'iFlytek Spark', format: 'openai', color: '#EF4444', letter: 'I',
      defaultModels: [{ id: 'spark-v3.5', name: 'Spark v3.5' }]
    },
    {
      match: u => /api\.sensenova\.cn/i.test(u), name: 'SenseNova', format: 'openai', color: '#10B981', letter: 'S',
      defaultModels: [{ id: 'SenseChat-5', name: 'SenseChat 5' }]
    },
    {
      match: u => /api\.cohere\.ai/i.test(u), name: 'Cohere', format: 'openai', color: '#D946EF', letter: 'C',
      defaultModels: [{ id: 'command-r-plus', name: 'Command R+' }, { id: 'command-r', name: 'Command R' }]
    },
    {
      match: u => /api\.mistral\.ai/i.test(u), name: 'Mistral AI', format: 'openai', color: '#F97316', letter: 'M',
      defaultModels: [{ id: 'mistral-large-latest', name: 'Mistral Large' }, { id: 'mistral-medium-latest', name: 'Mistral Medium' }]
    },
    {
      match: u => /api\.together\.xyz/i.test(u), name: 'Together AI', format: 'openai', color: '#06B6D4', letter: 'T',
    },
    {
      match: u => /api\.groq\.com/i.test(u), name: 'Groq', format: 'openai', color: '#F43F5E', letter: 'G',
      defaultModels: [{ id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' }, { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }]
    },
    {
      match: u => /api\.perplexity\.ai/i.test(u), name: 'Perplexity', format: 'openai', color: '#14B8A6', letter: 'P',
      defaultModels: [{ id: 'llama-3.1-sonar-large-128k-online', name: 'Sonar Large Online' }]
    },
    {
      match: u => /api\.fireworks\.ai/i.test(u), name: 'Fireworks AI', format: 'openai', color: '#FB923C', letter: 'F',
    },
    {
      match: u => /api\.replicate\.com/i.test(u), name: 'Replicate', format: 'openai', color: '#A855F7', letter: 'R',
    },
    {
      match: u => /api\.anthropic\.com/i.test(u), name: 'Anthropic', format: 'anthropic', color: '#D97757', letter: 'A',
      webSearch: 'native',
    },
    {
      match: u => /github\.com|copilot/i.test(u), name: 'GitHub Copilot', format: 'openai', color: '#24292F', letter: 'G',
      defaultModels: [{ id: 'gpt-4o', name: 'GPT-4o' }, { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }]
    },
  ];


function detectProvider(url: string) {
  for (const kp of KNOWN_PROVIDERS) {
    if (kp.match(url)) return kp;
  }
  return null;
}

// Real provider SVG logos
const PROVIDER_LOGOS: Record<string, (size: number) => React.ReactNode> = {
  'Anthropic': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.767l-1.932-5.147H4.836L2.904 20.48H-.863L6.57 3.52zm.846 8.832h4.47L9.65 6.36l-2.236 5.992z" fill="#D97757" /></svg>,
  'OpenAI': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="#10A37F" /></svg>,
  'DeepSeek': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#4D6BFE" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">D</text></svg>,
  'GLM (Zhipu)': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#3B68FF" /><text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="sans-serif">GLM</text></svg>,
  'SiliconFlow': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#7C3AED" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">Si</text></svg>,
  'MiniMax': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#FF6B35" /><text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="sans-serif">MM</text></svg>,
  'Google Gemini': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path d="M12 24C12 24 24 17.5 24 12S12 0 12 0 0 6.5 0 12s12 12 12 12z" fill="url(#gem)" /><defs><linearGradient id="gem" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stopColor="#4285F4" /><stop offset="50%" stopColor="#9B72CB" /><stop offset="100%" stopColor="#D96570" /></linearGradient></defs></svg>,
  'Qwen (Aliyun)': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#FF6A00" /><text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="sans-serif">Qw</text></svg>,
  'Moonshot (Kimi)': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#6366F1" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">K</text></svg>,
  'Baichuan': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#0EA5E9" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">B</text></svg>,
  'StepFun': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#8B5CF6" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">S</text></svg>,
  'Yi (01.AI)': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#F59E0B" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">Y</text></svg>,
  'iFlytek Spark': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#EF4444" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">I</text></svg>,
  'SenseNova': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#10B981" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">S</text></svg>,
  'Cohere': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#D946EF" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">C</text></svg>,
  'Mistral AI': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#F97316" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">M</text></svg>,
  'Together AI': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#06B6D4" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">T</text></svg>,
  'Groq': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#F43F5E" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">G</text></svg>,
  'Perplexity': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#14B8A6" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">P</text></svg>,
  'Fireworks AI': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#FB923C" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">F</text></svg>,
  'Replicate': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#A855F7" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">R</text></svg>,
  'GitHub Copilot': (s) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#24292F" /><text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="sans-serif">GH</text></svg>,
};

const ProviderIcon: React.FC<{ name: string; color: string; letter: string; size?: number }> = ({ name, color, letter, size = 32 }) => {
  const logo = PROVIDER_LOGOS[name];
  if (logo) return <div className="flex-shrink-0">{logo(size)}</div>;
  return (
    <div className="rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.38 }}>
      {letter}
    </div>
  );
};

// Chat models: the subset of models shown in the conversation model selector
interface ChatModel { id: string; name: string; providerId: string; providerName: string; thinkingId?: string; tier?: 'opus' | 'sonnet' | 'haiku' | 'extra'; }

// Composite key that uniquely identifies a model across providers.
// Two providers can expose the same model id (e.g. claude-opus-4-6);
// uid = "providerId:modelId" prevents them from colliding in the UI.
const modelUid = (m: { id: string; providerId: string }) => `${m.providerId}:${m.id}`;

const TIER_DEFS: { key: 'opus' | 'sonnet' | 'haiku'; label: string; description: string }[] = [
  { key: 'opus', label: 'Opus 档', description: 'Most capable for ambitious work' },
  { key: 'sonnet', label: 'Sonnet 档', description: 'Most efficient for everyday tasks' },
  { key: 'haiku', label: 'Haiku 档', description: 'Fastest for quick answers' },
];

function loadChatModels(): ChatModel[] {
  try {
    const raw: ChatModel[] = JSON.parse(localStorage.getItem('chat_models') || '[]');
    // Migrate legacy entries without a tier to 'extra' so they are visible and don't ghost-block tier dropdowns
    let migrated = false;
    for (const m of raw) { if (!m.tier) { m.tier = 'extra'; migrated = true; } }
    if (migrated) localStorage.setItem('chat_models', JSON.stringify(raw));
    return raw;
  } catch { return []; }
}
function saveChatModels(models: ChatModel[]) {
  localStorage.setItem('chat_models', JSON.stringify(models));
}

function isOAuthManagedProvider(provider: Provider) {
  return provider.authMode === 'oauth' || provider.authMode === 'gemini-cli-oauth';
}

function getAuthModeLabel(provider: Provider) {
  switch (provider.authMode) {
    case 'responses':
      return 'Responses API';
    case 'chat-completions':
      return 'chat/completions';
    case 'oauth':
      return 'OAuth';
    case 'gemini-cli-oauth':
      return 'Gemini CLI OAuth';
    case 'vertex-compatible':
      return 'Vertex-compatible';
    case 'api-key':
      return 'API Key';
    default:
      return provider.format === 'openai' ? 'OpenAI 兼容' : 'Anthropic Messages';
  }
}

function getVariantLabel(provider: Provider) {
  switch (provider.variant) {
    case 'openai-official-responses':
      return 'OpenAI Official Responses';
    case 'openai-oauth':
      return 'OpenAI OAuth';
    case 'github-copilot-oauth':
      return 'GitHub Copilot OAuth';
    case 'gemini-cli-oauth':
      return 'Gemini CLI OAuth';
    case 'gemini-antigravity-oauth':
      return 'Antigravity OAuth';
    case 'gemini-ai-studio':
      return 'Google AI Studio';
    case 'custom-openai-responses':
      return 'Custom OpenAI Responses';
    case 'custom-openai-chat':
      return 'Custom OpenAI Chat';
    case 'custom-google-vertex-like':
      return 'Custom Google Vertex-like';
    case 'custom-anthropic-like':
      return 'Custom Anthropic-like';
    case 'claude-official':
      return 'Claude Official';
    default:
      return provider.variant || '未指定';
  }
}

function getNextVariantForAuthMode(provider: Provider, authMode: Provider['authMode']) {
  if (provider.kind === 'gemini-like') {
    return provider.variant || 'custom-google-vertex-like';
  }
  if (provider.format === 'anthropic') {
    return provider.baseUrl?.includes('api.anthropic.com') ? 'claude-official' : 'custom-anthropic-like';
  }
  if (authMode === 'responses') {
    return provider.baseUrl?.includes('api.openai.com') ? 'openai-official-responses' : 'custom-openai-responses';
  }
  if (provider.variant === 'github-copilot-oauth') {
    return provider.variant;
  }
  return 'custom-openai-chat';
}

const SearchableModelSelect = ({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  dashed
}: {
  value: string;
  onChange: (val: string) => void;
  options: { id: string, providerId: string, name: string, providerName: string }[];
  placeholder: string;
  emptyLabel?: string;
  dashed?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClick);
      setSearch(''); // Reset search when opening
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filteredOptions = options.filter(o =>
    o.id.toLowerCase().includes(search.toLowerCase()) ||
    (o.name || '').toLowerCase().includes(search.toLowerCase()) ||
    o.providerName.toLowerCase().includes(search.toLowerCase())
  );

  const optUid = (o: typeof options[0]) => `${o.providerId}:${o.id}`;
  const selectedOption = options.find(o => optUid(o) === value);

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full ${dashed ? 'px-3 py-2 border-dashed rounded-[10px] text-claude-textSecondary' : 'px-3 py-1.5 rounded-lg text-claude-text'} bg-transparent border ${dashed ? 'border-claude-border/40' : 'border-claude-border/60'} text-[13px] text-left outline-none hover:border-[#387ee0]/40 focus:border-[#387ee0]/60 transition-colors flex items-center justify-between`}
      >
        <span className="truncate">{selectedOption ? `${selectedOption.name} (${selectedOption.providerName})` : placeholder}</span>
        <ChevronDown size={12} className="text-claude-textSecondary flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-[100] mt-1 w-[360px] max-w-[80vw] bg-[#ffffff] dark:bg-[#202020] border border-claude-border rounded-[10px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[380px]">
          <div className="p-2 border-b border-claude-border/50 bg-black/5 dark:bg-white/5">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索模型名称或供应商..."
              className="w-full px-3 py-1.5 bg-claude-input border border-claude-border rounded-[6px] text-[13px] text-claude-text outline-none focus:border-[#387ee0]/60 transition-colors"
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1 relative">
            {emptyLabel && (
              <button
                onClick={() => { onChange(''); setOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-[6px] text-[13px] mb-0.5 transition-colors hover:bg-claude-hover ${value === '' ? 'bg-claude-hover text-[#387ee0]' : 'text-claude-textSecondary'}`}
              >
                {emptyLabel}
              </button>
            )}
            {filteredOptions.length === 0 && <div className="px-3 py-4 text-center text-[12px] text-claude-textSecondary">未找到匹配模型</div>}
            {filteredOptions.map(o => {
              const uid = optUid(o);
              const selected = value === uid;
              return (
              <button
                key={uid}
                onClick={() => { onChange(uid); setOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-[6px] text-[13px] mb-0.5 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] flex flex-col gap-0.5 ${selected ? 'bg-[#387ee0]/10 text-[#387ee0]' : 'text-claude-text'}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`font-semibold truncate pr-2 ${selected ? 'text-[#387ee0]' : 'text-claude-text'}`}>{o.name}</span>
                  {selected && <Check size={14} className="flex-shrink-0 text-[#387ee0]" />}
                </div>
                <div className={`text-[11px] truncate ${selected ? 'text-[#387ee0]/70' : 'text-claude-textSecondary/60'}`}>
                  {o.providerName} &bull; <span className="font-mono">{o.id}</span>
                </div>
              </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const ProviderSettings: React.FC = () => {
  const [providerList, setProviderList] = useState<Provider[]>([]);
  const [selectedProviderRef, setSelectedProviderRef] = useState<string | null>(null);
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelPage, setModelPage] = useState(0);
  const MODELS_PER_PAGE = 10;
  const [defaultModel, setDefaultModel] = useState(localStorage.getItem('default_model') || '');
  const [chatModels, setChatModels] = useState<ChatModel[]>(loadChatModels());

  // Per-provider web-search probe state. Valid values: 'testing' | 'success' | 'failed'.
  // Absence means "never tested" (show as not supported).
  const [webSearchTestState, setWebSearchTestState] = useState<Record<string, 'testing' | 'success' | 'failed'>>({});

  // New provider form
  const [showAdd, setShowAdd] = useState(false);

  const [importingCloai, setImportingCloai] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  useEffect(() => {
    loadProviders();
  }, []);

  const migrateChatModelProviderRefs = (providers: Provider[]) => {
    if (providers.length === 0 || chatModels.length === 0) return;

    let changed = false;
    let nextDefaultModel = localStorage.getItem('default_model') || defaultModel;
    const resolveProviderRef = (model: ChatModel) => {
      if (model.providerId && providers.some(provider => getProviderRef(provider) === model.providerId)) {
        return model.providerId;
      }

      const matches = providers.filter(provider => {
        const matchesLegacyProvider = model.providerId ? provider.id === model.providerId : true;
        const hasModel = (provider.models || []).some(providerModel => providerModel.id === model.id);
        return matchesLegacyProvider && hasModel;
      });
      return matches.length === 1 ? getProviderRef(matches[0]) : model.providerId;
    };

    const nextChatModels = chatModels.map(model => {
      const nextProviderId = resolveProviderRef(model);
      if (!nextProviderId || nextProviderId === model.providerId) return model;

      const previousStoredId = getStoredModelId(model);
      const nextModel = { ...model, providerId: nextProviderId };
      const nextStoredId = getStoredModelId(nextModel);
      if (nextDefaultModel === previousStoredId || nextDefaultModel === model.id) {
        nextDefaultModel = nextStoredId;
      }
      changed = true;
      return nextModel;
    });

    if (!changed) return;
    setChatModels(nextChatModels);
    saveChatModels(nextChatModels);
    setDefaultModel(nextDefaultModel);
    localStorage.setItem('default_model', nextDefaultModel);
  };

  const loadProviders = async () => {
    try {
      const list = await getProviders();
      setProviderList(list);
      migrateChatModelProviderRefs(list);
      if (list.length > 0) {
        setSelectedProviderRef(prev => (
          prev && list.some(provider => getProviderRef(provider) === prev)
            ? prev
            : getProviderRef(list[0])
        ));
      } else {
        setSelectedProviderRef(null);
      }
      if (list.length === 0) {
        const imported = await importCloaiProviders();
        if (imported?.ok && Array.isArray(imported.providers) && imported.providers.length > 0) {
          setProviderList(imported.providers);
          migrateChatModelProviderRefs(imported.providers);
          setSelectedProviderRef(getProviderRef(imported.providers[0]));
          setImportMsg(`已从 ${imported.path} 导入 ${imported.importedCount} 个供应商`);
        } else if (imported?.error) {
          setImportMsg(imported.error);
        }
      }
    } catch (_) { }
  };

  const handleImportCloai = async () => {
    setImportingCloai(true);
    setImportMsg('');
    try {
      const imported = await importCloaiProviders();
      if (imported?.ok && Array.isArray(imported.providers)) {
        setProviderList(imported.providers);
        migrateChatModelProviderRefs(imported.providers);
        if (imported.providers.length > 0) {
          setSelectedProviderRef(prev => (
            prev && imported.providers.some(provider => getProviderRef(provider) === prev)
              ? prev
              : getProviderRef(imported.providers[0])
          ));
        }
        setImportMsg(`已从 ${imported.path} 导入 ${imported.importedCount} 个供应商`);
      } else {
        setImportMsg(imported?.error || '未找到可导入的 cloai 配置');
      }
    } catch (err: any) {
      setImportMsg(err?.message || '导入 cloai 配置失败');
    } finally {
      setImportingCloai(false);
    }
  };

  // Run the web-search probe for a provider and reflect the result in UI state.
  // Kicked off automatically after import and also from the manual "Retest" button.
  const handleTestWebSearch = async (providerRef: string) => {
    setWebSearchTestState(prev => ({ ...prev, [providerRef]: 'testing' }));
    try {
      const result = await testProviderWebSearch(providerRef);
      setWebSearchTestState(prev => ({ ...prev, [providerRef]: result.ok ? 'success' : 'failed' }));
      // The native/API layer has persisted supportsWebSearch/webSearchStrategy; pull the fresh record.
      const list = await getProviders();
      setProviderList(list);
    } catch (_) {
      setWebSearchTestState(prev => ({ ...prev, [providerRef]: 'failed' }));
    }
  };

  const handleUpdate = async (providerRef: string, updates: Partial<Provider>) => {
    const updated = await updateProvider(providerRef, updates);
    setProviderList(prev => prev.map(p => getProviderRef(p) === providerRef ? { ...p, ...updated } : p));
    setSelectedProviderRef(getProviderRef(updated));
  };

  const handleDelete = async (providerRef: string) => {
    await deleteProvider(providerRef);
    setProviderList(prev => prev.filter(p => getProviderRef(p) !== providerRef));
    if (selectedProviderRef === providerRef) {
      const nextProvider = providerList.find(p => getProviderRef(p) !== providerRef);
      setSelectedProviderRef(nextProvider ? getProviderRef(nextProvider) : null);
    }
  };

  // Auto-fetch models from /v1/models endpoint
  const handleFetchModels = async (p: Provider) => {
    if (!p.baseUrl || !p.apiKey) return;
    setFetchingModels(true);
    try {
      let endpoint = p.baseUrl.replace(/\/+$/, '').replace(/\/(chat\/completions|messages)$/, '').replace(/\/+$/, '');
      if (!endpoint.endsWith('/v1')) endpoint += '/v1';
      endpoint += '/models';

      const headers: Record<string, string> = {};
      if (p.format === 'openai') headers['Authorization'] = 'Bearer ' + p.apiKey;
      else headers['x-api-key'] = p.apiKey;

      const res = await fetch(endpoint, { headers });
      if (res.ok) {
        const data = await res.json();
        const models: ProviderModel[] = (data.data || [])
          .filter((m: any) => m.id && typeof m.id === 'string')
          .map((m: any) => ({ id: m.id, name: m.id, enabled: true }));
        if (models.length > 0) {
          await handleUpdate(getProviderRef(p), { models });
          // Re-load full provider list to ensure allAvailableModels is up-to-date
          await loadProviders();
        }
      }
    } catch (_) { }
    setFetchingModels(false);
  };

  const selected = providerList.find(p => getProviderRef(p) === selectedProviderRef);
  const selectedRef = selected ? getProviderRef(selected) : '';
  const selectedIsManagedByStorage = !!selected?.providerManagedByStorage;
  const selectedUsesManagedOAuth = !!selected && isOAuthManagedProvider(selected);

  const getProviderMeta = (p: Provider) => {
    const detected = detectProvider(p.baseUrl || '');
    return {
      color: detected?.color || '#6B7280',
      letter: detected?.letter || p.name.charAt(0).toUpperCase(),
    };
  };

  // All models across all providers (for the "add to chat" dropdown)
  const allAvailableModels: ChatModel[] = [];
  for (const p of providerList) {
    if (!p.enabled) continue;
    for (const m of (p.models || [])) {
      if (m.enabled === false) continue;
      allAvailableModels.push({ id: m.id, name: m.name || m.id, providerId: getProviderRef(p), providerName: p.name });
    }
  }

  // Detect thinking variant for a model ID across all providers
  const detectThinkingId = (model: Pick<ChatModel, 'id' | 'providerId'>): string | undefined => {
    const provider = providerList.find(p => getProviderRef(p) === model.providerId);
    if ((provider?.models || []).some(pm => pm.id === model.id + '-thinking')) {
      return model.id + '-thinking';
    }
    return undefined;
  };

  const handleSetTierModel = (tier: 'opus' | 'sonnet' | 'haiku', uid: string) => {
    // Remove any existing model in this tier
    let updated = chatModels.filter(cm => cm.tier !== tier);
    if (uid) {
      const src = allAvailableModels.find(m => modelUid(m) === uid);
      if (src) {
        const thinkingId = detectThinkingId(src);
        updated = [...updated, { ...src, tier, thinkingId }];
      }
    }
    setChatModels(updated);
    saveChatModels(updated);
    // Auto-set default to first tier model
    if (!updated.some(cm => getStoredModelId(cm) === defaultModel || cm.id === defaultModel)) {
      const first = updated.find(cm => cm.tier === 'opus') || updated[0];
      if (first) {
        const storedId = getStoredModelId(first)
        setDefaultModel(storedId)
        localStorage.setItem('default_model', storedId)
      }
    }
  };

  const handleAddExtraModel = (m: ChatModel) => {
    if (chatModels.some(cm => modelUid(cm) === modelUid(m))) return;
    const thinkingId = detectThinkingId(m);
    const updated = [...chatModels, { ...m, tier: 'extra' as const, thinkingId }];
    setChatModels(updated);
    saveChatModels(updated);
  };

  const handleRemoveChatModel = (uid: string) => {
    const removed = chatModels.find(cm => modelUid(cm) === uid);
    const updated = chatModels.filter(cm => modelUid(cm) !== uid);
    setChatModels(updated);
    saveChatModels(updated);
    if (removed && (defaultModel === removed.id || defaultModel === getStoredModelId(removed))) {
      const newDefault = updated[0] ? getStoredModelId(updated[0]) : '';
      setDefaultModel(newDefault);
      localStorage.setItem('default_model', newDefault);
    }
  };

  const handleSetDefault = (id: string) => {
    setDefaultModel(id);
    localStorage.setItem('default_model', id);
  };

  return (
    <div>
      {/* ===== Chat Models Section ===== */}
      <div className="relative z-50 mb-10 animate-fade-in">
        <h3 className="text-[16px] font-semibold text-claude-text mb-1">对话模型</h3>
        <p className="text-[12px] text-claude-textSecondary/60 mb-4">为每个档位分配模型，它们将显示在对话下拉框中。没有 Thinking 变体的模型将无法开启 Extended thinking。</p>

        {/* Tier slots: Opus / Sonnet / Haiku */}
        <div className="space-y-3 mb-6">
          {TIER_DEFS.map(tier => {
            const assigned = chatModels.find(cm => cm.tier === tier.key);
            const assignedIsDefault = assigned && (defaultModel === assigned.id || defaultModel === getStoredModelId(assigned));
            // Models available for this tier (not already assigned to another tier; ignore tierless entries)
            const usedUids = new Set(chatModels.filter(cm => cm.tier && cm.tier !== tier.key).map(cm => modelUid(cm)));
            const available = allAvailableModels.filter(m => !usedUids.has(modelUid(m)) && !m.id.endsWith('-thinking'));
            return (
              <div key={tier.key} className={`rounded-[12px] border transition-colors ${assigned ? (assignedIsDefault ? 'bg-[#387ee0]/5 border-[#387ee0]/40' : 'bg-black/[0.02] dark:bg-white/[0.02] border-claude-border') : 'border-dashed border-claude-border/40'}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Default star */}
                  {assigned && (
                    <button onClick={() => handleSetDefault(getStoredModelId(assigned))} title={assignedIsDefault ? '当前默认' : '设为默认'}
                      className={`flex-shrink-0 transition-colors ${assignedIsDefault ? 'text-[#387ee0]' : 'text-claude-textSecondary/30 hover:text-[#387ee0]/80'}`}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill={assignedIsDefault ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-claude-text">{tier.label}</span>
                      <span className="text-[12px] text-claude-textSecondary">{tier.description}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 max-w-[320px]">
                        <SearchableModelSelect
                          value={assigned ? modelUid(assigned) : ''}
                          onChange={uid => handleSetTierModel(tier.key, uid)}
                          options={[...(assigned && !available.find(x => modelUid(x) === modelUid(assigned)) ? [assigned] : []), ...available]}
                          placeholder="未分配"
                          emptyLabel="未分配"
                        />
                      </div>
                      {assigned && assigned.thinkingId && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0">Thinking</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* More models section */}
        {(() => {
          const extraModels = chatModels.filter(cm => cm.tier === 'extra');
          const usedUids = new Set(chatModels.map(cm => modelUid(cm)));
          const availableForExtra = allAvailableModels.filter(m => !usedUids.has(modelUid(m)) && !m.id.endsWith('-thinking'));
          return (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-claude-textSecondary">More models</span>
              </div>
              {extraModels.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {extraModels.map(cm => (
                    <div key={modelUid(cm)} className={`rounded-[10px] border transition-colors ${(defaultModel === cm.id || defaultModel === getStoredModelId(cm)) ? 'bg-[#387ee0]/5 border-[#387ee0]/40' : 'bg-black/[0.02] dark:bg-white/[0.02] border-claude-border/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'}`}>
                      <div className="flex items-center gap-2.5 px-3 py-2">
                        <button onClick={() => handleSetDefault(getStoredModelId(cm))} title={(defaultModel === cm.id || defaultModel === getStoredModelId(cm)) ? '当前默认' : '设为默认'}
                          className={`flex-shrink-0 transition-colors ${(defaultModel === cm.id || defaultModel === getStoredModelId(cm)) ? 'text-[#387ee0]' : 'text-claude-textSecondary/30 hover:text-[#387ee0]/80'}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={(defaultModel === cm.id || defaultModel === getStoredModelId(cm)) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                        </button>
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <input type="text" value={cm.name}
                            onChange={e => {
                              const updated = chatModels.map(c => modelUid(c) === modelUid(cm) ? { ...c, name: e.target.value } : c);
                              setChatModels(updated);
                              saveChatModels(updated);
                            }}
                            className="text-[13px] text-claude-text font-medium bg-transparent outline-none w-[140px] border-b border-transparent hover:border-claude-border/40 focus:border-[#387ee0]/60 transition-colors"
                          />
                          <span className="text-[11px] text-claude-textSecondary/50 truncate">{cm.providerName}</span>
                        </div>
                        {cm.thinkingId && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0">Thinking</span>
                        )}
                        <button onClick={() => handleRemoveChatModel(modelUid(cm))} className="p-0.5 text-claude-textSecondary/20 hover:text-red-400 transition-colors">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {availableForExtra.length > 0 && (
                <div>
                  <SearchableModelSelect
                    value=""
                    onChange={uid => {
                      const m = allAvailableModels.find(x => modelUid(x) === uid);
                      if (m) handleAddExtraModel(m);
                    }}
                    options={availableForExtra}
                    placeholder="+ 添加更多模型..."
                    dashed={true}
                  />
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <hr className="border-claude-border/40 mb-6" />

      {/* ===== Provider Management ===== */}
      <h3 className="text-[16px] font-semibold text-claude-text mb-4">模型供应商</h3>
      <div className="flex gap-6 min-h-[400px] animate-fade-in">
        {/* Left: Provider list */}
        <div className="w-[240px] flex-shrink-0 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-claude-textSecondary">供应商</span>
            <button
              onClick={() => setShowAdd(true)}
              className="p-1 text-claude-textSecondary hover:text-claude-text transition-colors rounded hover:bg-claude-hover"
              title="Add provider"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="mb-3 rounded-[12px] border border-claude-border bg-claude-input/60 p-3">
            <div className="text-[12px] font-medium text-claude-text mb-1">从 cloai 配置导入</div>
            <div className="text-[11px] text-claude-textSecondary leading-relaxed mb-2">
              导入 backend 已识别的 providers 与 OAuth/runtime storage 配置，避免桌面端重复手工录入。
            </div>
            <button
              onClick={handleImportCloai}
              disabled={importingCloai}
              className="w-full px-3 py-2 text-[12px] font-medium rounded-lg border border-claude-border/60 text-claude-textSecondary hover:text-claude-text hover:bg-claude-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importingCloai ? '导入中...' : '重新从 cloai 导入'}
            </button>
            {importMsg && (
              <div className="mt-2 text-[10.5px] leading-relaxed text-claude-textSecondary/80">
                {importMsg}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-0.5 overflow-y-auto">
            {providerList.map(p => {
              const providerRef = getProviderRef(p);
              const meta = getProviderMeta(p);
              const isActive = selectedProviderRef === providerRef;
              return (
                <button
                  key={providerRef}
                  onClick={() => { setSelectedProviderRef(providerRef); setModelPage(0); }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-[12px] transition-colors text-left border ${isActive ? 'bg-claude-input border-claude-border shadow-sm' : 'border-transparent hover:bg-claude-hover/80'
                    }`}
                >
                  <ProviderIcon name={p.name} color={meta.color} letter={meta.letter} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] truncate ${isActive ? 'text-claude-text font-medium' : 'text-claude-textSecondary'}`}>
                      {p.name}
                    </div>
                    <div className="text-[10px] text-claude-textSecondary/50 flex items-center gap-1.5">
                      <span>{(p.models || []).length} models</span>
                      {p.providerManagedByStorage ? (
                        <span className="px-1 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] text-[9px] text-claude-textSecondary/80">
                          Storage
                        </span>
                      ) : null}
                      {isOAuthManagedProvider(p) ? (
                        <span className="px-1 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] text-[9px] text-claude-textSecondary/80">
                          OAuth
                        </span>
                      ) : null}
                      {webSearchTestState[providerRef] === 'testing' ? (
                        <span className="flex items-center gap-1 text-[#387ee0] font-medium" title="正在测试网页搜索能力">
                          <RefreshCw size={9} className="animate-spin" />
                          <span>测试中</span>
                        </span>
                      ) : p.supportsWebSearch ? (
                        <span className="flex items-center gap-0.5 text-[#387ee0]" title="已验证支持网页搜索">
                          <Globe size={9} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {!p.enabled && (
                    <div className="w-1.5 h-1.5 rounded-full bg-claude-textSecondary/30 flex-shrink-0" title="Disabled" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Provider detail */}
        <div className="flex-1 overflow-y-auto">
          {/* Selected provider detail */}
          {selected ? (() => {
            const meta = getProviderMeta(selected);
            return (
              <div className="flex-1 space-y-6 bg-claude-input border border-claude-border rounded-[16px] p-6 shadow-sm">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <ProviderIcon name={selected.name} color={meta.color} letter={meta.letter} size={36} />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={selected.name}
                      onChange={e => handleUpdate(selectedRef, { name: e.target.value })}
                      className="text-[18px] font-semibold text-claude-text bg-transparent outline-none w-full"
                    />
                  </div>
                  <button
                    onClick={() => handleDelete(selectedRef)}
                    className="p-1.5 text-claude-textSecondary/30 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                    title="Delete provider"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => handleUpdate(selectedRef, { enabled: !selected.enabled })}
                    className={`w-10 h-6 rounded-full relative transition-colors ${selected.enabled ? 'bg-[#387ee0]' : 'bg-claude-border'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${selected.enabled ? 'left-5' : 'left-1'}`} />
                  </button>
                </div>

                {/* API Key */}
                <div>
                  <label className="text-[12px] text-claude-textSecondary mb-1.5 block font-medium">API 密钥</label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showKeyMap[selectedRef] ? 'text' : 'password'}
                      value={selected.apiKey || ''}
                      onChange={e => handleUpdate(selectedRef, { apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="flex-1 bg-transparent border border-claude-border rounded-[8px] px-3 py-2 text-[14px] text-claude-text outline-none focus:border-[#387ee0]/60 transition-colors placeholder:text-claude-textSecondary/40 font-mono"
                    />
                    <button
                      onClick={() => setShowKeyMap(prev => ({ ...prev, [selectedRef]: !prev[selectedRef] }))}
                      className="p-2 text-claude-textSecondary hover:text-claude-text transition-colors rounded-lg hover:bg-claude-hover"
                    >
                      {showKeyMap[selectedRef] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Base URL */}
                <div>
                  <label className="text-[12px] text-claude-textSecondary mb-1.5 block font-medium">API 地址</label>
                  <input
                    type="text"
                    value={selected.baseUrl || ''}
                    onChange={e => {
                      const newUrl = e.target.value;
                      const det = detectProvider(newUrl);
                      const patch: Partial<Provider> = { baseUrl: newUrl };
                      if (det && det.format !== selected.format) patch.format = det.format;
                      // URL change invalidates any previous test result — user must retest
                      patch.supportsWebSearch = false;
                      patch.webSearchStrategy = null;
                      patch.webSearchTestedAt = undefined;
                      handleUpdate(selectedRef, patch);
                    }}
                    className="w-full bg-transparent border border-claude-border rounded-[8px] px-3 py-2 text-[14px] text-claude-text outline-none focus:border-[#387ee0]/60 transition-colors placeholder:text-claude-textSecondary/40 font-mono"
                  />
                </div>

                {/* Format */}
                <div>
                  <label className="text-[12px] text-claude-textSecondary mb-1.5 block font-medium">API 格式</label>
                  <div className="flex gap-2">
                    {(['openai', 'anthropic'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => handleUpdate(selectedRef, { format: f })}
                        className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${selected.format === f
                          ? 'bg-black/[0.05] dark:bg-white/[0.1] text-claude-text border border-claude-textSecondary/50'
                          : 'border border-claude-border/40 text-claude-textSecondary hover:text-claude-text hover:border-claude-textSecondary/30'
                          }`}
                      >
                        {f === 'openai' ? 'OpenAI 兼容' : 'Anthropic'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] text-claude-textSecondary mb-1.5 block font-medium">请求协议</label>
                    {selectedUsesManagedOAuth ? (
                      <div className="px-3 py-2 rounded-[8px] border border-claude-border/60 text-[13px] text-claude-text bg-claude-hover/20">
                        {getAuthModeLabel(selected)}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(
                          selected.format === 'openai'
                            ? (['chat-completions', 'responses'] as const)
                            : selected.kind === 'gemini-like'
                              ? (['vertex-compatible'] as const)
                              : (['api-key'] as const)
                        ).map(mode => (
                          <button
                            key={mode}
                            onClick={() => handleUpdate(selectedRef, {
                              authMode: mode,
                              variant: getNextVariantForAuthMode(selected, mode),
                            })}
                            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                              selected.authMode === mode
                                ? 'bg-black/[0.05] dark:bg-white/[0.1] text-claude-text border border-claude-textSecondary/50'
                                : 'border border-claude-border/40 text-claude-textSecondary hover:text-claude-text hover:border-claude-textSecondary/30'
                            }`}
                          >
                            {mode === 'chat-completions'
                              ? 'chat/completions'
                              : mode === 'responses'
                                ? 'Responses API'
                                : mode === 'vertex-compatible'
                                  ? 'Vertex-compatible'
                                  : 'API Key'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[12px] text-claude-textSecondary mb-1.5 block font-medium">供应商变体</label>
                    <div className="px-3 py-2 rounded-[8px] border border-claude-border/60 text-[13px] text-claude-text bg-claude-hover/20">
                      {getVariantLabel(selected)}
                    </div>
                  </div>
                </div>

                {(selectedIsManagedByStorage || selectedUsesManagedOAuth) && (
                  <div className="rounded-[10px] border border-claude-border/60 bg-claude-hover/30 p-3">
                    <div className="text-[12px] font-medium text-claude-text mb-1">
                      {selectedUsesManagedOAuth ? 'OAuth 信息' : 'Provider 来源'}
                    </div>
                    <div className="text-[11px] text-claude-textSecondary leading-relaxed">
                      {selectedUsesManagedOAuth
                        ? '当前 provider 使用 cloai runtime 存储中的 OAuth 配置。桌面端不会再自行拼接 OpenAI、Gemini 或 GitHub 的 OAuth 请求格式，而是交给 cloai backend 处理。'
                        : '当前 provider 由 cloai backend 的 runtime/storage 配置托管。修改桌面端表单后，实际生效仍以后端导入结果为准。'}
                    </div>
                    {selected.oauth?.accountId && <div className="mt-2 text-[11px] text-claude-textSecondary">accountId: <span className="font-mono">{selected.oauth.accountId}</span></div>}
                    {selected.oauth?.enterpriseDomain && <div className="text-[11px] text-claude-textSecondary">enterpriseDomain: <span className="font-mono">{selected.oauth.enterpriseDomain}</span></div>}
                    {selected.oauth?.projectId && <div className="text-[11px] text-claude-textSecondary">projectId: <span className="font-mono">{selected.oauth.projectId}</span></div>}
                    {selected.oauth?.email && <div className="text-[11px] text-claude-textSecondary">email: <span className="font-mono">{selected.oauth.email}</span></div>}
                  </div>
                )}

                {/* Web search capability — determined solely by the probe result */}
                {(() => {
                  const state = webSearchTestState[selectedRef];
                  const isTesting = state === 'testing';
                  const hasTested = !!selected.webSearchTestedAt;
                  const supported = selected.supportsWebSearch === true;
                  const strategy = selected.webSearchStrategy;
                  const testedAt = selected.webSearchTestedAt ? new Date(selected.webSearchTestedAt).toLocaleString() : null;
                  return (
                    <div>
                      <label className="text-[12px] text-claude-textSecondary mb-1.5 block font-medium flex items-center gap-1.5">
                        <Globe size={12} /> 网页搜索能力
                      </label>
                      <div className={`rounded-[10px] border p-3 flex items-start gap-3 transition-colors ${
                        isTesting ? 'border-[#387ee0]/40 bg-[#387ee0]/[0.06]' :
                        supported ? 'border-[#387ee0]/40 bg-[#387ee0]/[0.04]' :
                        hasTested ? 'border-claude-border/60 bg-claude-hover/30' :
                        'border-claude-border/60'
                      }`}>
                        <div className="flex-shrink-0 mt-0.5">
                          {isTesting ? (
                            <RefreshCw size={16} className="text-[#387ee0] animate-spin" />
                          ) : supported ? (
                            <Check size={16} className="text-[#387ee0]" strokeWidth={2.5} />
                          ) : hasTested ? (
                            <X size={16} className="text-claude-textSecondary/60" />
                          ) : (
                            <Globe size={16} className="text-claude-textSecondary/50" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[12.5px] font-medium mb-0.5 ${isTesting || supported ? 'text-claude-text' : 'text-claude-textSecondary'}`}>
                            {isTesting ? '正在测试网页搜索能力...' :
                             supported ? '已验证支持网页搜索' :
                             hasTested ? '此供应商不支持网页搜索' :
                             '尚未测试'}
                          </div>
                          <div className="text-[11px] text-claude-textSecondary/80 leading-relaxed">
                            {isTesting ? '正在向供应商发送一次带 web_search 工具的探测请求（最长 45 秒）' :
                             supported ? (
                               <>
                                 策略：<span className="font-mono text-claude-text">{strategy || '—'}</span>
                                 {testedAt && <span className="ml-2 opacity-60">· {testedAt}</span>}
                               </>
                             ) :
                             hasTested ? (
                               <>
                                 {selected.webSearchTestReason || '探测未返回有效搜索结果'}
                                 <div className="mt-0.5 opacity-70">对话中模型请求的 web_search 工具会被自动剥除，不会虚假搜索</div>
                               </>
                             ) :
                             '新导入的供应商默认不启用网页搜索。点击右侧"测试"按钮验证。'}
                          </div>
                        </div>
                        <button
                          onClick={() => handleTestWebSearch(selectedRef)}
                          disabled={isTesting || !selected.apiKey || !selected.baseUrl}
                          className="flex-shrink-0 px-3 py-1.5 text-[11.5px] font-medium rounded-lg border border-claude-border/60 text-claude-textSecondary hover:text-claude-text hover:bg-claude-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isTesting ? '测试中...' : hasTested ? '重新测试' : '测试'}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Models */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[12px] text-claude-textSecondary font-medium">模型列表</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleFetchModels(selected)}
                        disabled={fetchingModels}
                        className="text-[11px] text-claude-textSecondary hover:text-claude-text transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-claude-hover"
                      >
                        <RefreshCw size={11} className={fetchingModels ? 'animate-spin' : ''} />
                        获取模型列表
                      </button>
                      <button
                        onClick={() => {
                          const models = [...(selected.models || []), { id: '', name: '', enabled: true }];
                          handleUpdate(selectedRef, { models });
                        }}
                        className="text-[11px] text-claude-textSecondary hover:text-claude-text transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-claude-hover"
                      >
                        <Plus size={11} /> 添加
                      </button>
                    </div>
                  </div>
                  <div className="space-y-0.5 pr-2 -mr-2">
                    {(selected.models || []).slice(modelPage * MODELS_PER_PAGE, (modelPage + 1) * MODELS_PER_PAGE).map((m, _pi) => {
                      const mi = modelPage * MODELS_PER_PAGE + _pi; // real index in full array
                      const hasThinking = (selected.models || []).some(x => x.id === m.id + '-thinking') || m.id.endsWith('-thinking');
                      return (
                        <div key={mi} className="flex items-center gap-2 group rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-claude-hover/50">
                          <button
                            onClick={() => {
                              const models = [...(selected.models || [])];
                              models[mi] = { ...models[mi], enabled: models[mi].enabled === false ? true : false };
                              handleUpdate(selectedRef, { models });
                            }}
                            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${m.enabled !== false ? 'bg-claude-text border-claude-text' : 'border-claude-border'
                              }`}
                          >
                            {m.enabled !== false && <Check size={10} className="text-claude-bg" strokeWidth={3} />}
                          </button>
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <input
                              type="text"
                              value={m.name || ''}
                              onChange={e => {
                                const models = [...(selected.models || [])];
                                models[mi] = { ...models[mi], name: e.target.value };
                                handleUpdate(selectedRef, { models });
                              }}
                              placeholder={m.id || '显示名称'}
                              className="w-[100px] bg-transparent text-[12.5px] text-claude-text outline-none py-0.5 placeholder:text-claude-textSecondary/30 truncate"
                            />
                            <input
                              type="text"
                              value={m.id}
                              onChange={e => {
                                const models = [...(selected.models || [])];
                                models[mi] = { ...models[mi], id: e.target.value };
                                handleUpdate(selectedRef, { models });
                              }}
                              placeholder="model-id"
                              className="flex-1 bg-transparent text-[11px] text-claude-textSecondary/50 font-mono outline-none py-0.5 placeholder:text-claude-textSecondary/25 truncate"
                            />
                          </div>
                          {hasThinking && !m.id.endsWith('-thinking') && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0" title="支持扩展思考">Thinking</span>
                          )}
                          <button
                            onClick={() => {
                              const models = (selected.models || []).filter((_, i) => i !== mi);
                              handleUpdate(selectedRef, { models });
                            }}
                            className="p-0.5 text-claude-textSecondary/0 group-hover:text-claude-textSecondary/30 hover:!text-red-400 transition-colors flex-shrink-0"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                    {(!selected.models || selected.models.length === 0) && (
                      <div className="text-[12px] text-claude-textSecondary/40 py-2">暂无模型 — 点击「获取模型列表」自动拉取，或手动添加。</div>
                    )}
                    {(selected.models || []).length > MODELS_PER_PAGE && (
                      <div className="flex items-center justify-between pt-2 mt-1 border-t border-claude-border/30">
                        <button
                          onClick={() => setModelPage(p => Math.max(0, p - 1))}
                          disabled={modelPage === 0}
                          className="text-[11px] px-2 py-1 rounded text-claude-textSecondary hover:bg-claude-hover disabled:opacity-30 disabled:cursor-default transition-colors"
                        >← 上一页</button>
                        <span className="text-[11px] text-claude-textSecondary/50">
                          {modelPage + 1} / {Math.ceil((selected.models || []).length / MODELS_PER_PAGE)}
                        </span>
                        <button
                          onClick={() => setModelPage(p => Math.min(Math.ceil((selected.models || []).length / MODELS_PER_PAGE) - 1, p + 1))}
                          disabled={modelPage >= Math.ceil((selected.models || []).length / MODELS_PER_PAGE) - 1}
                          className="text-[11px] px-2 py-1 rounded text-claude-textSecondary hover:bg-claude-hover disabled:opacity-30 disabled:cursor-default transition-colors"
                        >下一页 →</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Default model display */}
                {defaultModel && (
                  <div className="text-[11px] text-claude-textSecondary/50 flex items-center gap-1.5 pt-1">
                    <span>默认对话模型：</span>
                    <span className="text-claude-text font-medium">{
                      (() => {
                        for (const p of providerList) {
                          const m = (p.models || []).find(x => x.id === defaultModel);
                          if (m) return m.name || m.id;
                        }
                        return defaultModel;
                      })()
                    }</span>
                  </div>
                )}

              </div>
            );
          })() : !showAdd && (
            <div className="flex flex-col items-center justify-center h-full text-claude-textSecondary/40">
              <div className="text-[14px] mb-2">还没有配置供应商</div>
              <button
                onClick={() => setShowAdd(true)}
                className="text-[13px] text-claude-textSecondary hover:text-claude-text transition-colors"
              >
                + 添加第一个供应商
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Provider Add Dialog */}
      {showAdd && (
        <ProviderAddDialog
          onClose={() => setShowAdd(false)}
          onSuccess={async (provider) => {
            setProviderList(prev => [...prev, provider]);
            const providerRef = getProviderRef(provider);
            setSelectedProviderRef(providerRef);
            setShowAdd(false);
            // Auto-test web search capability
            setTimeout(() => { handleTestWebSearch(providerRef); }, 300);
          }}
        />
      )}
    </div>
  );
};

export default ProviderSettings;
