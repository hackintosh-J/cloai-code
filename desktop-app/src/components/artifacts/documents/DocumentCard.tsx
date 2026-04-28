import React from 'react';
import { FileText, Download } from 'lucide-react';
import { downloadDocumentRaw } from './documentDownload';

export interface SlideInfo {
  title: string;
  content: string;
  notes?: string;
  layout?: 'cover' | 'section' | 'content' | 'two_column' | 'summary';
  left_content?: string;
  right_content?: string;
}

export interface SheetInfo {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
}

export interface PdfSection {
  type: 'heading' | 'paragraph' | 'table' | 'list' | 'pagebreak';
  content?: string | string[];
  level?: number;
  headers?: string[];
  rows?: (string | number | null)[][];
  ordered?: boolean;
}

export interface DocumentInfo {
  id: string;
  title: string;
  filename: string;
  url: string;
  content?: string;
  format?: string;
  slides?: SlideInfo[];
  sheets?: SheetInfo[];
  sections?: PdfSection[];
  colorScheme?: string;
}

interface DocumentCardProps {
  document: DocumentInfo;
  onOpen: (document: DocumentInfo) => void;
}

const BINARY_DOCUMENT_FORMATS = new Set(['docx', 'pptx', 'xlsx', 'pdf']);

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

const getDocumentFormat = (document: DocumentInfo) => document.format || 'markdown';

const isBinaryDocument = (format: string) => BINARY_DOCUMENT_FORMATS.has(format);

const getTextExtension = (format: string) => TEXT_EXTENSION_BY_FORMAT[format] || format;

const getBinaryExtension = (format: string) => BINARY_EXTENSION_BY_FORMAT[format] || '.bin';

const getTextDownloadName = (document: DocumentInfo, format: string) => {
  if (document.title.includes('.')) {
    return document.title;
  }

  return `${document.title}.${getTextExtension(format)}`;
};

const downloadTextDocument = (document: DocumentInfo, format: string) => {
  const blob = new Blob([document.content || ''], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');

  link.href = url;
  link.download = getTextDownloadName(document, format);
  link.click();

  URL.revokeObjectURL(url);
};

const downloadBinaryDocument = async (document: DocumentInfo, format: string) => {
  try {
    await downloadDocumentRaw(document, getBinaryExtension(format));
  } catch {
    // Preserve the existing silent failure behavior for generated binary artifacts.
  }
};

const DocumentCard: React.FC<DocumentCardProps> = ({ document, onOpen }) => {
  const fmt = getDocumentFormat(document);

  const handleDownload = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();

    if (isBinaryDocument(fmt)) {
      await downloadBinaryDocument(document, fmt);
      return;
    }

    downloadTextDocument(document, fmt);
  };

  return (
    <div
      onClick={() => onOpen(document)}
      className="group/card flex items-center p-3 gap-3 border border-claude-border rounded-xl hover:bg-[#FDFCFA] dark:hover:bg-[#2A2A28] hover:border-[#CCC] dark:hover:border-[#40403E] transition-all cursor-pointer w-full select-none"
    >
      {/* Icon Area - Tilted Paper Style */}
      <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
        <div className="w-9 h-11 bg-claude-input border border-claude-border rounded-[6px] -rotate-6 shadow-[0_1px_1px_rgba(0,0,0,0.05)] flex items-center justify-center transition-transform group-hover/card:-rotate-12 duration-300">
          <FileText size={18} className="text-claude-textSecondary opacity-80" strokeWidth={1.5} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h3 className="font-semibold text-[15px] text-claude-text truncate leading-tight mb-0.5">
          {document.title}
        </h3>
        <p className="text-[12px] text-claude-textSecondary font-medium tracking-wide flex items-center">
          Document <span className="mx-1.5 opacity-40">·</span> {fmt.toUpperCase()}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
        {/* Download Button */}
        <button
          onClick={handleDownload}
          className="p-2 text-claude-textSecondary hover:text-claude-text hover:bg-claude-btn-hover rounded-lg transition-colors"
          title="Download"
        >
          <Download size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

export default React.memo(DocumentCard);
