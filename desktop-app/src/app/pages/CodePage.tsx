import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  Check,
  ChevronDown as SmallChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Edit3,
  Eye,
  File,
  FilePlus,
  Folder,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getProviderModels, getUserModels } from '../../api';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import ModelSelector, { type SelectableModel } from '../../components/ModelSelector';
import { isDesktopApp, openDesktopFolder, selectDesktopDirectory } from '../../desktop';
import type { CodeLaunchPayload } from '../types';
import { getStoredModelId, rememberDefaultModel } from '../../utils/providerIdentity';
import { isThinkingModel, stripThinking, withThinking } from '../../components/shared/utils/modelUtils';
import { safeGetStorageItem, safeParseStorageJson } from '../../utils/safeStorage';
import {
  createWorkspaceEntry,
  deleteWorkspacePath,
  getWorkspaceGitDiff,
  getWorkspaceGitStatus,
  listWorkspaceEntries,
  readWorkspaceFile,
  readWorkspaceFileDataUrl,
  renameWorkspacePath,
  setWorkspaceGitStaged,
  writeWorkspaceFile,
  type WorkspaceDirectoryListing,
  type WorkspaceEntry,
  type WorkspaceEntryKind,
  type WorkspaceFileDataUrl,
  type WorkspaceFileContent,
  type WorkspaceGitDiff,
  type WorkspaceGitFile,
  type WorkspaceGitStatus,
} from '../../services/workspace';

const TIER_DESCRIPTIONS: Record<string, string> = {
  opus: 'Most capable for ambitious work',
  sonnet: 'Most efficient for everyday tasks',
  haiku: 'Fastest for quick answers',
};

const ROOT_PATH = '';
const MAX_RENDERED_LINES = 5000;

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'mdx']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'apng']);
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  asm: 'asm',
  astro: 'astro',
  bat: 'batch',
  c: 'c',
  cc: 'cpp',
  cjs: 'javascript',
  clj: 'clojure',
  cljs: 'clojure',
  cmake: 'cmake',
  cmd: 'batch',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cts: 'typescript',
  cxx: 'cpp',
  dart: 'dart',
  diff: 'diff',
  dockerfile: 'docker',
  eex: 'elixir',
  env: 'dotenv',
  erl: 'erlang',
  ex: 'elixir',
  exs: 'elixir',
  fs: 'fsharp',
  fsi: 'fsharp',
  fsx: 'fsharp',
  go: 'go',
  gql: 'graphql',
  graphql: 'graphql',
  groovy: 'groovy',
  h: 'c',
  handlebars: 'handlebars',
  hbs: 'handlebars',
  hcl: 'hcl',
  hpp: 'cpp',
  hs: 'haskell',
  html: 'html',
  htm: 'html',
  java: 'java',
  jl: 'julia',
  js: 'javascript',
  json: 'json',
  json5: 'json',
  jsonc: 'json',
  jsx: 'jsx',
  kt: 'kotlin',
  kts: 'kotlin',
  less: 'less',
  lock: 'text',
  lua: 'lua',
  m: 'objectivec',
  make: 'makefile',
  md: 'markdown',
  mdown: 'markdown',
  mdx: 'mdx',
  mk: 'makefile',
  mkd: 'markdown',
  mjs: 'javascript',
  ml: 'ocaml',
  mli: 'ocaml',
  mm: 'objectivec',
  mts: 'typescript',
  php: 'php',
  pl: 'perl',
  pm: 'perl',
  proto: 'protobuf',
  ps1: 'powershell',
  py: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  sass: 'sass',
  scala: 'scala',
  scss: 'scss',
  sh: 'bash',
  sql: 'sql',
  svelte: 'svelte',
  swift: 'swift',
  tf: 'hcl',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
};
const LANGUAGE_BY_FILENAME: Record<string, string> = {
  '.babelrc': 'json',
  '.dockerignore': 'gitignore',
  '.editorconfig': 'ini',
  '.env': 'dotenv',
  '.eslintrc': 'json',
  '.gitignore': 'gitignore',
  '.npmrc': 'ini',
  '.prettierrc': 'json',
  'CMakeLists.txt': 'cmake',
  Dockerfile: 'docker',
  Jenkinsfile: 'groovy',
  Makefile: 'makefile',
  Rakefile: 'ruby',
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

const parentPathOf = (path: string) => {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : ROOT_PATH;
};

const basenameOf = (path: string) => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || path || 'workspace';
};

