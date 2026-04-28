import React, { memo, useCallback } from 'react';
import { Github, Loader2, X } from 'lucide-react';

export interface PendingFile {
  id: string;
  file?: File;
  fileId?: string;
  fileName: string;
  fileType?: 'image' | 'document' | 'text';
  mimeType: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
  previewUrl?: string;
  lineCount?: number;
  source?: 'github';
  ghRepo?: string;
  ghRef?: string;
}

interface FileUploadPreviewProps {
  files: PendingFile[];
  onRemove: (id: string) => void;
}

const SCROLLBAR_STYLES = `
  .custom-scrollbar-horizontal::-webkit-scrollbar {
    height: 6px;
  }
  .custom-scrollbar-horizontal::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar-horizontal::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 10px;
  }
  .dark .custom-scrollbar-horizontal::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
  }
  .custom-scrollbar-horizontal::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
  }
  .dark .custom-scrollbar-horizontal::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toUpperCase() || '?';
}

function getShortError(error?: string): string {
  if (!error) return '上传失败';
  return error.length > 26 ? `${error.slice(0, 26)}...` : error;
}

function getFileDetail(file: PendingFile): string | number {
  return file.lineCount !== undefined ? `${file.lineCount} lines` : formatSize(file.size);
}

const UploadProgress: React.FC<{ progress: number; iconSize?: number }> = ({ progress, iconSize = 10 }) => (
  <span className="flex items-center gap-1">
    <Loader2 size={iconSize} className="animate-spin" />
    {progress}%
  </span>
);

const FileStatusText: React.FC<{ file: PendingFile }> = ({ file }) => {
  if (file.status === 'uploading') {
    return <UploadProgress progress={file.progress} />;
  }

  if (file.status === 'error') {
    return (
      <span className="text-red-500" title={file.error}>
        {getShortError(file.error)}
      </span>
    );
  }

  return <>{getFileDetail(file)}</>;
};

const FileBadge: React.FC<{ children: React.ReactNode; withIcon?: boolean }> = ({ children, withIcon }) => (
  <div className="self-start flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border border-gray-200 dark:border-[#5B5B56] bg-gray-50 dark:bg-claude-input rounded text-claude-textSecondary uppercase">
    {withIcon && <Github size={10} />}
    {children}
  </div>
);

const GithubAttachment: React.FC<{ file: PendingFile }> = ({ file }) => (
  <>
    <div className="min-w-0">
      <div
        className="text-[13px] font-medium text-claude-text leading-tight break-words line-clamp-2"
        title={file.ghRepo || file.fileName}
      >
        {file.ghRepo || file.fileName}
      </div>
      <div className="text-[11px] text-claude-textSecondary mt-1">
        {file.status === 'done' ? file.ghRef || 'main' : <FileStatusText file={file} />}
      </div>
    </div>
    <FileBadge withIcon>GITHUB</FileBadge>
  </>
);

const ImageAttachment: React.FC<{ file: PendingFile }> = ({ file }) => {
  const shortError = getShortError(file.error);

  return (
    <>
      <img
        src={file.previewUrl}
        alt={file.fileName}
        className="w-full h-full object-cover"
      />
      {file.status !== 'done' && (
        <div
          className={`absolute inset-0 flex items-center justify-center text-[11px] px-2 text-center ${
            file.status === 'error' ? 'bg-red-600/80 text-white' : 'bg-black/45 text-white'
          }`}
          title={file.error}
        >
          {file.status === 'uploading' ? (
            <UploadProgress progress={file.progress} iconSize={12} />
          ) : (
            shortError
          )}
        </div>
      )}
    </>
  );
};

const DocumentAttachment: React.FC<{ file: PendingFile }> = ({ file }) => (
  <>
    <div className="min-w-0">
      <div className="text-[13px] font-medium text-claude-text truncate" title={file.fileName}>
        {file.fileName}
      </div>
      <div className="text-[11px] text-claude-textSecondary mt-0.5">
        <FileStatusText file={file} />
      </div>
    </div>
    <FileBadge>{getFileExtension(file.fileName)}</FileBadge>
  </>
);

interface AttachmentTileProps {
  file: PendingFile;
  onRemove: (id: string) => void;
}

const AttachmentTile: React.FC<AttachmentTileProps> = memo(({ file, onRemove }) => {
  const isImage = !!file.previewUrl && file.mimeType.startsWith('image/');
  const isGithub = file.source === 'github';
  const handleRemove = useCallback(() => onRemove(file.id), [file.id, onRemove]);

  return (
    <div
      className={`relative group/file flex-shrink-0 w-28 h-28 rounded-xl border border-gray-200 hover:border-gray-300 dark:border-[#5B5B56] dark:hover:border-gray-400 overflow-hidden transition-all ${
        isImage ? '' : 'bg-white dark:bg-claude-input p-3 flex flex-col justify-between'
      }`}
    >
      {isGithub ? (
        <GithubAttachment file={file} />
      ) : isImage ? (
        <ImageAttachment file={file} />
      ) : (
        <DocumentAttachment file={file} />
      )}

      <button
        onClick={handleRemove}
        className="absolute top-1 right-1 w-6 h-6 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover/file:opacity-100 transition-opacity backdrop-blur-sm"
      >
        <X size={14} />
      </button>
    </div>
  );
});

AttachmentTile.displayName = 'AttachmentTile';

const FileUploadPreview: React.FC<FileUploadPreviewProps> = ({ files, onRemove }) => {
  if (files.length === 0) return null;

  return (
    <>
      <style>{SCROLLBAR_STYLES}</style>
      <div className="flex flex-nowrap gap-3 px-4 pt-3 pb-2 overflow-x-auto overflow-y-hidden custom-scrollbar-horizontal">
        {files.map((file) => (
          <AttachmentTile key={file.id} file={file} onRemove={onRemove} />
        ))}
      </div>
    </>
  );
};

export default FileUploadPreview;
