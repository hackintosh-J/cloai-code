import React, { memo, useEffect, useMemo, useState } from 'react';
import { FolderOpen, Github, X } from 'lucide-react';
import { DocumentInfo } from '@/src/components/DocumentCard';
import { isDesktopApp, openDesktopFolder, showDesktopItemInFolder } from '@/src/desktop';
import { getAttachmentDisplayUrl, getAttachmentPath, getAttachmentRawUrl, getAttachmentUrl } from '@/src/services';
import { safeGetStorageItem } from '@/src/utils/safeStorage';

interface Attachment {
  id: string;
  file_type: string;
  file_name: string;
  mime_type: string;
  file_size?: number;
  line_count?: number;
  source?: string;
  gh_repo?: string;
  gh_ref?: string;
}

interface MessageAttachmentsProps {
  attachments: Attachment[];
  onOpenDocument?: (doc: DocumentInfo) => void;
}

const TEXT_EXTENSIONS = new Set([
  'C',
  'CPP',
  'CS',
  'CSS',
  'GO',
  'H',
  'HTML',
  'JAVA',
  'JS',
  'JSX',
  'JSON',
  'LUA',
  'MD',
  'PHP',
  'PY',
  'RB',
  'RS',
  'SH',
  'SQL',
  'SVELTE',
  'TS',
  'TSX',
  'TXT',
  'VUE',
  'XML',
  'YAML',
]);

const isDesktopRuntime = isDesktopApp();

function fileExtension(fileName?: string | null): string {
  if (!fileName) return '';
  return (fileName.split('.').pop() || '').toUpperCase();
}

function compactSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

function isImageAttachment(attachment: Attachment): boolean {
  return attachment.file_type === 'image' || !!attachment.mime_type?.startsWith('image/');
}

function isGithubAttachment(attachment: Attachment): boolean {
  return attachment.source === 'github' || attachment.file_type === 'github';
}

