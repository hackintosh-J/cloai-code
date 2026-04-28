import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronDown, FileText, ArrowUp, RotateCcw, Pencil, Copy, Check, Paperclip, ListCollapse, Globe, Clock, Info, Github, Plus, X, Loader2, Folder } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { IconPlus, IconVoice, IconPencil, IconProjects, IconResearch, IconWebSearch, IconCoworkSparkle } from '@/src/components/Icons';
import AssistantActivityIndicator from '@/src/components/AssistantActivityIndicator';
import { LONG_THINKING_THRESHOLD_MS } from '@/src/components/assistantActivityState';
import { getConversation, sendMessage, createConversation, getUser, updateConversation, deleteMessagesFrom, deleteMessagesTail, uploadFile, uploadFilePath, deleteAttachment, compactConversation, answerUserQuestion, getUserUsage, getAttachmentRawUrl, getAttachmentUrl, getGenerationStatus, stopGeneration, getContextSize, getUserModels, getStreamStatus, reconnectStream, getProviderModels, getSkills, warmEngine, getProjects, createProject, Project, materializeGithub, getProviders, Provider, type Skill } from '@/src/services';
import { addStreaming, removeStreaming, isStreaming } from '@/src/components/chat/streaming/streamingRegistry';
import MarkdownRenderer from '@/src/components/MarkdownRenderer';
import ResearchPanel from '@/src/components/ResearchPanel';
import ModelSelector, { SelectableModel } from '@/src/components/ModelSelector';
import FileUploadPreview, { PendingFile } from '@/src/components/FileUploadPreview';
import AddFromGithubModal, { GithubAddPayload } from '@/src/components/AddFromGithubModal';
import MessageAttachments from '@/src/components/MessageAttachments';
import DocumentCard, { DocumentInfo } from '@/src/components/DocumentCard';
import { copyToClipboard } from '@/src/components/shared/utils/clipboard';
import SearchProcess from '@/src/components/SearchProcess';
import DocumentCreationProcess, { DocumentDraftInfo } from '@/src/components/DocumentCreationProcess';
import CompactingStatus from '@/src/components/CompactingStatus';
import CodeExecution from '@/src/components/CodeExecution';
import SkillInputOverlay from '@/src/components/SkillInputOverlay';
import SkillTag from '@/src/components/SkillTag';
import ToolDiffView, { shouldUseDiffView, hasExpandableContent, getToolStats } from '@/src/components/ToolDiffView';
import { executeCode, sendCodeResult, setStatusCallback } from '@/src/components/chat/code/pyodideRunner';
import { isDesktopApp, openDesktopFolder, selectDesktopFile } from '@/src/desktop';
import ChatLandingPage from '@/src/components/ChatLandingPage';
import { UnifiedLandingLayout, UnifiedInputContainer } from '@/src/components/UnifiedComponents';
import { formatChatError, formatVoiceError, formatMessageTime, withAuthToken } from '@/src/components/shared/utils/chatUtils';
import { isSearchStatusMessage, extractTextContent } from '@/src/components/shared/utils/contentUtils';
import { getStoredModelId, rememberDefaultModel } from '@/src/utils/providerIdentity';
import { safeGetStorageItem, safeParseStorageJson, safeRemoveStorageItem } from '@/src/utils/safeStorage';
import {
  createAssistantPlaceholder,
  assistantHadLongThinking,
  applyAssistantTextUpdate,
  applyAssistantThinkingUpdate,
  normalizeMessageDocuments,
  sanitizeInlineArtifactMessage,
  mergeDocumentsIntoMessage,
  applyGenerationState,
  normalizeDocumentDrafts,
  mergeDocumentDraftIntoMessage,
} from '@/src/utils/messageUtils';
import { stripThinking, withThinking, isThinkingModel } from '@/src/components/shared/utils/modelUtils';
import { applyResearchEvent } from '@/src/components/shared/utils/researchUtils';
import inspirationsData from '@/assets/fixtures/artifact-gallery/inspirations.json';
import inputPlusIcon from '@/assets/home/composer/input-plus.svg';
import modelCaretIcon from '@/assets/home/model-selector/caret.svg';
import promptWriteIcon from '@/assets/home/prompt-suggestions/write.svg';
import promptLearnIcon from '@/assets/home/prompt-suggestions/learn.svg';
import promptCodeIcon from '@/assets/home/prompt-suggestions/code.svg';
import promptLifeIcon from '@/assets/home/prompt-suggestions/life.svg';
import promptChoiceIcon from '@/assets/home/prompt-suggestions/choice.svg';
import plusMenuAttachIcon from '@/assets/home/plus-menu/attach.svg';
import plusMenuScreenshotIcon from '@/assets/home/plus-menu/screenshot.svg';
import plusMenuProjectIcon from '@/assets/home/plus-menu/project.svg';
import plusMenuChevronIcon from '@/assets/home/plus-menu/chevron.svg';
import plusMenuSkillsIcon from '@/assets/home/plus-menu/skills.svg';
import plusMenuConnectorsIcon from '@/assets/home/plus-menu/connectors.svg';
import plusMenuWebSearchIcon from '@/assets/home/plus-menu/web-search.svg';
import plusMenuCheckIcon from '@/assets/home/plus-menu/check.svg';
import plusMenuStyleIcon from '@/assets/home/plus-menu/style.svg';

interface InspirationItem {
  artifact_id: string;
  chat_id: string;
  category: string;
  name: string;
  description: string;
  starting_prompt: string;
  img_src: string;
  content_uuid?: string;
  code_file?: string;
}

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: null | (() => void);
  onresult: null | ((event: any) => void);
  onerror: null | ((event: any) => void);
  onend: null | (() => void);
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const inspirationLibrary = inspirationsData.items as InspirationItem[];

const pickInspirations = (names: string[]) =>
  names
    .map((name) => inspirationLibrary.find((item) => item.name === name))
    .filter((item): item is InspirationItem => Boolean(item));

const LANDING_PROMPT_SECTIONS = [
  {
    label: 'Write',
    icon: promptWriteIcon,
    width: 82.609,
    items: pickInspirations([
      'Writing editor',
      'Email writing assistant',
      'Meeting notes summary',
      'One-pager PRD maker',
      'My weekly chronicle',
    ]),
  },
  {
    label: 'Learn',
    icon: promptLearnIcon,
    width: 83.703,
    items: pickInspirations([
      'Flashcards',
      'PyLingo',
      'Molecule studio',
      'Language learning tutor',
      'Origin stories',
    ]),
  },
  {
    label: 'Code',
    icon: promptCodeIcon,
    width: 81.688,
    items: pickInspirations([
      'CodeVerter',
      'Project dashboard generator',
      'Interactive drum machine',
      'Join dots',
      'Piano',
    ]),
  },
  {
    label: 'Life stuff',
    icon: promptLifeIcon,
    width: 106.484,
    items: pickInspirations([
      'Your life in weeks',
      'Dream interpreter',
      'Team activity ideas',
      'Magic in the grass',
      'How petty are you?',
    ]),
  },
  {
    label: 'Claude’s choice',
    icon: promptChoiceIcon,
    width: 148.453,
    items: pickInspirations([
      'Historical SVG amphitheater',
      'Stories in the sky',
      'Word cloud maker',
      'Sakura serenity',
      'Better than very',
    ]),
  },
] as const;

interface CoworkLaunchSessionPayload {
  prompt: string;
  model?: string;
  projectId?: string | null;
  researchMode?: boolean;
  attachments?: Array<{
    fileId: string;
    fileName: string;
    fileType?: 'image' | 'document' | 'text';
    mimeType: string;
    size: number;
  }>;
}

function createRestoredPendingFile(
  attachment: NonNullable<CoworkLaunchSessionPayload['attachments']>[number]
): PendingFile {
  const fallbackType = attachment.mimeType || 'application/octet-stream';
  return {
    id: `restored-${attachment.fileId}`,
    file: new File([], attachment.fileName, { type: fallbackType }),
    fileId: attachment.fileId,
    fileName: attachment.fileName,
    fileType: attachment.fileType,
    mimeType: fallbackType,
    size: attachment.size,
    progress: 100,
    status: 'done',
  };
}

interface CodeLaunchSessionPayload {
  folderPath: string;
  prompt?: string;
  model?: string;
}


interface MainContentProps {
  onNewChat: () => void; // Callback to tell sidebar to refresh
  resetKey?: number;
  tunerConfig?: any;
  onOpenDocument?: (doc: DocumentInfo) => void;
  onArtifactsUpdate?: (docs: DocumentInfo[]) => void;
  onOpenArtifacts?: () => void;
  onTitleChange?: (title: string) => void;
  onChatModeChange?: (isChat: boolean) => void;
}

// 草稿存储：在切换对话、打开设置页面时保留输入内容和附件
const draftsStore = new Map<string, { text: string; files: PendingFile[]; height: number }>();

interface ModelCatalog {
  common: SelectableModel[];
  all: SelectableModel[];
  fallback_model: string | null;
}

type ActiveTaskInfo = {
  description: string;
  status?: string;
  summary?: string;
  last_tool_name?: string;
};

const TASK_TERMINAL_SUBTYPES = new Set([
  'task_notification',
  'task_done',
  'task_error',
  'task_stopped',
  'task_cancelled',
  'task_canceled',
]);

function reduceActiveTasksFromEvent(
  previous: Map<string, ActiveTaskInfo>,
  data: any,
): Map<string, ActiveTaskInfo> {
  const taskId = typeof data?.task_id === 'string' ? data.task_id : '';
  if (!taskId) return previous;

  const next = new Map(previous);
  if (data.subtype === 'task_started') {
    next.set(taskId, {
      description: data.description || 'Running task...',
      status: data.status,
    });
  } else if (data.subtype === 'task_progress') {
    const existing = next.get(taskId);
    if (existing) {
      next.set(taskId, {
        ...existing,
        last_tool_name: data.last_tool_name,
        summary: data.summary,
        status: data.status,
      });
    }
  } else if (TASK_TERMINAL_SUBTYPES.has(data.subtype)) {
    next.delete(taskId);
  }
  return next;
}

function getActiveTaskLabel(task: ActiveTaskInfo): string {
  const details = task.last_tool_name || task.summary;
  return details ? `${task.description} (${details})` : task.description;
}

const readStoredChatModelIds = () => {
  try {
    const chatModels = safeParseStorageJson<any[]>('chat_models', []);
    if (!Array.isArray(chatModels)) return new Set<string>();
    const ids = new Set<string>();
    for (const model of chatModels) {
      const storedId = getStoredModelId(model);
      if (storedId) ids.add(storedId);
      if (model?.id) ids.add(model.id);
      if (model?.thinkingId) {
        ids.add(model.thinkingId);
        const storedThinkingId = getStoredModelId({ id: model.thinkingId, providerId: model.providerId });
        if (storedThinkingId) ids.add(storedThinkingId);
      }
    }
    return ids;
  } catch {
    return new Set<string>();
  }
};

/** Memoized message list — skips re-render when only inputText changes */
interface MessageListProps {
  messages: any[];
  loading: boolean;
  expandedMessages: Set<number>;
  editingMessageIdx: number | null;
  editingContent: string;
  copiedMessageIdx: number | null;
  compactStatus: { state: string; message?: string };
  onSetEditingContent: (v: string) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onToggleExpand: (idx: number) => void;
  onResend: (content: string, idx: number) => void;
  onEdit: (content: string, idx: number) => void;
  onCopy: (content: string, idx: number) => void;
  onOpenDocument?: (doc: DocumentInfo) => void;
  onOpenResearch: (messageId: string) => void;
  onSetMessages: React.Dispatch<React.SetStateAction<any[]>>;
  messageContentRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
}

