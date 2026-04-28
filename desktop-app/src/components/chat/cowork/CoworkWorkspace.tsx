import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Check,
  ChevronRight,
  Code2,
  FileText,
  Lightbulb,
  Paperclip,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  createProject,
  deleteAttachment,
  getProjects,
  getProviderModels,
  getProviders,
  getSkills,
  getUserModels,
  type Project,
  type Provider,
  type Skill,
  uploadFile,
  uploadFilePath,
} from '@/src/services';
import { IconCoworkSparkle, IconPlus, IconProjects, IconResearch, IconWebSearch } from '@/src/components/Icons';
import SkillInputOverlay from '@/src/components/SkillInputOverlay';
import SkillTag from '@/src/components/SkillTag';
import { UnifiedLandingLayout, UnifiedInputContainer } from '@/src/components/UnifiedComponents';
import type { SelectableModel } from '@/src/components/ModelSelector';
import StarterIdeasAccordion from '@/src/components/StarterIdeasAccordion';
import { isDesktopApp, selectDesktopFile } from '@/src/desktop';
import { getStoredModelId, rememberDefaultModel } from '@/src/utils/providerIdentity';
import { isThinkingModel, stripThinking, withThinking } from '@/src/components/shared/utils/modelUtils';

type CoworkAttachment = {
  fileId: string;
  fileName: string;
  fileType?: 'image' | 'document' | 'text';
  mimeType: string;
  size: number;
};