function withAuthToken(url: string): string {
  const token = safeGetStorageItem('auth_token');
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

async function resolveAttachmentPreviewUrl(attachment: Attachment): Promise<string | null> {
  if (isDesktopRuntime) {
    try {
      return await getAttachmentDisplayUrl(attachment.id);
    } catch {
      try {
        return await getAttachmentRawUrl(attachment.id);
      } catch {
        return null;
      }
    }
  }
  return withAuthToken(getAttachmentUrl(attachment.id));
}

async function openFileInFolder(fileId: string) {
  if (!isDesktopRuntime) return false;
  try {
    const data = await getAttachmentPath(fileId);
    if (data?.localPath) return await showDesktopItemInFolder(data.localPath);
    if (data?.folder) return await openDesktopFolder(data.folder);
  } catch (err) {
    console.error('[Attachment] Failed to open folder:', err);
  }
  return false;
}

function useThumbnailUrl(attachment: Attachment, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    let active = true;

    if (!enabled) {
      setUrl(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    resolveAttachmentPreviewUrl(attachment)
      .then((nextUrl) => {
        if (active) setUrl(nextUrl);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attachment, enabled]);

  return { url, loading };
}

const GithubCard = memo(function GithubCard({ attachment }: { attachment: Attachment }) {
  const repo = attachment.gh_repo || attachment.file_name || 'github';
  const ref = attachment.gh_ref || 'main';

  return (
    <div
      className="relative flex h-28 w-28 flex-col justify-between overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-[#5B5B56] dark:bg-claude-input"
      title={repo}
    >
      <div className="min-w-0">
        <div className="line-clamp-2 break-words text-[13px] font-medium leading-tight text-claude-text">
          {repo}
        </div>
        <div className="mt-1 text-[11px] text-claude-textSecondary">{ref}</div>
      </div>
      <div className="flex items-center gap-1 self-start rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-claude-textSecondary dark:border-[#5B5B56] dark:bg-claude-input">
        <Github size={10} />
        GITHUB
      </div>
    </div>
  );
});

function AttachmentCard({
  attachment,
  onOpen,
}: {
  attachment: Attachment;
  onOpen: () => void;
}) {
  const image = isImageAttachment(attachment);
  const github = isGithubAttachment(attachment);
  const { url: thumbnailUrl, loading } = useThumbnailUrl(attachment, image && !github);

  if (github) {
    return <GithubCard attachment={attachment} />;
  }

  if (image) {
    return (
      <button
        type="button"
        className="group relative h-28 w-28 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:opacity-90 dark:border-[#5B5B56] dark:bg-claude-input dark:hover:border-gray-400"
        onClick={onOpen}
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={attachment.file_name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            {loading && <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />}
          </div>
        )}
        {isDesktopRuntime && (
          <div className="absolute bottom-1 right-1 rounded-md bg-black/40 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <FolderOpen size={12} className="text-white" />
          </div>
        )}
      </button>
    );
  }

  const ext = fileExtension(attachment.file_name);
  const subtitle = attachment.line_count
    ? `${attachment.line_count} lines`
    : compactSize(attachment.file_size) || '文件';

  return (
    <button
      type="button"
      className="group relative flex h-28 w-28 flex-col justify-between overflow-hidden rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-all hover:border-gray-300 dark:border-[#5B5B56] dark:bg-claude-input dark:hover:border-gray-400"
      onClick={onOpen}
      title={`${attachment.file_name}${isDesktopRuntime ? '\nClick to open in folder' : ''}`}
    >
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-claude-text" title={attachment.file_name || 'file'}>
          {attachment.file_name || 'file'}
        </div>
        <div className="mt-0.5 text-[11px] text-claude-textSecondary">{subtitle}</div>
      </div>

      <div className="flex items-center justify-between">
        <div className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-claude-textSecondary dark:border-[#5B5B56] dark:bg-claude-input">
          {ext}
        </div>
        {isDesktopRuntime && (
          <FolderOpen size={12} className="text-claude-textSecondary opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
    </button>
  );
}

async function readTextAttachment(attachment: Attachment): Promise<string | null> {
  const url = isDesktopRuntime
    ? await getAttachmentRawUrl(attachment.id)
    : withAuthToken(getAttachmentUrl(attachment.id));
  const response = await fetch(url);
  return response.ok ? response.text() : null;
}

function canOpenAsText(attachment: Attachment): boolean {
  return TEXT_EXTENSIONS.has(fileExtension(attachment.file_name)) || !!attachment.mime_type?.startsWith('text/');
}

const MessageAttachments: React.FC<MessageAttachmentsProps> = ({ attachments, onOpenDocument }) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const visibleAttachments = useMemo(() => attachments?.filter((attachment) => attachment?.id) ?? [], [attachments]);

  if (visibleAttachments.length === 0) return null;

  const handleAttachmentClick = async (attachment: Attachment) => {
    if (isDesktopRuntime && await openFileInFolder(attachment.id)) return;

    if (isImageAttachment(attachment)) {
      setLightboxUrl(await resolveAttachmentPreviewUrl(attachment));
      return;
    }

    const fallbackUrl = getAttachmentUrl(attachment.id);
    if (onOpenDocument && canOpenAsText(attachment)) {
      try {
        const content = await readTextAttachment(attachment);
        if (content !== null) {
          onOpenDocument({
            id: attachment.id,
            title: attachment.file_name,
            filename: attachment.file_name,
            url: fallbackUrl,
            content,
            format: 'markdown',
          });
          return;
        }
      } catch (err) {
        console.error('Failed to fetch file content', err);
      }
    }

    if (!isDesktopRuntime) {
      window.open(fallbackUrl, '_blank');
    }
  };

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-2">
        {visibleAttachments.map((attachment) => (
          <AttachmentCard
            key={attachment.id}
            attachment={attachment}
            onOpen={() => handleAttachmentClick(attachment)}
          />
        ))}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-black/20 p-2 text-white/70 transition-colors hover:bg-black/40 hover:text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={24} />
          </button>
          <img
            src={lightboxUrl}
            alt="preview"
            className="max-h-[95vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default memo(MessageAttachments);