const MessageList = React.memo<MessageListProps>(({
  messages, loading, expandedMessages, editingMessageIdx, editingContent,
  copiedMessageIdx, compactStatus, onSetEditingContent, onEditCancel, onEditSave,
  onToggleExpand, onResend, onEdit, onCopy, onOpenDocument, onOpenResearch, onSetMessages,
  messageContentRefs,
}) => {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-shimmer-text {
          background: linear-gradient(90deg, var(--text-claude-secondary) 45%, var(--text-claude-main) 50%, var(--text-claude-secondary) 55%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
      `}</style>
      {messages.map((msg: any, idx: number) => (
        <div key={idx} className="mb-6 group">
          {(msg.is_summary === 1 || msg.is_compact_boundary) && (
            <div className="flex items-center gap-3 mb-5 mt-2">
              <div className="flex-1 h-px bg-claude-border" />
              <span className="text-[12px] text-claude-textSecondary whitespace-nowrap">Context compacted above this point</span>
              <div className="flex-1 h-px bg-claude-border" />
            </div>
          )}
          {(msg.is_summary === 1 || msg.is_compact_boundary) ? null : msg.role === 'user' ? (
            editingMessageIdx === idx ? (
              <div className="w-full bg-[#F0EEE7] dark:bg-claude-btnHover rounded-xl p-3 border border-black/5 dark:border-white/10">
                <div className="bg-white dark:bg-black/20 rounded-lg border border-black/10 dark:border-white/10 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all p-3">
                  <textarea
                    className="w-full bg-transparent text-claude-text outline-none resize-none text-[16px] leading-relaxed font-sans font-[350] block"
                    value={editingContent}
                    onChange={(e) => {
                      onSetEditingContent(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onKeyDown={(e) => { if (e.key === 'Escape') onEditCancel(); }}
                    ref={(el) => {
                      if (el) {
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                        el.focus();
                      }
                    }}
                    style={{ minHeight: '60px' }}
                  />
                </div>
                <div className="flex items-start justify-between mt-3 px-1 gap-4">
                  <div className="flex items-start gap-2 text-claude-textSecondary text-[13px] leading-tight pt-1">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <span>
                      Editing this message will create a new conversation branch. You can switch between branches using the arrow navigation buttons.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={onEditCancel}
                      className="px-3 py-1.5 text-[13px] font-medium text-claude-text bg-white dark:bg-claude-bg border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-claude-hover rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={onEditSave}
                      disabled={!editingContent.trim() || editingContent === msg.content}
                      className="px-3 py-1.5 text-[13px] font-medium text-white bg-claude-text hover:bg-claude-textSecondary rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-end">
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="max-w-[85%] w-fit mb-1">
                    <MessageAttachments attachments={msg.attachments} onOpenDocument={onOpenDocument} />
                  </div>
                )}
                {(!msg.attachments || msg.attachments.length === 0) && msg.has_attachments === 1 && (
                  <div className="max-w-[85%] w-fit mb-1">
                    <div className="bg-[#F0EEE7] dark:bg-claude-btnHover text-claude-textSecondary px-3.5 py-2 text-[14px] rounded-2xl font-sans italic">
                      📎 Files attached
                    </div>
                  </div>
                )}
                {(() => { const displayText = extractTextContent(msg.content); return displayText && displayText.trim() !== ''; })() && (
                  <div className="max-w-[85%] w-fit relative">
                    <div
                      className="bg-[#F0EEE7] dark:bg-claude-btnHover text-claude-text px-3.5 py-2.5 text-[16px] leading-relaxed font-sans font-[350] whitespace-pre-wrap break-words relative overflow-hidden"
                      style={{
                        maxHeight: expandedMessages.has(idx) ? 'none' : '300px',
                        borderRadius: ((() => {
                          const el = messageContentRefs.current.get(idx);
                          const isOverflow = el && el.scrollHeight > 300;
                          return isOverflow;
                        })()) ? '16px 16px 0 0' : '16px',
                      }}
                      ref={(el) => { if (el) messageContentRefs.current.set(idx, el); }}
                    >
                      {(() => {
                        try {
                          const text = extractTextContent(msg.content);
                          if (!text) return '';
                          const skillMatch = text.match(/^\/([a-zA-Z0-9_-]+)(\s|$)/);
                          if (skillMatch) {
                            const slug = skillMatch[1];
                            const rest = text.slice(skillMatch[0].length);
                            return <>
                              <span className="text-[#4B9EFA] font-medium">/{slug}</span>
                              {rest ? ' ' + rest : ''}
                            </>;
                          }
                          return text;
                        } catch { return extractTextContent(msg.content) || ''; }
                      })()}
                      {!expandedMessages.has(idx) && (() => {
                        const el = messageContentRefs.current.get(idx);
                        return el && el.scrollHeight > 300;
                      })() && (
                          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#F0EEE7] dark:from-claude-btnHover to-transparent pointer-events-none" />
                        )}
                    </div>
                    {(() => {
                      const el = messageContentRefs.current.get(idx);
                      const isOverflow = el && el.scrollHeight > 300;
                      if (!isOverflow) return null;
                      return (
                        <div className="bg-[#F0EEE7] dark:bg-claude-btnHover rounded-b-2xl px-3.5 pb-3 pt-1 -mt-[1px] relative" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                          <button onClick={() => onToggleExpand(idx)} className="text-[13px] text-claude-textSecondary hover:text-claude-text transition-colors">
                            {expandedMessages.has(idx) ? 'Show less' : 'Show more'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 pr-1">
                  {msg.created_at && (
                    <span className="text-[12px] text-claude-textSecondary mr-1">{formatMessageTime(msg.created_at)}</span>
                  )}
                  <div className="flex items-center gap-0.5 overflow-hidden transition-all duration-200 ease-in-out max-w-0 opacity-0 group-hover:max-w-[200px] group-hover:opacity-100">
                    <button onClick={() => onResend(msg.content, idx)} className="p-1 text-claude-textSecondary hover:text-claude-text hover:bg-claude-hover rounded transition-colors" title="重新发送"><RotateCcw size={14} /></button>
                    <button onClick={() => onEdit(msg.content, idx)} className="p-1 text-claude-textSecondary hover:text-claude-text hover:bg-claude-hover rounded transition-colors" title="编辑"><Pencil size={14} /></button>
                    <button onClick={() => onCopy(msg.content, idx)} className="p-1 text-claude-textSecondary hover:text-claude-text hover:bg-claude-hover rounded transition-colors" title="复制">
                      {copiedMessageIdx === idx ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="px-1 text-claude-text text-[16.5px] leading-normal mt-2">
              {msg.thinking && assistantHadLongThinking(msg) && (
                <div className="mb-4">
                  <div
                    className="flex items-center gap-2 cursor-pointer select-none group/think text-claude-textSecondary hover:text-claude-text transition-colors"
                    onClick={() => {
                      onSetMessages(prev =>
                        prev.map((m, i) =>
                          i === idx ? { ...m, isThinkingExpanded: !m.isThinkingExpanded } : m
                        )
                      );
                    }}
                  >
                    <AssistantActivityIndicator
                      phase="waiting"
                      didLongThinking
                      size={14}
                      className="flex-shrink-0"
                      style={{ opacity: msg.isThinking ? 1 : 0.72 }}
                    />
                    <span className={`text-[14px] ${msg.isThinking ? 'font-serif italic text-[#3D3D3A]' : 'text-claude-textSecondary'}`}>
                      {(() => {
                        if (msg.isThinking) return 'Thinking deeply, stand by...';
                        if (msg.thinking_summary) return msg.thinking_summary;
                        const text = (msg.thinking || '').trim();
                        const lines = text.split('\n').filter((l: string) => l.trim());
                        const last = lines[lines.length - 1] || '';
                        const summary = last.length > 40 ? last.slice(0, 40) + '...' : last;
                        return summary || 'Thinking...';
                      })()}
                    </span>
                    <ChevronDown size={14} className={`transform transition-transform duration-200 ${msg.isThinkingExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {msg.isThinkingExpanded && (
                    <div className="mt-2 ml-1 pl-4 border-l-2 border-claude-border">
                      <div className="flex flex-col">
                        <div className="relative">
                          <div
                            className="text-claude-textSecondary text-[14px] leading-normal whitespace-pre-wrap overflow-hidden"
                            style={{ maxHeight: expandedMessages.has(idx) ? 'none' : '300px' }}
                            ref={(el) => { if (el) messageContentRefs.current.set(idx, el); }}
                          >
                            {msg.thinking}
                          </div>
                          {!expandedMessages.has(idx) && (() => {
                            const el = messageContentRefs.current.get(idx);
                            return el && el.scrollHeight > 300;
                          })() && (
                              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-claude-bg to-transparent pointer-events-none" />
                            )}
                        </div>
                        {(() => {
                          const el = messageContentRefs.current.get(idx);
                          const isOverflow = el && el.scrollHeight > 300;
                          if (!isOverflow) return null;
                          return (
                            <div className="pt-1">
                              <button onClick={() => onToggleExpand(idx)} className="text-[13px] text-claude-text hover:text-claude-textSecondary transition-colors font-medium">
                                {expandedMessages.has(idx) ? 'Show less' : 'Show more'}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                      {!msg.isThinking && (
                        <div className="flex items-center gap-2 mt-2 text-claude-textSecondary">
                          <Check size={16} />
                          <span className="text-[14px]">Done</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Research badge */}
              {msg.research && (
                <button
                  onClick={() => onOpenResearch(msg.id)}
                  className="mb-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#DBEAFE] dark:bg-[#1E3A5F] hover:bg-[#BFDBFE] dark:hover:bg-[#2A4A75] transition-colors"
                >
                  {msg.research.completed ? (
                    <IconResearch size={16} className="text-[#2E7CF6]" />
                  ) : (
                    <Loader2 size={16} className="text-[#2E7CF6] animate-spin" />
                  )}
                  <div className="text-left">
                    <div className="text-[12.5px] font-medium text-[#2E7CF6] leading-tight">
                      {msg.research.completed
                        ? `Research complete · ${(msg.research.sources || []).length} sources`
                        : msg.research.phase_label || 'Researching...'}
                    </div>
                    {msg.research.plan?.title && (
                      <div className="text-[11px] text-[#2E7CF6]/70 leading-tight mt-0.5 truncate max-w-[400px]">
                        {msg.research.plan.title}
                      </div>
                    )}
                  </div>
                </button>
              )}
              {/* Tool calls display */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (() => {
                const FRONTEND_HIDDEN = new Set(['WebSearch', 'WebFetch']);
                const visibleToolCalls = msg.toolCalls.filter((tc: any) => !FRONTEND_HIDDEN.has(tc.name));
                if (visibleToolCalls.length === 0) return null;
                const isCurrentMsg = idx === messages.length - 1;
                const isStale = (!loading && isCurrentMsg) || (idx < messages.length - 1);

                // Split text: work text (during tools) vs final text (after last tool done)
                const fullText = extractTextContent(msg.content);
                const offset = msg.toolTextEndOffset;
                const hasOffset = offset && offset > 0 && offset < fullText.length;
                const workText = hasOffset ? fullText.slice(0, offset).trim() : '';
                const finalText = hasOffset ? fullText.slice(offset).trim() : '';
                const isCurrentlyStreaming = loading && idx === messages.length - 1;
                // Tag message for MarkdownRenderer below:
                // - Streaming with tools: show nothing in main area (all text in tool section)
                // - Complete with offset: show only final text
                // - Complete without offset: show full text (fallback)
                // During streaming: compute pending text (text after last tool's textBefore)
                let consumedLen = 0;
                for (const tc of visibleToolCalls) {
                  if (tc.textBefore) consumedLen += tc.textBefore.length;
                }
                // Text currently being typed that hasn't been associated with a tool yet
                const pendingWorkText_ui = isCurrentlyStreaming ? fullText.slice(consumedLen).trim() : '';

                (msg as any)._finalText = isCurrentlyStreaming
                  ? ''  // During streaming, all text goes in tool section
                  : (hasOffset ? finalText : null);

                const toolNames = visibleToolCalls.map((tc: any) => {
                  const nameMap: Record<string, string> = {
                    'Read': 'Read file', 'Write': 'Write file', 'Edit': 'Edit file',
                    'Bash': 'Run command', 'ListDir': 'List directory',
                    'MultiEdit': 'Edit files', 'Search': 'Search',
                  };
                  return nameMap[tc.name] || tc.name;
                });
                const uniqueNames = [...new Set(toolNames)];
                const allDone = visibleToolCalls.every((tc: any) => {
                  const rs = (tc.status === 'running' && isStale) ? 'canceled' : tc.status;
                  return rs !== 'running';
                });
                const hasError = visibleToolCalls.some((tc: any) => tc.status === 'error');
                const summary = uniqueNames.join(', ');

                return (
                  <div className="mb-4">
                    <div className={`rounded-lg overflow-hidden ${!allDone ? 'bg-black/[0.04] dark:bg-white/[0.04]' : ''}`}>
                    <div
                      className="flex items-center gap-2 cursor-pointer select-none group/tool text-claude-textSecondary hover:text-claude-text transition-colors px-2 py-1.5"
                      onClick={() => {
                        onSetMessages(prev =>
                          prev.map((m, i) =>
                            i === idx ? { ...m, isToolCallsExpanded: !m.isToolCallsExpanded } : m
                          )
                        );
                      }}
                    >
                      {!allDone && (
                        <FileText size={16} className="text-claude-textSecondary animate-pulse" />
                      )}
                      {allDone && !hasError && (
                        <Check size={16} className="text-claude-textSecondary" />
                      )}
                      {allDone && hasError && (
                        <span className="text-red-400 text-[14px]">✗</span>
                      )}
                      <span className={`text-[14px] ${!allDone ? 'animate-shimmer-text' : 'text-claude-textSecondary'}`}>
                        {summary}
                      </span>
                      <ChevronDown size={14} className={`transform transition-transform duration-200 ${(msg.isToolCallsExpanded ?? (isCurrentlyStreaming || !allDone)) ? 'rotate-180' : ''}`} />
                    </div>
                    </div>

                    {(msg.isToolCallsExpanded ?? (isCurrentlyStreaming || !allDone)) && (
                      <div className="mt-2 ml-1 pl-4 border-l-2 border-claude-border space-y-2">
                        {visibleToolCalls.map((tc: any, tcIdx: number) => {
                          const inputStr = tc.input ? (typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input, null, 2)) : '';
                          const rawPath = tc.input?.file_path || tc.input?.path || '';
                          const shortPath = rawPath ? rawPath.split(/[/\\]/).pop() || rawPath : '';
                          const actionLabel: Record<string, string> = {
                            'Read': 'Read', 'Write': 'Write', 'Edit': 'Edit',
                            'MultiEdit': 'Edit', 'Bash': '', 'Grep': 'Search',
                            'Glob': 'Find', 'ListDir': 'List', 'Skill': 'Skill',
                          };
                          const prefix = actionLabel[tc.name] ?? tc.name;
                          const fileOrCmd = shortPath || tc.input?.command || (inputStr.length > 80 ? inputStr.slice(0, 80) + '...' : inputStr);
                          const inputPreview = (prefix && fileOrCmd) ? `${prefix} ${fileOrCmd}` : (fileOrCmd || prefix || tc.name);
                          const realStatus = (tc.status === 'running' && isStale) ? 'canceled' : tc.status;
                          const expandable = hasExpandableContent(tc.name, tc.input, tc.result);
                          const stats = getToolStats(tc.name, tc.input);

                          return (
                            <div key={tc.id || tcIdx}>
                              {/* Interleaved text: what the model said BEFORE this tool call */}
                              {tc.textBefore && (
                                <div className="text-[13px] text-claude-textSecondary px-1 py-1.5 leading-relaxed">
                                  {tc.textBefore}
                                </div>
                              )}
                              {/* Tool card */}
                              <div className="text-[13px] bg-black/5 dark:bg-black/20 rounded-lg overflow-hidden border border-black/5 dark:border-white/5 mx-1 w-full">
                                <div
                                  className={`flex items-center justify-between px-3 py-2 transition-colors ${expandable ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5' : ''}`}
                                  onClick={() => {
                                    if (!expandable) return;
                                    onSetMessages(prev =>
                                      prev.map((m, i) => {
                                        if (i !== idx) return m;
                                        const newTc = [...m.toolCalls];
                                        newTc[tcIdx] = { ...newTc[tcIdx], isExpanded: newTc[tcIdx].isExpanded === undefined ? true : !newTc[tcIdx].isExpanded };
                                        return { ...m, toolCalls: newTc };
                                      })
                                    );
                                  }}
                                >
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    {tc.name === 'Bash' ? (
                                      <span className="text-claude-textSecondary font-mono font-bold">&gt;_</span>
                                    ) : (
                                      <FileText size={14} className="text-claude-textSecondary flex-shrink-0" />
                                    )}
                                    <span className="text-claude-text font-mono text-[12px] truncate">
                                      {inputPreview || tc.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                                    {stats && realStatus !== 'running' && (
                                      <span className="text-[11px] font-mono flex items-center gap-1.5">
                                        {stats.added > 0 && <span className="text-green-500 dark:text-green-400">+{stats.added}</span>}
                                        {stats.removed > 0 && <span className="text-red-500 dark:text-red-400">-{stats.removed}</span>}
                                      </span>
                                    )}
                                    {realStatus === 'running' && <span className="text-claude-textSecondary text-[12px] animate-shimmer-text">Running...</span>}
                                    {realStatus === 'error' && <span className="text-red-400/80 text-[12px]">Failed</span>}
                                    {expandable && (
                                      <ChevronDown size={14} className={`text-claude-textSecondary transform transition-transform duration-200 ${(tc.isExpanded ?? false) ? 'rotate-180' : ''}`} />
                                    )}
                                  </div>
                                </div>
                                {expandable && (tc.isExpanded ?? false) && (
                                  <div className="px-2 py-2 border-t border-black/5 dark:border-white/5">
                                    {shouldUseDiffView(tc.name, tc.input) ? (
                                      <ToolDiffView toolName={tc.name} input={tc.input} result={tc.result} />
                                    ) : tc.result != null ? (
                                      <div className="px-1 text-claude-textSecondary text-[12px] font-mono max-h-[400px] overflow-y-auto whitespace-pre-wrap bg-black/5 dark:bg-black/40 rounded-md p-2">
                                        {typeof tc.result === 'string' ? (tc.result.length > 2000 ? tc.result.slice(0, 2000) + '...' : tc.result || '(Empty output)') : JSON.stringify(tc.result).slice(0, 2000)}
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {/* Streaming: show latest text being generated */}
                        {isCurrentlyStreaming && pendingWorkText_ui && (
                          <div className="text-[13px] text-claude-textSecondary px-1 py-1.5 leading-relaxed animate-shimmer-text">
                            {pendingWorkText_ui}
                          </div>
                        )}
                        {allDone && !isCurrentlyStreaming && (
                          <div className="flex items-center gap-2 text-claude-textSecondary pt-1 pb-1">
                            <Check size={14} />
                            <span className="text-[13px]">Done</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              {msg.searchStatus && (!msg.searchLogs || msg.searchLogs.length === 0) && (!msg.content || msg.content.length === (msg._contentLenBeforeSearch || 0)) && loading && idx === messages.length - 1 && (
                <div className="flex items-center justify-center gap-2 text-[15px] font-medium mb-4 w-full">
                  <Globe size={18} className="text-claude-textSecondary" />
                  <span className="animate-shimmer-text">
                    Searching the web
                  </span>
                </div>
              )}

              {msg.searchLogs && msg.searchLogs.length > 0 && (
                <SearchProcess logs={msg.searchLogs} isThinking={msg.isThinking} isDone={(msg.content || '').length > (msg._contentLenBeforeSearch || 0)} />
              )}

              {normalizeDocumentDrafts(msg).length > 0 && (
                <DocumentCreationProcess drafts={normalizeDocumentDrafts(msg)} />
              )}

              <MarkdownRenderer content={(msg as any)._finalText ?? extractTextContent(msg.content)} citations={msg.citations} />
              {normalizeMessageDocuments(msg).length > 0 && (
                <div className="mt-2 mb-1 space-y-2">
                  {normalizeMessageDocuments(msg).map((doc, docIdx) => (
                    <DocumentCard
                      key={doc.id || `${idx}-${docIdx}`}
                      document={doc}
                      onOpen={(openedDoc) => onOpenDocument?.(openedDoc)}
                    />
                  ))}
                </div>
              )}
              {msg.codeExecution && (
                <CodeExecution
                  code={msg.codeExecution.code}
                  status={msg.codeExecution.status}
                  stdout={msg.codeExecution.stdout}
                  stderr={msg.codeExecution.stderr}
                  images={msg.codeExecution.images}
                  error={msg.codeExecution.error}
                />
              )}
              {!msg.codeExecution && (msg as any).codeImages && (msg as any).codeImages.length > 0 && (
                <div className="my-3 space-y-2">
                  {(msg as any).codeImages.map((url: string, i: number) => (
                    <div key={i} className="rounded-lg overflow-hidden">
                      <img src={withAuthToken(url)} alt={`图表 ${i + 1}`} className="max-w-full" />
                    </div>
                  ))}
                </div>
              )}
              {(() => {
                const isLastMessage = idx === messages.length - 1;
                const hasDocumentDrafts = normalizeDocumentDrafts(msg).length > 0;
                const hasToolCalls = Boolean(msg.toolCalls && msg.toolCalls.length > 0);
                const didLongThinking = assistantHadLongThinking(msg);
                const tailPhase = !isLastMessage
                  ? null
                  : loading && !msg.content && !msg.searchStatus && !hasDocumentDrafts && !hasToolCalls
                    ? 'waiting'
                    : loading && !msg.isThinking && (msg.content || (msg.searchStatus && msg.content))
                      ? 'streaming'
                      : !loading && msg.content
                        ? 'done'
                        : null;

                if (!tailPhase) return null;

                const tailIndicator = (
                  <span className="inline-flex ml-1 align-middle" style={{ verticalAlign: '-0.18em' }}>
                    <AssistantActivityIndicator
                      phase={tailPhase}
                      didLongThinking={didLongThinking}
                      size={24}
                      interactive={tailPhase === 'done'}
                      className="inline-block"
                    />
                  </span>
                );

                if (tailPhase === 'done') {
                  return (
                    <>
                      {tailIndicator}
                      {compactStatus.state === 'compacting' && (
                        <div className="mt-3">
                          <CompactingStatus />
                        </div>
                      )}
                    </>
                  );
                }

                return tailIndicator;
              })()}
            </div>
          )}
        </div>
      ))}
    </>
  );
});

const MainContent = ({ onNewChat, resetKey, tunerConfig, onOpenDocument, onArtifactsUpdate, onOpenArtifacts, onTitleChange, onChatModeChange }: MainContentProps) => {
  const { id: routeId } = useParams(); // Get conversation ID from URL
  const location = useLocation();
  const [localId, setLocalId] = useState<string | null>(null);
  const [showEntranceAnimation, setShowEntranceAnimation] = useState(false);
  const conversationRouteBase = location.pathname.startsWith('/cowork')
    ? '/cowork'
    : location.pathname.startsWith('/code')
      ? '/code'
      : '/chat';
  const customizeRoute = location.pathname.startsWith('/cowork')
    ? '/cowork/customize'
    : location.pathname.startsWith('/code')
      ? '/code/customize'
      : '/customize';
  const pendingWorkspaceFolderRef = useRef<string | null>(null);
  const pendingLaunchModelRef = useRef<string | null>(null);
  const [activeWorkspacePath, setActiveWorkspacePath] = useState<string | null>(null);

  // Use localId if we just created a chat, effectively overriding the lack of URL param until next true navigation
  const id = routeId === 'new' ? null : routeId;
  const activeId = id || localId || null;

  const navigate = useNavigate();
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Notify parent about artifacts
  useEffect(() => {
    if (onArtifactsUpdate) {
      const docsMap = new Map<string, DocumentInfo>();
      for (const message of messages) {
        for (const doc of normalizeMessageDocuments(message)) {
          const key = doc.id || doc.url || doc.filename || doc.title;
          if (!key) continue;
          docsMap.set(key, doc);
        }
      }
      const docs = Array.from(docsMap.values());
      onArtifactsUpdate(docs);
    }
  }, [messages, onArtifactsUpdate]);

  // Notify parent about Chat Mode and Title
  useEffect(() => {
    const isChat = !!(activeId || messages.length > 0);
    onChatModeChange?.(isChat);
  }, [activeId, messages.length, onChatModeChange]);


  // Model state
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const isSelfHostedMode = true;

  // Self-hosted: read chat_models from localStorage synchronously to avoid flash of wrong models
  const selfHostedModels = useMemo<SelectableModel[]>(() => {
    if (!isSelfHostedMode) return [];
    try {
      const chatModels = safeParseStorageJson<any[]>('chat_models', []);
      if (chatModels.length === 0) return [];
      const tierDescMap: Record<string, string> = {
        'opus': 'Most capable for ambitious work',
        'sonnet': 'Most efficient for everyday tasks',
        'haiku': 'Fastest for quick answers',
      };
      return chatModels.map((m: any) => ({
        id: getStoredModelId(m),
        name: m.name || m.id,
        enabled: 1,
        tier: m.tier || 'extra',
        description: m.tier && tierDescMap[m.tier] ? tierDescMap[m.tier] : undefined,
      }));
    } catch { return []; }
  }, [isSelfHostedMode]);

  const fallbackCommonModels = useMemo<SelectableModel[]>(() => {
    // Self-hosted: use user-configured models as fallback, not hardcoded Claude models
    if (isSelfHostedMode && selfHostedModels.length > 0) {
      const tierOrder = ['opus', 'sonnet', 'haiku'];
      const common = tierOrder.map(t => selfHostedModels.find(m => m.tier === t)).filter(Boolean) as SelectableModel[];
      return common.length > 0 ? common : selfHostedModels;
    }
    return [
      { id: 'claude-opus-4-6', name: 'Opus 4.6', enabled: 1, description: 'Most capable for ambitious work' },
      { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', enabled: 1, description: 'Most efficient for everyday tasks' },
      { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', enabled: 1, description: 'Fastest for quick answers' },
    ];
  }, [isSelfHostedMode, selfHostedModels]);

  // Initial model: for self-hosted, prefer first configured model over hardcoded claude-sonnet-4-6
  const [currentModelString, setCurrentModelString] = useState(() => {
    const saved = safeGetStorageItem('default_model');
    if (saved) return saved;
    if (isSelfHostedMode && selfHostedModels.length > 0) return selfHostedModels[0].id;
    return 'claude-sonnet-4-6';
  });

  const displayCommonModels = modelCatalog?.common?.length ? modelCatalog.common : fallbackCommonModels;
  const selectorModels = useMemo<SelectableModel[]>(() => {
    const visible = [...displayCommonModels];
    const seen = new Set(visible.map(m => m.id));
    // Only add extra models (e.g. GPT) for self-hosted mode
    if (isSelfHostedMode) {
      const extraModels = (modelCatalog?.all || []).filter(m => !seen.has(m.id));
      for (const model of extraModels) {
        // Tag non-tier models as 'extra' so ModelSelector can split them into "More models"
        visible.push({ ...model, tier: model.tier || 'extra' });
        seen.add(model.id);
      }
    }
    const currentBase = stripThinking(currentModelString);
    if (currentBase && !seen.has(currentBase)) {
      visible.push({
        id: currentBase,
        name: currentBase,
        enabled: 1,
        tier: 'extra',
      });
    }
    return visible;
  }, [currentModelString, displayCommonModels, modelCatalog, isSelfHostedMode]);

  const [conversationTitle, setConversationTitle] = useState("");

  useEffect(() => {
    onTitleChange?.(conversationTitle);
  }, [conversationTitle, onTitleChange]);

  useEffect(() => {
    const handleConversationTitleUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string; title?: string }>;
      const nextId = customEvent.detail?.id;
      const nextTitle = customEvent.detail?.title;
      if (!nextId || !nextTitle) return;
      if (activeId === nextId) {
        setConversationTitle(nextTitle);
      }
    };

    window.addEventListener('conversationTitleUpdated', handleConversationTitleUpdated as EventListener);
    return () => {
      window.removeEventListener('conversationTitleUpdated', handleConversationTitleUpdated as EventListener);
    };
  }, [activeId]);

  const [user, setUser] = useState<any>(null);

  // Welcome greeting — randomized per new chat, time-aware
  const welcomeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = user?.display_name || user?.nickname || 'there';
    const timeGreetings = hour < 6
      ? [`Night owl mode, ${name}`, `Burning the midnight oil, ${name}?`, `Still up, ${name}?`]
      : hour < 12
        ? [`Good morning, ${name}`, `Morning, ${name}`, `Rise and shine, ${name}`]
        : hour < 18
          ? [`Good afternoon, ${name}`, `Hey there, ${name}`, `What's on your mind, ${name}?`]
          : [`Good evening, ${name}`, `Evening, ${name}`, `Winding down, ${name}?`];
    const general = [`What can I help with?`, `How can I help you today?`, `Let's get to work, ${name}`, `Ready when you are, ${name}`];
    const pool = [...timeGreetings, ...general];
    return pool[Math.floor(Math.random() * pool.length)];
  }, [resetKey, user?.nickname]);

  // 输入栏参数
  const inputBarWidth = 768;
  const inputBarMinHeight = 32;
  const inputBarRadius = 24;
  const inputBarBottom = 0;
  const inputBarBaseHeight = inputBarMinHeight + 16; // border-box: content + padding (pt-4=16px + pb-0=0px)
  const textareaHeightVal = useRef(inputBarBaseHeight);

  const isCreatingRef = useRef(false);
  const pendingInitialMessageRef = useRef<string | null>(null);
  const [pendingLaunchTick, setPendingLaunchTick] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestCountRef = useRef(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastResetKeyRef = useRef(0);
  const streamConversationIdRef = useRef<string | null>(null);
  const streamRequestIdRef = useRef(0);

  // Per-conversation message buffer for multi-conversation streaming isolation
  const viewingIdRef = useRef<string | null>(null);
  const messagesBufferRef = useRef(new Map<string, any[]>());

  // Update messages for a specific conversation — only touches React state if it's the active conversation.
  //
  // Backfill safety net: setMessagesFor is called exclusively from streaming event
  // handlers (text deltas, thinking deltas, tool events, done/error callbacks). They all
  // mutate the trailing assistant placeholder. If a race causes the updater to run BEFORE
  // the placeholder push has committed (rare but real — depends on React batching, async
  // boundaries, and SSE chunk timing), the original updaters silently dropped the event
  // via their `lastMsg.role === 'assistant'` guard.
  //
  // The fix: ensure the tail of `prev` is an assistant message before invoking the
  // updater. Existing callers don't change — their guard now always passes, and the
  // event lands on the backfilled placeholder. The persisted assistant message will overwrite
  // this placeholder with the canonical content + toolCalls on the next reload, so even if a
  // re-load races with backfill the persistent state stays correct.
  const setMessagesFor = useCallback((convId: string, updater: (prev: any[]) => any[]) => {
    const ensureUpdater = (prev: any[]) => {
      if (prev.length === 0) return updater(prev); // empty conv: don't synthesize a phantom placeholder
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') return updater(prev);
      // Tail is a user message (or other non-assistant). Backfill an assistant
      // placeholder so the trailing SSE event has somewhere to land instead of
      // being silently dropped by the updater's `lastMsg.role === 'assistant'` guard.
      return updater([...prev, createAssistantPlaceholder()]);
    };

    if (viewingIdRef.current === convId) {
      setMessages(prev => {
        const result = ensureUpdater(prev);
        messagesBufferRef.current.set(convId, result);
        return result;
      });
    } else {
      const prev = messagesBufferRef.current.get(convId) || [];
      messagesBufferRef.current.set(convId, ensureUpdater(prev));
    }
  }, []);

  const isModelSelectable = useCallback((modelString: string) => {
    const base = stripThinking(modelString);
    const pool = modelCatalog?.all || displayCommonModels;
    const found = pool.find(m => m.id === base);
    return !!found && Number(found.enabled) === 1;
  }, [modelCatalog, displayCommonModels]);

  const isKnownNewChatModel = useCallback((modelString: string) => {
    const base = stripThinking(modelString);
    if (!base) return false;
    if (isModelSelectable(modelString)) return true;
    const storedIds = readStoredChatModelIds();
    return storedIds.has(modelString) || storedIds.has(base);
  }, [isModelSelectable]);

  const resolveModelForNewChat = useCallback((preferredModel?: string | null) => {
    const saved = preferredModel || safeGetStorageItem('default_model', 'claude-sonnet-4-6');
    const thinking = isThinkingModel(saved);
    const base = stripThinking(saved);
    const storedIds = readStoredChatModelIds();
    if (storedIds.has(saved)) {
      return saved;
    }
    if (storedIds.has(base)) {
      return withThinking(base, thinking);
    }
    const all = modelCatalog?.all || displayCommonModels;
    const preferred = all.find(m => m.id === base);
    if (preferred && Number(preferred.enabled) === 1) {
      return withThinking(base, thinking);
    }

    const fallbackBase = modelCatalog?.fallback_model
      || all.find(m => /sonnet/i.test(m.id) && Number(m.enabled) === 1)?.id
      || all.find(m => Number(m.enabled) === 1)?.id
      || base
      || 'claude-sonnet-4-6';
    return withThinking(fallbackBase, thinking);
  }, [displayCommonModels, modelCatalog]);

  const resolveModelForCreate = useCallback((preferredModel?: string | null) => {
    const launchModel = pendingLaunchModelRef.current?.trim();
    if (launchModel) return launchModel;
    const requested = preferredModel || currentModelString;
    const remembered = safeGetStorageItem('default_model').trim();
    if (remembered && requested === remembered) return requested;
    return isKnownNewChatModel(requested)
      ? requested
      : resolveModelForNewChat(requested);
  }, [currentModelString, isKnownNewChatModel, resolveModelForNewChat]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const userScrolledUpRef = useRef(false);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  const [copiedMessageIdx, setCopiedMessageIdx] = useState<number | null>(null);
  const [editingMessageIdx, setEditingMessageIdx] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const messageContentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [inputHeight, setInputHeight] = useState(160);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const [openedResearchMsgId, setOpenedResearchMsgId] = useState<string | null>(null);
  const toggleResearchMode = useCallback(async () => {
    const next = !researchMode;
    setResearchMode(next);
    if (activeId) {
      try { await updateConversation(activeId, { research_mode: next }); } catch (_) {}
    }
  }, [researchMode, activeId]);

  // Provider web-search capability (derived from the current model's provider).
  // Unsupported providers simply won't emit search events, so this state is purely
  // a UI indicator — no need to persist or toggle.
  const [providersCache, setProvidersCache] = useState<Provider[]>([]);
  const [webSearchToast, setWebSearchToast] = useState<string | null>(null);
  const [voiceToast, setVoiceToast] = useState<string | null>(null);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [activeLandingPromptSection, setActiveLandingPromptSection] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceBaseInputRef = useRef('');
  const voiceCommittedTranscriptRef = useRef('');
  useEffect(() => {
    getProviders().then(setProvidersCache).catch(() => {});
  }, []);
  const currentProviderSupportsWebSearch = useMemo(() => {
    if (!providersCache.length) return false;
    const bareModel = (currentModelString || '').replace(/-thinking$/, '');
    for (const p of providersCache) {
      if ((p.models || []).some(m => m.id === bareModel)) {
        return p.supportsWebSearch === true;
      }
    }
    return false;
  }, [providersCache, currentModelString]);
  useEffect(() => {
    if (!webSearchToast) return;
    const t = setTimeout(() => setWebSearchToast(null), 2800);
    return () => clearTimeout(t);
  }, [webSearchToast]);
  useEffect(() => {
    if (!voiceToast) return;
    const t = setTimeout(() => setVoiceToast(null), 2800);
    return () => clearTimeout(t);
  }, [voiceToast]);
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!loading || !lastMsg || lastMsg.role !== 'assistant' || !lastMsg.isThinking || assistantHadLongThinking(lastMsg)) {
      return;
    }

    const startedAt = typeof lastMsg._streamStartedAt === 'number' ? lastMsg._streamStartedAt : Date.now();
    const elapsed = Date.now() - startedAt;

    const markAsLongThinking = () => {
      setMessages((prev) => {
        const newMsgs = [...prev];
        const target = newMsgs[newMsgs.length - 1];
        if (!target || target.role !== 'assistant' || !target.isThinking || assistantHadLongThinking(target)) {
          return prev;
        }
        target._didLongThinking = true;
        if (activeId) {
          messagesBufferRef.current.set(activeId, newMsgs);
        }
        return newMsgs;
      });
    };

    if (elapsed >= LONG_THINKING_THRESHOLD_MS) {
      markAsLongThinking();
      return;
    }

    const timer = window.setTimeout(markAsLongThinking, LONG_THINKING_THRESHOLD_MS - elapsed);
    return () => window.clearTimeout(timer);
  }, [activeId, loading, messages]);
  useEffect(() => () => {
    try {
      recognitionRef.current?.abort();
    } catch {}
  }, []);
  const [showSkillsSubmenu, setShowSkillsSubmenu] = useState(false);
  const [enabledSkills, setEnabledSkills] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [selectedSkill, setSelectedSkill] = useState<{ name: string; slug: string; description?: string } | null>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  // Add-to-project state
  const [showProjectsSubmenu, setShowProjectsSubmenu] = useState(false);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [projectAddToast, setProjectAddToast] = useState<string | null>(null);
  const [compactStatus, setCompactStatus] = useState<{ state: 'idle' | 'compacting' | 'done' | 'error'; message?: string }>({ state: 'idle' });
  const [showCompactDialog, setShowCompactDialog] = useState(false);
  const [compactInstruction, setCompactInstruction] = useState('');
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null); // null = loading
  const [contextInfo, setContextInfo] = useState<{ tokens: number; limit: number } | null>(null);

  // AskUserQuestion state
  const [askUserDialog, setAskUserDialog] = useState<{
    request_id: string;
    tool_use_id: string;
    questions: Array<{ question: string; header?: string; options?: Array<{ label: string; description?: string }>; multiSelect?: boolean }>;
    answers: Record<string, string>;
  } | null>(null);

  // Task/Agent progress state
  const [activeTasks, setActiveTasks] = useState<Map<string, ActiveTaskInfo>>(new Map());
  const activeTaskItems = useMemo(() => Array.from(activeTasks.entries()), [activeTasks]);

  // Plan mode state
  const [planMode, setPlanMode] = useState(false);

  // 草稿持久化 refs（跟踪最新值，供 effect cleanup 读取）
  const inputTextRef = useRef(inputText);
  inputTextRef.current = inputText;
  const pendingFilesRef = useRef(pendingFiles);
  pendingFilesRef.current = pendingFiles;
  const textareaHeightRef = useRef(textareaHeightVal.current);
  textareaHeightRef.current = textareaHeightVal.current;

  // textarea 高度计算改为在 onChange 中直接操作 DOM（见 adjustTextareaHeight）
  const adjustTextareaHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = `${inputBarBaseHeight}px`;
    const sh = el.scrollHeight;
    const newH = sh > inputBarBaseHeight ? Math.min(sh, 316) : inputBarBaseHeight;
    el.style.height = `${newH}px`;
    el.style.overflowY = newH >= 316 ? 'auto' : 'hidden';
    textareaHeightVal.current = newH;
  }, [inputBarBaseHeight]);

  useEffect(() => {
    // If we have a URL param ID, clear any local ID to ensure we sync with source of truth
    if (id) {
      setLocalId(null);
    }
  }, [id]);

  // 检测滚动条宽度
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => setScrollbarWidth(el.offsetWidth - el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [messages]);

  // 动态调整 paddingBottom，使聊天列表能滚到输入框上方
  useEffect(() => {
    const el = inputWrapperRef.current;
    if (!el) return;

    const updateHeight = () => {
      // 底部留白 = 输入框高度 + 底部边距(48px)
      setInputHeight(el.offsetHeight + 48);
    };

    // 初始测量
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);

    return () => observer.disconnect();
  }, [activeId, messages.length]);

  // 用户滚轮向上时，立刻中止自动滚动
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        userScrolledUpRef.current = true;
        isAtBottomRef.current = false;
        // 取消正在进行的 smooth scroll 动画
        el.scrollTo({ top: el.scrollTop });
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Load enabled skills for the plus menu
  useEffect(() => {
    if (!showPlusMenu) { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); return; }
    getSkills().then((data) => {
      const all = [...(data.examples || []), ...(data.my_skills || [])];
      setEnabledSkills(all.filter((s: Skill) => s.enabled).map((s) => ({ id: s.id, name: s.name, description: s.description })));
    }).catch(() => {});
    getProjects().then((data: Project[]) => {
      setProjectList((data || []).filter(p => !p.is_archived));
    }).catch(() => {});
  }, [showPlusMenu]);

  // 点击外部关闭加号菜单
  useEffect(() => {
    if (!showPlusMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideMenu = plusMenuRef.current && plusMenuRef.current.contains(target);
      const insideButton = plusBtnRef.current && plusBtnRef.current.contains(target);
      if (!insideMenu && !insideButton) {
        setShowPlusMenu(false);
        setShowSkillsSubmenu(false);
        setShowProjectsSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPlusMenu]);

  // Reset when resetKey changes (New Chat clicked)
  useEffect(() => {
    if (resetKey && resetKey !== lastResetKeyRef.current) {
      lastResetKeyRef.current = resetKey;
      draftsStore.delete('__new__');
      pendingInitialMessageRef.current = null;
      pendingLaunchModelRef.current = null;
      setPendingLaunchTick(0);
      setLocalId(null);
      setMessages([]);
      setInputText('');
      setPendingFiles([]);
      setCurrentModelString(resolveModelForNewChat());
      setConversationTitle("");
      setContextInfo(null);
      setCurrentProjectId(null);
      setPendingProjectId(null);
      setActiveWorkspacePath(null);
      // 触发入场动画
      setShowEntranceAnimation(true);
      setTimeout(() => setShowEntranceAnimation(false), 800);
      isAtBottomRef.current = true;

      // Check for prefill input (from Create with Claude)
      const prefillInput = safeGetStorageItem('prefill_input', '', 'session');
      if (prefillInput) {
        safeRemoveStorageItem('prefill_input', 'session');
        setTimeout(() => {
          setInputText(prefillInput);
          // Auto-resize textarea
          const ta = document.querySelector('textarea');
          if (ta) {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 316) + 'px';
          }
        }, 200);
      }

      const coworkPayloadRaw = safeGetStorageItem('cowork_launch_payload_v1', '', 'session');
      if (coworkPayloadRaw) {
        safeRemoveStorageItem('cowork_launch_payload_v1', 'session');
        try {
          const coworkPayload = JSON.parse(coworkPayloadRaw) as CoworkLaunchSessionPayload;
          const nextPrompt = typeof coworkPayload.prompt === 'string' ? coworkPayload.prompt.trim() : '';
          const restoredFiles = Array.isArray(coworkPayload.attachments)
            ? coworkPayload.attachments
              .filter((item) => item && item.fileId && item.fileName)
              .map(createRestoredPendingFile)
            : [];

          if (coworkPayload.projectId !== undefined) {
            setPendingProjectId(coworkPayload.projectId || null);
          }

          if (coworkPayload.researchMode !== undefined) {
            setResearchMode(!!coworkPayload.researchMode);
          }

          if (coworkPayload.model) {
            const nextModel = coworkPayload.model.trim();
            pendingLaunchModelRef.current = nextModel;
            setCurrentModelString(nextModel);
            rememberDefaultModel(nextModel);
          }

          setTimeout(() => {
            setInputText(nextPrompt);
            setPendingFiles(restoredFiles);
            pendingInitialMessageRef.current = nextPrompt || null;
            setPendingLaunchTick(prev => prev + 1);
            const ta = inputRef.current || document.querySelector('textarea');
            if (ta) {
              ta.style.height = 'auto';
              ta.style.height = Math.min(ta.scrollHeight, 316) + 'px';
            }
          }, 200);
        } catch {}
      }

      const codePayloadRaw = safeGetStorageItem('code_launch_payload_v1', '', 'session');
      if (codePayloadRaw) {
        safeRemoveStorageItem('code_launch_payload_v1', 'session');
        try {
          const codePayload = JSON.parse(codePayloadRaw) as CodeLaunchSessionPayload;
          pendingWorkspaceFolderRef.current = codePayload.folderPath || null;
          const nextPrompt = typeof codePayload.prompt === 'string' ? codePayload.prompt.trim() : '';
          if (codePayload.model) {
            const nextModel = codePayload.model.trim();
            pendingLaunchModelRef.current = nextModel;
            setCurrentModelString(nextModel);
            rememberDefaultModel(nextModel);
          }
          if (nextPrompt) {
            setTimeout(() => {
              setInputText(nextPrompt);
              pendingInitialMessageRef.current = nextPrompt;
              setPendingLaunchTick(prev => prev + 1);
              const ta = inputRef.current || document.querySelector('textarea');
              if (ta) {
                ta.style.height = 'auto';
                ta.style.height = Math.min(ta.scrollHeight, 316) + 'px';
              }
            }, 200);
          }
        } catch {
          pendingWorkspaceFolderRef.current = null;
        }
      } else {
        pendingWorkspaceFolderRef.current = null;
      }

      // Check for artifact prompt (from Artifacts page)
      const artifactPrompt = safeGetStorageItem('artifact_prompt', '', 'session');
      if (artifactPrompt) {
        safeRemoveStorageItem('artifact_prompt', 'session');
        if (artifactPrompt === '__remix__') {
          // Remix mode: pre-load artifact into conversation
          const remixData = safeGetStorageItem('artifact_remix', '', 'session');
          safeRemoveStorageItem('artifact_remix', 'session');
          if (remixData) {
            try {
              const remix = JSON.parse(remixData);
              // Inject pre-baked assistant message with artifact info
              const assistantMsg = {
                id: 'remix-' + Date.now(),
                role: 'assistant' as const,
                content: JSON.stringify([{ type: 'text', text: `I'll customize this artifact:\n\n**${remix.name}**\n\nTransform any artifact into something uniquely yours by customizing its core elements.\n\n1. Change the topic - Adapt the content for a different subject\n2. Update the style - Refresh the visuals or overall design\n3. Make it personal - Tailor specifically for your needs\n4. Share your vision - I'll bring it to life\n\nWhere would you like to begin?` }]),
                created_at: new Date().toISOString(),
              };
              setTimeout(() => {
                setMessages([assistantMsg]);
                // Open the artifact in DocumentPanel
                if (remix.code?.content && onOpenDocument) {
                  const isReactArtifact = remix.code?.type === 'application/vnd.ant.react';
                  onOpenDocument({
                    id: 'remix-artifact',
                    title: remix.code?.title || remix.name,
                    filename: (remix.code?.title || remix.name) + (isReactArtifact ? '.jsx' : '.html'),
                    url: '',
                    content: remix.code.content,
                    format: isReactArtifact ? 'jsx' : 'html',
                  });
                }
              }, 200);
            } catch {}
          }
        } else {
          // Normal artifact prompt: auto-send
          setTimeout(() => handleSend(artifactPrompt), 300);
        }
      }
    }
  }, [isKnownNewChatModel, resetKey, resolveModelForNewChat]);

  useEffect(() => {
    let cancelled = false;
    const isSelfHosted = true;
    const loadModels = async () => {
      try {
        let data: any;
        if (isSelfHosted) {
          // Self-hosted: use chat_models from localStorage (configured in Models settings)
          let chatModels: any[] = [];
          chatModels = safeParseStorageJson<any[]>('chat_models', []);
          if (chatModels.length > 0) {
            const tierDescMap: Record<string, string> = {
              'opus': 'Most capable for ambitious work',
              'sonnet': 'Most efficient for everyday tasks',
              'haiku': 'Fastest for quick answers',
            };
            const all = chatModels.map((m: any) => ({
              id: getStoredModelId(m),
              name: m.name || m.id,
              enabled: 1,
              tier: m.tier || 'extra',
              description: m.tier && tierDescMap[m.tier] ? tierDescMap[m.tier] : undefined,
            }));
            // Common = tier models (opus/sonnet/haiku), ordered by tier
            const tierOrder = ['opus', 'sonnet', 'haiku'];
            const common = tierOrder.map(t => all.find((m: any) => m.tier === t)).filter(Boolean);
            data = { all, common: common.length > 0 ? common : all, fallback_model: safeGetStorageItem('default_model') || all[0]?.id || 'claude-sonnet-4-6' };
          } else {
            // Fallback: load all from providers
            const pModels = await getProviderModels();
            const all = pModels.map(m => ({ id: getStoredModelId(m), name: m.name || m.id, enabled: 1 }));
            data = { all, common: all, fallback_model: all[0]?.id || 'claude-sonnet-4-6' };
          }
        } else {
          data = await getUserModels();
          // Enrich known Anthropic models with descriptions
          const descMap: Record<string, string> = {
            'claude-opus-4-6': 'Most capable for ambitious work',
            'claude-sonnet-4-6': 'Most efficient for everyday tasks',
            'claude-haiku-4-5-20251001': 'Fastest for quick answers',
          };
          for (const list of [data?.common, data?.all]) {
            if (!Array.isArray(list)) continue;
            for (const m of list) {
              if (descMap[m.id] && !m.description) m.description = descMap[m.id];
            }
          }
        }
        if (cancelled) return;
        setModelCatalog(data);
        if (!viewingIdRef.current) {
          setCurrentModelString(prev => {
            const storedDefaultModel = safeGetStorageItem('default_model');
            const current = prev || storedDefaultModel || 'claude-sonnet-4-6';
            const launchModel = pendingLaunchModelRef.current?.trim();
            if (launchModel && current === launchModel) {
              return current;
            }
            if (current && current === storedDefaultModel) {
              return current;
            }
            const thinking = isThinkingModel(current);
            const base = stripThinking(current);
            const all: SelectableModel[] = data?.all?.length ? data.all : fallbackCommonModels;
            const preferred = all.find((m: SelectableModel) => m.id === base && Number(m.enabled) === 1);
            if (preferred) return withThinking(base, thinking);
            const fallbackBase = data?.fallback_model
              || all.find((m: SelectableModel) => /sonnet/i.test(m.id) && Number(m.enabled) === 1)?.id
              || all.find((m: SelectableModel) => Number(m.enabled) === 1)?.id
              || base
              || 'claude-sonnet-4-6';
            return withThinking(fallbackBase, thinking);
          });
        }
      } catch {
        // ignore
      }
    };
    loadModels();
    const timer = setInterval(loadModels, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackCommonModels]);

  // 草稿持久化：切换对话 / 打开设置页面时保存，切回时恢复
  const draftKey = activeId || '__new__';
  useEffect(() => {
    const saved = draftsStore.get(draftKey);
    if (saved) {
      setInputText(saved.text);
      setPendingFiles(saved.files);
      textareaHeightVal.current = saved.height;
      // Apply saved height to DOM
      if (inputRef.current) {
        inputRef.current.style.height = `${saved.height}px`;
        inputRef.current.style.overflowY = saved.height >= 316 ? 'auto' : 'hidden';
      }
      draftsStore.delete(draftKey);
    } else {
      setInputText('');
      setPendingFiles([]);
      textareaHeightVal.current = inputBarBaseHeight;
    }
    return () => {
      const text = inputTextRef.current;
      const files = pendingFilesRef.current;
      const height = textareaHeightRef.current;
      if (text.trim() || files.length > 0) {
        draftsStore.set(draftKey, { text, files, height });
      } else {
        draftsStore.delete(draftKey);
      }
    };
  }, [draftKey]);

  // 路由变化时也触发入场动画
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '') {
      setShowEntranceAnimation(true);
      setTimeout(() => setShowEntranceAnimation(false), 800);
    }
  }, [location.pathname]);

  useEffect(() => {
    setUser(getUser());
    // Check subscription status
    getUserUsage().then(usage => {
      const hasSub = !!(usage.plan && usage.plan.status === 'active');
      const hasQuota = usage.token_quota > 0 && usage.token_remaining > 0;
      setHasSubscription(hasSub || hasQuota);
    }).catch(() => setHasSubscription(false));
  }, [activeId]);

  useEffect(() => {
    // Reset state when switching conversations — each conversation has independent streaming
    setPlanMode(false);
    setActiveTasks(new Map());
    setAskUserDialog(null);
    isCreatingRef.current = false;
    viewingIdRef.current = activeId || null;

    // Pre-warm engine when user opens a conversation (init in background before they send)
    if (activeId) warmEngine(activeId);

      if (activeId) {
      // Check if there's a live buffer for this conversation (e.g. streaming in background)
      const buffered = messagesBufferRef.current.get(activeId);
        if (buffered && buffered.length > 0) {
          setMessages(buffered);
          setLoading(isStreaming(activeId));
          // Restore model from server even when using buffer for messages
          const buffConvId = activeId;
          getConversation(buffConvId).then(data => {
            if (viewingIdRef.current === buffConvId) {
              setActiveWorkspacePath(data?.workspace_path || null);
            }
            if (data?.model && viewingIdRef.current === buffConvId) {
              setCurrentModelString(isModelSelectable(data.model) ? data.model : resolveModelForNewChat(data.model));
            }
          }).catch(() => {});
      } else {
        setLoading(false);
        loadConversation(activeId);
        // Check if server has an active stream we can reconnect to
        const convId = activeId;
        getStreamStatus(convId).then(status => {
          if (status.active && viewingIdRef.current === convId) {
            setLoading(true);
            addStreaming(convId);
            // Seed buffer from current messages + placeholder
            setMessages(prev => {
              const msgs = prev.length > 0 ? prev : [];
              // Add assistant placeholder if last message isn't one
              if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'assistant') {
                const withPlaceholder = [...msgs, createAssistantPlaceholder()];
                messagesBufferRef.current.set(convId, withPlaceholder);
                return withPlaceholder;
              }
              messagesBufferRef.current.set(convId, msgs);
              return msgs;
            });
            const reconnectController = new AbortController();
            abortControllerRef.current = reconnectController;
            reconnectStream(
              convId,
              (delta, full) => {
                setMessagesFor(convId, prev => {
                  const newMsgs = [...prev];
                  const lastMsg = newMsgs[newMsgs.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant') {
                    applyAssistantTextUpdate(lastMsg, full);
                  }
                  return newMsgs;
                });
              },
              (full) => {
                removeStreaming(convId);
                messagesBufferRef.current.delete(convId);
                if (viewingIdRef.current === convId) {
                  setLoading(false);
                  setActiveTasks(new Map());
                }
                abortControllerRef.current = null;
                setMessagesFor(convId, prev => {
                  const newMsgs = [...prev];
                  const lastMsg = newMsgs[newMsgs.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant') {
                    applyAssistantTextUpdate(lastMsg, full);
                  }
                  return newMsgs;
                });
              },
              (err) => {
                removeStreaming(convId);
                messagesBufferRef.current.delete(convId);
                if (viewingIdRef.current === convId) {
                  setLoading(false);
                  setActiveTasks(new Map());
                }
                abortControllerRef.current = null;
              },
              (thinkingDelta, thinkingFull) => {
                setMessagesFor(convId, prev => {
                  const newMsgs = [...prev];
                  const lastMsg = newMsgs[newMsgs.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant') {
                    applyAssistantThinkingUpdate(lastMsg, thinkingFull);
                  }
                  return newMsgs;
                });
              },
              (event, message, data) => {
                if (event === 'ask_user' && data) {
                  setAskUserDialog({ request_id: data.request_id, tool_use_id: data.tool_use_id, questions: data.questions || [], answers: {} });
                }
                if (event === 'task_event' && data) {
                  setActiveTasks(prev => reduceActiveTasksFromEvent(prev, data));
                }
              },
              (toolEvent) => {
                if (toolEvent.type === 'done' && toolEvent.tool_name === 'EnterPlanMode') setPlanMode(true);
                if (toolEvent.type === 'done' && toolEvent.tool_name === 'ExitPlanMode') setPlanMode(false);
                const INTERNAL_TOOLS = new Set(['EnterPlanMode', 'ExitPlanMode', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop']);
                if (INTERNAL_TOOLS.has(toolEvent.tool_name || '')) return;
                setMessagesFor(convId, prev => {
                  const newMsgs = [...prev];
                  const lastMsg = newMsgs[newMsgs.length - 1];
                  if (!lastMsg || lastMsg.role !== 'assistant') return prev;
                  const toolCalls = lastMsg.toolCalls || [];
                  if (toolEvent.type === 'start') {
                    let existing = toolCalls.find((t: any) => t.id === toolEvent.tool_use_id);
                    if (existing) {
                      existing.name = toolEvent.tool_name || existing.name;
                      if (toolEvent.tool_input && Object.keys(toolEvent.tool_input).length > 0) existing.input = toolEvent.tool_input;
                      if (toolEvent.textBefore) existing.textBefore = toolEvent.textBefore;
                    } else {
                      toolCalls.push({ id: toolEvent.tool_use_id, name: toolEvent.tool_name || 'unknown', input: toolEvent.tool_input || {}, status: 'running' as const, textBefore: toolEvent.textBefore || '' });
                    }
                  }
                  else if (toolEvent.type === 'input') {
                    const tc = toolCalls.find((t: any) => t.id === toolEvent.tool_use_id);
                    if (tc) tc.input = toolEvent.tool_input || {};
                  }
                  else if (toolEvent.type === 'done') {
                    let tc = toolCalls.find((t: any) => t.id === toolEvent.tool_use_id);
                    if (!tc) { tc = { id: toolEvent.tool_use_id, name: toolEvent.tool_name || 'unknown', input: {}, status: 'done' as const, result: toolEvent.content }; toolCalls.push(tc); }
                    else { tc.status = toolEvent.is_error ? 'error' as const : 'done' as const; tc.result = toolEvent.content; }
                  }
                  lastMsg.toolCalls = toolCalls;
                  return newMsgs;
                });
              },
              reconnectController.signal
            );
          }
        }).catch(() => {});
      }
      getContextSize(activeId).then(setContextInfo).catch(() => { });
      isAtBottomRef.current = true;

      // Handle initialMessage from Project page navigation
      const navState = location.state as any;
        if (navState?.initialMessage) {
          pendingInitialMessageRef.current = navState.initialMessage;
          setPendingLaunchTick(prev => prev + 1);
          if (navState.model) setCurrentModelString(navState.model);
          // Clear location state to prevent re-sends on refresh
          navigate(location.pathname, { replace: true, state: {} });
      }
      return;
    }

    setLoading(false);
    setMessages([]);
    setContextInfo(null);
    setActiveTasks(new Map());
    setCurrentModelString(resolveModelForNewChat());
    setActiveWorkspacePath(null);
  }, [activeId]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const beginStreamSession = useCallback((conversationId: string) => {
    const nextId = streamRequestIdRef.current + 1;
    streamRequestIdRef.current = nextId;
    streamConversationIdRef.current = conversationId;
    return nextId;
  }, []);

  const isStreamSessionActive = useCallback((conversationId: string, requestId: number) => {
    return streamConversationIdRef.current === conversationId && streamRequestIdRef.current === requestId;
  }, []);

  const clearStreamSession = useCallback((conversationId: string, requestId: number) => {
    if (!isStreamSessionActive(conversationId, requestId)) return false;
    streamConversationIdRef.current = null;
    return true;
  }, [isStreamSessionActive]);

  const abortStreamSession = useCallback((targetConversationId?: string) => {
    const trackedConversationId = streamConversationIdRef.current;
    if (!trackedConversationId) return false;
    if (targetConversationId && trackedConversationId !== targetConversationId) return false;

    streamRequestIdRef.current += 1;
    streamConversationIdRef.current = null;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
    } else if (pollingRef.current) {
      stopPolling();
      stopGeneration(trackedConversationId).catch(e => console.error('[Stop] error:', e));
    }

    removeStreaming(trackedConversationId);
    setLoading(false);
    setActiveTasks(new Map());
    isCreatingRef.current = false;
    return true;
  }, [stopPolling]);

  // 组件卸载或对话切换时停止轮询
  useEffect(() => {
    return () => { stopPolling(); };
  }, [activeId, stopPolling]);

  // 对话删除前先中止流式请求，避免旧会话的输出串到当前界面
  useEffect(() => {
    const handleConversationDeleting = (evt: Event) => {
      const customEvt = evt as CustomEvent<{ id?: string }>;
      const conversationId = customEvt.detail?.id;
      if (!conversationId) return;
      abortStreamSession(conversationId);
    };

    window.addEventListener('conversationDeleting', handleConversationDeleting as EventListener);
    return () => {
      window.removeEventListener('conversationDeleting', handleConversationDeleting as EventListener);
    };
  }, [abortStreamSession]);

  useEffect(() => {
    // 只在加载中（模型正在生成）或用户刚发送消息时才自动滚动
    // 对话结束后不要自动滚动，避免用户正在查看历史消息时被打断
    if (isAtBottomRef.current && loading && !userScrolledUpRef.current) {
      scrollToBottom('auto');
    }
  }, [messages, loading]);

  // 当输入框高度变化时，如果已经在底部，则保持在底部
  useEffect(() => {
    if (isAtBottomRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [inputHeight]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
      if (isBottom && userScrolledUpRef.current) {
        // 用户自己滚回了底部，重新启用自动滚动
        userScrolledUpRef.current = false;
      }
      if (!userScrolledUpRef.current) {
        isAtBottomRef.current = isBottom;
      }
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  };

  const scheduleScrollToBottomAfterRender = useCallback((attempts = 6) => {
    const run = (remaining: number) => {
      // Respect user scroll: if user scrolled up, abort all scheduled scrolls
      if (userScrolledUpRef.current || !isAtBottomRef.current) return;
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
      if (remaining > 0) {
        requestAnimationFrame(() => run(remaining - 1));
      }
    };

    requestAnimationFrame(() => run(attempts));

    // 某些内容（Markdown、文档卡片、字体回流）会在首帧后继续撑高高度，
    // 仅靠 rAF 可能还会停在上方，因此再补几次延迟滚动。
    // 但必须在每次执行前检查用户是否已经主动滚动了！
    [80, 200, 400, 800, 1200].forEach((delay) => {
      window.setTimeout(() => {
        // Skip if user has scrolled away
        if (userScrolledUpRef.current || !isAtBottomRef.current) return;
        const el = scrollContainerRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }, delay);
    });
  }, []);

  const loadConversation = async (conversationId: string) => {
    stopPolling();
    try {
      const data = await getConversation(conversationId);
      if (data.model) {
        if (isModelSelectable(data.model)) {
          setCurrentModelString(data.model);
        } else {
          setCurrentModelString(resolveModelForNewChat(data.model));
        }
      }
      // Restore research mode toggle
      setResearchMode(!!data.research_mode);
      setActiveWorkspacePath(data.workspace_path || null);
      const normalizedMessages = (data.messages || []).map((msg: any) => {
        // Normalize attachment field names (some persisted records still use camelCase)
        if (msg.attachments && Array.isArray(msg.attachments)) {
          msg.attachments = msg.attachments.map((att: any) => ({
            id: att.id || att.fileId || att.file_id || '',
            file_name: att.file_name || att.fileName || 'file',
            file_type: att.file_type || att.fileType || 'document',
            mime_type: att.mime_type || att.mimeType || '',
            file_size: att.file_size || att.size || 0,
            ...att,
          }));
        }
        return sanitizeInlineArtifactMessage(msg);
      });
      setMessages(normalizedMessages);
      isAtBottomRef.current = true;
      scheduleScrollToBottomAfterRender();
      setConversationTitle(data.title || 'New Chat');
      setCurrentProjectId(data.project_id || null);

      // 检查是否有活跃的后台生成
      try {
        const genStatus = await getGenerationStatus(conversationId);
        if (genStatus.active && genStatus.status === 'generating') {
          // 追加占位 assistant 消息（如果最后一条不是 assistant）
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (
              last &&
              last.role === 'assistant' &&
              !last.content &&
              !genStatus.text &&
              !genStatus.thinking &&
              !(genStatus.documents && genStatus.documents.length > 0) &&
              !genStatus.document
            ) {
              // 已有空占位，更新它
              return prev;
            }
            if (last && last.role === 'assistant') {
              // 更新现有 assistant 消息
              const newMsgs = [...prev];
              newMsgs[newMsgs.length - 1] = applyGenerationState(last, genStatus);
              return newMsgs;
            }
            // 追加新的 assistant 占位
            return [...prev, mergeDocumentsIntoMessage({
              role: 'assistant',
              content: genStatus.text || '',
              thinking: genStatus.thinking || '',
              thinkingSummary: genStatus.thinkingSummary,
              citations: genStatus.citations,
              searchLogs: genStatus.searchLogs,
              isThinking: !genStatus.text && !!genStatus.thinking,
            }, genStatus.document, genStatus.documents)];
          });
          setLoading(true);
          isAtBottomRef.current = true;

          // 启动轮询
          pollingRef.current = setInterval(async () => {
            try {
              const s = await getGenerationStatus(conversationId);
              if (!s.active || s.status !== 'generating') {
                // 生成结束，停止轮询，重新加载最终数据
                stopPolling();
                setLoading(false);
                setActiveTasks(new Map());
                const final_ = await getConversation(conversationId);
                setMessages((final_.messages || []).map((msg: any) => sanitizeInlineArtifactMessage(msg)));
                isAtBottomRef.current = true;
                scheduleScrollToBottomAfterRender();
                if (final_.title) setConversationTitle(final_.title);
                getContextSize(conversationId).then(setContextInfo).catch(() => { });
                return;
              }
              // 跨进程轮询：内容在另一个进程，从数据库拉最新消息
              if (s.crossProcess) {
                const fresh = await getConversation(conversationId);
                const freshMsgs = (fresh.messages || []).map((msg: any) => sanitizeInlineArtifactMessage(msg));
                isAtBottomRef.current = true;
                scheduleScrollToBottomAfterRender();
                // 如果数据库里最后一条是 assistant，说明有新内容，更新
                // 否则保留当前显示的内容（助手消息可能还没存到数据库）
                setMessages(prev => {
                  const lastFresh = freshMsgs[freshMsgs.length - 1];
                  const lastPrev = prev[prev.length - 1];
                  if (lastFresh && lastFresh.role === 'assistant') {
                    return freshMsgs;
                  }
                  // 数据库里还没有助手消息，保留当前显示的占位消息
                  if (lastPrev && lastPrev.role === 'assistant') {
                    return prev;
                  }
                  return freshMsgs;
                });
                return;
              }
              // 更新进度
              setMessages(prev => {
                const newMsgs = [...prev];
                const last = newMsgs[newMsgs.length - 1];
                if (last && last.role === 'assistant') {
                  newMsgs[newMsgs.length - 1] = applyGenerationState(last, s);
                }
                return newMsgs;
              });
            } catch (e) {
              console.error('[Polling] error:', e);
              stopPolling();
              setLoading(false);
              setActiveTasks(new Map());
            }
          }, 1500);
        } else {
          setLoading(false);
          setActiveTasks(new Map());
        }
      } catch {
        // generation-status 接口失败不影响正常加载
        setLoading(false);
        setActiveTasks(new Map());
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
      setActiveTasks(new Map());
    }
  };

  const handleModelChange = async (newModelString: string) => {
    if (!isKnownNewChatModel(newModelString)) return;
    const previousModelString = currentModelString;
    setCurrentModelString(newModelString);
    rememberDefaultModel(newModelString);

    // If in an existing conversation, we should update the conversation's model immediately
    if (activeId && !isCreatingRef.current) {
      try {
        const updated = await updateConversation(activeId, { model: newModelString });
        if (updated?.model) {
          setCurrentModelString(updated.model);
          rememberDefaultModel(updated.model);
        }
      } catch (err) {
        console.error("Failed to update conversation model", err);
        setCurrentModelString(previousModelString);
        rememberDefaultModel(previousModelString);
      }
    }
  };

  const handleAttachToProject = async (project: Project) => {
    setShowPlusMenu(false);
    setShowProjectsSubmenu(false);
    if (activeId) {
      if (currentProjectId === project.id) return;
      try {
        await updateConversation(activeId, { project_id: project.id });
        setCurrentProjectId(project.id);
        onNewChat();
        setProjectAddToast(`Added to ${project.name}`);
        setTimeout(() => setProjectAddToast(null), 2500);
      } catch (err) {
        console.error('Failed to add conversation to project', err);
      }
    } else {
      setPendingProjectId(project.id);
      setProjectAddToast(`Will add to ${project.name} on send`);
      setTimeout(() => setProjectAddToast(null), 2500);
    }
  };

  const handleCreateProjectFromMenu = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const project = await createProject(name, newProjectDescription.trim());
      setShowNewProjectDialog(false);
      setNewProjectName('');
      setNewProjectDescription('');
      setProjectList(prev => [project, ...prev]);
      await handleAttachToProject(project);
    } catch (err) {
      console.error('Failed to create project', err);
    }
  };

  const handleSend = async (overrideText?: string) => {
    const effectiveText = (typeof overrideText === 'string') ? overrideText : inputText;
    // Skill slug is already in the text (inserted when selected from menu)
    setSelectedSkill(null);
    const hasFiles = pendingFiles.some(f => f.status === 'done');
    const hasErrorFiles = pendingFiles.some(f => f.status === 'error');
    if ((!effectiveText.trim() && !hasFiles) || loading) {
      if (!loading && !effectiveText.trim() && !hasFiles && hasErrorFiles) {
        alert('有文件上传失败，请先删除失败文件后再发送');
      }
      return;
    }
    if (activeRequestCountRef.current >= 2) {
      alert('最多同时进行 2 个对话，请等待其他对话完成');
      return;
    }
    const isUploading = pendingFiles.some(f => f.status === 'uploading');
    if (isUploading) {
      alert('文件仍在上传中，请稍等完成后再发送');
      return;
    }

    const userMessageText = effectiveText;
    setInputText(""); // Clear input

    // 收集已上传的附件
    const uploadedFiles = pendingFiles.filter(f => f.status === 'done' && f.fileId);
    const githubFiles = pendingFiles.filter(f => f.status === 'done' && f.source === 'github');
    const uploadedPayload = uploadedFiles.map(f => ({ fileId: f.fileId!, fileName: f.fileName, fileType: f.fileType, mimeType: f.mimeType, size: f.size }));
    const githubPayload = githubFiles.map(f => ({
      fileId: `github:${f.ghRepo || f.fileName}`,
      fileName: f.ghRepo || f.fileName,
      fileType: 'github' as any,
      mimeType: 'application/x-github',
      size: 0,
      source: 'github',
      ghRepo: f.ghRepo,
      ghRef: f.ghRef,
    }));
    const attachmentsPayload = (uploadedPayload.length + githubPayload.length) > 0
      ? [...uploadedPayload, ...githubPayload]
      : null;

    // 构建乐观 UI 的附件数据
    const optimisticAttachments: any[] = uploadedFiles.map(f => ({
      id: f.fileId!,
      file_type: f.fileType || 'text',
      file_name: f.fileName,
      mime_type: f.mimeType,
      file_size: f.size,
      line_count: f.lineCount,
    }));
    for (const g of githubFiles) {
      optimisticAttachments.push({
        id: `github:${g.ghRepo || g.fileName}`,
        file_type: 'github',
        file_name: g.ghRepo || g.fileName,
        mime_type: 'application/x-github',
        file_size: 0,
        source: 'github',
        gh_repo: g.ghRepo,
        gh_ref: g.ghRef,
      });
    }

    // 清空 pendingFiles 并释放预览 URL
    pendingFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setPendingFiles([]);
    draftsStore.delete(activeId || '__new__');

    // 重置 textarea 高度
    textareaHeightVal.current = inputBarBaseHeight;
    if (inputRef.current) {
      inputRef.current.style.height = `${inputBarBaseHeight}px`;
      inputRef.current.style.overflowY = 'hidden';
    }

    // Optimistic UI: Add user message immediately
    const tempUserMsg: any = { role: 'user', content: userMessageText, created_at: new Date().toISOString() };
    if (optimisticAttachments.length > 0) {
      tempUserMsg.has_attachments = 1;
      tempUserMsg.attachments = optimisticAttachments;
    }
    setMessages(prev => [...prev, tempUserMsg]);

    // Force scroll to bottom and track state
    isAtBottomRef.current = true;
    setTimeout(() => scrollToBottom('auto'), 50);

    // Prepare assistant message placeholder
    setMessages(prev => [...prev, createAssistantPlaceholder()]);

    let conversationId = activeId;

    // If no ID, create conversation first
    if (!conversationId) {
      isCreatingRef.current = true; // Block useEffect fetch
      try {
        const modelForCreate = resolveModelForCreate();
        if (modelForCreate !== currentModelString) {
          setCurrentModelString(modelForCreate);
        }
        rememberDefaultModel(modelForCreate);
        // 不传临时标题，让后端生成
        console.log("Creating conversation with model:", modelForCreate);
        const workspaceFolder = pendingWorkspaceFolderRef.current;
        const newConv = await createConversation(undefined, modelForCreate, {
          research_mode: researchMode,
          ...(workspaceFolder ? { workspace: { mode: 'existing-folder' as const, folderPath: workspaceFolder } } : {}),
        });
        pendingWorkspaceFolderRef.current = null;
        pendingLaunchModelRef.current = null;
        console.log("Created conversation response:", newConv);

        if (!newConv || !newConv.id) {
          throw new Error("Invalid conversation response from server");
        }

        conversationId = newConv.id;
        console.log("New Conversation ID:", conversationId);
        // Attach to pending project if user chose one before sending
        if (pendingProjectId) {
          try {
            await updateConversation(conversationId!, { project_id: pendingProjectId });
            setCurrentProjectId(pendingProjectId);
          } catch (e) {
            console.error('Failed to attach new conversation to project', e);
          }
          setPendingProjectId(null);
        }
        warmEngine(conversationId); // Pre-warm engine while user waits

        // Use React Router navigate so useParams stays in sync with the URL
        // isCreatingRef prevents the activeId effect from reloading during streaming
        navigate(`${conversationRouteBase}/${conversationId}`, { replace: true });
        if (newConv.model) {
          setCurrentModelString(newConv.model);
          rememberDefaultModel(newConv.model);
        }
        setActiveWorkspacePath(newConv.workspace_path || workspaceFolder || null);
        setConversationTitle(newConv.title || 'New Chat');

        onNewChat(); // Refresh sidebar
      } catch (err: any) {
        console.error("Failed to create conversation", err);
        isCreatingRef.current = false;
        setMessages(prev => {
          const newMsgs = [...prev];
          // Find the last assistant message (placeholder) and update it
          if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'assistant') {
            newMsgs[newMsgs.length - 1].content = "Error: Failed to create conversation. " + (err.message || err);
          }
          return newMsgs;
        });
        return;
      }
    }

    // Call streaming API — seed buffer with current messages so background streaming works
    messagesBufferRef.current.set(conversationId!, [...messages, tempUserMsg, createAssistantPlaceholder()]);
    const controller = new AbortController();
    const streamRequestId = beginStreamSession(conversationId!);
    abortControllerRef.current = controller;
    setLoading(true);
    addStreaming(conversationId!);
    activeRequestCountRef.current += 1;
    await sendMessage(
      conversationId!,
      userMessageText,
      attachmentsPayload,
      (delta, full) => {
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;
        setMessagesFor(conversationId!, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            applyAssistantTextUpdate(lastMsg, full);
          }
          return newMsgs;
        });
      },
      (full) => {
        // Always clean up streaming state and request count, even if session changed
        removeStreaming(conversationId!);
        messagesBufferRef.current.delete(conversationId!);
        activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;
        if (viewingIdRef.current === conversationId) {
          setLoading(false);
          setActiveTasks(new Map());
        }
        abortControllerRef.current = null;
        isCreatingRef.current = false; // Reset flag
        clearStreamSession(conversationId!, streamRequestId);
        setMessagesFor(conversationId!, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            applyAssistantTextUpdate(lastMsg, full);
          }
          return newMsgs;
        });
      },
      (err) => {
        // Always clean up streaming state and request count, even if session changed
        removeStreaming(conversationId!);
        messagesBufferRef.current.delete(conversationId!);
        activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;
        if (viewingIdRef.current === conversationId) {
          setLoading(false);
          setActiveTasks(new Map());
        }
        abortControllerRef.current = null;
        isCreatingRef.current = false;
        clearStreamSession(conversationId!, streamRequestId);
        setMessagesFor(conversationId!, prev => {
          const newMsgs = [...prev];
          if (newMsgs[newMsgs.length - 1] && newMsgs[newMsgs.length - 1].role === 'assistant') {
            newMsgs[newMsgs.length - 1].content = formatChatError(err);
            newMsgs[newMsgs.length - 1].isThinking = false;
          }
          return newMsgs;
        });
      },
      (thinkingDelta, thinkingFull) => {
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;
        setMessagesFor(conversationId!, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            applyAssistantThinkingUpdate(lastMsg, thinkingFull);
          }
          return newMsgs;
        });
      },
      (event, message, data) => {
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;
        // Handle metadata (update user message ID)
        if (event === 'metadata' && data && data.user_message_id) {
          setMessages(prev => {
            const newMsgs = [...prev];
            const userIdx = newMsgs.length - 2;
            if (userIdx >= 0 && newMsgs[userIdx].role === 'user') {
              newMsgs[userIdx] = { ...newMsgs[userIdx], id: data.user_message_id };
            }
            return newMsgs;
          });
        }
        // Handle system/status events (e.g. web search status)
        if (event === 'status' && message) {
          if (!isSearchStatusMessage(message)) return;
          setMessagesFor(conversationId!, prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.searchStatus = message;
              lastMsg._contentLenBeforeSearch = (lastMsg.content || '').length;
            }
            return newMsgs;
          });
        }
        // Handle thinking summary
        if (event === 'thinking_summary' && message) {
          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.thinking_summary = message;
            }
            return newMsgs;
          });
        }
        if (event === 'conversation_title' && data?.title) {
          const nextTitle = String(data.title || '').trim();
          if (nextTitle) {
            setConversationTitle(nextTitle);
            window.dispatchEvent(new CustomEvent('conversationTitleUpdated', {
              detail: { id: conversationId, title: nextTitle }
            }));
          }
        }
        // Handle auto compaction progress
        if (event === 'compaction_start') {
          setCompactStatus({ state: 'compacting' });
        }
        if (event === 'compaction_done') {
          if (data && data.messagesCompacted > 0) {
            setCompactStatus({ state: 'done', message: `Compacted ${data.messagesCompacted} messages, saved ~${data.tokensSaved} tokens` });
            setTimeout(() => setCompactStatus({ state: 'idle' }), 4000);
          } else {
            setCompactStatus({ state: 'idle' });
          }
        }
        // Handle compact_boundary from engine auto-compact during normal chat
        if (event === 'compact_boundary') {
          const meta = data?.compact_metadata || {};
          const preTokens = meta.pre_tokens || 0;
          const saved = preTokens ? Math.round(preTokens * 0.7) : 0;
          setCompactStatus({ state: 'done', message: saved > 0 ? `Auto-compacted, saved ~${saved} tokens` : 'Context auto-compacted' });
          setTimeout(() => setCompactStatus({ state: 'idle' }), 4000);
          // Reload messages to reflect compacted state
          if (activeId) {
            loadConversation(activeId);
            getContextSize(activeId).then(setContextInfo).catch(() => {});
          }
        }
        if (event === 'context_size' && data) {
          setContextInfo({ tokens: data.tokens, limit: data.limit });
        }
        if (event === 'tool_text_offset' && data && data.offset != null) {
          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.toolTextEndOffset = data.offset;
            }
            return newMsgs;
          });
        }
        if (event && event.startsWith('research_')) {
          setMessages(prev => applyResearchEvent(prev, event, data));
        }
        // AskUserQuestion — engine needs user input
        if (event === 'ask_user' && data) {
          setAskUserDialog({
            request_id: data.request_id,
            tool_use_id: data.tool_use_id,
            questions: data.questions || [],
            answers: {},
          });
        }
        // Task/Agent progress
        if (event === 'task_event' && data) {
          setActiveTasks(prev => reduceActiveTasksFromEvent(prev, data));
        }
      },
      (sources, query, tokens) => {
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;
        // Handle search_sources — collect citation sources
        setMessagesFor(conversationId!, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            const existing = lastMsg.citations || [];

            // 去重合并
            const existingUrls = new Set(existing.map((s: any) => s.url));
            const newSources = sources.filter((s: any) => !existingUrls.has(s.url));
            lastMsg.citations = [...existing, ...newSources];

            if (query) {
              const logs = lastMsg.searchLogs || [];
              // 检查是否已存在相同的 query
              const existingLogIndex = logs.findIndex((log: any) => log.query === query);
              if (existingLogIndex !== -1) {
                // 更新现有 log 的 results 和 tokens
                const existingLog = logs[existingLogIndex];
                const currentResults = existingLog.results || [];
                const currentUrls = new Set(currentResults.map((r: any) => r.url));
                const uniqueNewResults = sources.filter((s: any) => !currentUrls.has(s.url));
                existingLog.results = [...currentResults, ...uniqueNewResults];
                if (tokens !== undefined) {
                  existingLog.tokens = tokens;
                }
              } else {
                // 添加新 log
                logs.push({ query, results: sources, tokens });
              }
              lastMsg.searchLogs = logs;
            }
          }
          return newMsgs;
        });
      },
      (doc) => {
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;
        setMessagesFor(conversationId!, prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          if (newMsgs[lastIdx] && newMsgs[lastIdx].role === 'assistant') {
            newMsgs[lastIdx] = mergeDocumentsIntoMessage(newMsgs[lastIdx], doc);
          }
          return newMsgs;
        });
      },
      (draft) => {
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;
        setMessagesFor(conversationId!, prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          if (newMsgs[lastIdx] && newMsgs[lastIdx].role === 'assistant') {
            newMsgs[lastIdx] = mergeDocumentDraftIntoMessage(newMsgs[lastIdx], draft);
          }
          return newMsgs;
        });
      },
      async (data) => {
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;
        // Handle code_execution / code_result events
        if (data.type === 'code_execution') {
          // 收到代码执行请求 — 更新消息状态 + 在 Pyodide 中执行
          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.codeExecution = {
                code: data.code || '',
                status: 'running' as const,
                stdout: '',
                stderr: '',
                images: [],
                error: null,
              };
            }
            return newMsgs;
          });

          // 构建文件列表（附件 URL）
          const authToken = safeGetStorageItem('auth_token');
          const files = await Promise.all((data.files || []).map(async (f: any) => {
            const baseUrl = await getAttachmentRawUrl(f.id);
            return {
              name: f.name,
              url: authToken && !baseUrl.startsWith('data:')
                ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(authToken)}`
                : baseUrl,
            };
          }));

          try {
            const result = await executeCode(data.code || '', files, data.executionId);
            // 发送结果回后端
            await sendCodeResult(data.executionId, result, conversationId!);
          } catch (e: any) {
            // 发送错误结果回后端
            await sendCodeResult(data.executionId, {
              stdout: '',
              stderr: '',
              images: [],
              error: e.message || 'Pyodide 执行失败',
            }, conversationId!);
          }
        }

        if (data.type === 'code_result') {
          // 收到执行结果 — 更新消息状态
          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.codeExecution) {
              lastMsg.codeExecution = {
                ...lastMsg.codeExecution,
                status: data.error ? 'error' as const : 'done' as const,
                stdout: data.stdout || '',
                stderr: data.stderr || '',
                images: data.images || [],
                error: data.error || null,
              };
            }
            return newMsgs;
          });
        }
      },
      // Handle tool use events from SDK
      (toolEvent) => {
        if (!isStreamSessionActive(conversationId!, streamRequestId)) return;

        // Track plan mode from tool events
        if (toolEvent.type === 'done' && toolEvent.tool_name === 'EnterPlanMode') setPlanMode(true);
        if (toolEvent.type === 'done' && toolEvent.tool_name === 'ExitPlanMode') setPlanMode(false);

        // Don't add internal tools to UI tool list
        const INTERNAL_TOOLS = new Set(['EnterPlanMode', 'ExitPlanMode', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop']);
        if (INTERNAL_TOOLS.has(toolEvent.tool_name || '')) return;

        setMessagesFor(conversationId!, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (!lastMsg || lastMsg.role !== 'assistant') return prev;

          const toolCalls = lastMsg.toolCalls || [];

          if (toolEvent.type === 'start') {
            // Dedupe by id (we may receive a placeholder tool_use_start before
            // the input has finished streaming, then a tool_use_input later)
            let existing = toolCalls.find((t: any) => t.id === toolEvent.tool_use_id);
            if (existing) {
              existing.name = toolEvent.tool_name || existing.name;
              if (toolEvent.tool_input && Object.keys(toolEvent.tool_input).length > 0) existing.input = toolEvent.tool_input;
              if (toolEvent.textBefore) existing.textBefore = toolEvent.textBefore;
            } else {
              toolCalls.push({
                id: toolEvent.tool_use_id,
                name: toolEvent.tool_name || 'unknown',
                input: toolEvent.tool_input || {},
                status: 'running' as const,
                textBefore: toolEvent.textBefore || '',
              });
            }
          } else if (toolEvent.type === 'input') {
            // Update an existing tool's input after the JSON has fully streamed
            const tc = toolCalls.find((t: any) => t.id === toolEvent.tool_use_id);
            if (tc) tc.input = toolEvent.tool_input || {};
          } else if (toolEvent.type === 'done') {
            let tc = toolCalls.find((t: any) => t.id === toolEvent.tool_use_id);
            if (!tc) {
              // tool_use_start was missed — back-fill the entry so the card still renders
              tc = { id: toolEvent.tool_use_id, name: toolEvent.tool_name || 'unknown', input: {}, status: 'done' as const, result: toolEvent.content };
              toolCalls.push(tc);
            } else {
              tc.status = toolEvent.is_error ? 'error' as const : 'done' as const;
              tc.result = toolEvent.content;
            }
          }

          lastMsg.toolCalls = toolCalls;
          return newMsgs;
        });
      },
      controller.signal
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;

    const sendKey = safeGetStorageItem('sendKey', 'enter');
    // Normalize format (settings uses underscore, old might use plus)
    const sk = sendKey.replace('+', '_').toLowerCase();

    let shouldSend = false;
    if (sk === 'enter') {
      if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) shouldSend = true;
    } else if (sk === 'ctrl_enter') {
      if (e.ctrlKey) shouldSend = true;
    } else if (sk === 'cmd_enter') {
      if (e.metaKey) shouldSend = true;
    } else if (sk === 'alt_enter') {
      if (e.altKey) shouldSend = true;
    }

    if (shouldSend) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-send initialMessage from Project page navigation
  useEffect(() => {
    if (pendingInitialMessageRef.current && activeId && !loading) {
      const msg = pendingInitialMessageRef.current;
      pendingInitialMessageRef.current = null;
      // Small delay to let conversation finish loading
      setTimeout(() => handleSend(msg), 150);
    }
  }, [activeId, loading, pendingLaunchTick]);

  useEffect(() => {
    if (!pendingInitialMessageRef.current || activeId || loading) return;
    if (pendingFiles.some(file => file.status === 'uploading')) return;
    const msg = pendingInitialMessageRef.current;
    pendingInitialMessageRef.current = null;
    setTimeout(() => handleSend(msg), 150);
  }, [activeId, loading, pendingFiles, pendingLaunchTick]);

  // 停止生成（双模式：SSE 直连 or 轮询模式）
  const handleStop = () => {
    if (abortStreamSession(activeId || undefined)) {
      if (activeId) removeStreaming(activeId);
      return;
    }
    if (pollingRef.current && activeId) {
      // 轮询模式：调用后端停止接口
      stopGeneration(activeId).catch(e => console.error('[Stop] error:', e));
      stopPolling();
    }
    if (activeId) removeStreaming(activeId);
    setLoading(false);
    setActiveTasks(new Map());
    isCreatingRef.current = false;
  };

  // 复制消息内容
  // 复制消息内容
  const handleCopyMessage = (content: string, idx: number) => {
    copyToClipboard(content).then((success) => {
      if (success) {
        setCopiedMessageIdx(idx);
        setTimeout(() => setCopiedMessageIdx(null), 2000);
      }
    });
  };

  const extractMessageAttachments = (msg: any) => {
    const raw = Array.isArray(msg?.attachments)
      ? msg.attachments.filter((att: any) => att && ((typeof att.id === 'string' && att.id.trim()) || (typeof att.fileId === 'string' && att.fileId.trim())))
      : [];
    // Normalize to snake_case for component compatibility
    const attachments = raw.map((att: any) => ({
      id: att.id || att.fileId || '',
      file_name: att.file_name || att.fileName || 'file',
      file_type: att.file_type || att.fileType || 'document',
      mime_type: att.mime_type || att.mimeType || '',
      file_size: att.file_size || att.size || 0,
      ...att,
    }));
    const attachmentIds = attachments.map((att: any) => att.id);
    return {
      attachmentIds,
      attachmentsPayload: attachments.length > 0
        ? attachments.map((att: any) => ({ fileId: att.id, fileName: att.file_name, fileType: att.file_type, mimeType: att.mime_type, size: att.file_size }))
        : null,
      optimisticAttachments: attachments,
    };
  };

  // 重新发送消息
  const handleResendMessage = async (content: string, idx: number) => {
    if (loading) return;
    if (activeRequestCountRef.current >= 2) {
      alert('最多同时进行 2 个对话，请等待其他对话完成');
      return;
    }
    const msg = messages[idx];
    const { attachmentIds, attachmentsPayload, optimisticAttachments } = extractMessageAttachments(msg);
    const tempUserMsg: any = { role: 'user', content, created_at: new Date().toISOString() };
    if (optimisticAttachments.length > 0) {
      tempUserMsg.has_attachments = 1;
      tempUserMsg.attachments = optimisticAttachments;
    }
    // 删除当前消息及其后续消息（前端），然后重新添加用户消息 + assistant 占位
    setMessages(prev => [
      ...prev.slice(0, idx),
      tempUserMsg,
      createAssistantPlaceholder(),
    ]);
    // 删除后端消息（regenerate）
    if (activeId) {
      try {
        if (msg.id) {
          await deleteMessagesFrom(activeId, msg.id, attachmentIds);
        } else {
          const tailCount = messages.length - idx;
          if (tailCount > 0) await deleteMessagesTail(activeId, tailCount, attachmentIds);
        }
      } catch (err) {
        console.error('Failed to delete messages from backend:', err);
      }
    }
    // 直接重新发送
    isAtBottomRef.current = true;
    setTimeout(() => scrollToBottom('auto'), 50);
    const controller = new AbortController();
    const conversationId = activeId!;
    const streamRequestId = beginStreamSession(conversationId);
    abortControllerRef.current = controller;
    setLoading(true);
    addStreaming(conversationId);
    activeRequestCountRef.current += 1;
    await sendMessage(
      conversationId,
      content,
      attachmentsPayload,
      (delta, full) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            applyAssistantTextUpdate(lastMsg, full);
          }
          return newMsgs;
        });
      },
      (full) => {
        // Always clean up streaming state and request count
        removeStreaming(conversationId);
        messagesBufferRef.current.delete(conversationId);
        activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        if (viewingIdRef.current === conversationId) {
          setLoading(false);
          setActiveTasks(new Map());
        }
        abortControllerRef.current = null;
        clearStreamSession(conversationId, streamRequestId);
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            applyAssistantTextUpdate(lastMsg, full);
          }
          return newMsgs;
        });
      },
      (err) => {
        // Always clean up streaming state and request count
        removeStreaming(conversationId);
        activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setLoading(false);
        setActiveTasks(new Map());
        abortControllerRef.current = null;
        clearStreamSession(conversationId, streamRequestId);
        setMessages(prev => {
          const newMsgs = [...prev];
          if (newMsgs[newMsgs.length - 1] && newMsgs[newMsgs.length - 1].role === 'assistant') {
            newMsgs[newMsgs.length - 1].content = formatChatError(err);
            newMsgs[newMsgs.length - 1].isThinking = false;
          }
          return newMsgs;
        });
      },
      (thinkingDelta, thinkingFull) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            applyAssistantThinkingUpdate(lastMsg, thinkingFull);
          }
          return newMsgs;
        });
      },
      (event, message, data) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        if (event === 'metadata' && data && data.user_message_id) {
          setMessagesFor(conversationId, prev => {
            const newMsgs = [...prev];
            const userIdx = newMsgs.length - 2;
            if (userIdx >= 0 && newMsgs[userIdx].role === 'user') {
              newMsgs[userIdx] = { ...newMsgs[userIdx], id: data.user_message_id };
            }
            return newMsgs;
          });
        }
        if (event === 'thinking_summary' && message) {
          setMessagesFor(conversationId, prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.thinking_summary = message;
            }
            return newMsgs;
          });
        }
        if (event === 'context_size' && data) {
          setContextInfo({ tokens: data.tokens, limit: data.limit });
        }
        if (event === 'tool_text_offset' && data && data.offset != null) {
          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.toolTextEndOffset = data.offset;
            }
            return newMsgs;
          });
        }
        if (event && event.startsWith('research_')) {
          setMessages(prev => applyResearchEvent(prev, event, data));
        }
      },
      undefined,
      (doc) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          if (newMsgs[lastIdx] && newMsgs[lastIdx].role === 'assistant') {
            newMsgs[lastIdx] = mergeDocumentsIntoMessage(newMsgs[lastIdx], doc);
          }
          return newMsgs;
        });
      },
      (draft) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          if (newMsgs[lastIdx] && newMsgs[lastIdx].role === 'assistant') {
            newMsgs[lastIdx] = mergeDocumentDraftIntoMessage(newMsgs[lastIdx], draft);
          }
          return newMsgs;
        });
      },
      undefined,
      undefined,
      controller.signal
    );
  };

  // 编辑消息 — 进入原地编辑模式（不立即删除后续消息）
  const handleEditMessage = (content: string, idx: number) => {
    if (loading) return;
    setEditingMessageIdx(idx);
    setEditingContent(content);
  };

  // 取消编辑
  const handleEditCancel = () => {
    setEditingMessageIdx(null);
    setEditingContent('');
  };

  // 保存编辑 — 删除当前及后续消息，用新内容重新发送
  const handleEditSave = async () => {
    if (editingMessageIdx === null || !editingContent.trim() || loading) return;
    if (activeRequestCountRef.current >= 2) {
      alert('最多同时进行 2 个对话，请等待其他对话完成');
      return;
    }
    const idx = editingMessageIdx;
    const msg = messages[idx];
    const newContent = editingContent.trim();
    const { attachmentIds, attachmentsPayload, optimisticAttachments } = extractMessageAttachments(msg);

    // 退出编辑模式
    setEditingMessageIdx(null);
    setEditingContent('');

    const tempUserMsg: any = { role: 'user', content: newContent, created_at: new Date().toISOString() };
    if (optimisticAttachments.length > 0) {
      tempUserMsg.has_attachments = 1;
      tempUserMsg.attachments = optimisticAttachments;
    }

    // 删除当前消息及其后续消息（前端），同时加入新的用户消息和 assistant 占位
    setMessages(prev => [
      ...prev.slice(0, idx),
      tempUserMsg,
      createAssistantPlaceholder(),
    ]);

    // 删除后端消息（regenerate）
    if (activeId) {
      try {
        if (msg.id) {
          await deleteMessagesFrom(activeId, msg.id, attachmentIds);
        } else {
          const tailCount = messages.length - idx;
          if (tailCount > 0) await deleteMessagesTail(activeId, tailCount, attachmentIds);
        }
      } catch (err) {
        console.error('Failed to delete messages from backend:', err);
      }
    }

    // 直接发送新内容
    isAtBottomRef.current = true;
    setTimeout(() => scrollToBottom('auto'), 50);

    const conversationId = activeId;
    if (!conversationId) return;

    const controller = new AbortController();
    const streamRequestId = beginStreamSession(conversationId);
    abortControllerRef.current = controller;
    setLoading(true);
    addStreaming(conversationId);
    activeRequestCountRef.current += 1;
    await sendMessage(
      conversationId,
      newContent,
      attachmentsPayload,
      (delta, full) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            applyAssistantTextUpdate(lastMsg, full);
          }
          return newMsgs;
        });
      },
      (full) => {
        // Always clean up streaming state and request count
        removeStreaming(conversationId);
        messagesBufferRef.current.delete(conversationId);
        activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        if (viewingIdRef.current === conversationId) {
          setLoading(false);
          setActiveTasks(new Map());
        }
        abortControllerRef.current = null;
        clearStreamSession(conversationId, streamRequestId);
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            applyAssistantTextUpdate(lastMsg, full);
          }
          return newMsgs;
        });
      },
      (err) => {
        // Always clean up streaming state and request count
        removeStreaming(conversationId);
        activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setLoading(false);
        setActiveTasks(new Map());
        abortControllerRef.current = null;
        clearStreamSession(conversationId, streamRequestId);
        setMessages(prev => {
          const newMsgs = [...prev];
          if (newMsgs[newMsgs.length - 1] && newMsgs[newMsgs.length - 1].role === 'assistant') {
            newMsgs[newMsgs.length - 1].content = formatChatError(err);
            newMsgs[newMsgs.length - 1].isThinking = false;
          }
          return newMsgs;
        });
      },
      (thinkingDelta, thinkingFull) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            applyAssistantThinkingUpdate(lastMsg, thinkingFull);
          }
          return newMsgs;
        });
      },
      (event, message, data) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        if (event === 'metadata' && data && data.user_message_id) {
          setMessagesFor(conversationId, prev => {
            const newMsgs = [...prev];
            const userIdx = newMsgs.length - 2;
            if (userIdx >= 0 && newMsgs[userIdx].role === 'user') {
              newMsgs[userIdx] = { ...newMsgs[userIdx], id: data.user_message_id };
            }
            return newMsgs;
          });
        }
        if (event === 'thinking_summary' && message) {
          setMessagesFor(conversationId, prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.thinking_summary = message;
            }
            return newMsgs;
          });
        }
        if (event === 'context_size' && data) {
          setContextInfo({ tokens: data.tokens, limit: data.limit });
        }
        if (event === 'tool_text_offset' && data && data.offset != null) {
          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.toolTextEndOffset = data.offset;
            }
            return newMsgs;
          });
        }
        if (event && event.startsWith('research_')) {
          setMessages(prev => applyResearchEvent(prev, event, data));
        }
      },
      undefined,
      (doc) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          if (newMsgs[lastIdx] && newMsgs[lastIdx].role === 'assistant') {
            newMsgs[lastIdx] = mergeDocumentsIntoMessage(newMsgs[lastIdx], doc);
          }
          return newMsgs;
        });
      },
      (draft) => {
        if (!isStreamSessionActive(conversationId, streamRequestId)) return;
        setMessagesFor(conversationId, prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          if (newMsgs[lastIdx] && newMsgs[lastIdx].role === 'assistant') {
            newMsgs[lastIdx] = mergeDocumentDraftIntoMessage(newMsgs[lastIdx], draft);
          }
          return newMsgs;
        });
      },
      undefined,
      undefined,
      controller.signal
    );
  };

  // 切换消息展开/折叠
  const toggleMessageExpand = (idx: number) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // === 文件上传相关 ===
  const ACCEPTED_TYPES = 'image/png,image/jpeg,image/jpg,image/gif,image/webp,application/pdf,.docx,.xlsx,.pptx,.odt,.rtf,.epub,.txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.h,.cs,.go,.rs,.rb,.php,.swift,.kt,.scala,.html,.css,.scss,.less,.sql,.sh,.bash,.vue,.svelte,.lua,.r,.m,.pl,.ex,.exs';

  const handleFilesSelected = (files: FileList | File[], defaults?: Partial<PendingFile>) => {
    const fileArray = Array.from(files);
    const maxFiles = 20;
    const currentCount = pendingFiles.length;
    const allowed = fileArray.slice(0, maxFiles - currentCount);

    for (const file of allowed) {
      const id = Math.random().toString(36).slice(2);
      const isImage = file.type.startsWith('image/');
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

      const pending: PendingFile = {
        id,
        file,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        progress: 0,
        status: 'uploading',
        previewUrl,
        ...(defaults || {}),
      };

      setPendingFiles(prev => [...prev, pending]);

      // Calculate lines for text files
      const textExtensions = /\.(txt|md|csv|json|xml|yaml|yml|js|jsx|ts|tsx|py|java|cpp|c|h|cs|go|rs|rb|php|swift|kt|scala|html|css|scss|less|sql|sh|bash|vue|svelte|lua|r|m|pl|ex|exs)$/i;
      if (file.size < 5 * 1024 * 1024 && (file.type.startsWith('text/') || textExtensions.test(file.name))) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          if (text) {
            const lines = text.split(/\r\n|\r|\n/).length;
            setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, lineCount: lines } : f));
          }
        };
        reader.readAsText(file);
      }

      uploadFile(file, (percent) => {
        setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, progress: percent } : f));
      }, activeId).then((result) => {
        setPendingFiles(prev => prev.map(f => f.id === id ? {
          ...f,
          fileId: result.fileId,
          fileType: result.fileType,
          status: 'done' as const,
          progress: 100,
        } : f));
      }).catch((err) => {
        setPendingFiles(prev => prev.map(f => f.id === id ? {
          ...f,
          status: 'error' as const,
          error: err.message,
        } : f));
      });
    }
  };

  const handleNativeFileSelected = async () => {
    const filePath = await selectDesktopFile();
    if (!filePath) return;

    const id = Math.random().toString(36).slice(2);
    const fileName = filePath.split(/[\\/]/).pop() || 'file';
    const pending: PendingFile = {
      id,
      fileName,
      mimeType: 'application/octet-stream',
      size: 0,
      progress: 0,
      status: 'uploading',
    };

    setPendingFiles(prev => [...prev, pending]);
    uploadFilePath(filePath, (percent) => {
      setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, progress: percent } : f));
    }, activeId).then((result) => {
      setPendingFiles(prev => prev.map(f => f.id === id ? {
        ...f,
        fileId: result.fileId,
        fileName: result.fileName,
        fileType: result.fileType,
        mimeType: result.mimeType,
        size: result.size,
        status: 'done' as const,
        progress: 100,
      } : f));
    }).catch((err) => {
      setPendingFiles(prev => prev.map(f => f.id === id ? {
        ...f,
        status: 'error' as const,
        error: err.message,
      } : f));
    });
  };

  const openFilePicker = () => {
    if (isDesktopApp()) {
      void handleNativeFileSelected();
      return;
    }
    fileInputRef.current?.click();
  };

  const handleRemoveFile = (id: string) => {
    setPendingFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      // 已上传的文件调后端删除，释放存储空间
      if (file?.fileId) {
        deleteAttachment(file.fileId).catch(() => { });
      }
      return prev.filter(f => f.id !== id);
    });
  };

  // Handle "Add from GitHub" confirmation: resolve/create conversation,
  // materialize files into its workspace, then add a visual-only card.
  const handleGithubAdd = async (payload: GithubAddPayload): Promise<void> => {
    let convId = activeId;
    let createdNewConv = false;
    if (!convId) {
      const modelForCreate = resolveModelForCreate();
      rememberDefaultModel(modelForCreate);
      const workspaceFolder = pendingWorkspaceFolderRef.current;
      const newConv = await createConversation(undefined, modelForCreate, {
        research_mode: researchMode,
        ...(workspaceFolder ? { workspace: { mode: 'existing-folder' as const, folderPath: workspaceFolder } } : {}),
      });
      pendingWorkspaceFolderRef.current = null;
      pendingLaunchModelRef.current = null;
      if (!newConv || !newConv.id) throw new Error('Failed to create conversation');
      convId = newConv.id;
      createdNewConv = true;
      warmEngine(convId);
      onNewChat();
    }

    const result = await materializeGithub(
      convId,
      payload.repoFullName,
      payload.ref,
      payload.selections,
    );

    const githubCard: PendingFile = {
      id: Math.random().toString(36).slice(2),
      file: new File([], 'github-placeholder'),
      fileName: payload.repoFullName,
      mimeType: 'application/x-github',
      size: 0,
      progress: 100,
      status: 'done',
      source: 'github',
      ghRepo: payload.repoFullName,
      ghRef: payload.ref,
      lineCount: result.fileCount,
    };

    if (createdNewConv) {
      // Stash the card into draftsStore under the NEW conv key so the mount
      // effect restores it. Then navigate — the useEffect will pick it up.
      const text = inputTextRef.current || '';
      const height = textareaHeightRef.current || inputBarBaseHeight;
      draftsStore.set(convId, { text, files: [githubCard], height });
      navigate(`${conversationRouteBase}/${convId}`, { replace: true });
    } else {
      setPendingFiles(prev => [...prev, githubCard]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // 1. 优先检查图片
    const items = e.clipboardData?.items;
    if (items) {
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFilesSelected(imageFiles);
        return;
      }
    }

    // 2. 检查长文本 (超过 10000 字符或 100 行自动转为附件)
    const text = e.clipboardData.getData('text');
    if (text) {
      const lineCount = text.split('\n').length;
      if (text.length > 10000 || lineCount > 100) {
        e.preventDefault();
        const blob = new Blob([text], { type: 'text/plain' });
        const file = new File([blob], 'Pasted-Text.txt', { type: 'text/plain' });
        handleFilesSelected([file]);
      }
    }
  };

  const resizeLandingInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
    el.style.overflowY = el.scrollHeight > 300 ? 'auto' : 'hidden';
  }, []);

  const updateInputFromVoice = useCallback((nextValue: string) => {
    setInputText(nextValue);
    requestAnimationFrame(() => resizeLandingInput());
  }, [resizeLandingInput]);

  const stopVoiceDictation = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
  }, []);

  const handleVoiceDictationToggle = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setVoiceToast('当前环境暂不支持语音听写。');
      return;
    }

    if (isVoiceListening) {
      stopVoiceDictation();
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor() as BrowserSpeechRecognition;
      recognitionRef.current = recognition;
      voiceBaseInputRef.current = inputText.trimEnd();
      voiceCommittedTranscriptRef.current = '';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'zh-CN';

      recognition.onstart = () => {
        setIsVoiceListening(true);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i]?.[0]?.transcript ?? '';
          if (!transcript) continue;
          if (event.results[i].isFinal) {
            voiceCommittedTranscriptRef.current += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const nextTranscript = `${voiceCommittedTranscriptRef.current}${interimTranscript}`.trim();
        const nextValue = [voiceBaseInputRef.current, nextTranscript].filter(Boolean).join(' ').trim();
        updateInputFromVoice(nextValue);
      };

      recognition.onerror = (event: any) => {
        const message = formatVoiceError(event?.error);
        if (message) setVoiceToast(message);
        recognitionRef.current = null;
        setIsVoiceListening(false);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        setIsVoiceListening(false);
      };

      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsVoiceListening(false);
      setVoiceToast('当前环境暂时无法启动语音听写。');
    }
  }, [inputText, isVoiceListening, stopVoiceDictation, updateInputFromVoice]);


  // --- Render Logic ---

  const closePlusMenu = () => {
    setShowPlusMenu(false);
    setShowSkillsSubmenu(false);
    setShowProjectsSubmenu(false);
  };

  const landingPlusMenuShellClass = "absolute left-0 top-full mt-2 z-50 w-[218px] rounded-[12px] border border-[rgba(31,31,30,0.3)] dark:border-white/15 bg-white dark:bg-claude-input px-[7px] pb-px pt-[7px] shadow-[0_2px_8px_rgba(0,0,0,0.08)]";
  const landingPlusMenuItemClass = "flex h-[32px] w-full items-center gap-[8px] rounded-[8px] px-[8px] py-[6px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5";
  const landingPlusMenuTextClass = "text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text";
  const landingPlusMenuSubmenuClass = "absolute left-full top-0 ml-2 z-50 w-[218px] max-h-[30vh] overflow-y-auto rounded-[12px] border border-[rgba(31,31,30,0.3)] dark:border-white/15 bg-white dark:bg-claude-input px-[7px] pb-px pt-[7px] shadow-[0_2px_8px_rgba(0,0,0,0.08)]";
  const renderLandingPlusMenu = () => showPlusMenu ? (
    <div
      ref={plusMenuRef}
      className={landingPlusMenuShellClass}
    >
      <button
        onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
        onClick={() => { closePlusMenu(); openFilePicker(); }}
        className={landingPlusMenuItemClass}
      >
        <img src={plusMenuAttachIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
        <span className={landingPlusMenuTextClass}>Add files or photos</span>
      </button>
      <button
        onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
        onClick={closePlusMenu}
        className={landingPlusMenuItemClass}
      >
        <img src={plusMenuScreenshotIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
        <span className={landingPlusMenuTextClass}>Take a screenshot</span>
      </button>
      <div className="relative" onMouseLeave={() => setShowProjectsSubmenu(false)}>
        <button
          onMouseEnter={() => { setShowProjectsSubmenu(true); setShowSkillsSubmenu(false); }}
          onClick={() => setShowProjectsSubmenu(prev => !prev)}
          className={`${landingPlusMenuItemClass} justify-between`}
        >
          <div className="flex items-center gap-[8px]">
            <img src={plusMenuProjectIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
            <span className={landingPlusMenuTextClass}>Add to project</span>
          </div>
          <img src={plusMenuChevronIcon} alt="" aria-hidden="true" className="h-[16px] w-[16px] shrink-0 dark:invert dark:brightness-150" />
        </button>
        {showProjectsSubmenu && (
          <div className={landingPlusMenuSubmenuClass}>
            {projectList.length > 0 ? projectList.map(p => {
              const isSelected = (activeId && currentProjectId === p.id) || (!activeId && pendingProjectId === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => handleAttachToProject(p)}
                  className="flex h-[32px] w-full items-center justify-between gap-2 rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <IconProjects size={20} className="text-claude-textSecondary shrink-0 dark:[filter:brightness(0)_invert(1)_brightness(0.68)_sepia(0.18)]" />
                    <span className="truncate text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">{p.name}</span>
                  </div>
                  {isSelected && <Check size={14} className="shrink-0 text-[#2977D6]" />}
                </button>
              );
            }) : (
              <div className="px-[8px] py-[6px] text-[13px] italic text-[#7B7974]">No projects yet</div>
            )}
            <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
            <button
              onClick={() => {
                setShowProjectsSubmenu(false);
                closePlusMenu();
                setNewProjectName('');
                setNewProjectDescription('');
                setShowNewProjectDialog(true);
              }}
              className="flex h-[32px] w-full items-center gap-[8px] rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
            >
              <Plus size={14} className="text-[#7B7974] dark:text-claude-textSecondary" />
              <span className="text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">Start a new project</span>
            </button>
          </div>
        )}
      </div>
      <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
      <div className="relative" onMouseLeave={() => setShowSkillsSubmenu(false)}>
        <button
          onMouseEnter={() => { setShowSkillsSubmenu(true); setShowProjectsSubmenu(false); }}
          onClick={() => setShowSkillsSubmenu(prev => !prev)}
          className={`${landingPlusMenuItemClass} justify-between`}
        >
          <div className="flex items-center gap-[8px]">
            <img src={plusMenuSkillsIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
            <span className={landingPlusMenuTextClass}>Skills</span>
          </div>
          <img src={plusMenuChevronIcon} alt="" aria-hidden="true" className="h-[16px] w-[16px] shrink-0 dark:invert dark:brightness-150" />
        </button>
        {showSkillsSubmenu && (
          <div className={landingPlusMenuSubmenuClass}>
            {enabledSkills.length > 0 ? enabledSkills.map(skill => (
              <button
                key={skill.id}
                onClick={() => {
                  closePlusMenu();
                  const slug = skill.name.toLowerCase().replace(/\s+/g, '-');
                  setSelectedSkill({ name: skill.name, slug, description: skill.description });
                  setInputText(prev => prev ? `/${slug} ${prev}` : `/${slug} `);
                  inputRef.current?.focus();
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
              onClick={() => {
                closePlusMenu();
                navigate(customizeRoute);
              }}
              className="flex h-[32px] w-full items-center gap-[8px] rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
            >
              <img src={plusMenuSkillsIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
              <span className="text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">Manage skills</span>
            </button>
          </div>
        )}
      </div>
      <button
        onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
        onClick={() => { closePlusMenu(); navigate(customizeRoute); }}
        className={landingPlusMenuItemClass}
      >
        <img src={plusMenuConnectorsIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
        <span className={landingPlusMenuTextClass}>Add connectors</span>
      </button>
      <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
      <button
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
          <img src={plusMenuWebSearchIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0" />
          <span className={`text-[14px] leading-[20px] tracking-[-0.1504px] ${currentProviderSupportsWebSearch ? 'text-[#2977D6] dark:text-[#3B8BE5]' : 'text-[#121212] dark:text-claude-text'}`}>Web search</span>
        </div>
        {currentProviderSupportsWebSearch ? (
          <img src={plusMenuCheckIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0" />
        ) : null}
      </button>
      <button
        onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
        onClick={closePlusMenu}
        className={`${landingPlusMenuItemClass} justify-between`}
      >
        <div className="flex items-center gap-[8px]">
          <img src={plusMenuStyleIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
          <span className={landingPlusMenuTextClass}>Use style</span>
        </div>
        <img src={plusMenuChevronIcon} alt="" aria-hidden="true" className="h-[16px] w-[16px] shrink-0 dark:invert dark:brightness-150" />
      </button>
    </div>
  ) : null;

  // Shared overlays rendered in both MODE 1 and MODE 2
  const sharedProjectOverlays = (
    <>
      {showNewProjectDialog && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
          onClick={() => { setShowNewProjectDialog(false); setNewProjectName(''); setNewProjectDescription(''); }}
        >
          <div className="bg-claude-bg border border-claude-border rounded-2xl shadow-xl w-[560px] max-w-[92vw] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-7 pt-6 pb-4">
              <h2 className="font-[Spectral] text-[22px] text-claude-text" style={{ fontWeight: 600 }}>Create a project</h2>
              <button
                onClick={() => { setShowNewProjectDialog(false); setNewProjectName(''); setNewProjectDescription(''); }}
                className="p-1 text-claude-textSecondary hover:text-claude-text hover:bg-claude-hover rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-7 pb-4 space-y-5">
              <div>
                <label className="block text-[15px] font-medium text-claude-textSecondary mb-2">What are you working on?</label>
                <input
                  type="text"
                  placeholder="Name your project"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newProjectName.trim()) handleCreateProjectFromMenu(); }}
                  className="w-full px-4 py-3 bg-white dark:bg-claude-input border border-gray-200 dark:border-claude-border rounded-xl text-claude-text placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-[#387ee0] focus:ring-0 transition-all text-[15px]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[15px] font-medium text-claude-textSecondary mb-2">What are you trying to achieve?</label>
                <textarea
                  placeholder="Describe your project, goals, subject, etc..."
                  rows={3}
                  value={newProjectDescription}
                  onChange={e => setNewProjectDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-claude-input border border-gray-200 dark:border-claude-border rounded-xl text-claude-text placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-[#387ee0] focus:ring-0 transition-all text-[15px] resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-7 pb-6 pt-2">
              <button
                onClick={() => { setShowNewProjectDialog(false); setNewProjectName(''); setNewProjectDescription(''); }}
                className="px-5 py-2.5 text-[15px] font-medium text-claude-text bg-white dark:bg-claude-bg border border-gray-300 dark:border-claude-border hover:bg-gray-50 dark:hover:bg-claude-hover rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProjectFromMenu}
                disabled={!newProjectName.trim()}
                className="px-5 py-2.5 text-[15px] font-medium text-claude-bg bg-black dark:bg-white dark:text-black hover:opacity-90 rounded-xl transition-opacity disabled:opacity-40"
              >
                Create project
              </button>
            </div>
          </div>
        </div>
      )}
      {projectAddToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 bg-claude-input border border-claude-border rounded-lg shadow-lg text-[13px] text-claude-text flex items-center gap-2">
          <Check size={14} className="text-[#C6613F]" />
          {projectAddToast}
        </div>
      )}
      {webSearchToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 bg-claude-input border border-claude-border rounded-lg shadow-lg text-[13px] text-claude-text flex items-center gap-2">
          <IconWebSearch size={14} className="text-claude-textSecondary" />
          {webSearchToast}
        </div>
      )}
      {voiceToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 bg-claude-input border border-claude-border rounded-lg shadow-lg text-[13px] text-claude-text flex items-center gap-2">
          <IconVoice size={14} className="text-[#121212]" />
          {voiceToast}
        </div>
      )}
    </>
  );

  const isCodeConversation = location.pathname.startsWith('/code');

  // MODE 1: Landing Page (No ID)
  if (false && !activeId && messages.length === 0 && !isCodeConversation) {
    const canSend = (inputText.trim() || pendingFiles.some(f => f.status === 'done')) && !loading && !pendingFiles.some(f => f.status === 'uploading');
    const promptTabs = LANDING_PROMPT_SECTIONS;
    const activePromptSection = promptTabs.find((tab) => tab.label === activeLandingPromptSection) ?? null;

    // 使用统一的Landing布局
    return (
      <UnifiedLandingLayout
        title={welcomeGreeting}
        icon={<IconCoworkSparkle size={32} />}
        starterIdeas={
          <div className="w-[672px]">
            <div className="mb-[16px] flex items-center justify-center gap-[8px]">
              {promptTabs.map((tab) => {
                const isActive = tab.label === activeLandingPromptSection;
                return (
                  <button
                    key={tab.label}
                    type="button"
                    onClick={() => setActiveLandingPromptSection(tab.label)}
                    className={`flex h-[32px] items-center gap-[6px] rounded-[10px] px-[12px] text-[13px] font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-[#f6f3ee] text-[#373734] shadow-sm dark:bg-[#201d19] dark:text-[#D7D0C4]'
                        : 'text-[#7b7974] hover:bg-[#f6f3ee]/50 hover:text-[#373734] dark:hover:bg-[#201d19]/50 dark:hover:text-[#D7D0C4]'
                    }`}
                  >
                    <img src={tab.icon} alt="" className="h-[16px] w-[16px] dark:invert dark:brightness-200" style={{ width: `${tab.width}px` }} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            {activePromptSection && (
              <div className="grid grid-cols-2 gap-[8px]">
                {activePromptSection.items.map((item) => (
                  <button
                    key={item.artifact_id}
                    type="button"
                    onClick={() => {
                      setInputText(item.starting_prompt);
                      inputRef.current?.focus();
                    }}
                    className="group flex flex-col items-start gap-[6px] rounded-[12px] border border-[rgba(31,31,30,0.08)] bg-white p-[12px] text-left transition-all duration-200 hover:border-[rgba(31,31,30,0.15)] hover:shadow-sm dark:border-white/5 dark:bg-claude-input dark:hover:border-white/10"
                  >
                    <div className="text-[13px] font-medium text-[#373734] dark:text-claude-text">{item.name}</div>
                    <div className="text-[12px] text-[#7b7974] dark:text-claude-textSecondary">{item.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      >
        <UnifiedInputContainer
          modelOptions={selectorModels}
          currentModel={currentModelString}
          onModelChange={(model) => {
            setCurrentModelString(model);
            rememberDefaultModel(model);
          }}
          canSend={canSend}
          onSend={handleSend}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          bottomActions={
            <div className="relative flex items-center">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept={ACCEPTED_TYPES}
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                ref={plusBtnRef}
                onClick={() => setShowPlusMenu(prev => !prev)}
                className="flex h-[32px] w-[34px] items-center justify-center rounded-[8px] transition-colors hover:bg-[#f5f4f1] dark:hover:bg-white/5"
              >
                <img src={inputPlusIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] dark:invert dark:brightness-200" />
              </button>
              {renderLandingPlusMenu()}
            </div>
          }
        >
          <FileUploadPreview files={pendingFiles} onRemove={handleRemoveFile} />
          <div className="relative min-h-[48px]">
            <SkillInputOverlay
              text={inputText}
              className="pl-[6px] pr-0 pt-[4px] pb-0 text-[16px] leading-[24px] font-sans font-normal tracking-[-0.3125px] overflow-hidden"
              style={{ minHeight: '48px' }}
            />
            <textarea
              ref={inputRef}
              className={`w-full pl-[6px] pr-0 pt-[4px] pb-0 placeholder:text-[#7b7974] text-[16px] leading-[24px] tracking-[-0.3125px] outline-none resize-none overflow-hidden bg-transparent font-sans font-normal ${inputText.match(/^\/[a-zA-Z0-9_-]+/) ? 'text-transparent caret-claude-text' : 'text-[#373734] dark:text-claude-text'}`}
              style={{ minHeight: '48px' }}
              placeholder={selectedSkill ? `Describe what you want ${selectedSkill.name} to do...` : "How can I help you today?"}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
                e.target.style.overflowY = e.target.scrollHeight > 300 ? 'auto' : 'hidden';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && selectedSkill) {
                  const pos = (e.target as HTMLTextAreaElement).selectionStart;
                  const skillPrefix = `/${selectedSkill.slug} `;
                  if (pos > 0 && pos <= skillPrefix.length && inputText.startsWith(skillPrefix.slice(0, pos))) {
                    e.preventDefault();
                    setInputText(inputText.slice(skillPrefix.length));
                    setSelectedSkill(null);
                    return;
                  }
                }
                handleKeyDown(e);
              }}
              onPaste={handlePaste}
              autoFocus
            />
          </div>
        </UnifiedInputContainer>
      </UnifiedLandingLayout>
    );
  }

  // 旧的MODE 1代码（保留以防需要恢复功能）
  if (!activeId && messages.length === 0 && !isCodeConversation) {
    const canSend = (inputText.trim() || pendingFiles.some(f => f.status === 'done')) && !loading && !pendingFiles.some(f => f.status === 'uploading');
    const promptTabs = LANDING_PROMPT_SECTIONS;
    const activePromptSection = promptTabs.find((tab) => tab.label === activeLandingPromptSection) ?? null;

    return (
      <div className={`flex-1 bg-claude-bg h-full flex flex-col relative overflow-hidden text-claude-text chat-font-scope ${showEntranceAnimation ? 'animate-slide-in' : ''}`}>
        <div className="flex-1 flex flex-col items-center pt-[179px]">
          <div className="flex w-[672px] flex-col items-center">
            <div className="mb-[28px] flex h-[60px] w-[672px] items-center justify-center gap-[12px]">
              <div className="flex h-[32px] w-[32px] items-center justify-center shrink-0">
                <IconCoworkSparkle size={32} className="text-claude-accent" />
              </div>
              <h1
                className="whitespace-nowrap text-[#373734] dark:!text-[#d6cec3]"
                style={{
                  fontFamily: '"Anthropic Serif", "Source Serif 4", "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
                  fontSize: '40px',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  lineHeight: '60px',
                }}
              >
                {welcomeGreeting}
              </h1>
            </div>

            <div className="relative w-[672px] group">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept={ACCEPTED_TYPES}
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <div
                className={`w-[672px] border transition-all duration-200 flex flex-col max-h-[60vh] font-sans bg-white dark:bg-claude-input ${isDragging ? 'border-[#D97757] bg-orange-50/30 dark:bg-orange-900/20' : 'border-transparent'} focus-within:border-[#d9d7d0] dark:focus-within:border-claude-border`}
                style={{
                  borderRadius: '20px',
                  boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.04), 0px 0px 0px rgba(31, 31, 30, 0.15)',
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col px-[15px] py-[15px]">
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <FileUploadPreview files={pendingFiles} onRemove={handleRemoveFile} />
                    <div className="relative min-h-[48px]">
                      <SkillInputOverlay
                        text={inputText}
                        className="pl-[6px] pr-0 pt-[4px] pb-0 text-[16px] leading-[24px] font-sans font-normal tracking-[-0.3125px] overflow-hidden"
                        style={{ minHeight: '48px' }}
                      />
                      <textarea
                        ref={inputRef}
                        className={`w-full pl-[6px] pr-0 pt-[4px] pb-0 placeholder:text-[#7b7974] text-[16px] leading-[24px] tracking-[-0.3125px] outline-none resize-none overflow-hidden bg-transparent font-sans font-normal ${inputText.match(/^\/[a-zA-Z0-9_-]+/) ? 'text-transparent caret-claude-text' : 'text-[#373734]'}`}
                        style={{ minHeight: '48px' }}
                        placeholder={selectedSkill ? `Describe what you want ${selectedSkill.name} to do...` : "How can I help you today?"}
                        value={inputText}
                        onChange={(e) => {
                          setInputText(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
                          e.target.style.overflowY = e.target.scrollHeight > 300 ? 'auto' : 'hidden';
                        }}
                        onKeyDown={(e) => {
                          // Backspace deletes entire /skill-name as a unit
                          if (e.key === 'Backspace' && selectedSkill) {
                            const pos = (e.target as HTMLTextAreaElement).selectionStart;
                            const skillPrefix = `/${selectedSkill.slug} `;
                            if (pos > 0 && pos <= skillPrefix.length && inputText.startsWith(skillPrefix.slice(0, pos))) {
                              e.preventDefault();
                              setInputText(inputText.slice(skillPrefix.length));
                              setSelectedSkill(null);
                              return;
                            }
                          }
                          handleKeyDown(e);
                        }}
                        onPaste={handlePaste}
                      />
                    </div>
                  </div>
                  <div className="mt-[12px] flex h-[32px] items-center justify-between">
                    <div className="relative flex items-center">
                      <button
                        ref={plusBtnRef}
                        onClick={() => setShowPlusMenu(prev => !prev)}
                        className="flex h-[32px] w-[34px] items-center justify-center rounded-[8px] transition-colors hover:bg-[#f5f4f1] dark:hover:bg-white/5"
                      >
                        <img src={inputPlusIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] dark:invert dark:brightness-200" />
                      </button>
                      {showPlusMenu && (
                        <div
                          ref={plusMenuRef}
                          className={landingPlusMenuShellClass}
                        >
                          <button
                            onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
                            onClick={() => { closePlusMenu(); openFilePicker(); }}
                            className={landingPlusMenuItemClass}
                          >
                            <img src={plusMenuAttachIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
                            <span className={landingPlusMenuTextClass}>Add files or photos</span>
                          </button>
                          <button
                            onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
                            onClick={closePlusMenu}
                            className={landingPlusMenuItemClass}
                          >
                            <img src={plusMenuScreenshotIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
                            <span className={landingPlusMenuTextClass}>Take a screenshot</span>
                          </button>
                          <div className="relative" onMouseLeave={() => setShowProjectsSubmenu(false)}>
                            <button
                              onMouseEnter={() => { setShowProjectsSubmenu(true); setShowSkillsSubmenu(false); }}
                              onClick={() => setShowProjectsSubmenu(prev => !prev)}
                              className={`${landingPlusMenuItemClass} justify-between`}
                            >
                              <div className="flex items-center gap-[8px]">
                                <img src={plusMenuProjectIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
                                <span className={landingPlusMenuTextClass}>Add to project</span>
                              </div>
                              <img src={plusMenuChevronIcon} alt="" aria-hidden="true" className="h-[16px] w-[16px] shrink-0 dark:invert dark:brightness-150" />
                            </button>
                            {showProjectsSubmenu && (
                              <div className={landingPlusMenuSubmenuClass}>
                                {projectList.length > 0 ? projectList.map(p => {
                                  const isSelected = (activeId && currentProjectId === p.id) || (!activeId && pendingProjectId === p.id);
                                  return (
                                    <button
                                      key={p.id}
                                      onClick={() => handleAttachToProject(p)}
                                      className="flex h-[32px] w-full items-center justify-between gap-2 rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
                                    >
                                      <div className="flex min-w-0 items-center gap-2">
                                        <IconProjects size={20} className="text-claude-textSecondary shrink-0 dark:[filter:brightness(0)_invert(1)_brightness(0.68)_sepia(0.18)]" />
                                        <span className="truncate text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">{p.name}</span>
                                      </div>
                                      {isSelected && <Check size={14} className="shrink-0 text-[#2977D6]" />}
                                    </button>
                                  );
                                }) : (
                                  <div className="px-[8px] py-[6px] text-[13px] italic text-[#7B7974]">No projects yet</div>
                                )}
                                <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
                                <button
                                  onClick={() => {
                                    setShowProjectsSubmenu(false);
                                    closePlusMenu();
                                    setNewProjectName('');
                                    setNewProjectDescription('');
                                    setShowNewProjectDialog(true);
                                  }}
                                  className="flex h-[32px] w-full items-center gap-[8px] rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
                                >
                                  <Plus size={14} className="text-[#7B7974] dark:text-claude-textSecondary" />
                                  <span className="text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">Start a new project</span>
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
                          <div className="relative" onMouseLeave={() => setShowSkillsSubmenu(false)}>
                            <button
                              onMouseEnter={() => { setShowSkillsSubmenu(true); setShowProjectsSubmenu(false); }}
                              onClick={() => setShowSkillsSubmenu(prev => !prev)}
                              className={`${landingPlusMenuItemClass} justify-between`}
                            >
                              <div className="flex items-center gap-[8px]">
                                <img src={plusMenuSkillsIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
                                <span className={landingPlusMenuTextClass}>Skills</span>
                              </div>
                              <img src={plusMenuChevronIcon} alt="" aria-hidden="true" className="h-[16px] w-[16px] shrink-0 dark:invert dark:brightness-150" />
                            </button>
                            {showSkillsSubmenu && (
                              <div className={landingPlusMenuSubmenuClass}>
                                {enabledSkills.length > 0 ? enabledSkills.map(skill => (
                                  <button
                                    key={skill.id}
                                    onClick={() => {
                                      closePlusMenu();
                                      const slug = skill.name.toLowerCase().replace(/\s+/g, '-');
                                      setSelectedSkill({ name: skill.name, slug, description: skill.description });
                                      setInputText(prev => prev ? `/${slug} ${prev}` : `/${slug} `);
                                      inputRef.current?.focus();
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
                                  onClick={() => {
                                    closePlusMenu();
                                    navigate(customizeRoute);
                                  }}
                                  className="flex h-[32px] w-full items-center gap-[8px] rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#F5F4F1] dark:hover:bg-white/5"
                                >
                                  <img src={plusMenuSkillsIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
                                  <span className="text-[14px] leading-[20px] tracking-[-0.1504px] text-[#121212] dark:text-claude-text">Manage skills</span>
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
                            onClick={() => { closePlusMenu(); navigate(customizeRoute); }}
                            className={landingPlusMenuItemClass}
                          >
                            <img src={plusMenuConnectorsIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
                            <span className={landingPlusMenuTextClass}>Add connectors</span>
                          </button>
                          <div className="mx-[8px] my-[7px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
                          <button
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
                              <img src={plusMenuWebSearchIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0" />
                              <span className={`text-[14px] leading-[20px] tracking-[-0.1504px] ${currentProviderSupportsWebSearch ? 'text-[#2977D6] dark:text-[#3B8BE5]' : 'text-[#121212] dark:text-claude-text'}`}>Web search</span>
                            </div>
                            {currentProviderSupportsWebSearch ? (
                              <img src={plusMenuCheckIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0" />
                            ) : null}
                          </button>
                          <button
                            onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
                            onClick={closePlusMenu}
                            className={`${landingPlusMenuItemClass} justify-between`}
                          >
                            <div className="flex items-center gap-[8px]">
                              <img src={plusMenuStyleIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0 dark:invert dark:brightness-200" />
                              <span className={landingPlusMenuTextClass}>Use style</span>
                            </div>
                            <img src={plusMenuChevronIcon} alt="" aria-hidden="true" className="h-[16px] w-[16px] shrink-0 dark:invert dark:brightness-150" />
                          </button>
                        </div>
                      )}
                      {/* Blue research badge next to + button when enabled */}
                      {researchMode && (
                        <div className="group/research relative ml-1 flex items-center bg-[#DBEAFE] dark:bg-[#1E3A5F] rounded-lg p-1.5">
                          <IconResearch size={16} className="text-[#2E7CF6] flex-shrink-0" />
                          <span className="inline-flex items-center overflow-hidden w-0 group-hover/research:w-[18px] transition-[width] duration-150 ease-out">
                            <button
                              onClick={toggleResearchMode}
                              className="ml-1 flex-shrink-0 flex items-center justify-center hover:opacity-70 transition-opacity"
                              aria-label="Disable research mode"
                            >
                              <X size={14} className="text-[#2E7CF6]" />
                            </button>
                          </span>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-[#2a2a2a] text-white dark:bg-[#e8e8e8] dark:text-[#1a1a1a] rounded-md text-[11px] whitespace-nowrap opacity-0 group-hover/research:opacity-100 pointer-events-none transition-opacity">
                            Research mode
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-[8px]">
                      <ModelSelector
                        currentModelString={currentModelString}
                        models={selectorModels}
                        onModelChange={handleModelChange}
                        isNewChat={true}
                        variant="landing"
                        caretIconSrc={modelCaretIcon}
                      />
                      {canSend && !isVoiceListening ? (
                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            void handleSend()
                          }}
                          disabled={!canSend}
                          className="flex h-[32px] w-[40px] items-center justify-center rounded-[8px] bg-[#efcbc0] text-white transition-colors hover:bg-[#e7bcaf] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowUp size={18} strokeWidth={2.3} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={isVoiceListening ? 'Stop voice dictation' : 'Use voice mode'}
                          aria-pressed={isVoiceListening}
                          onClick={handleVoiceDictationToggle}
                          className={`group relative flex h-[32px] w-[36px] items-center justify-center rounded-[8px] transition-all duration-200 ${isVoiceListening ? 'bg-[#f4e3dc] shadow-[inset_0_0_0_1px_rgba(198,97,63,0.08)]' : 'hover:-translate-y-[1px] hover:bg-[#f5f4f1] dark:hover:bg-white/5'}`}
                        >
                          {isVoiceListening && (
                            <span className="absolute inset-0 rounded-[8px] bg-[#f7d9ce] opacity-60 animate-pulse" aria-hidden="true" />
                          )}
                          <IconVoice size={20} className="relative text-[#121212] dark:text-claude-text" active={isVoiceListening} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {activePromptSection && (
              <div className="mt-[12px] w-[672px] overflow-hidden rounded-[16px] border border-[rgba(31,31,30,0.15)] dark:border-claude-border bg-white dark:bg-claude-input shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                <div className="flex items-center justify-between px-[16px] py-[12px]">
                  <div className="flex items-center gap-[8px]">
                    <img src={activePromptSection.icon} alt="" aria-hidden="true" className="h-[20px] w-[18px] shrink-0 dark:invert dark:brightness-200" />
                    <span className="text-[14px] leading-[19.6px] tracking-[-0.1504px] text-[#605E5A] dark:text-claude-textSecondary">
                      {activePromptSection.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveLandingPromptSection(null)}
                    className="flex h-[20px] w-[20px] items-center justify-center rounded-full text-[#7B7974] dark:text-claude-textSecondary transition-colors hover:bg-[#f5f4f1] dark:hover:bg-white/5 hover:text-[#373734] dark:hover:text-claude-text"
                    aria-label={`Close ${activePromptSection.label} suggestions`}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="border-t border-[rgba(31,31,30,0.12)] dark:border-white/10" />
                <div className="flex flex-col">
                  {activePromptSection.items.map((item, index) => (
                    <button
                      key={item.artifact_id}
                      type="button"
                      onClick={() => {
                        setActiveLandingPromptSection(null);
                        setInputText(item.starting_prompt);
                        requestAnimationFrame(() => {
                          resizeLandingInput();
                          inputRef.current?.focus();
                        });
                      }}
                      className={`flex min-h-[44px] items-center px-[16px] py-[10px] text-left transition-colors hover:bg-[#f8f7f4] dark:hover:bg-white/5 ${index < activePromptSection.items.length - 1 ? 'border-b border-[rgba(31,31,30,0.12)] dark:border-white/10' : ''}`}
                    >
                      <span className="text-[14px] leading-[19.6px] tracking-[-0.1504px] text-[#373734] dark:text-claude-text">
                        {item.description || item.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-[16px] flex h-[32px] w-full items-center justify-center gap-[8px]">
              {promptTabs.map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => setActiveLandingPromptSection((prev) => prev === tab.label ? null : tab.label)}
                  className={`group flex h-[32px] items-center gap-[6px] overflow-hidden rounded-[8px] border px-[10px] text-[#373734] dark:text-claude-text transition-all duration-200 hover:-translate-y-[1px] ${activeLandingPromptSection === tab.label ? 'bg-white dark:bg-claude-input border-[rgba(31,31,30,0.25)] dark:border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.06)]' : 'bg-[#f8f8f6] dark:bg-claude-bg border-[rgba(31,31,30,0.15)] dark:border-white/10 hover:bg-[#f3f2ee] dark:hover:bg-claude-hover'}`}
                  style={{
                    width: `${tab.width}px`,
                  }}
                >
                  <img src={tab.icon} alt="" aria-hidden="true" className="h-5 w-[18px] shrink-0 transition-transform duration-200 group-hover:-translate-y-[1px] dark:invert dark:brightness-150" />
                  <span className="truncate text-[14px] font-normal leading-[19.6px] tracking-[-0.1504px]">
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <AddFromGithubModal
          isOpen={showGithubModal}
          onClose={() => setShowGithubModal(false)}
          currentContextTokens={contextInfo?.tokens || 0}
          contextLimit={contextInfo?.limit || 200000}
          onConfirm={handleGithubAdd}
        />
        {sharedProjectOverlays}
      </div>
    );
  }

  // MODE 2: Chat Interface (Has ID or Messages)
  const effectiveWorkspacePath = activeWorkspacePath || pendingWorkspaceFolderRef.current || null;
  const workspaceLabel = effectiveWorkspacePath
    ? effectiveWorkspacePath.split(/[\\/]/).filter(Boolean).pop() || effectiveWorkspacePath
    : 'No workspace attached';

  return (
    <div className={`flex-1 h-full flex flex-col overflow-clip text-claude-text chat-root chat-font-scope ${isCodeConversation ? 'bg-[#f6f4ef] dark:bg-[#1f1d1a]' : 'bg-claude-bg'}`}>
      {/* Content area - positioning container for scroll + bottom bars */}
      <div className="flex-1 min-h-0 relative">
        <div
          className="absolute inset-0 overflow-y-auto chat-scroll"
          style={{ paddingBottom: `${inputHeight}px` }}
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          <div
            className="w-full mx-auto px-4 py-8 pb-2"
            style={{ maxWidth: `${tunerConfig?.mainContentWidth || 768}px` }}
          >
            {isCodeConversation && (
              <div className="mb-6 overflow-hidden rounded-[18px] border border-black/8 bg-white/88 shadow-[0_12px_36px_rgba(0,0,0,0.04)] backdrop-blur dark:border-white/10 dark:bg-[#24211d]/92">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/6 px-4 py-3 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f1ece4] text-[#615A4F] dark:bg-[#2A2622] dark:text-[#E6DDD2]">
                      <Folder size={15} />
                    </div>
                    <div>
                      <div className="text-[13px] font-medium text-claude-text">Code workspace</div>
                      <div className="text-[12px] text-claude-textSecondary">This conversation stays attached to a local folder.</div>
                    </div>
                  </div>
                  {effectiveWorkspacePath ? (
                    <button
                      type="button"
                      onClick={() => openDesktopFolder(effectiveWorkspacePath).catch(() => {})}
                      className="inline-flex h-[32px] items-center gap-2 rounded-[10px] border border-black/10 bg-[#faf8f4] px-3 text-[13px] text-claude-text transition-colors hover:bg-[#f2eee8] dark:border-white/10 dark:bg-[#2A2622] dark:hover:bg-[#312c27]"
                    >
                      <Folder size={14} className="text-claude-textSecondary" />
                      <span>Open folder</span>
                    </button>
                  ) : null}
                </div>
                <div className="px-4 py-3">
                  <div className="rounded-[12px] border border-black/8 bg-[#faf8f4] px-3 py-2 text-[13px] text-[#4B4843] dark:border-white/10 dark:bg-[#201d19] dark:text-[#D7D0C4]">
                    <span className="font-medium">{workspaceLabel}</span>
                    {effectiveWorkspacePath ? (
                      <span className="ml-2 text-claude-textSecondary">{effectiveWorkspacePath}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
            <MessageList
              messages={messages}
              loading={loading}
              expandedMessages={expandedMessages}
              editingMessageIdx={editingMessageIdx}
              editingContent={editingContent}
              copiedMessageIdx={copiedMessageIdx}
              compactStatus={compactStatus}
              onSetEditingContent={setEditingContent}
              onEditCancel={handleEditCancel}
              onEditSave={handleEditSave}
              onToggleExpand={toggleMessageExpand}
              onResend={handleResendMessage}
              onEdit={handleEditMessage}
              onCopy={handleCopyMessage}
              onOpenDocument={onOpenDocument}
              onOpenResearch={setOpenedResearchMsgId}
              onSetMessages={setMessages}
              messageContentRefs={messageContentRefs}
            />
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 免责声明 - 固定在最底部 */}
        <div className={`absolute bottom-0 left-0 z-10 flex items-center justify-center text-[12px] text-claude-textSecondary h-7 pointer-events-none font-sans ${isCodeConversation ? 'bg-[#f6f4ef] dark:bg-[#1f1d1a]' : 'bg-claude-bg'}`} style={{ right: `${scrollbarWidth}px` }}>
          Claude is AI and can make mistakes. Please double-check responses.
        </div>

        {/* 输入框 - 浮动在内容上方，底部距离可调 */}
        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ bottom: `${inputBarBottom + 28}px`, paddingLeft: '16px', paddingRight: `${16 + scrollbarWidth}px` }}>
          <div
            className="mx-auto pointer-events-auto"
            style={{ maxWidth: `${inputBarWidth}px` }}
          >
            <div className="w-full relative group" ref={inputWrapperRef}>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept={ACCEPTED_TYPES}
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <div
                className={`border transition-all duration-200 flex flex-col font-sans ${
                  isCodeConversation
                    ? 'bg-white/92 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl hover:border-[#d8d2c8] focus-within:border-[#d8d2c8] dark:bg-[#24211d]/92 dark:hover:border-white/15 dark:focus-within:border-white/15'
                    : 'bg-white/92 dark:bg-[#24211d]/92 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] hover:border-[#d8d2c8] dark:hover:border-white/15 focus-within:border-[#d8d2c8] dark:focus-within:border-white/15'
                } ${isDragging ? 'border-[#D97757] bg-orange-50/30' : 'border-transparent dark:border-transparent'}`}
                style={{ borderRadius: `24px` }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <FileUploadPreview files={pendingFiles} onRemove={handleRemoveFile} />
                <div className="relative">
                  <SkillInputOverlay
                    text={inputText}
                    className="px-4 pt-4 pb-0 text-[16px] font-sans font-[350]"
                    style={{ height: `${inputBarBaseHeight}px`, minHeight: '16px', boxSizing: 'border-box', overflow: 'hidden' }}
                  />
                  <textarea
                    ref={inputRef}
                    className={`w-full px-4 pt-4 pb-0 placeholder:text-claude-textSecondary text-[16px] outline-none resize-none bg-transparent font-sans font-[350] ${inputText.match(/^\/[a-zA-Z0-9_-]+/) ? 'text-transparent caret-claude-text' : 'text-claude-text'}`}
                    style={{ height: `${inputBarBaseHeight}px`, minHeight: '16px', boxSizing: 'border-box', overflowY: 'hidden' }}
                    placeholder={selectedSkill ? `Describe what you want ${selectedSkill.name} to do...` : "How can I help you today?"}
                    value={inputText}
                    onChange={(e) => {
                      setInputText(e.target.value);
                      adjustTextareaHeight();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && selectedSkill) {
                        const pos = (e.target as HTMLTextAreaElement).selectionStart;
                        const skillPrefix = `/${selectedSkill.slug} `;
                        if (pos > 0 && pos <= skillPrefix.length && inputText.startsWith(skillPrefix.slice(0, pos))) {
                          e.preventDefault();
                          setInputText(inputText.slice(skillPrefix.length));
                          setSelectedSkill(null);
                          return;
                        }
                      }
                      handleKeyDown(e);
                    }}
                    onPaste={handlePaste}
                  />
                </div>
                {activeTaskItems.length > 0 && (
                  <div className="mx-4 mb-1 flex flex-col gap-1 rounded-[12px] border border-black/8 bg-[#faf8f4] px-3 py-2 text-[12px] text-[#5f5b53] dark:border-white/10 dark:bg-[#201d19] dark:text-[#CFC6BA]">
                    {activeTaskItems.map(([taskId, task]) => (
                      <div key={taskId} className="flex min-w-0 items-center gap-2">
                        <Loader2 size={13} className="shrink-0 animate-spin text-claude-textSecondary" />
                        <span className="truncate">{getActiveTaskLabel(task)}</span>
                      </div>
                    ))}
                  </div>
                )}
                  <div className="px-4 pb-3 pt-1 flex items-center justify-between">
                    <div className="relative flex items-center">
                    <button
                      ref={plusBtnRef}
                      onClick={() => setShowPlusMenu(prev => !prev)}
                      className="p-2 text-claude-textSecondary hover:text-claude-text hover:bg-claude-hover rounded-lg transition-colors"
                    >
                      <IconPlus size={20} />
                    </button>
                    {showPlusMenu && (
                      <div
                        ref={plusMenuRef}
                        className="absolute bottom-full left-0 mb-2 w-[220px] bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] py-1.5 z-50"
                      >
                        <button
                          onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
                          onClick={() => {
                            setShowPlusMenu(false);
                            openFilePicker();
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-claude-text hover:bg-claude-hover transition-colors"
                        >
                          <Paperclip size={16} className="text-claude-textSecondary" />
                          Add files or photos
                        </button>
                        <button
                          onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
                          onClick={() => {
                            setShowPlusMenu(false);
                            setShowGithubModal(true);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-claude-text hover:bg-claude-hover transition-colors"
                        >
                          <Github size={16} className="text-claude-textSecondary" />
                          Add from GitHub
                        </button>
                        {/* Add to project submenu */}
                        <div className="relative" onMouseLeave={() => setShowProjectsSubmenu(false)}>
                          <button
                            onMouseEnter={() => { setShowProjectsSubmenu(true); setShowSkillsSubmenu(false); }}
                            onClick={() => setShowProjectsSubmenu(prev => !prev)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-claude-text hover:bg-claude-hover transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <IconProjects size={16} className="text-claude-textSecondary scale-[1.6] dark:[filter:brightness(0)_invert(1)_brightness(0.68)_sepia(0.18)]" />
                              Add to project
                            </div>
                            <ChevronDown size={14} className="text-claude-textSecondary -rotate-90" />
                          </button>
                          {showProjectsSubmenu && (
                            <div className="absolute left-full bottom-0 w-[220px] bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] py-1.5 z-50 max-h-[30vh] overflow-y-auto">
                              {projectList.length > 0 ? projectList.map(p => {
                                const isSelected = (activeId && currentProjectId === p.id) || (!activeId && pendingProjectId === p.id);
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => handleAttachToProject(p)}
                                    className="w-full flex items-center justify-between gap-2 px-4 py-2 text-[13px] text-claude-text hover:bg-claude-hover transition-colors text-left"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <IconProjects size={26} className="text-claude-textSecondary flex-shrink-0 dark:[filter:brightness(0)_invert(1)_brightness(0.68)_sepia(0.18)]" />
                                      <span className="truncate">{p.name}</span>
                                    </div>
                                    {isSelected && <Check size={14} className="text-claude-textSecondary flex-shrink-0" />}
                                  </button>
                                );
                              }) : (
                                <div className="px-4 py-2 text-[12px] text-claude-textSecondary italic">No projects yet</div>
                              )}
                              <div className="border-t border-claude-border mt-1 pt-1">
                                <button
                                  onClick={() => {
                                    setShowProjectsSubmenu(false);
                                    setShowPlusMenu(false);
                                    setNewProjectName('');
                                    setNewProjectDescription('');
                                    setShowNewProjectDialog(true);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2 text-[13px] text-claude-textSecondary hover:bg-claude-hover transition-colors"
                                >
                                  <Plus size={14} />
                                  Start a new project
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Skills submenu */}
                        <div className="relative" onMouseLeave={() => setShowSkillsSubmenu(false)}>
                          <button
                            onMouseEnter={() => { setShowSkillsSubmenu(true); setShowProjectsSubmenu(false); }}
                            onClick={(e) => { e.stopPropagation(); setShowSkillsSubmenu(prev => !prev); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-claude-text hover:bg-claude-hover transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <FileText size={16} className="text-claude-textSecondary" />
                              Skills
                            </div>
                            <ChevronDown size={14} className="text-claude-textSecondary -rotate-90" />
                          </button>
                          {showSkillsSubmenu && enabledSkills.length > 0 && (
                            <div className="absolute left-full bottom-0 w-[220px] bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] py-1.5 z-50 max-h-[30vh] overflow-y-auto">
                              {enabledSkills.map(skill => (
                                <button
                                  key={skill.id}
                                  onClick={() => {
                                    setShowPlusMenu(false);
                                    setShowSkillsSubmenu(false);
                                    const slug = skill.name.toLowerCase().replace(/\s+/g, '-');
                                    setSelectedSkill({ name: skill.name, slug, description: skill.description });
                                    setInputText(prev => prev ? `/${slug} ${prev}` : `/${slug} `);
                                    inputRef.current?.focus();
                                  }}
                                  className="w-full text-left px-4 py-2 text-[13px] text-claude-text hover:bg-claude-hover transition-colors truncate"
                                >
                                  {skill.name}
                                </button>
                              ))}
                              <div className="border-t border-claude-border mt-1 pt-1">
                                <button
                                  onClick={() => {
                                    setShowPlusMenu(false);
                                    setShowSkillsSubmenu(false);
                                    navigate(customizeRoute);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2 text-[13px] text-claude-textSecondary hover:bg-claude-hover transition-colors"
                                >
                                  <FileText size={14} />
                                  Manage skills
                                </button>
                              </div>
                            </div>
                          )}
                          {showSkillsSubmenu && enabledSkills.length === 0 && (
                            <div className="absolute left-full bottom-0 w-[220px] bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] py-1.5 z-50">
                              <div className="px-4 py-2 text-[12px] text-claude-textSecondary italic">No skills enabled</div>
                              <div className="border-t border-claude-border mt-1 pt-1">
                                <button
                                  onClick={() => {
                                    setShowPlusMenu(false);
                                    navigate(customizeRoute);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2 text-[13px] text-claude-textSecondary hover:bg-claude-hover transition-colors"
                                >
                                  <FileText size={14} />
                                  Manage skills
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
                          onClick={() => {
                            setShowPlusMenu(false);
                            if (!activeId || compactStatus.state === 'compacting') return;
                            setCompactInstruction('');
                            setShowCompactDialog(true);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-claude-text hover:bg-claude-hover transition-colors"
                        >
                          <ListCollapse size={16} className="text-claude-textSecondary" />
                          Compact conversation
                        </button>
                        {/* Research toggle */}
                        <div className="border-t border-claude-border mt-1 pt-1">
                          <button
                            onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
                            onClick={() => { toggleResearchMode(); setShowPlusMenu(false); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] hover:bg-claude-hover transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <IconResearch size={16} className={researchMode ? 'text-[#2E7CF6]' : 'text-claude-textSecondary'} />
                              <span className={researchMode ? 'text-[#2E7CF6] font-medium' : 'text-claude-text'}>Research</span>
                            </div>
                            {researchMode && <Check size={14} className="text-[#2E7CF6]" />}
                          </button>
                        </div>
                        {/* Web search indicator — always on when provider supports it, not togglable */}
                        <div>
                          <button
                            onMouseEnter={() => { setShowSkillsSubmenu(false); setShowProjectsSubmenu(false); }}
                            onClick={() => {
                              if (currentProviderSupportsWebSearch) {
                                setShowPlusMenu(false);
                              } else {
                                setWebSearchToast('当前模型的供应商不支持网页搜索');
                                setShowPlusMenu(false);
                              }
                            }}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] hover:bg-claude-hover transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <IconWebSearch size={16} className={currentProviderSupportsWebSearch ? 'text-[#2E7CF6]' : 'text-claude-textSecondary'} />
                              <span className={currentProviderSupportsWebSearch ? 'text-[#2E7CF6] font-medium' : 'text-claude-text'}>Web search</span>
                            </div>
                            {currentProviderSupportsWebSearch && <Check size={14} className="text-[#2E7CF6]" />}
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Blue research badge next to + button when enabled */}
                    {researchMode && (
                      <div className="group/research relative ml-1 flex items-center bg-[#DBEAFE] dark:bg-[#1E3A5F] rounded-lg p-1.5">
                        <IconResearch size={16} className="text-[#2E7CF6] flex-shrink-0" />
                        <span className="inline-flex items-center overflow-hidden w-0 group-hover/research:w-[18px] transition-[width] duration-150 ease-out">
                          <button
                            onClick={toggleResearchMode}
                            className="ml-1 flex-shrink-0 flex items-center justify-center hover:opacity-70 transition-opacity"
                            aria-label="Disable research mode"
                          >
                            <X size={14} className="text-[#2E7CF6]" />
                          </button>
                        </span>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-[#2a2a2a] text-white dark:bg-[#e8e8e8] dark:text-[#1a1a1a] rounded-md text-[11px] whitespace-nowrap opacity-0 group-hover/research:opacity-100 pointer-events-none transition-opacity">
                          Research mode
                        </div>
                      </div>
                    )}
                    {contextInfo && contextInfo.tokens > 0 && (() => {
                      const pct = Math.min(contextInfo.tokens / contextInfo.limit, 1);
                      const color = pct > 0.8 ? '#dc2626' : pct > 0.5 ? '#d97706' : '#6b7280';
                      const r = 7, c = 2 * Math.PI * r, dash = pct * c;
                      const label = contextInfo.tokens.toLocaleString() + ' tokens';
                      const pctLabel = (pct * 100).toFixed(1) + '% 上下文已使用';
                      return (
                        <div className="flex items-center gap-1 ml-1 select-none" title={pctLabel}>
                          <svg width="18" height="18" viewBox="0 0 18 18">
                            <circle cx="9" cy="9" r={r} fill="none" stroke="#d4d4d4" strokeWidth="2" />
                            <circle cx="9" cy="9" r={r} fill="none" stroke={color} strokeWidth="2"
                              strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                              transform="rotate(-90 9 9)" />
                          </svg>
                          <span className="text-[11px] whitespace-nowrap" style={{ color: '#6b7280' }}>{label}</span>
                        </div>
                      );
                    })()}
                  </div>
                    <div className="flex items-center gap-3">
                    {isCodeConversation && (
                      <div className="hidden sm:inline-flex h-[32px] items-center gap-2 rounded-[10px] border border-black/10 bg-[#faf8f4] px-3 text-[13px] text-[#4B4843] dark:border-white/10 dark:bg-[#201d19] dark:text-[#D7D0C4]">
                        <Folder size={14} className="text-claude-textSecondary" />
                        <span className="truncate max-w-[180px]">{workspaceLabel}</span>
                      </div>
                    )}
                    <ModelSelector
                      currentModelString={currentModelString}
                      models={selectorModels}
                      onModelChange={handleModelChange}
                      isNewChat={false}
                      dropdownPosition="top"
                    />
                    {loading ? (
                      <button
                        onClick={handleStop}
                        className="p-2 text-claude-text hover:bg-claude-hover rounded-lg transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          void handleSend()
                        }}
                        disabled={(!inputText.trim() && !pendingFiles.some(f => f.status === 'done')) || pendingFiles.some(f => f.status === 'uploading')}
                        className="p-2 bg-[#C6613F] text-white rounded-lg hover:bg-[#D97757] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ArrowUp size={22} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {false && (
                <div className="mx-4 flex items-center justify-between px-4 py-1.5 bg-claude-bgSecondary border-x border-b border-claude-border rounded-b-xl text-claude-textSecondary text-xs pointer-events-auto">
                  <span>您当前没有可用套餐，无法发送消息</span>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('open-upgrade'))}
                    className="px-2 py-0.5 bg-claude-btnHover hover:bg-claude-hover text-claude-text text-xs font-medium rounded transition-colors border border-claude-border hover:border-blue-500 hover:text-blue-600"
                  >
                    购买套餐
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Plan mode banner */}
      {planMode && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center pointer-events-none" style={{ paddingLeft: 'var(--sidebar-width, 260px)' }}>
          <div className="mt-2 px-4 py-1.5 bg-amber-500/90 text-white text-[13px] font-medium rounded-full shadow-lg pointer-events-auto flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            Plan Mode — Claude is planning, not executing
          </div>
        </div>
      )}

      {/* AskUserQuestion dialog */}
      {askUserDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
          <div className="bg-claude-bg border border-claude-border rounded-2xl shadow-xl w-[480px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-[15px] font-semibold text-claude-text mb-1 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Claude needs your input
              </h3>
            </div>
            <div className="px-5 pb-4 flex flex-col gap-4">
              {askUserDialog.questions.map((q, qi) => (
                <div key={qi} className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-claude-text">{q.question}</label>
                  {q.options && q.options.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {q.options.map((opt, oi) => {
                        const selected = askUserDialog.answers[q.question] === opt.label;
                        return (
                          <button
                            key={oi}
                            onClick={() => setAskUserDialog(prev => prev ? { ...prev, answers: { ...prev.answers, [q.question]: opt.label } } : null)}
                            className={`text-left px-3 py-2 rounded-lg border text-[13px] transition-colors ${selected ? 'border-[#C6613F] bg-[#C6613F]/10 text-claude-text' : 'border-claude-border hover:bg-claude-hover text-claude-textSecondary'}`}
                          >
                            <div className="font-medium text-claude-text">{opt.label}</div>
                            {opt.description && <div className="text-[12px] text-claude-textSecondary mt-0.5">{opt.description}</div>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="w-full bg-claude-input border border-claude-border rounded-lg px-3 py-2 text-[13px] text-claude-text outline-none focus:border-claude-textSecondary/40 transition-colors"
                      placeholder="Type your answer..."
                      value={askUserDialog.answers[q.question] || ''}
                      onChange={e => setAskUserDialog(prev => prev ? { ...prev, answers: { ...prev.answers, [q.question]: e.target.value } } : null)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('ask-user-submit-btn')?.click();
                        }
                      }}
                      autoFocus={qi === 0}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 pb-4">
              <button
                id="ask-user-submit-btn"
                onClick={async () => {
                  if (!askUserDialog || !activeId) return;
                  const { request_id, tool_use_id, answers } = askUserDialog;
                  setAskUserDialog(null);
                  try {
                    await answerUserQuestion(activeId, request_id, tool_use_id, answers);
                  } catch (err) {
                    console.error('Failed to send answer:', err);
                  }
                }}
                className="px-4 py-1.5 text-[13px] text-white bg-[#C6613F] hover:bg-[#D97757] rounded-lg transition-colors font-medium"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      <AddFromGithubModal
        isOpen={showGithubModal}
        onClose={() => setShowGithubModal(false)}
        currentContextTokens={contextInfo?.tokens || 0}
        contextLimit={contextInfo?.limit || 200000}
        onConfirm={(bundle: GithubAddPayload) => {
          if (!bundle || !bundle.selections?.length) return;
          const githubSelections = bundle.selections.map((selection, index) => ({
            id: `github-${bundle.repoFullName}-${selection.path}-${index}`,
            name: selection.path.split('/').pop() || selection.path,
            path: selection.path,
            size: 0,
            type: selection.isFolder ? 'dir' : 'file',
          }));
          handleFilesSelected(githubSelections as any, {
            source: 'github',
            ghRepo: bundle.repoFullName,
            ghRef: bundle.ref,
          });
        }}
      />

      {/* Compact conversation dialog */}
      {showCompactDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={() => setShowCompactDialog(false)}>
          <div className="bg-claude-bg border border-claude-border rounded-2xl shadow-xl w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-[15px] font-semibold text-claude-text mb-1">Compact conversation</h3>
              <p className="text-[13px] text-claude-textSecondary leading-snug">
                Summarize the conversation history to free up context space. The engine will preserve key decisions and context.
              </p>
            </div>
            <div className="px-5 pb-3">
              <textarea
                className="w-full bg-claude-input border border-claude-border rounded-lg px-3 py-2 text-[13px] text-claude-text placeholder:text-claude-textSecondary/50 outline-none focus:border-claude-textSecondary/40 transition-colors resize-none"
                rows={3}
                placeholder="Optional: add instructions for the summary (e.g. 'preserve all API endpoint details')"
                value={compactInstruction}
                onChange={e => setCompactInstruction(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    document.getElementById('compact-confirm-btn')?.click();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 pb-4">
              <button
                onClick={() => setShowCompactDialog(false)}
                className="px-3.5 py-1.5 text-[13px] text-claude-textSecondary hover:text-claude-text rounded-lg hover:bg-claude-hover transition-colors"
              >
                Cancel
              </button>
              <button
                id="compact-confirm-btn"
                onClick={async () => {
                  setShowCompactDialog(false);
                  if (!activeId || compactStatus.state === 'compacting') return;
                  setCompactStatus({ state: 'compacting' });
                  try {
                    const instruction = compactInstruction.trim() || undefined;
                    const result = await compactConversation(activeId, instruction);
                    await loadConversation(activeId);
                    const newContextInfo = await getContextSize(activeId);
                    setContextInfo(newContextInfo);
                    setCompactStatus({ state: 'done', message: `Compacted ${result.messagesCompacted} messages, saved ~${result.tokensSaved} tokens` });
                    setTimeout(() => setCompactStatus({ state: 'idle' }), 4000);
                  } catch (err) {
                    console.error('Compact failed:', err);
                    setCompactStatus({ state: 'error', message: 'Compaction failed' });
                    setTimeout(() => setCompactStatus({ state: 'idle' }), 3000);
                  }
                }}
                className="px-3.5 py-1.5 text-[13px] text-white bg-[#C6613F] hover:bg-[#D97757] rounded-lg transition-colors font-medium"
              >
                Compact
              </button>
            </div>
          </div>
        </div>
      )}

      {sharedProjectOverlays}

      {/* Research panel — fixed right-side drawer */}
      {openedResearchMsgId && (() => {
        const liveMsg = messages.find(m => m.id === openedResearchMsgId);
        if (!liveMsg || !liveMsg.research) return null;
        return (
          <>
            <div
              className="fixed inset-0 z-[60] bg-black/20"
              onClick={() => setOpenedResearchMsgId(null)}
            />
            <div className="fixed top-0 right-0 bottom-0 w-[440px] z-[61] bg-claude-bg border-l border-claude-border shadow-2xl flex flex-col">
              <ResearchPanel research={liveMsg.research} onClose={() => setOpenedResearchMsgId(null)} />
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default MainContent;
