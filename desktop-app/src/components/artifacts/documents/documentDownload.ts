import { isDesktopApp } from '@/src/desktop';
import type { DocumentInfo } from '@/src/components/DocumentCard';

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function base64ToBlob(dataUrl: string) {
  const [meta, data] = dataUrl.split(',', 2);
  if (!data) return null;
  const mimeType = meta.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function downloadDocumentRaw(
  document: DocumentInfo,
  extension: string
): Promise<boolean> {
  const filename = `${document.title}${extension}`;

  if (isDesktopApp()) {
    if (document.url?.startsWith('data:')) {
      const blob = base64ToBlob(document.url);
      if (blob) {
        triggerBlobDownload(blob, filename);
        return true;
      }
    }
    if (document.content !== undefined) {
      triggerBlobDownload(new Blob([document.content], { type: 'application/octet-stream' }), filename);
      return true;
    }
    return false;
  }

  const token = localStorage.getItem('auth_token');
  const res = await fetch(`/api/documents/${document.id}/raw`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return false;
  triggerBlobDownload(await res.blob(), filename);
  return true;
}