const formatBytes = (size: number) => {
  if (!Number.isFinite(size)) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const extensionOf = (pathOrName: string, explicit?: string | null) => {
  if (explicit) return explicit.toLowerCase();
  const last = basenameOf(pathOrName).toLowerCase();
  if (LANGUAGE_BY_FILENAME[last] || LANGUAGE_BY_FILENAME[basenameOf(pathOrName)]) return last;
  const index = last.lastIndexOf('.');
  return index >= 0 ? last.slice(index + 1) : '';
};

const languageForPath = (pathOrName: string, explicit?: string | null) => {
  const name = basenameOf(pathOrName);
  const exact = LANGUAGE_BY_FILENAME[name] || LANGUAGE_BY_FILENAME[name.toLowerCase()];
  if (exact) return exact;
  const extension = extensionOf(pathOrName, explicit);
  return LANGUAGE_BY_EXTENSION[extension] || extension || 'text';
};

const isMarkdownPath = (pathOrName: string, explicit?: string | null) => (
  MARKDOWN_EXTENSIONS.has(extensionOf(pathOrName, explicit))
);

const isImagePath = (pathOrName: string, explicit?: string | null) => (
  IMAGE_EXTENSIONS.has(extensionOf(pathOrName, explicit))
);

function useDarkTheme() {
  const [isDark, setIsDark] = useState(() => (
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  ));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => setIsDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

const statusTone = (entry: WorkspaceGitFile) => {
  if (entry.index === '?' && entry.workingTree === '?') return 'text-[#6f64d6] bg-[#eeeefe] dark:bg-[#242338] dark:text-[#b8b2ff]';
  if (entry.label === 'Conflict') return 'text-[#b9382c] bg-[#fff0ee] dark:bg-[#3a211f] dark:text-[#ffb2a8]';
  if (entry.label === 'Added') return 'text-[#268245] bg-[#e9f7ee] dark:bg-[#193325] dark:text-[#83d79d]';
  if (entry.label === 'Deleted') return 'text-[#b9382c] bg-[#fff0ee] dark:bg-[#3a211f] dark:text-[#ffb2a8]';
  return 'text-[#9a5b22] bg-[#fff5e8] dark:bg-[#332719] dark:text-[#e8bb83]';
};

const diffLineClass = (line: string) => {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-[#7b7974] bg-[#f7f5f1] dark:bg-[#242421] dark:text-[#aaa39a]';
  if (line.startsWith('@@')) return 'text-[#4a6fb2] bg-[#eef3ff] dark:bg-[#1d2635] dark:text-[#9bbcff]';
  if (line.startsWith('+')) return 'text-[#1c5f34] bg-[#e9f7ee] dark:bg-[#143020] dark:text-[#9ad9a9]';
  if (line.startsWith('-')) return 'text-[#8c2f25] bg-[#fff0ee] dark:bg-[#351c1a] dark:text-[#f1a49b]';
  if (line.startsWith('diff --git')) return 'text-[#3f3d39] bg-[#efede8] dark:bg-[#2f2d29] dark:text-[#ddd4c9]';
  return 'text-[#4b4843] dark:text-[#d7d0c4]';
};

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#5e5b55] transition-colors hover:bg-[#efede8] disabled:cursor-not-allowed disabled:opacity-[0.45] dark:text-[#bdb5aa] dark:hover:bg-white/[0.07]"
    >
      {children}
    </button>
  );
}

function WorkspaceTree({
  entriesByPath,
  expandedPaths,
  activeDirectory,
  selectedPath,
  loadingPaths,
  searchQuery,
  onToggleDirectory,
  onSelectFile,
}: {
  entriesByPath: Record<string, WorkspaceDirectoryListing>;
  expandedPaths: Set<string>;
  activeDirectory: string;
  selectedPath: string;
  loadingPaths: Set<string>;
  searchQuery: string;
  onToggleDirectory: (entry: WorkspaceEntry) => void;
  onSelectFile: (entry: WorkspaceEntry) => void;
}) {
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

  const renderEntries = (directoryPath: string, depth: number): React.ReactNode => {
    const listing = entriesByPath[directoryPath];
    if (!listing) return null;

    const visibleEntries = normalizedQuery
      ? listing.entries.filter((entry) => `${entry.path} ${entry.name}`.toLowerCase().includes(normalizedQuery))
      : listing.entries;

    return visibleEntries.map((entry) => {
      const isExpanded = expandedPaths.has(entry.path);
      const isActive = entry.path === activeDirectory;
      const isSelected = entry.path === selectedPath;
      const isLoading = loadingPaths.has(entry.path);

      return (
        <div key={entry.path || entry.name}>
          <button
            type="button"
            onClick={() => entry.isDir ? onToggleDirectory(entry) : onSelectFile(entry)}
            className={`flex h-[28px] w-full min-w-0 items-center gap-1.5 rounded-[6px] pr-2 text-left text-[13px] ${
              isSelected || isActive
                ? 'bg-[#ece7df] text-[#2f2d29] dark:bg-[#3a342d] dark:text-[#f1ebe3]'
                : 'text-[#4b4843] hover:bg-[#f0eee9] dark:text-[#d7d0c4] dark:hover:bg-white/[0.06]'
            }`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            title={entry.path || entry.name}
          >
            {entry.isDir ? (
              <>
                {isLoading ? <Loader2 size={13} className="shrink-0 animate-spin" /> : <ChevronRight size={13} className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />}
                {isExpanded ? <FolderOpen size={15} className="shrink-0 text-[#bf6a4a]" /> : <Folder size={15} className="shrink-0 text-[#bf6a4a]" />}
              </>
            ) : (
              <>
                <span className="w-[13px] shrink-0" />
                <File size={15} className="shrink-0 text-[#7e7a72] dark:text-[#aaa39a]" />
              </>
            )}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {!entry.isDir && entry.extension ? (
              <span className="shrink-0 text-[10px] uppercase text-[#aaa49a] dark:text-[#776f66]">{entry.extension}</span>
            ) : null}
          </button>
          {entry.isDir && isExpanded ? renderEntries(entry.path, depth + 1) : null}
        </div>
      );
    });
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
      {renderEntries(ROOT_PATH, 0)}
      {entriesByPath[ROOT_PATH]?.truncated ? (
        <div className="px-2 py-2 text-[12px] text-claude-textSecondary">Directory list truncated.</div>
      ) : null}
    </div>
  );
}

function FilePreview({
  file,
  image,
  diff,
  diffLoading,
  loading,
  error,
  copied,
  editing,
  editorValue,
  dirty,
  saving,
  onCopy,
  onClose,
  onEdit,
  onEditorChange,
  onSave,
  onDiscard,
  onShowFileFromDiff,
}: {
  file: WorkspaceFileContent | null;
  image: WorkspaceFileDataUrl | null;
  diff: WorkspaceGitDiff | null;
  diffLoading: boolean;
  loading: boolean;
  error: string;
  copied: boolean;
  editing: boolean;
  editorValue: string;
  dirty: boolean;
  saving: boolean;
  onCopy: () => void;
  onClose: () => void;
  onEdit: () => void;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onShowFileFromDiff: () => void;
}) {
  const isDark = useDarkTheme();
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  const diffLines = useMemo(() => diff?.diff.split('\n').slice(0, MAX_RENDERED_LINES) || [], [diff?.diff]);
  const lines = useMemo(() => file?.content.split('\n').slice(0, MAX_RENDERED_LINES) || [], [file?.content]);
  const syntaxCode = useMemo(() => lines.join('\n'), [lines]);
  const fileLineCount = useMemo(() => file?.content.split('\n').length || 0, [file?.content]);
  const diffLineCount = useMemo(() => diff?.diff.split('\n').length || 0, [diff?.diff]);
  const showingDiff = !!diff?.path || diffLoading;
  const fileLanguage = file ? languageForPath(file.path || file.name, file.extension) : 'text';
  const isMarkdownFile = !!file && isMarkdownPath(file.path || file.name, file.extension);
  const wrappedLineStyle = { overflowWrap: 'anywhere' as const };
  const previewTitle = showingDiff ? (diff?.path || 'Diff') : image ? image.name : (file?.name || 'Preview');
  const previewSubtitle = showingDiff
    ? `${diff?.staged ? 'Staged' : 'Working tree'} changes`
    : image
      ? `${image.path} · ${image.mimeType} · ${formatBytes(image.size)}`
      : file ? `${file.path} · ${formatBytes(file.size)}` : 'Select a file or Git change';

  useEffect(() => {
    if (editing) {
      editorTextareaRef.current?.focus();
    }
  }, [editing, file?.path]);

  const handleEditorKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (dirty && !saving && !file?.truncated) {
        onSave();
      }
      return;
    }

    if (event.key !== 'Tab') return;

    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const indent = '  ';
    onEditorChange(`${editorValue.slice(0, start)}${indent}${editorValue.slice(end)}`);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = start + indent.length;
      textarea.selectionEnd = start + indent.length;
    });
  }, [dirty, editorValue, file?.truncated, onEditorChange, onSave, saving]);

  return (
    <section className="flex min-h-0 min-w-0 flex-[1_1_0] flex-col border-x border-[#e8e4dc] bg-[#fbfaf7] dark:border-white/[0.08] dark:bg-[#20201e]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#e8e4dc] px-4 dark:border-white/[0.08]">
        <div className="flex min-w-0 items-center gap-2">
          {image ? <ImageIcon size={16} className="shrink-0 text-[#7b7974]" /> : <Eye size={16} className="shrink-0 text-[#7b7974]" />}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-[#373734] dark:text-[#e8e0d5]">
              {previewTitle}
            </div>
            <div className="truncate text-[11px] text-claude-textSecondary">
              {previewSubtitle}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showingDiff && diff?.path ? (
            <IconButton label="Open file editor" onClick={onShowFileFromDiff} disabled={diffLoading}>
              <Edit3 size={15} />
            </IconButton>
          ) : null}
          {!showingDiff && file && !file.isBinary ? (
            <>
              <IconButton label={editing ? 'Save file' : 'Edit file'} onClick={editing ? onSave : onEdit} disabled={saving || file.truncated}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : editing ? <Save size={15} /> : <Edit3 size={15} />}
              </IconButton>
              {editing ? (
                <IconButton label="Discard edits" onClick={onDiscard} disabled={saving || !dirty}>
                  <RotateCcw size={15} />
                </IconButton>
              ) : null}
            </>
          ) : null}
          <IconButton label={copied ? 'Copied' : 'Copy file'} onClick={onCopy} disabled={showingDiff || !!image || !file || file.isBinary}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </IconButton>
          <IconButton label="Close preview" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {diffLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-claude-textSecondary">
            <Loader2 size={16} className="animate-spin" />
            Loading diff
          </div>
        ) : diff?.error ? (
          <div className="m-4 rounded-[8px] border border-[#e5b0a1] bg-[#fff1ec] px-3 py-2 text-[13px] text-[#a0452e] dark:border-[#8A4C3A] dark:bg-[#3A2620] dark:text-[#F3B29D]">
            {diff.error}
          </div>
        ) : diff && diff.diff.trim() ? (
          <div className="w-full min-w-0 font-mono text-[11.5px] leading-[18px]">
            {diff.truncated || diffLineCount > diffLines.length ? (
              <div className="sticky top-0 z-10 border-b border-[#e8e4dc] bg-[#fff8ea] px-4 py-2 text-[12px] text-[#8a5a1f] dark:border-white/[0.08] dark:bg-[#332719] dark:text-[#e8bb83]">
                Diff preview truncated.
              </div>
            ) : null}
            {diffLines.map((line, index) => (
              <div
                key={index}
                className={`min-w-0 whitespace-pre-wrap break-words px-3 ${diffLineClass(line)}`}
                style={wrappedLineStyle}
              >
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        ) : showingDiff ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-claude-textSecondary">
            No diff available for this selection.
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-claude-textSecondary">
            <Loader2 size={16} className="animate-spin" />
            Loading preview
          </div>
        ) : error ? (
          <div className="m-4 rounded-[8px] border border-[#e5b0a1] bg-[#fff1ec] px-3 py-2 text-[13px] text-[#a0452e] dark:border-[#8A4C3A] dark:bg-[#3A2620] dark:text-[#F3B29D]">
            {error}
          </div>
        ) : image ? (
          <div className="flex min-h-full items-center justify-center bg-[#f4f1ea] p-6 dark:bg-[#181816]">
            <img
              src={image.dataUrl}
              alt={image.name}
              className="max-h-full max-w-full object-contain shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
            />
          </div>
        ) : !file ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-[13px] text-claude-textSecondary">
            <File size={34} className="mb-3 opacity-[0.45]" />
            Choose a file to inspect its contents.
          </div>
        ) : file.isBinary ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-[13px] text-claude-textSecondary">
            <File size={34} className="mb-3 opacity-[0.45]" />
            Binary preview is unavailable for this file.
          </div>
        ) : editing ? (
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#e8e4dc] bg-[#f6f4ef] px-3 text-[12px] text-claude-textSecondary dark:border-white/[0.08] dark:bg-[#1d1d1b]">
              <span>{dirty ? 'Unsaved changes' : 'No changes'}</span>
              {file.truncated ? <span>Large file preview is truncated; editing is disabled.</span> : null}
            </div>
            <textarea
              ref={editorTextareaRef}
              value={editorValue}
              onChange={(event) => onEditorChange(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              spellCheck={false}
              disabled={saving || file.truncated}
              className="min-h-0 min-w-0 flex-1 resize-none overflow-auto bg-[#fffefa] p-4 font-mono text-[12px] leading-[20px] text-[#2f2d29] outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#20201e] dark:text-[#e8e0d5]"
              style={{ tabSize: 2 }}
            />
          </div>
        ) : isMarkdownFile ? (
          <div className="min-h-full min-w-0 bg-[#fffefa] px-5 py-4 dark:bg-[#20201e]">
            {file.truncated || fileLineCount > lines.length ? (
              <div className="sticky top-0 z-10 border-b border-[#e8e4dc] bg-[#fff8ea] px-4 py-2 text-[12px] text-[#8a5a1f] dark:border-white/[0.08] dark:bg-[#332719] dark:text-[#e8bb83]">
                Preview truncated.
              </div>
            ) : null}
            <MarkdownRenderer content={syntaxCode} />
          </div>
        ) : (
          <div className="w-full min-w-0 font-mono text-[12px] leading-[20px]">
            {file.truncated || fileLineCount > lines.length ? (
              <div className="sticky top-0 z-10 border-b border-[#e8e4dc] bg-[#fff8ea] px-4 py-2 text-[12px] text-[#8a5a1f] dark:border-white/[0.08] dark:bg-[#332719] dark:text-[#e8bb83]">
                Preview truncated.
              </div>
            ) : null}
            <SyntaxHighlighter
              language={fileLanguage}
              style={isDark ? vscDarkPlus : oneLight}
              showLineNumbers
              wrapLongLines
              customStyle={{
                margin: 0,
                minHeight: '100%',
                background: 'transparent',
                fontSize: '12px',
                lineHeight: '20px',
                padding: '12px 0',
              }}
              lineNumberStyle={{
                minWidth: '48px',
                paddingRight: '12px',
                color: isDark ? '#6d665f' : '#aaa49a',
                borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#eeeae2'}`,
                marginRight: '12px',
                textAlign: 'right',
                userSelect: 'none',
              }}
              codeTagProps={{
                style: {
                  fontFamily: 'Menlo, Monaco, SF Mono, Cascadia Code, Fira Code, Consolas, Courier New, monospace',
                  overflowWrap: 'anywhere',
                  whiteSpace: 'pre-wrap',
                },
              }}
            >
              {syntaxCode || ' '}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </section>
  );
}

function GitPanel({
  status,
  selectedPath,
  diffMode,
  statusLoading,
  busyPath,
  onSelect,
  onModeChange,
  onStage,
  onUnstage,
}: {
  status: WorkspaceGitStatus | null;
  selectedPath: string | null;
  diffMode: 'unstaged' | 'staged';
  statusLoading: boolean;
  busyPath: string;
  onSelect: (path: string) => void;
  onModeChange: (mode: 'unstaged' | 'staged') => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
}) {
  const changedCount = status?.entries.length || 0;

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-[#f6f4ef] dark:bg-[#1e1e1c]">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#e8e4dc] px-3 dark:border-white/[0.08]">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch size={16} className="shrink-0 text-[#bf6a4a]" />
          <div className="min-w-0 truncate text-[13px] font-medium text-[#373734] dark:text-[#e8e0d5]">
            {statusLoading ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : null}
            {status?.branch || 'Git'}
            <span className="ml-2 text-[11px] font-normal text-claude-textSecondary">
              {changedCount} changed{status?.truncated ? '+' : ''}
            </span>
          </div>
        </div>
        {status?.isRepo ? (
          <div className="grid h-7 w-[176px] shrink-0 grid-cols-2 rounded-[8px] bg-[#ebe8e1] p-0.5 dark:bg-[#151513]">
            {(['unstaged', 'staged'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onModeChange(mode)}
                className={`rounded-[6px] text-[11.5px] ${
                  diffMode === mode
                    ? 'bg-white text-[#2f2d29] shadow-sm dark:bg-[#2d2d2a] dark:text-[#f1ebe3]'
                    : 'text-claude-textSecondary hover:text-[#373734] dark:hover:text-[#f1ebe3]'
                }`}
              >
                {mode === 'unstaged' ? 'Working tree' : 'Staged'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!status?.isRepo ? (
        <div className="m-3 rounded-[8px] border border-[#e8e4dc] bg-white px-3 py-3 text-[13px] leading-5 text-claude-textSecondary dark:border-white/[0.08] dark:bg-[#252522]">
          {status?.error || 'This folder is not a Git repository.'}
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
            {status.entries.length === 0 ? (
              <div className="px-2 py-8 text-center text-[13px] text-claude-textSecondary">No local changes.</div>
            ) : (
              status.entries.map((entry) => {
                const isSelected = entry.path === selectedPath;
                const isBusy = busyPath === entry.path;

                return (
                  <button
                    key={`${entry.path}-${entry.index}-${entry.workingTree}`}
                    type="button"
                    onClick={() => onSelect(entry.path)}
                    className={`mb-1 w-full rounded-[8px] p-2 text-left ${
                      isSelected
                        ? 'bg-white shadow-sm dark:bg-[#2c2c29]'
                        : 'hover:bg-white/[0.75] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium text-[#373734] dark:text-[#e8e0d5]">{entry.path}</div>
                        {entry.oldPath ? <div className="truncate text-[11px] text-claude-textSecondary">from {entry.oldPath}</div> : null}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${statusTone(entry)}`}>
                        {entry.label}
                      </span>
                    </div>
                    {isSelected ? (
                      <div className="mt-2 flex gap-2">
                        {entry.unstaged ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onStage(entry.path);
                            }}
                            disabled={isBusy}
                            className="inline-flex h-7 items-center gap-1 rounded-[6px] bg-[#2f2d29] px-2 text-[12px] text-white disabled:opacity-50 dark:bg-[#f1ebe3] dark:text-[#1e1e1c]"
                          >
                            {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Stage
                          </button>
                        ) : null}
                        {entry.staged ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onUnstage(entry.path);
                            }}
                            disabled={isBusy}
                            className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-[#d8d3ca] px-2 text-[12px] text-[#4b4843] disabled:opacity-50 dark:border-white/10 dark:text-[#d7d0c4]"
                          >
                            {isBusy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                            Unstage
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

        </>
      )}
    </aside>
  );
}

type CodePageProps = {
  onStart: (payload: CodeLaunchPayload) => void;
  chatPane?: React.ReactNode;
  initialFolderPath?: string | null;
  onFolderPathChange?: (path: string | null) => void;
  forceWorkbench?: boolean;
};

const CodePage = ({
  onStart,
  chatPane,
  initialFolderPath,
  onFolderPathChange,
  forceWorkbench = false,
}: CodePageProps) => {
  const [folderPath, setFolderPathState] = useState(initialFolderPath || '');
  const [draft, setDraft] = useState('');
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState('');
  const [modelOptions, setModelOptions] = useState<SelectableModel[]>([
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet', enabled: 1, description: 'Balanced for everyday work' }
  ]);
  const [currentModelString, setCurrentModelString] = useState(() => safeGetStorageItem('default_model', 'claude-sonnet-4-6'));
  const [isAnimatingIn, setIsAnimatingIn] = useState(true);
  const [entriesByPath, setEntriesByPath] = useState<Record<string, WorkspaceDirectoryListing>>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([ROOT_PATH]));
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());
  const [activeDirectory, setActiveDirectory] = useState(ROOT_PATH);
  const [selectedPath, setSelectedPath] = useState('');
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileContent | null>(null);
  const [selectedImage, setSelectedImage] = useState<WorkspaceFileDataUrl | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus | null>(null);
  const [gitStatusLoading, setGitStatusLoading] = useState(false);
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null);
  const [gitDiff, setGitDiff] = useState<WorkspaceGitDiff | null>(null);
  const [gitDiffLoading, setGitDiffLoading] = useState(false);
  const [gitDiffMode, setGitDiffMode] = useState<'unstaged' | 'staged'>('unstaged');
  const [gitBusyPath, setGitBusyPath] = useState('');
  const [copied, setCopied] = useState(false);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [gitCollapsed, setGitCollapsed] = useState(true);
  const [explorerWidth, setExplorerWidth] = useState(280);
  const [rightPaneWidth, setRightPaneWidth] = useState(440);
  const [gitPaneHeight, setGitPaneHeight] = useState(260);
  const [titlebarToolbarTarget, setTitlebarToolbarTarget] = useState<HTMLElement | null>(null);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentModelRef = useRef(currentModelString);
  const fileRequestIdRef = useRef(0);
  const diffRequestIdRef = useRef(0);

  const setFolderPath = useCallback((path: string) => {
    setFolderPathState(path);
    onFolderPathChange?.(path || null);
  }, [onFolderPathChange]);

  const rootName = folderPath.split(/[\\/]/).filter(Boolean).pop() || 'Workspace';
  const selectedFolderName = folderPath ? rootName : 'Choose folder';
  const canSend = folderPath.trim().length > 0 && draft.trim().length > 0;
  const hasWorkspace = folderPath.trim().length > 0;
  const hasUnsavedFileChanges = !!selectedFile && !selectedFile.isBinary && editorValue !== selectedFile.content;
  const showPreviewPane = !!selectedFile || !!selectedImage || !!selectedGitPath || fileLoading || gitDiffLoading || !!fileError || !!gitDiff?.error;
  const shouldShowWorkbench = hasWorkspace || forceWorkbench;

  const confirmDiscardUnsavedFileChanges = useCallback(() => (
    !hasUnsavedFileChanges || window.confirm('Discard unsaved file changes?')
  ), [hasUnsavedFileChanges]);

  useEffect(() => {
    const nextPath = initialFolderPath || '';
    if (nextPath && nextPath !== folderPath) {
      setFolderPathState(nextPath);
    }
  }, [folderPath, initialFolderPath]);

  useEffect(() => {
    setTitlebarToolbarTarget(document.getElementById('code-titlebar-toolbar'));
  }, []);

  const beginHorizontalResize = useCallback((
    event: React.MouseEvent<HTMLDivElement>,
    pane: 'explorer' | 'right',
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startExplorerWidth = explorerWidth;
    const startRightWidth = rightPaneWidth;

    const handleMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      if (pane === 'explorer') {
        setExplorerWidth(clamp(startExplorerWidth + delta, 220, 520));
      } else {
        setRightPaneWidth(clamp(startRightWidth - delta, 320, 760));
      }
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [explorerWidth, rightPaneWidth]);

  const beginVerticalResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = workbenchRef.current;
    if (!container) return;

    const startY = event.clientY;
    const startHeight = gitPaneHeight;

    const handleMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const maxHeight = Math.max(180, container.clientHeight - 220);
      setGitPaneHeight(clamp(startHeight + delta, 140, maxHeight));
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [gitPaneHeight]);

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
    ta.style.height = `${Math.min(ta.scrollHeight, hasWorkspace ? 132 : 300)}px`;
    ta.style.overflowY = ta.scrollHeight > (hasWorkspace ? 132 : 300) ? 'auto' : 'hidden';
  }, [hasWorkspace]);

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

  const loadDirectory = useCallback(async (path = ROOT_PATH) => {
    if (!folderPath) return;
    setLoadingPaths((current) => new Set(current).add(path));
    setError('');
    try {
      const listing = await listWorkspaceEntries(folderPath, path);
      setEntriesByPath((current) => ({ ...current, [path]: listing }));
    } catch (err: any) {
      setError(err?.message || 'Failed to read workspace directory');
    } finally {
      setLoadingPaths((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
    }
  }, [folderPath]);

  const refreshGitStatus = useCallback(async () => {
    if (!folderPath) return;
    setGitStatusLoading(true);
    try {
      const status = await getWorkspaceGitStatus(folderPath);
      setGitStatus(status);
      setSelectedGitPath((current) => {
        if (!current) return null;
        return status.entries.some((entry) => entry.path === current) ? current : null;
      });
    } catch (err: any) {
      setGitStatus({ isRepo: false, branch: null, entries: [], truncated: false, error: err?.message || 'Failed to read Git status' });
    } finally {
      setGitStatusLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    if (!folderPath) return;
    setEntriesByPath({});
    setExpandedPaths(new Set([ROOT_PATH]));
    setActiveDirectory(ROOT_PATH);
    setSelectedPath('');
    setSelectedFile(null);
    setSelectedImage(null);
    setEditorValue('');
    setIsEditingFile(false);
    setSelectedGitPath(null);
    setGitDiff(null);
    loadDirectory(ROOT_PATH);
    refreshGitStatus();
  }, [folderPath, loadDirectory, refreshGitStatus]);

  const loadGitDiff = useCallback(async (path: string | null, mode: 'unstaged' | 'staged') => {
    const requestId = ++diffRequestIdRef.current;
    if (!folderPath || !path) {
      setGitDiff(null);
      setGitDiffLoading(false);
      return;
    }

    setGitDiffLoading(true);
    try {
      const diff = await getWorkspaceGitDiff(folderPath, path, mode === 'staged');
      if (diffRequestIdRef.current !== requestId) return;
      setGitDiff(diff);
    } catch (err: any) {
      if (diffRequestIdRef.current !== requestId) return;
      setGitDiff({
        isRepo: true,
        path,
        staged: mode === 'staged',
        diff: '',
        truncated: false,
        error: err?.message || 'Failed to load diff',
      });
    } finally {
      if (diffRequestIdRef.current === requestId) {
        setGitDiffLoading(false);
      }
    }
  }, [folderPath]);

  const handleSelectGitPath = useCallback((path: string, preferredMode?: 'unstaged' | 'staged') => {
    if (!confirmDiscardUnsavedFileChanges()) return;
    const statusEntry = gitStatus?.entries.find((entry) => entry.path === path);
    const nextMode = preferredMode || (statusEntry?.unstaged ? 'unstaged' : statusEntry?.staged ? 'staged' : gitDiffMode);
    fileRequestIdRef.current += 1;
    setSelectedGitPath(path);
    setSelectedFile(null);
    setSelectedImage(null);
    setEditorValue('');
    setIsEditingFile(false);
    setFileLoading(false);
    setFileError('');
    setCopied(false);
    setGitDiffMode(nextMode);
    void loadGitDiff(path, nextMode);
  }, [confirmDiscardUnsavedFileChanges, gitDiffMode, gitStatus?.entries, loadGitDiff]);

  const handleGitModeChange = useCallback((mode: 'unstaged' | 'staged') => {
    setGitDiffMode(mode);
    if (selectedGitPath) {
      void loadGitDiff(selectedGitPath, mode);
    }
  }, [loadGitDiff, selectedGitPath]);

  const handlePickFolder = async () => {
    if (!confirmDiscardUnsavedFileChanges()) return;
    setIsPicking(true);
    setError('');
    try {
      const picked = await selectDesktopDirectory();
      if (picked) {
        const model = currentModelRef.current || currentModelString;
        rememberDefaultModel(model);
        setFolderPath(picked);
        onStart({
          folderPath: picked,
          model: model || undefined,
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to choose folder');
    } finally {
      setIsPicking(false);
    }
  };

  const handleSubmit = () => {
    if (!canSend) return;
    const model = currentModelRef.current || currentModelString;
    rememberDefaultModel(model);
    onStart({
      folderPath: folderPath.trim(),
      prompt: draft.trim(),
      model: model || undefined,
    });
    setDraft('');
  };

  const handleToggleDirectory = async (entry: WorkspaceEntry) => {
    setActiveDirectory(entry.path);
    setSelectedPath(entry.path);
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (entry.path === ROOT_PATH) {
        next.add(ROOT_PATH);
      } else if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
      }
      return next;
    });
    if (!entriesByPath[entry.path]) {
      await loadDirectory(entry.path);
    }
  };

  const handleClosePreview = useCallback(() => {
    if (!confirmDiscardUnsavedFileChanges()) return;
    fileRequestIdRef.current += 1;
    diffRequestIdRef.current += 1;
    setSelectedFile(null);
    setSelectedImage(null);
    setEditorValue('');
    setIsEditingFile(false);
    setSelectedGitPath(null);
    setGitDiff(null);
    setFileLoading(false);
    setGitDiffLoading(false);
    setFileError('');
    setCopied(false);
  }, [confirmDiscardUnsavedFileChanges]);

  const handleSelectFile = async (
    entry: WorkspaceEntry,
    options?: { preferFilePreview?: boolean; startEditing?: boolean },
  ) => {
    if (entry.path === selectedFile?.path && hasUnsavedFileChanges) {
      setSelectedPath(entry.path);
      setSelectedGitPath(null);
      setGitDiff(null);
      setGitDiffLoading(false);
      setSelectedImage(null);
      if (options?.startEditing) {
        setIsEditingFile(true);
      }
      return;
    }
    if (entry.path !== selectedFile?.path && !confirmDiscardUnsavedFileChanges()) return;
    setSelectedPath(entry.path);
    const changedEntry = gitStatus?.entries.find((changed) => changed.path === entry.path);
    if (changedEntry && !options?.preferFilePreview) {
      handleSelectGitPath(entry.path, changedEntry.unstaged ? 'unstaged' : 'staged');
      return;
    }

    const requestId = ++fileRequestIdRef.current;
    diffRequestIdRef.current += 1;
    setSelectedGitPath(null);
    setGitDiff(null);
    setGitDiffLoading(false);
    setSelectedImage(null);
    setFileLoading(true);
    setFileError('');
    setCopied(false);
    setIsEditingFile(false);
    try {
      if (!options?.preferFilePreview && isImagePath(entry.path, entry.extension)) {
        const image = await readWorkspaceFileDataUrl(folderPath, entry.path);
        if (fileRequestIdRef.current !== requestId) return;
        setSelectedImage(image);
        setSelectedFile(null);
        setEditorValue('');
        return;
      }

      const content = await readWorkspaceFile(folderPath, entry.path);
      if (fileRequestIdRef.current !== requestId) return;
      setSelectedFile(content);
      setSelectedImage(null);
      setEditorValue(content.content);
      setIsEditingFile(!!options?.startEditing && !content.isBinary && !content.truncated);
    } catch (err: any) {
      if (fileRequestIdRef.current !== requestId) return;
      setSelectedFile(null);
      setSelectedImage(null);
      setEditorValue('');
      setFileError(err?.message || 'Failed to read file');
    } finally {
      if (fileRequestIdRef.current === requestId) {
        setFileLoading(false);
      }
    }
  };

  const refreshWorkspace = async () => {
    if (!confirmDiscardUnsavedFileChanges()) return;
    await Promise.all([
      loadDirectory(activeDirectory),
      activeDirectory !== ROOT_PATH ? loadDirectory(ROOT_PATH) : Promise.resolve(),
      refreshGitStatus(),
    ]);
    if (selectedFile) {
      await handleSelectFile({
        name: selectedFile.name,
        path: selectedFile.path,
        isDir: false,
        size: selectedFile.size,
        modified: null,
        extension: selectedFile.extension,
      });
    } else if (selectedImage) {
      await handleSelectFile({
        name: selectedImage.name,
        path: selectedImage.path,
        isDir: false,
        size: selectedImage.size,
        modified: null,
        extension: selectedImage.extension,
      });
    }
  };

  const handleCreateEntry = async (kind: WorkspaceEntryKind) => {
    if (!confirmDiscardUnsavedFileChanges()) return;
    const label = kind === 'directory' ? 'folder' : 'file';
    const name = window.prompt(`New ${label} name`);
    if (!name) return;
    try {
      const entry = await createWorkspaceEntry(folderPath, activeDirectory, name, kind);
      await loadDirectory(activeDirectory);
      if (kind === 'directory') {
        setExpandedPaths((current) => new Set(current).add(activeDirectory));
        setActiveDirectory(entry.path);
      } else {
        await handleSelectFile(entry);
      }
      await refreshGitStatus();
    } catch (err: any) {
      setError(err?.message || `Failed to create ${label}`);
    }
  };

  const handleRename = async () => {
    if (!selectedPath) return;
    if (!confirmDiscardUnsavedFileChanges()) return;
    const currentName = basenameOf(selectedPath);
    const newName = window.prompt('Rename to', currentName);
    if (!newName || newName === currentName) return;
    const parent = parentPathOf(selectedPath);
    try {
      const renamed = await renameWorkspacePath(folderPath, selectedPath, newName);
      await loadDirectory(parent);
      setSelectedPath(renamed.path);
      if (renamed.isDir) {
        setActiveDirectory(renamed.path);
      } else {
        await handleSelectFile(renamed);
      }
      await refreshGitStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to rename path');
    }
  };

  const handleDelete = async () => {
    if (!selectedPath) return;
    if (!confirmDiscardUnsavedFileChanges()) return;
    const confirmed = window.confirm(`Delete ${selectedPath}?`);
    if (!confirmed) return;
    const parent = parentPathOf(selectedPath);
    try {
      await deleteWorkspacePath(folderPath, selectedPath);
      setSelectedPath('');
      setSelectedFile(null);
      setSelectedImage(null);
      setEditorValue('');
      setIsEditingFile(false);
      setActiveDirectory(parent);
      await loadDirectory(parent);
      await refreshGitStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete path');
    }
  };

  const handleEditFile = () => {
    if (!selectedFile || selectedFile.isBinary || selectedFile.truncated) return;
    setSelectedGitPath(null);
    setGitDiff(null);
    setGitDiffLoading(false);
    setSelectedImage(null);
    setEditorValue(selectedFile.content);
    setIsEditingFile(true);
  };

  const handleDiscardFileEdits = () => {
    if (!selectedFile) return;
    setEditorValue(selectedFile.content);
    setIsEditingFile(false);
  };

  const handleOpenDiffFileEditor = async () => {
    if (!gitDiff?.path) return;
    const path = gitDiff.path;
    const entry: WorkspaceEntry = {
      name: basenameOf(path),
      path,
      isDir: false,
      size: 0,
      modified: null,
      extension: path.includes('.') ? path.split('.').pop()?.toLowerCase() || null : null,
    };
    await handleSelectFile(entry, { preferFilePreview: true, startEditing: true });
  };

  const handleSaveFile = async () => {
    if (!selectedFile || selectedFile.isBinary || selectedFile.truncated) return false;
    if (!hasUnsavedFileChanges) return true;
    setIsSavingFile(true);
    setFileError('');
    try {
      const saved = await writeWorkspaceFile(folderPath, selectedFile.path, editorValue);
      setSelectedFile(saved);
      setSelectedImage(null);
      setEditorValue(saved.content);
      setIsEditingFile(false);
      setSelectedGitPath(saved.path);
      setGitDiffMode('unstaged');
      await Promise.all([
        loadDirectory(parentPathOf(saved.path)),
        refreshGitStatus(),
        loadGitDiff(saved.path, 'unstaged'),
      ]);
      return true;
    } catch (err: any) {
      setFileError(err?.message || 'Failed to save file');
      return false;
    } finally {
      setIsSavingFile(false);
    }
  };

  const handleStageChange = async (path: string, staged: boolean) => {
    const shouldRefreshDisplayedDiff = selectedGitPath === path || selectedFile?.path === path || selectedImage?.path === path;
    if (hasUnsavedFileChanges && selectedFile?.path === path) {
      const shouldSave = window.confirm('Save current file before updating Git index?');
      if (!shouldSave) return;
      const saved = await handleSaveFile();
      if (!saved) return;
    }

    setGitBusyPath(path);
    try {
      await setWorkspaceGitStaged(folderPath, path, staged);
      await refreshGitStatus();
      if (shouldRefreshDisplayedDiff) {
        const nextMode = staged ? 'staged' : 'unstaged';
        setSelectedGitPath(path);
        setSelectedFile(null);
        setSelectedImage(null);
        setEditorValue('');
        setIsEditingFile(false);
        setGitDiffMode(nextMode);
        await loadGitDiff(path, nextMode);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update Git index');
    } finally {
      setGitBusyPath('');
    }
  };

  const handleCopyFile = async () => {
    if (!selectedFile || selectedFile.isBinary) return;
    await navigator.clipboard?.writeText(selectedFile.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (!shouldShowWorkbench) {
    return (
      <div className="flex-1 h-full overflow-y-auto bg-claude-bg chat-font-scope">
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-6 pb-16 pt-[112px]">
          <div
            className={`mb-[14px] flex min-h-[44px] w-[672px] items-center justify-center gap-[12px] transition-all duration-150 ease-out ${
              isAnimatingIn ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
            }`}
          >
            <div className="flex h-[32px] w-[32px] shrink-0 items-center justify-center text-claude-accent transition-transform duration-500 hover:rotate-12 hover:scale-110">
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

          <div
            className={`mb-5 text-[12.5px] font-medium text-claude-textSecondary transition-all duration-150 ease-out ${
              isAnimatingIn ? 'opacity-0' : 'opacity-100'
            }`}
            style={{ transitionDelay: '50ms' }}
          >
            Choose a project folder to open file management, preview, diff, and Git tools.
          </div>

          {error ? (
            <div className="mb-4 w-[672px] rounded-[16px] border border-[#e5b0a1] bg-[#fff1ec] px-4 py-3 text-[13px] text-[#a0452e] dark:border-[#8A4C3A] dark:bg-[#3A2620] dark:text-[#F3B29D]">
              {error}
            </div>
          ) : null}

          <div
            className={`relative z-20 w-[672px] transition-all duration-150 ease-out ${
              isAnimatingIn ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
            }`}
            style={{ transitionDelay: '100ms' }}
          >
            <div className="flex w-[672px] items-center justify-between gap-3 rounded-[14px] border border-[#e8e4dc] bg-white px-3 py-3 shadow-[0px_4px_18px_rgba(0,0,0,0.035)] dark:border-white/10 dark:bg-claude-input">
              <button
                type="button"
                onClick={handlePickFolder}
                disabled={isPicking}
                className="flex h-9 min-w-0 flex-1 items-center gap-[8px] rounded-[8px] bg-[#f6f3ee] px-[10px] text-[13px] font-normal tracking-[-0.1504px] text-[#4B4843] transition-all duration-200 hover:bg-[#f0ebe3] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#201d19] dark:text-[#D7D0C4] dark:hover:bg-[#28241f]"
              >
                <Folder size={16} strokeWidth={1.8} className={isPicking ? 'shrink-0 animate-pulse' : 'shrink-0'} />
                <span className="truncate">{isPicking ? 'Choosing...' : selectedFolderName}</span>
              </button>
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  const chatOnlyMode = explorerCollapsed && gitCollapsed && !showPreviewPane;
  const rightPaneStyle = showPreviewPane && !chatOnlyMode
    ? { width: `${rightPaneWidth}px`, flex: `0 0 ${rightPaneWidth}px` }
    : { flex: '1 1 auto' };

  const fallbackChatPane = (
    <div className="flex h-full min-h-0 flex-col justify-end bg-claude-bg p-4 dark:bg-[#1f1f1d]">
      <div className="mx-auto flex w-full max-w-[760px] items-end gap-3 rounded-[14px] border border-[#ddd8cf] bg-white p-2 shadow-sm dark:border-white/10 dark:bg-[#252522]">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            adjustTextareaHeight();
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Ask Claude to edit, explain, test, or debug this workspace"
          className="min-h-[42px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-5 text-[#373734] outline-none placeholder:text-[#8f887f] dark:text-[#e8e0d5]"
        />
        <div className="flex shrink-0 items-center gap-2 pb-1">
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
            className="flex h-[32px] items-center gap-[6px] rounded-[8px] px-[10px] text-[13px] text-[#373734] transition-colors hover:bg-[#f5f4f1] dark:text-claude-text dark:hover:bg-white/5"
          >
            <Code2 size={15} />
            <span>Plan</span>
            <SmallChevronDown size={14} />
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSubmit}
            className={`flex h-[32px] w-[40px] items-center justify-center rounded-[8px] text-white transition-all ${
              canSend
                ? 'bg-[#2b2926] hover:bg-[#1f1d1a] dark:bg-[#f2eee7] dark:text-[#1f1d1a] dark:hover:bg-[#e5ddd2]'
                : 'bg-[#efcbc0] disabled:cursor-not-allowed disabled:opacity-40'
            }`}
          >
            <ArrowUp size={18} strokeWidth={2.3} />
          </button>
        </div>
      </div>
    </div>
  );

  const codeTitlebarToolbar = (
    <div className="flex h-full min-w-0 flex-1 items-center justify-between gap-2 text-[#373734] dark:text-[#d7d0c4]">
      <div className="flex min-w-0 items-center gap-2">
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <IconButton label={explorerCollapsed ? 'Show Explorer' : 'Hide Explorer'} onClick={() => setExplorerCollapsed((current) => !current)} disabled={!hasWorkspace}>
            {explorerCollapsed ? <FolderClosed size={15} /> : <FolderOpen size={15} />}
          </IconButton>
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#efe9df] text-[#bf6a4a] dark:bg-[#2d2720]">
          <Code2 size={16} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{hasWorkspace ? rootName : 'Code workspace'}</div>
          <div className="truncate text-[11px] text-claude-textSecondary">{folderPath || 'Open a folder or select a Code session'}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <IconButton label="Open in system file manager" onClick={() => openDesktopFolder(folderPath)} disabled={!hasWorkspace}>
          <FolderOpen size={15} />
        </IconButton>
        <IconButton label="Change folder" onClick={handlePickFolder} disabled={isPicking}>
          <Folder size={15} />
        </IconButton>
        <IconButton label="Refresh workspace" onClick={refreshWorkspace} disabled={!hasWorkspace}>
          <RefreshCw size={15} />
        </IconButton>
        <IconButton label={gitCollapsed ? 'Show Git' : 'Hide Git'} onClick={() => setGitCollapsed((current) => !current)} disabled={!hasWorkspace}>
          <GitBranch size={15} />
        </IconButton>
      </div>
    </div>
  );

  return (
    <>
      {titlebarToolbarTarget ? createPortal(codeTitlebarToolbar, titlebarToolbarTarget) : null}
      <div className="flex h-full min-h-0 flex-1 flex-col bg-claude-bg text-[#373734] dark:text-[#d7d0c4]">
      {error ? (
        <div className="mx-4 mt-3 flex shrink-0 items-center justify-between rounded-[8px] border border-[#e5b0a1] bg-[#fff1ec] px-3 py-2 text-[13px] text-[#a0452e] dark:border-[#8A4C3A] dark:bg-[#3A2620] dark:text-[#F3B29D]">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10">
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div ref={workbenchRef} className="flex min-h-0 flex-1 overflow-hidden">
        {hasWorkspace && !explorerCollapsed ? (
          <>
            <aside className="flex min-h-0 shrink-0 flex-col bg-[#f6f4ef] dark:bg-[#1e1e1c]" style={{ width: `${explorerWidth}px` }}>
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#e8e4dc] px-3 dark:border-white/[0.08]">
                <div className="flex min-w-0 items-center gap-2">
                  <Folder size={16} className="shrink-0 text-[#bf6a4a]" />
                  <div className="truncate text-[13px] font-medium">{rootName}</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <IconButton label="New file" onClick={() => handleCreateEntry('file')}>
                    <FilePlus size={15} />
                  </IconButton>
                  <IconButton label="New folder" onClick={() => handleCreateEntry('directory')}>
                    <FolderPlus size={15} />
                  </IconButton>
                </div>
              </div>

              <div className="shrink-0 border-b border-[#e8e4dc] p-2 dark:border-white/[0.08]">
                <div className="flex h-8 items-center gap-2 rounded-[8px] border border-[#ddd8cf] bg-white px-2 dark:border-white/10 dark:bg-[#252522]">
                  <Search size={14} className="shrink-0 text-[#8f887f]" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search files"
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[#373734] outline-none placeholder:text-[#9c968d] dark:text-[#e8e0d5]"
                  />
                </div>
              </div>

              <WorkspaceTree
                entriesByPath={entriesByPath}
                expandedPaths={expandedPaths}
                activeDirectory={activeDirectory}
                selectedPath={selectedPath}
                loadingPaths={loadingPaths}
                searchQuery={searchQuery}
                onToggleDirectory={handleToggleDirectory}
                onSelectFile={handleSelectFile}
              />

              <div className="flex h-11 shrink-0 items-center justify-between border-t border-[#e8e4dc] px-2 dark:border-white/[0.08]">
                <div className="min-w-0 truncate px-1 text-[11.5px] text-claude-textSecondary">
                  {activeDirectory || rootName}
                </div>
                <div className="flex items-center gap-0.5">
                  <IconButton label="Rename selected" onClick={handleRename} disabled={!selectedPath}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton label="Delete selected" onClick={handleDelete} disabled={!selectedPath}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            </aside>
            <div
              role="separator"
              aria-orientation="vertical"
              className="w-[5px] shrink-0 cursor-col-resize border-x border-transparent bg-[#ede9e1] hover:bg-[#d8d2c7] dark:bg-white/[0.05] dark:hover:bg-white/[0.12]"
              onMouseDown={(event) => beginHorizontalResize(event, 'explorer')}
            />
          </>
        ) : null}

        {showPreviewPane ? (
          <FilePreview
            file={selectedFile}
            image={selectedImage}
            diff={gitDiff}
            diffLoading={gitDiffLoading}
            loading={fileLoading}
            error={fileError}
            copied={copied}
            editing={isEditingFile}
            editorValue={editorValue}
            dirty={hasUnsavedFileChanges}
            saving={isSavingFile}
            onCopy={handleCopyFile}
            onClose={handleClosePreview}
            onEdit={handleEditFile}
            onEditorChange={setEditorValue}
            onSave={handleSaveFile}
            onDiscard={handleDiscardFileEdits}
            onShowFileFromDiff={handleOpenDiffFileEditor}
          />
        ) : null}

        {showPreviewPane ? (
          <div
            role="separator"
            aria-orientation="vertical"
            className="w-[5px] shrink-0 cursor-col-resize border-x border-transparent bg-[#ede9e1] hover:bg-[#d8d2c7] dark:bg-white/[0.05] dark:hover:bg-white/[0.12]"
            onMouseDown={(event) => beginHorizontalResize(event, 'right')}
          />
        ) : null}

        <section className="flex min-h-0 min-w-0 flex-col bg-claude-bg dark:bg-[#1f1f1d]" style={rightPaneStyle}>
          {hasWorkspace && !gitCollapsed ? (
            <>
              <div className="min-h-[140px] shrink-0 overflow-hidden border-b border-[#e8e4dc] dark:border-white/[0.08]" style={{ height: `${gitPaneHeight}px` }}>
                <GitPanel
                  status={gitStatus}
                  selectedPath={selectedGitPath}
                  diffMode={gitDiffMode}
                  statusLoading={gitStatusLoading}
                  busyPath={gitBusyPath}
                  onSelect={handleSelectGitPath}
                  onModeChange={handleGitModeChange}
                  onStage={(path) => handleStageChange(path, true)}
                  onUnstage={(path) => handleStageChange(path, false)}
                />
              </div>
              <div
                role="separator"
                aria-orientation="horizontal"
                className="h-[6px] shrink-0 cursor-row-resize bg-[#ede9e1] hover:bg-[#d8d2c7] dark:bg-white/[0.05] dark:hover:bg-white/[0.12]"
                onMouseDown={beginVerticalResize}
              />
            </>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            {chatPane || fallbackChatPane}
          </div>
        </section>
      </div>
      </div>
    </>
  );
};

export default CodePage;
