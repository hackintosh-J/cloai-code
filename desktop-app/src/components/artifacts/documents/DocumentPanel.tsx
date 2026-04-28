import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Code, Eye, RefreshCw, X } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { DocumentInfo } from '@/src/components/DocumentCard';
import DocxPreview from '@/src/components/DocxPreview';
import MarkdownRenderer from '@/src/components/MarkdownRenderer';
import PdfPreview from '@/src/components/PdfPreview';
import SlidePreview from '@/src/components/SlidePreview';
import { buildArtifactHtml } from '@/src/components/artifacts/runtime/artifactRenderer';
import { copyToClipboard } from '@/src/components/shared/utils/clipboard';
import { downloadDocumentRaw } from './documentDownload';

interface DocumentPanelProps {
  document: DocumentInfo;
  onClose: () => void;
}

type ViewMode = 'preview' | 'code';

const BINARY_FORMATS = new Set(['pptx', 'docx', 'xlsx', 'pdf']);
const MARKDOWN_FORMATS = new Set(['markdown', 'md']);
const RENDERABLE_EXTENSIONS = new Set(['html', 'htm', 'jsx', 'tsx']);

const TEXT_EXTENSION_BY_FORMAT: Record<string, string> = {
  markdown: 'md',
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  scala: 'scala',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  shell: 'sh',
  bash: 'sh',
  powershell: 'ps1',
  yaml: 'yml',
  json: 'json',
  xml: 'xml',
  toml: 'toml',
  ini: 'ini',
  dockerfile: 'Dockerfile',
  r: 'r',
  matlab: 'm',
  lua: 'lua',
  perl: 'pl',
  dart: 'dart',
  vue: 'vue',
  svelte: 'svelte',
};

const BINARY_EXTENSION_BY_FORMAT: Record<string, string> = {
  docx: '.docx',
  pptx: '.pptx',
  xlsx: '.xlsx',
  pdf: '.pdf',
};

function getTitleExtension(title: string): string {
  return title.match(/\.(\w+)$/)?.[1]?.toLowerCase() || '';
}

