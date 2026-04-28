import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown as SmallChevronDown, Code2, Folder } from 'lucide-react';
import { getProviderModels, getUserModels } from '../../api';
import ModelSelector, { type SelectableModel } from '../../components/ModelSelector';
import StarterIdeasAccordion, { type StarterIdeasExtraPanel } from '../../components/StarterIdeasAccordion';
import { isDesktopApp, selectDesktopDirectory } from '../../desktop';
import type { CodeLaunchPayload } from '../types';
import { CODE_MODE_BASICS, CODE_STARTER_SECTIONS } from './codeStarterContent';
import { getStoredModelId, rememberDefaultModel } from '../../utils/providerIdentity';
import { isThinkingModel, stripThinking, withThinking } from '../../components/shared/utils/modelUtils';
import { safeGetStorageItem, safeParseStorageJson } from '../../utils/safeStorage';

const CODE_EXTRA_PANELS: StarterIdeasExtraPanel[] = [
  {
    id: 'code-mode-basics',
    label: 'Code mode basics',
    content: (
      <div className="overflow-hidden rounded-b-[16px] bg-white dark:bg-claude-input">
        <div className="grid gap-0 md:grid-cols-3">
          {CODE_MODE_BASICS.map(([title, copy], index) => (
            <div
              key={title}
              className={`px-5 py-4 ${index < 2 ? 'border-b border-claude-border md:border-b-0 md:border-r' : ''} md:border-claude-border`}
            >
              <div className="text-[14px] font-medium text-claude-text">{title}</div>
              <div className="mt-1 text-[13px] leading-5 text-claude-textSecondary">{copy}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

const TIER_DESCRIPTIONS: Record<string, string> = {
  opus: 'Most capable for ambitious work',
  sonnet: 'Most efficient for everyday tasks',
  haiku: 'Fastest for quick answers',
};

const readConfiguredChatModels = (): SelectableModel[] => {
  try {
    const chatModels = safeParseStorageJson<any[]>('chat_models', []);
    if (!Array.isArray(chatModels)) return [];

    return chatModels
      .map((model: any) => {
        const id = getStoredModelId(model);
        if (!id) return null;
        const tier = model.tier || 'extra';
        return {
          id,
          name: model.name || model.id || id,
          enabled: model.enabled === false ? 0 : 1,
          tier,
          description: model.description || TIER_DESCRIPTIONS[tier],
        } as SelectableModel;
      })
      .filter(Boolean) as SelectableModel[];
  } catch {
    return [];
  }
};

const dedupeModels = (models: SelectableModel[]) => {
  const seen = new Set<string>();
  const deduped: SelectableModel[] = [];

  for (const model of models) {
    if (!model?.id || seen.has(model.id)) continue;
    seen.add(model.id);
    deduped.push(model);
  }

  return deduped;
};

const CodePage = ({
  onStart,
}: {
  onStart: (payload: CodeLaunchPayload) => void;
}) => {
  const [folderPath, setFolderPath] = useState('');
  const [draft, setDraft] = useState('');
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState('');
  const [modelOptions, setModelOptions] = useState<SelectableModel[]>([
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet', enabled: 1, description: 'Balanced for everyday work' }
  ]);
  const [currentModelString, setCurrentModelString] = useState(() => safeGetStorageItem('default_model', 'claude-sonnet-4-6'));
  const [isAnimatingIn, setIsAnimatingIn] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentModelRef = useRef(currentModelString);

  const selectedFolderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || 'Choose folder';
  const canStart = folderPath.trim().length > 0 && draft.trim().length > 0;

  // 快速入场动画
  useEffect(() => {
    const timer = setTimeout(() => setIsAnimatingIn(false), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    currentModelRef.current = currentModelString;
  }, [currentModelString]);

  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
    ta.style.overflowY = ta.scrollHeight > 300 ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [draft, adjustTextareaHeight]);

  useEffect(() => {
    let cancelled = false;

    const applyModelOptions = (options: SelectableModel[]) => {
      if (cancelled || options.length === 0) return;

      setModelOptions(options);

      const selected = currentModelRef.current;
      const resolveKnownModel = (modelId?: string | null) => {
        const normalized = String(modelId || '').trim();
        if (!normalized) return '';
        const base = stripThinking(normalized);
        const found = options.find((model) => model.id === base && Number(model.enabled) === 1);
        return found ? withThinking(found.id, isThinkingModel(normalized)) : '';
      };

      if (!resolveKnownModel(selected)) {
        const storedDefault = safeGetStorageItem('default_model');
        const fallback = resolveKnownModel(storedDefault)
          || options.find((model) => Number(model.enabled) === 1)?.id
          || options[0].id;

        if (fallback && fallback !== selected) {
          currentModelRef.current = fallback;
          setCurrentModelString(fallback);
        }
      }
    };

    const loadModels = async () => {
      try {
        const configuredModels = readConfiguredChatModels();
        if (configuredModels.length > 0) {
          applyModelOptions(dedupeModels(configuredModels));
          return;
        }

        const providerModelsPromise = getProviderModels().catch(() => []);
        const userModelsPromise = isDesktopApp()
          ? Promise.resolve({ all: [] })
          : getUserModels().catch(() => ({ all: [] }));
        const [userModels, providerModels] = await Promise.all([userModelsPromise, providerModelsPromise]);

        const normalizedUserModels = Array.isArray(userModels?.all)
          ? userModels.all.map((model: any) => ({
              id: model.id,
              name: model.name || model.id,
              enabled: Number(model.enabled ?? 1),
            }))
          : [];
        const normalizedProviderModels = Array.isArray(providerModels)
          ? providerModels.map((model: any) => ({
              id: getStoredModelId(model),
              name: model.name || model.id,
              enabled: 1,
            }))
          : [];

        const deduped = dedupeModels([...normalizedUserModels, ...normalizedProviderModels]);

        applyModelOptions(deduped.map((model) => ({
          id: model.id,
          name: model.name,
          enabled: Number(model.enabled ?? 1),
          description: model.description,
          tier: model.tier,
        })));
      } catch (_) {}
    };

    loadModels();
    return () => { cancelled = true; };
  }, []);

  const handlePickFolder = async () => {
    setIsPicking(true);
    setError('');
    try {
      const picked = await selectDesktopDirectory();
      if (picked) setFolderPath(picked);
    } catch (err: any) {
      setError(err?.message || 'Failed to choose folder');
    } finally {
      setIsPicking(false);
    }
  };

  const handleSubmit = () => {
    if (!canStart) return;
    const model = currentModelRef.current || currentModelString;
    rememberDefaultModel(model);
    onStart({
      folderPath: folderPath.trim(),
      prompt: draft.trim(),
      model: model || undefined,
    });
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg chat-font-scope">
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-6 pb-16 pt-[112px]">
        {/* 标题区域 - 快速入场动画 */}
        <div
          className={`mb-[14px] flex min-h-[44px] w-[672px] items-center justify-center gap-[12px] transition-all duration-150 ease-out ${
            isAnimatingIn ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="flex h-[32px] w-[32px] items-center justify-center shrink-0 text-claude-accent transition-transform duration-500 hover:scale-110 hover:rotate-12">
            <Code2 size={28} strokeWidth={1.8} />
          </div>
          <h1
            className="whitespace-nowrap text-[#373734] dark:!text-[#d6cec3]"
            style={{
              fontFamily: '"Anthropic Serif", "Source Serif 4", "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
              fontSize: '36px',
              fontStyle: 'normal',
              fontWeight: 400,
              lineHeight: '48px',
            }}
          >
            Build directly in your project
          </h1>
        </div>

        {/* 副标题 - 快速动画 */}
        <div
          className={`mb-5 text-[12.5px] font-medium text-claude-textSecondary transition-all duration-150 ease-out ${
            isAnimatingIn ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ transitionDelay: '50ms' }}
        >
          Code stays in its own mode and keeps your workspace attached.
        </div>

        {/* 错误提示 - 快速动画 */}
        {error ? (
          <div className="mb-4 w-[672px] rounded-[16px] border border-[#e5b0a1] bg-[#fff1ec] px-4 py-3 text-[13px] text-[#a0452e] dark:border-[#8A4C3A] dark:bg-[#3A2620] dark:text-[#F3B29D] animate-in fade-in slide-in-from-top-2 duration-200">
            {error}
          </div>
        ) : null}

        {/* 输入框容器 - 快速动画和交互 */}
        <div
          className={`relative z-20 w-[672px] transition-all duration-150 ease-out ${
            isAnimatingIn ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}
          style={{ transitionDelay: '100ms' }}
        >
          <div className="w-[672px] rounded-[24px] border border-transparent bg-white shadow-[0px_4px_20px_rgba(0,0,0,0.04)] transition-all duration-300 focus-within:border-[#d9d7d0] focus-within:shadow-[0px_6px_24px_rgba(0,0,0,0.08)] focus-within:-translate-y-1 hover:shadow-[0px_5px_22px_rgba(0,0,0,0.06)] dark:bg-claude-input dark:focus-within:border-claude-border">
            <div className="flex flex-col px-[15px] py-[15px]">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="relative min-h-[48px]">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      adjustTextareaHeight();
                    }}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="Describe what you want Claude to change, build, or debug in this folder"
                    className="w-full resize-none overflow-hidden bg-transparent px-[6px] pb-0 pt-[4px] text-[16px] leading-[24px] tracking-[-0.3125px] text-[#373734] outline-none placeholder:text-[#7b7974] dark:text-claude-text dark:placeholder:text-[#7b7974] transition-all duration-200"
                    style={{ minHeight: '48px' }}
                  />
                </div>
              </div>
              <div className="mt-[12px] flex min-h-[32px] items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    disabled={isPicking}
                    className="flex h-[32px] max-w-[220px] items-center gap-[8px] rounded-[10px] bg-[#f6f3ee] px-[10px] text-[13px] font-normal tracking-[-0.1504px] text-[#4B4843] transition-all duration-200 hover:bg-[#f0ebe3] hover:shadow-sm hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#201d19] dark:text-[#D7D0C4] dark:hover:bg-[#28241f] active:scale-95"
                  >
                    <Folder size={16} strokeWidth={1.8} className={`transition-transform duration-200 ${isPicking ? 'animate-pulse' : ''}`} />
                    <span className="truncate">{isPicking ? 'Choosing…' : selectedFolderName}</span>
                  </button>
                </div>
                <div className="flex items-center gap-[8px]">
                  <ModelSelector
                    currentModelString={currentModelString}
                    models={modelOptions}
                    onModelChange={(model) => {
                      currentModelRef.current = model;
                      setCurrentModelString(model);
                      rememberDefaultModel(model);
                    }}
                    isNewChat={true}
                    variant="landing"
                  />
                  <button
                    type="button"
                    className="flex h-[32px] items-center gap-[6px] rounded-[8px] px-[10px] text-[14px] font-normal tracking-[-0.1504px] text-[#373734] transition-all duration-200 hover:bg-[#f5f4f1] hover:shadow-sm dark:text-claude-text dark:hover:bg-white/5 active:scale-95"
                  >
                    <Code2 size={15} className="transition-transform duration-200 group-hover:rotate-6" />
                    <span>Plan</span>
                    <SmallChevronDown size={14} className="transition-transform duration-200 group-hover:translate-y-0.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!canStart}
                    onClick={handleSubmit}
                    className={`flex h-[32px] w-[40px] items-center justify-center rounded-[8px] text-white transition-all duration-200 active:scale-95 ${
                      canStart
                        ? 'bg-[#2b2926] hover:bg-[#1f1d1a] hover:shadow-md hover:-translate-y-0.5 dark:bg-[#f2eee7] dark:text-[#1f1d1a] dark:hover:bg-[#e5ddd2]'
                        : 'bg-[#efcbc0] disabled:cursor-not-allowed disabled:opacity-40'
                    }`}
                  >
                    <ArrowUp size={18} strokeWidth={2.3} className="transition-transform duration-200 group-hover:-translate-y-0.5" />
                  </button>
                </div>
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-3 border-t border-[rgba(31,31,30,0.08)] pt-[10px] text-[12px] text-claude-textSecondary dark:border-white/5 transition-colors">
                <div className="min-w-0 truncate">
                  Workspace: {folderPath || 'Choose workspace'}
                </div>
                <div className="shrink-0 text-[11.5px] text-claude-textSecondary/80">
                  Code mode keeps this folder attached after send
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Starter Ideas - 快速入场动画 */}
        <div
          className={`relative z-0 transition-all duration-150 ease-out ${
            isAnimatingIn ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}
          style={{ transitionDelay: '150ms' }}
        >
          <StarterIdeasAccordion
            sections={CODE_STARTER_SECTIONS}
            onSelectPrompt={setDraft}
            extraPanels={CODE_EXTRA_PANELS}
            className="mt-4 w-[672px]"
          />
        </div>
      </div>
    </div>
  );
};

export default CodePage;