interface LocalAttachment extends CoworkAttachment {
  id: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

export interface CoworkLaunchPayload {
  prompt: string;
  model?: string;
  projectId?: string | null;
  researchMode?: boolean;
  attachments?: CoworkAttachment[];
}

interface CoworkPageProps {
  onStartTask: (payload: CoworkLaunchPayload) => void;
  modelOptions?: SelectableModel[];
  currentModelString?: string;
  onModelChange?: (model: string) => void;
}

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/jpg,image/gif,image/webp,application/pdf,.docx,.xlsx,.pptx,.odt,.rtf,.epub,.txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.h,.cs,.go,.rs,.rb,.php,.swift,.kt,.scala,.html,.css,.scss,.less,.sql,.sh,.bash,.vue,.svelte,.lua,.r,.m,.pl,.ex,.exs';

const STARTER_TASK_SECTIONS = [
  {
    id: 'coding',
    label: 'Coding',
    items: [
      {
        id: 'build-feature',
        title: 'Build a feature',
        description: 'Scope the work, identify tradeoffs, and plan an implementation path.',
        prompt: 'Help me build a new feature for my project',
        icon: Code2,
      },
      {
        id: 'debug-issue',
        title: 'Debug an issue',
        description: 'Reason through symptoms, likely causes, and a focused debugging plan.',
        prompt: 'Help me debug an issue in my code',
        icon: Search,
      },
      {
        id: 'refactor-code',
        title: 'Refactor code',
        description: 'Improve structure while preserving behavior and avoiding risky churn.',
        prompt: 'Help me refactor and improve my code',
        icon: Sparkles,
      },
      {
        id: 'write-tests',
        title: 'Write tests',
        description: 'Design coverage for edge cases, regressions, and important flows.',
        prompt: 'Help me write tests for my code',
        icon: FileText,
      },
    ],
  },
  {
    id: 'research',
    label: 'Research',
    items: [
      {
        id: 'explore-topic',
        title: 'Explore a topic',
        description: 'Break down a technical topic into clear concepts and next steps.',
        prompt: 'Help me research and understand a technical topic',
        icon: Brain,
      },
      {
        id: 'compare-options',
        title: 'Compare options',
        description: 'Evaluate approaches with pros, cons, risks, and recommendation criteria.',
        prompt: 'Help me compare different technical approaches',
        icon: Search,
      },
      {
        id: 'find-resources',
        title: 'Find resources',
        description: 'Identify docs, examples, and references worth reading first.',
        prompt: 'Help me find relevant documentation and resources',
        icon: Lightbulb,
      },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    items: [
      {
        id: 'design-architecture',
        title: 'Design architecture',
        description: 'Map the components, boundaries, and data flow for a new system.',
        prompt: 'Help me design the architecture for a new system',
        icon: Brain,
      },
      {
        id: 'plan-implementation',
        title: 'Plan implementation',
        description: 'Turn a goal into milestones, sequencing, and concrete deliverables.',
        prompt: 'Help me plan the implementation of a feature',
        icon: FileText,
      },
      {
        id: 'review-approach',
        title: 'Review approach',
        description: 'Stress-test a proposal for gaps, risks, and better alternatives.',
        prompt: 'Help me review my technical approach',
        icon: Lightbulb,
      },
    ],
  },
];

const COWORK_EXTRA_PANELS = [
  {
    id: 'about-cowork',
    label: 'About Cowork',
    content: (
      <div className="space-y-3 px-[16px] pb-[14px] text-[13px] leading-relaxed text-claude-textSecondary">
        <p>
          Cowork is a collaborative mode where Claude works alongside you without needing access to your files.
          Perfect for brainstorming, research, and planning.
        </p>
        <p className="text-[12px] opacity-80">
          Unlike Code mode, Cowork doesn&apos;t require a workspace folder and won&apos;t modify your files directly.
        </p>
      </div>
    ),
  },
];

const landingPlusMenuShellClass = 'absolute left-0 top-full mt-2 z-[140] w-[218px] rounded-[12px] border border-[rgba(31,31,30,0.3)] bg-white px-[7px] pb-px pt-[7px] shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:border-white/15 dark:bg-claude-input';
const landingPlusMenuItemClass = 'flex h-[32px] w-full items-center gap-[8px] rounded-[8px] px-[8px] py-[6px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5';
const landingPlusMenuTextClass = 'text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text';
const landingPlusMenuSubmenuClass = 'absolute left-full top-0 ml-2 z-[150] w-[218px] max-h-[30vh] overflow-y-auto rounded-[12px] border border-[rgba(31,31,30,0.3)] bg-white px-[7px] pb-px pt-[7px] shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:border-white/15 dark:bg-claude-input';

const EMPTY_MODEL_OPTIONS: SelectableModel[] = [];
const noopModelChange = () => {};

const CoworkPage: React.FC<CoworkPageProps> = ({
  onStartTask,
  modelOptions = EMPTY_MODEL_OPTIONS,
  currentModelString = '',
  onModelChange = noopModelChange,
}) => {
  const [draft, setDraft] = useState('');
  const [selectedModel, setSelectedModel] = useState(currentModelString);
  const [resolvedModelOptions, setResolvedModelOptions] = useState<SelectableModel[]>(modelOptions);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showSkillsSubmenu, setShowSkillsSubmenu] = useState(false);
  const [showProjectsSubmenu, setShowProjectsSubmenu] = useState(false);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [enabledSkills, setEnabledSkills] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [selectedSkill, setSelectedSkill] = useState<{ name: string; slug: string; description?: string } | null>(null);
  const [researchMode, setResearchMode] = useState(false);
  const [providersCache, setProvidersCache] = useState<Provider[]>([]);
  const [webSearchToast, setWebSearchToast] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const selectedModelRef = useRef(selectedModel);

  const isUploading = attachments.some((attachment) => attachment.status === 'uploading');
  const doneAttachments = attachments.filter((attachment) => attachment.status === 'done' && attachment.fileId);
  const canStart = (draft.trim().length > 0 || doneAttachments.length > 0) && !isUploading;

  const currentProviderSupportsWebSearch = useMemo(() => {
    if (!providersCache.length) return false;
    const bareModel = (selectedModel || '').replace(/-thinking$/, '');
    for (const provider of providersCache) {
      if ((provider.models || []).some((model) => model.id === bareModel)) {
        return provider.supportsWebSearch === true;
      }
    }
    return false;
  }, [providersCache, selectedModel]);

  const closePlusMenu = useCallback(() => {
    setShowPlusMenu(false);
    setShowSkillsSubmenu(false);
    setShowProjectsSubmenu(false);
  }, []);

  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
    ta.style.overflowY = ta.scrollHeight > 300 ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight, draft]);

  useEffect(() => {
    getProviders().then(setProvidersCache).catch(() => {});
  }, []);

  useEffect(() => {
    if (!webSearchToast) return;
    const timer = setTimeout(() => setWebSearchToast(null), 2800);
    return () => clearTimeout(timer);
  }, [webSearchToast]);

  useEffect(() => {
    if (!showPlusMenu) {
      setShowSkillsSubmenu(false);
      setShowProjectsSubmenu(false);
      return;
    }

    getSkills().then((data) => {
      const all = [...(data.examples || []), ...(data.my_skills || [])];
      setEnabledSkills(all.filter((skill: Skill) => skill.enabled).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
      })));
    }).catch(() => {});

    getProjects().then((data: Project[]) => {
      setProjectList((data || []).filter((project) => !project.is_archived));
    }).catch(() => {});
  }, [showPlusMenu]);

  useEffect(() => {
    if (!showPlusMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideMenu = plusMenuRef.current && plusMenuRef.current.contains(target);
      const insideButton = plusButtonRef.current && plusButtonRef.current.contains(target);
      if (!insideMenu && !insideButton) {
        closePlusMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closePlusMenu, showPlusMenu]);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      if (modelOptions.length > 0) {
        setResolvedModelOptions(modelOptions);
        return;
      }

      try {
        const [userModels, providerModels] = await Promise.all([
          getUserModels().catch(() => ({ all: [] })),
          getProviderModels().catch(() => []),
        ]);

        if (cancelled) return;

        const normalizedUserModels = Array.isArray(userModels?.all)
          ? userModels.all.map((model: any) => ({ id: model.id, name: model.name || model.id }))
          : [];
        const normalizedProviderModels = Array.isArray(providerModels)
          ? providerModels.map((model: any) => ({
              id: getStoredModelId(model),
              name: model.name || model.id,
            }))
          : [];

        const deduped = [...normalizedUserModels, ...normalizedProviderModels].filter((item, index, arr) =>
          item.id && arr.findIndex((candidate) => candidate.id === item.id) === index
        );

        if (deduped.length === 0) return;

        const nextOptions = deduped.map((model) => ({
          id: model.id,
          name: model.name,
          enabled: 1,
          description: undefined,
        }));

        setResolvedModelOptions(nextOptions);

        const resolveKnownModel = (modelId?: string | null) => {
          const normalized = String(modelId || '').trim();
          if (!normalized) return '';
          const base = stripThinking(normalized);
          const found = deduped.find((model) => model.id === base);
          return found ? withThinking(found.id, isThinkingModel(normalized)) : '';
        };

        if (!resolveKnownModel(selectedModel)) {
          const storedDefault = localStorage.getItem('default_model');
          const fallback = resolveKnownModel(storedDefault) || deduped[0].id;
          selectedModelRef.current = fallback;
          setSelectedModel(fallback);
          onModelChange(fallback);
        }
      } catch {}
    };

    loadModels();
    return () => { cancelled = true; };
  }, [modelOptions, onModelChange, selectedModel]);

  const handleModelChange = (model: string) => {
    selectedModelRef.current = model;
    setSelectedModel(model);
    rememberDefaultModel(model);
    onModelChange(model);
  };

  useEffect(() => {
    selectedModelRef.current = currentModelString;
    setSelectedModel(currentModelString);
  }, [currentModelString]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const allowed = Array.from(files).slice(0, Math.max(0, 20 - attachments.length));

    for (const file of allowed) {
      const id = Math.random().toString(36).slice(2);
      const initialAttachment: LocalAttachment = {
        id,
        fileId: '',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        progress: 0,
        status: 'uploading',
      };

      setAttachments((prev) => [...prev, initialAttachment]);

      uploadFile(file, (percent) => {
        setAttachments((prev) => prev.map((item) => item.id === id ? { ...item, progress: percent } : item));
      }).then((result) => {
        setAttachments((prev) => prev.map((item) => item.id === id ? {
          ...item,
          fileId: result.fileId,
          fileType: result.fileType,
          status: 'done' as const,
          progress: 100,
        } : item));
      }).catch((err) => {
        setAttachments((prev) => prev.map((item) => item.id === id ? {
          ...item,
          status: 'error' as const,
          error: err?.message || 'Upload failed',
        } : item));
      });
    }
  };

  const handleNativeFileSelected = async () => {
    const filePath = await selectDesktopFile();
    if (!filePath) return;

    const id = Math.random().toString(36).slice(2);
    const fileName = filePath.split(/[\\/]/).pop() || 'file';
    const initialAttachment: LocalAttachment = {
      id,
      fileId: '',
      fileName,
      mimeType: 'application/octet-stream',
      size: 0,
      progress: 0,
      status: 'uploading',
    };

    setAttachments((prev) => [...prev, initialAttachment]);

    uploadFilePath(filePath, (percent) => {
      setAttachments((prev) => prev.map((item) => item.id === id ? { ...item, progress: percent } : item));
    }).then((result) => {
      setAttachments((prev) => prev.map((item) => item.id === id ? {
        ...item,
        fileId: result.fileId,
        fileName: result.fileName,
        fileType: result.fileType,
        mimeType: result.mimeType,
        size: result.size,
        status: 'done' as const,
        progress: 100,
      } : item));
    }).catch((err) => {
      setAttachments((prev) => prev.map((item) => item.id === id ? {
        ...item,
        status: 'error' as const,
        error: err?.message || 'Upload failed',
      } : item));
    });
  };

  const openFilePicker = () => {
    if (isDesktopApp()) {
      void handleNativeFileSelected();
      return;
    }
    fileInputRef.current?.click();
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((item) => item.id === id);
      if (attachment?.fileId) {
        deleteAttachment(attachment.fileId).catch(() => {});
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleAttachToProject = (project: Project) => {
    setPendingProjectId(project.id);
    closePlusMenu();
  };

  const handleCreateProjectFromMenu = async () => {
    const name = newProjectName.trim();
    if (!name) return;

    try {
      const project = await createProject(name, newProjectDescription.trim());
      setProjectList((prev) => [project, ...prev]);
      setPendingProjectId(project.id);
      setShowNewProjectDialog(false);
      setNewProjectName('');
      setNewProjectDescription('');
    } catch (err) {
      console.error('Failed to create project', err);
    }
  };

  const handleSubmit = () => {
    if (!canStart) return;
    const model = selectedModelRef.current || selectedModel;
    rememberDefaultModel(model);
    onStartTask({
      prompt: draft.trim(),
      model: model || undefined,
      projectId: pendingProjectId,
      researchMode,
      attachments: doneAttachments.map(({ fileId, fileName, fileType, mimeType, size }) => ({
        fileId,
        fileName,
        fileType,
        mimeType,
        size,
      })),
    });
  };

  const handleSelectPrompt = (prompt: string) => {
    setDraft(prompt);
    requestAnimationFrame(() => {
      adjustTextareaHeight();
      textareaRef.current?.focus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && selectedSkill) {
      const pos = (e.target as HTMLTextAreaElement).selectionStart;
      const skillPrefix = `/${selectedSkill.slug} `;
      if (pos > 0 && pos <= skillPrefix.length && draft.startsWith(skillPrefix.slice(0, pos))) {
        e.preventDefault();
        setDraft(draft.slice(skillPrefix.length));
        setSelectedSkill(null);
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const renderSkillInputOverlay = () => {
    if (!selectedSkill) return null;
    return (
      <SkillInputOverlay
        text={draft}
        className="pointer-events-none absolute left-0 right-0 top-0 pl-[6px] pr-0 pt-[4px] pb-0 text-[16px] leading-[24px] tracking-[-0.3125px]"
      />
    );
  };

  const renderLandingPlusMenu = () => showPlusMenu ? (
    <div ref={plusMenuRef} className={landingPlusMenuShellClass}>
      <button
        type="button"
        onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
        onClick={() => { closePlusMenu(); openFilePicker(); }}
        className={landingPlusMenuItemClass}
      >
        <Paperclip size={16} className="shrink-0 text-[#7B7974] dark:text-claude-textSecondary" />
        <span className={landingPlusMenuTextClass}>Add files or photos</span>
      </button>
      <button
        type="button"
        onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
        onClick={closePlusMenu}
        className={landingPlusMenuItemClass}
      >
        <FileText size={16} className="shrink-0 text-[#7B7974] dark:text-claude-textSecondary" />
        <span className={landingPlusMenuTextClass}>Take a screenshot</span>
      </button>
      <div className="relative" onMouseLeave={() => setShowProjectsSubmenu(false)}>
        <button
          type="button"
          onMouseEnter={() => { setShowProjectsSubmenu(true); setShowSkillsSubmenu(false); }}
          onClick={() => setShowProjectsSubmenu((prev) => !prev)}
          className={`${landingPlusMenuItemClass} justify-between`}
        >
          <div className="flex items-center gap-[8px]">
            <IconProjects size={18} className="shrink-0 text-[#7B7974] dark:text-claude-textSecondary" />
            <span className={landingPlusMenuTextClass}>Add to project</span>
          </div>
          <ChevronRight size={16} className="shrink-0 text-[#7B7974] dark:text-claude-textSecondary" />
        </button>
        {showProjectsSubmenu && (
          <div className={landingPlusMenuSubmenuClass}>
            {projectList.length > 0 ? projectList.map((project) => {
              const isSelected = pendingProjectId === project.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleAttachToProject(project)}
                  className="flex h-[32px] w-full items-center justify-between gap-2 rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <IconProjects size={18} className="shrink-0 text-claude-textSecondary" />
                    <span className="truncate text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">
                      {project.name}
                    </span>
                  </div>
                  {isSelected ? <Check size={14} className="shrink-0 text-[#2977D6]" /> : null}
                </button>
              );
            }) : (
              <div className="px-[8px] py-[6px] text-[13px] italic text-[#7B7974] dark:text-claude-textSecondary">No projects yet</div>
            )}
            <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
            <button
              type="button"
              onClick={() => {
                setShowProjectsSubmenu(false);
                closePlusMenu();
                setNewProjectName('');
                setNewProjectDescription('');
                setShowNewProjectDialog(true);
              }}
              className="flex h-[32px] w-full items-center gap-[8px] rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
            >
              <IconPlus size={16} className="shrink-0 text-[#7B7974] dark:text-claude-textSecondary" />
              <span className="text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">Start a new project</span>
            </button>
          </div>
        )}
      </div>
      <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
      <div className="relative" onMouseLeave={() => setShowSkillsSubmenu(false)}>
        <button
          type="button"
          onMouseEnter={() => { setShowSkillsSubmenu(true); setShowProjectsSubmenu(false); }}
          onClick={() => setShowSkillsSubmenu((prev) => !prev)}
          className={`${landingPlusMenuItemClass} justify-between`}
        >
          <div className="flex items-center gap-[8px]">
            <Sparkles size={16} className="shrink-0 text-[#7B7974] dark:text-claude-textSecondary" />
            <span className={landingPlusMenuTextClass}>Skills</span>
          </div>
          <ChevronRight size={16} className="shrink-0 text-[#7B7974] dark:text-claude-textSecondary" />
        </button>
        {showSkillsSubmenu && (
          <div className={landingPlusMenuSubmenuClass}>
            {enabledSkills.length > 0 ? enabledSkills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => {
                  closePlusMenu();
                  const slug = skill.name.toLowerCase().replace(/\s+/g, '-');
                  setSelectedSkill({ name: skill.name, slug, description: skill.description });
                  setDraft((prev) => prev ? `/${slug} ${prev}` : `/${slug} `);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                className="flex h-[32px] w-full items-center rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
              >
                <span className="truncate text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">{skill.name}</span>
              </button>
            )) : (
              <div className="px-[8px] py-[6px] text-[13px] italic text-[#7B7974] dark:text-claude-textSecondary">No skills enabled</div>
            )}
            <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
            <button
              type="button"
              onClick={closePlusMenu}
              className="flex h-[32px] w-full items-center gap-[8px] rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
            >
              <Sparkles size={16} className="shrink-0 text-[#7B7974] dark:text-claude-textSecondary" />
              <span className="text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">Manage skills</span>
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
        onClick={closePlusMenu}
        className={landingPlusMenuItemClass}
      >
        <FileText size={16} className="shrink-0 text-[#7B7974] dark:text-claude-textSecondary" />
        <span className={landingPlusMenuTextClass}>Add connectors</span>
      </button>
      <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
      <button
        type="button"
        onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
        onClick={() => {
          if (currentProviderSupportsWebSearch) {
            closePlusMenu();
          } else {
            setWebSearchToast('当前模型的供应商不支持网页搜索');
            closePlusMenu();
          }
        }}
        className={`${landingPlusMenuItemClass} justify-between`}
      >
        <div className="flex items-center gap-[8px]">
          <IconWebSearch size={16} className={currentProviderSupportsWebSearch ? 'text-[#2E7CF6]' : 'text-[#7B7974] dark:text-claude-textSecondary'} />
          <span className={`text-[14px] leading-[20px] tracking-[-0.1504px] ${currentProviderSupportsWebSearch ? 'text-[#2977D6] dark:text-[#3B8BE5]' : 'text-[#121212] dark:text-claude-text'}`}>
            Web search
          </span>
        </div>
        {currentProviderSupportsWebSearch ? <Check size={14} className="shrink-0 text-[#2977D6]" /> : null}
      </button>
      <button
        type="button"
        onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
        onClick={() => {
          setResearchMode((prev) => !prev);
          closePlusMenu();
        }}
        className={`${landingPlusMenuItemClass} justify-between`}
      >
        <div className="flex items-center gap-[8px]">
          <IconResearch size={16} className={researchMode ? 'text-[#2E7CF6]' : 'text-[#7B7974] dark:text-claude-textSecondary'} />
          <span className={researchMode ? 'text-[14px] font-medium leading-[20px] tracking-[-0.1504px] text-[#2E7CF6]' : landingPlusMenuTextClass}>Research</span>
        </div>
        {researchMode ? <Check size={14} className="shrink-0 text-[#2E7CF6]" /> : null}
      </button>
    </div>
  ) : null;

  const selectedProjectName = pendingProjectId
    ? projectList.find((project) => project.id === pendingProjectId)?.name || 'Selected project'
    : null;

  return (
    <UnifiedLandingLayout
      title="Cowork with Claude"
      subtitle="Collaborate without needing to attach files or folders"
      icon={<IconCoworkSparkle size={32} />}
      starterIdeas={
        <StarterIdeasAccordion
          sections={STARTER_TASK_SECTIONS}
          onSelectPrompt={handleSelectPrompt}
          extraPanels={COWORK_EXTRA_PANELS}
        />
      }
    >
      <UnifiedInputContainer
        modelOptions={resolvedModelOptions}
        currentModel={selectedModel}
        onModelChange={handleModelChange}
        canSend={canStart}
        onSend={handleSubmit}
        bottomActions={
          <div className="relative z-[120] flex min-w-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept={ACCEPTED_TYPES}
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="relative flex items-center">
              <button
                ref={plusButtonRef}
                type="button"
                onClick={() => setShowPlusMenu((prev) => !prev)}
                className="flex h-[32px] w-[34px] items-center justify-center rounded-[8px] transition-all duration-200 hover:scale-110 hover:bg-[#f5f4f1] active:scale-95 dark:hover:bg-white/5"
                aria-label="Add context"
              >
                <IconPlus size={20} />
              </button>
              {renderLandingPlusMenu()}
            </div>

            {selectedSkill ? (
              <SkillTag slug={selectedSkill.slug} description={selectedSkill.description} />
            ) : null}

            {researchMode && (
              <div className="group/research relative flex items-center rounded-lg bg-[#DBEAFE] p-1.5 dark:bg-[#1E3A5F]">
                <IconResearch size={16} className="shrink-0 text-[#2E7CF6]" />
                <span className="inline-flex w-0 items-center overflow-hidden transition-[width] duration-150 ease-out group-hover/research:w-[18px]">
                  <button
                    type="button"
                    onClick={() => setResearchMode(false)}
                    className="ml-1 flex shrink-0 items-center justify-center transition-opacity hover:opacity-70"
                    aria-label="Disable research mode"
                  >
                    <X size={14} className="text-[#2E7CF6]" />
                  </button>
                </span>
                <div className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2a2a2a] px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover/research:opacity-100 dark:bg-[#e8e8e8] dark:text-[#1a1a1a]">
                  Research mode
                </div>
              </div>
            )}
          </div>
        }
        bottomInfo={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {selectedProjectName ? (
              <div className="flex items-center gap-1.5 rounded-[8px] border border-[rgba(31,31,30,0.12)] bg-[#f8f7f4] px-2 py-1 text-[12px] text-claude-textSecondary dark:border-white/10 dark:bg-white/5">
                <IconProjects size={12} className="shrink-0" />
                <span className="truncate max-w-[160px]">{selectedProjectName}</span>
                <button
                  type="button"
                  onClick={() => setPendingProjectId(null)}
                  className="shrink-0 rounded-full p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label="Remove selected project"
                >
                  <X size={12} />
                </button>
              </div>
            ) : null}

            {attachments.length > 0 ? attachments.map((attachment) => (
              <div
                key={attachment.id}
                className={`flex max-w-[190px] items-center gap-1.5 rounded-[8px] border px-2 py-1 text-[12px] ${
                  attachment.status === 'error'
                    ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-950/30'
                    : 'border-[rgba(31,31,30,0.12)] bg-[#f8f7f4] text-claude-textSecondary dark:border-white/10 dark:bg-white/5'
                }`}
                title={attachment.error || attachment.fileName}
              >
                <FileText size={12} className="shrink-0" />
                <span className="truncate">
                  {attachment.fileName}
                  {attachment.status === 'uploading' ? ` ${attachment.progress}%` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(attachment.id)}
                  className="shrink-0 rounded-full p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label={`Remove ${attachment.fileName}`}
                >
                  <X size={12} />
                </button>
              </div>
            )) : (
              <div className="min-w-0 truncate">
                Cowork mode stays lightweight and does not require a workspace folder.
              </div>
            )}
          </div>
        }
      >
        <div className="relative min-h-[48px]">
          {renderSkillInputOverlay()}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={selectedSkill ? `Describe what you want ${selectedSkill.name} to do...` : 'What would you like to work on together?'}
            className={`w-full resize-none overflow-hidden bg-transparent px-[6px] pb-0 pt-[4px] text-[16px] leading-[24px] tracking-[-0.3125px] outline-none transition-all duration-200 placeholder:text-[#7b7974] dark:placeholder:text-[#7b7974] ${
              draft.match(/^\/[a-zA-Z0-9_-]+/) ? 'text-transparent caret-claude-text' : 'text-[#373734] dark:text-claude-text'
            }`}
            style={{ minHeight: '48px' }}
            autoFocus
          />
        </div>
      </UnifiedInputContainer>

      {showNewProjectDialog && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
          onClick={() => {
            setShowNewProjectDialog(false);
            setNewProjectName('');
            setNewProjectDescription('');
          }}
        >
          <div
            className="w-[560px] max-w-[92vw] overflow-hidden rounded-2xl border border-claude-border bg-claude-bg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-7 pb-4 pt-6">
              <h2 className="font-[Spectral] text-[22px] text-claude-text" style={{ fontWeight: 600 }}>Create a project</h2>
              <button
                type="button"
                onClick={() => {
                  setShowNewProjectDialog(false);
                  setNewProjectName('');
                  setNewProjectDescription('');
                }}
                className="rounded-lg p-1 text-claude-textSecondary transition-colors hover:bg-claude-hover hover:text-claude-text"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-5 px-7 pb-4">
              <div>
                <label className="mb-2 block text-[15px] font-medium text-claude-textSecondary">What are you working on?</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. iOS app redesign"
                  className="w-full rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[15px] text-claude-text outline-none transition-colors placeholder:text-claude-textSecondary focus:border-claude-accent"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-2 block text-[15px] font-medium text-claude-textSecondary">Description</label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Optional context for this project"
                  className="min-h-[112px] w-full resize-none rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[15px] text-claude-text outline-none transition-colors placeholder:text-claude-textSecondary focus:border-claude-accent"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-claude-border px-7 py-5">
              <button
                type="button"
                onClick={() => {
                  setShowNewProjectDialog(false);
                  setNewProjectName('');
                  setNewProjectDescription('');
                }}
                className="rounded-xl px-4 py-2 text-[14px] text-claude-textSecondary transition-colors hover:bg-claude-hover hover:text-claude-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateProjectFromMenu}
                disabled={!newProjectName.trim()}
                className="rounded-xl bg-[#2b2926] px-4 py-2 text-[14px] text-white transition-colors hover:bg-[#1f1d1a] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#f2eee7] dark:text-[#1f1d1a] dark:hover:bg-[#e5ddd2]"
              >
                Create project
              </button>
            </div>
          </div>
        </div>
      )}

      {webSearchToast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[210] -translate-x-1/2 rounded-xl bg-[#2b2926] px-4 py-2 text-[13px] text-white shadow-lg dark:bg-[#f2eee7] dark:text-[#1f1d1a]">
          {webSearchToast}
        </div>
      )}
    </UnifiedLandingLayout>
  );
};

export default CoworkPage;