function startsLikeHtml(content?: string): boolean {
  const head = (content || '').trimStart().slice(0, 60).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

function describeDocument(doc: DocumentInfo) {
  const format = (doc.format || 'markdown').toLowerCase();
  const extension = getTitleExtension(doc.title || doc.filename || '');
  const isBinary = BINARY_FORMATS.has(format);
  const isMarkdown = MARKDOWN_FORMATS.has(format) || extension === 'md';
  const isReact = ['jsx', 'tsx'].includes(format) || ['jsx', 'tsx'].includes(extension);
  const isHtml = ['html', 'htm'].includes(format) || ['html', 'htm'].includes(extension) || startsLikeHtml(doc.content);
  const isRenderable = isReact || isHtml || RENDERABLE_EXTENSIONS.has(extension);
  const isCode = !isBinary && !isMarkdown && !isRenderable;

  return { format, extension, isBinary, isMarkdown, isReact, isHtml, isRenderable, isCode };
}

function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getTextDownloadName(doc: DocumentInfo, format: string): string {
  if (doc.title.includes('.')) return doc.title;
  return `${doc.title}.${TEXT_EXTENSION_BY_FORMAT[format] || format}`;
}

async function downloadDocument(doc: DocumentInfo, format: string, requestedFormat?: string) {
  if (requestedFormat === 'pdf' && format === 'markdown') {
    downloadText(`${doc.title}.md`, doc.content || '', 'text/markdown;charset=utf-8');
    return;
  }

  if (!BINARY_FORMATS.has(format)) {
    downloadText(getTextDownloadName(doc, format), doc.content || '');
    return;
  }

  try {
    await downloadDocumentRaw(doc, BINARY_EXTENSION_BY_FORMAT[format] || '.bin');
  } catch {
    // Keep the old generated-binary failure behavior quiet.
  }
}

function useDarkMode() {
  const [dark, setDark] = useState(() => (
    typeof window !== 'undefined' && window.document.documentElement.classList.contains('dark')
  ));

  useEffect(() => {
    const refresh = () => setDark(window.document.documentElement.classList.contains('dark'));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(window.document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

function useOutsideClick(
  active: boolean,
  refs: Array<React.RefObject<HTMLElement>>,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!active) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (refs.every((ref) => !ref.current?.contains(target))) {
        onOutside();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [active, onOutside, refs]);
}

function ArtifactPreview({ content, type }: { content: string; type: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const html = buildArtifactHtml(content, type);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content, type]);

  if (!blobUrl) return null;
  return <iframe src={blobUrl} className="h-full w-full border-0 bg-white" title="Artifact Preview" />;
}

function ViewToggle({ viewMode, onChange }: { viewMode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const buttonClass = (mode: ViewMode) => (
    `rounded-md p-1.5 transition-all ${
      viewMode === mode
        ? 'bg-white text-claude-text shadow-sm dark:bg-[#555]'
        : 'text-claude-textSecondary hover:text-claude-text'
    }`
  );

  return (
    <div className="flex flex-shrink-0 rounded-lg bg-claude-btnHover p-0.5">
      <button type="button" onClick={() => onChange('preview')} className={buttonClass('preview')} title="Preview">
        <Eye size={16} />
      </button>
      <button type="button" onClick={() => onChange('code')} className={buttonClass('code')} title="Code">
        <Code size={16} />
      </button>
    </div>
  );
}

function ActionMenu({
  copied,
  show,
  buttonRef,
  menuRef,
  onCopy,
  onToggle,
  onDownload,
  canDownloadAsPdf,
}: {
  copied: boolean;
  show: boolean;
  buttonRef: React.RefObject<HTMLButtonElement>;
  menuRef: React.RefObject<HTMLDivElement>;
  onCopy: () => void;
  onToggle: () => void;
  onDownload: (format?: string) => void;
  canDownloadAsPdf: boolean;
}) {
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={onCopy}
        className="flex h-7 items-center rounded-l-lg border border-r-0 border-claude-border px-3 text-[13px] font-medium text-claude-text transition-colors hover:bg-claude-btnHover"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        ref={buttonRef}
        onClick={onToggle}
        className="flex h-7 items-center justify-center rounded-r-lg border border-claude-border px-2 text-claude-text transition-colors hover:bg-claude-btnHover"
      >
        <ChevronDown size={14} />
      </button>

      {show && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-claude-border bg-white py-1 shadow-lg dark:bg-claude-input"
        >
          <MenuItem onClick={() => onDownload()}>Download</MenuItem>
          {canDownloadAsPdf && <MenuItem onClick={() => onDownload('pdf')}>Download as PDF</MenuItem>}
          <MenuItem onClick={onToggle}>Publish artifact</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-4 py-2 text-left text-[13px] text-claude-text transition-colors hover:bg-claude-btnHover"
    >
      {children}
    </button>
  );
}

function CodeView({
  doc,
  language,
  dark,
}: {
  doc: DocumentInfo;
  language: string;
  dark: boolean;
}) {
  const lines = (doc.content || '').split('\n');

  return (
    <div className="relative flex h-full overflow-hidden bg-[#FAFAFA] font-mono text-[13px] leading-relaxed dark:bg-[#1E1E1E]">
      <div className="flex-1 overflow-auto bg-[#FAFAFA] dark:bg-[#1E1E1E]">
        <div className="flex min-h-full">
          <div className="sticky left-0 w-[40px] flex-none select-none bg-[#FAFAFA] pt-4 pr-2 text-right text-claude-textSecondary opacity-50 dark:bg-[#1E1E1E]">
            {lines.map((_, index) => (
              <div key={index} style={{ lineHeight: '1.625' }}>{index + 1}</div>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <SyntaxHighlighter
              language={language}
              style={dark ? vscDarkPlus : oneLight}
              customStyle={{
                margin: 0,
                padding: '16px 16px 16px 8px',
                background: 'transparent',
                fontSize: '14px',
                fontFamily: 'Menlo, Monaco, SF Mono, Cascadia Code, Fira Code, Consolas, Courier New, monospace',
                lineHeight: '1.625',
                border: 'none',
                boxShadow: 'none',
                minHeight: '100%',
              }}
              codeTagProps={{ style: { fontFamily: 'inherit' } }}
            >
              {doc.content || ''}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>
    </div>
  );
}

function SheetPreview({ document }: { document: DocumentInfo }) {
  if (!document.sheets) return <MarkdownRenderer content={document.content || ''} />;

  return (
    <div className="space-y-6">
      {document.sheets.map((sheet, sheetIndex) => (
        <div key={`${sheet.name}-${sheetIndex}`}>
          <div className="mb-2 text-[14px] font-medium text-claude-text">{sheet.name}</div>
          <div className="overflow-x-auto rounded-lg border border-claude-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#4472C4] text-white">
                  {sheet.headers.map((header, headerIndex) => (
                    <th key={`${header}-${headerIndex}`} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-claude-bg' : 'bg-transparent'}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="whitespace-nowrap border-t border-claude-border px-3 py-1.5 text-claude-text">
                        {cell ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewContent({
  doc,
  format,
}: {
  doc: DocumentInfo;
  format: string;
}) {
  if (format === 'pptx' && doc.slides) {
    return <SlidePreview slides={doc.slides} title={doc.title} colorScheme={doc.colorScheme} />;
  }
  if (format === 'docx' && doc.content) {
    return <DocxPreview content={doc.content} title={doc.title} />;
  }
  if (format === 'pdf' && doc.sections) {
    return <PdfPreview sections={doc.sections} title={doc.title} />;
  }
  if (format === 'xlsx' && doc.sheets) {
    return <SheetPreview document={doc} />;
  }
  return <MarkdownRenderer content={doc.content || ''} />;
}

const DocumentPanel: React.FC<DocumentPanelProps> = ({ document: doc, onClose }) => {
  const descriptor = useMemo(() => describeDocument(doc), [doc]);
  const [viewMode, setViewMode] = useState<ViewMode>(descriptor.isCode ? 'code' : 'preview');
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const dark = useDarkMode();

  useEffect(() => {
    setViewMode(descriptor.isCode ? 'code' : 'preview');
  }, [descriptor.isCode, doc.id]);

  useOutsideClick(showCopyMenu, [copyMenuRef, copyButtonRef], () => setShowCopyMenu(false));

  const canSwitchViews = descriptor.isMarkdown || descriptor.isRenderable;
  const showingCode = viewMode === 'code' || descriptor.isCode;
  const previewingArtifact = viewMode === 'preview' && descriptor.isRenderable;

  const handleDownload = async (format?: string) => {
    setShowCopyMenu(false);
    await downloadDocument(doc, descriptor.format, format);
  };

  const handleCopy = () => {
    if (!doc.content) return;
    copyToClipboard(doc.content).then((success) => {
      if (!success) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    });
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col border-l border-claude-border bg-claude-input">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-claude-border px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {canSwitchViews && <ViewToggle viewMode={viewMode} onChange={setViewMode} />}
          <div className="flex min-w-0 items-center truncate text-[14px]">
            <span className="truncate font-normal text-claude-text">{doc.title}</span>
            {!doc.title.toLowerCase().endsWith(`.${descriptor.format}`) && (
              <span className="ml-1 flex-shrink-0 font-normal text-claude-textSecondary">· {descriptor.format.toUpperCase()}</span>
            )}
          </div>
        </div>

        <div className="ml-4 flex flex-shrink-0 items-center gap-2">
          <ActionMenu
            copied={copied}
            show={showCopyMenu}
            buttonRef={copyButtonRef}
            menuRef={copyMenuRef}
            onCopy={handleCopy}
            onToggle={() => setShowCopyMenu((value) => !value)}
            onDownload={handleDownload}
            canDownloadAsPdf={descriptor.format === 'markdown'}
          />

          <button
            type="button"
            onClick={() => {}}
            className="rounded-lg p-1.5 text-claude-textSecondary transition-colors hover:bg-claude-btnHover hover:text-claude-text"
            title="Reload"
          >
            <RefreshCw size={16} />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-claude-textSecondary transition-colors hover:bg-claude-btnHover hover:text-claude-text"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div
        className={`chat-font-scope flex-1 overflow-y-auto ${
          descriptor.format === 'docx' || descriptor.format === 'pdf' ? 'bg-claude-hover px-6 py-6' : 'px-8 py-6'
        } ${showingCode ? '!p-0 overflow-hidden bg-[#FAFAFA] dark:bg-[#1E1E1E]' : ''} ${
          previewingArtifact ? '!p-0 !overflow-hidden' : ''
        }`}
      >
        {previewingArtifact && doc.content ? (
          <ArtifactPreview content={doc.content} type={descriptor.isReact ? 'application/vnd.ant.react' : 'text/html'} />
        ) : showingCode ? (
          <CodeView doc={doc} language={descriptor.isCode ? descriptor.format : 'markdown'} dark={dark} />
        ) : (
          <PreviewContent doc={doc} format={descriptor.format} />
        )}
      </div>
    </div>
  );
};

export default DocumentPanel;
