import type { UploadPathResult, UploadRawResult, UploadResult } from '../types/api'
import { isDesktopApp } from '../desktop'
import { invokeTauri } from '../platform/tauriClient'
import { API_BASE, getToken, redirectToLogin, request } from './http/apiClient'

export type { UploadPathResult, UploadRawResult, UploadResult }

type NativeFilePayload = {
  filePath: string;
  fileName?: string;
  mimeType?: string;
  conversationId?: string;
}

function getNativeFilePath(file: File): string | null {
  const candidate = (file as File & { path?: unknown }).path
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

function toNativeFilePayload(
  file: File,
  conversationId?: string
): NativeFilePayload | null {
  const filePath = getNativeFilePath(file)
  if (!filePath) {
    return null
  }

  return {
    filePath,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    conversationId,
  }
}

function fileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() || 'file'
}

export function uploadFile(
  file: File,
  onProgress?: (percent: number) => void,
  conversationId?: string
): Promise<UploadResult> {
  if (isDesktopApp()) {
    const payload = toNativeFilePayload(file, conversationId)
    if (payload) {
      return invokeTauri<UploadResult>('upload_file', { payload })
        .then((result) => {
          onProgress?.(100)
          return result
        })
    }

    return Promise.reject(new Error('This file does not expose a native path for upload'))
  }

  return uploadFileViaHttp(file, onProgress, conversationId)
}

export async function uploadFilePath(
  filePath: string,
  onProgress?: (percent: number) => void,
  conversationId?: string,
  fileName?: string,
  mimeType = 'application/octet-stream'
): Promise<UploadResult> {
  if (!isDesktopApp()) {
    throw new Error('Native file path uploads are only available in the desktop app')
  }

  onProgress?.(10)
  try {
    const result = await invokeTauri<UploadResult>('upload_file', {
      payload: {
        filePath,
        fileName,
        mimeType,
        conversationId,
      } satisfies NativeFilePayload,
    })
    onProgress?.(100)
    return result
  } catch (error: any) {
    throw new Error(error?.message || 'Native upload failed')
  }
}

function uploadFileViaHttp(
  file: File,
  onProgress?: (percent: number) => void,
  conversationId?: string
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const token = getToken()
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status === 401) {
        redirectToLogin()
        reject(new Error('认证失效'))
        return
      }

      const raw = xhr.responseText || ''
      let data: any = null
      if (raw) {
        try {
          data = JSON.parse(raw)
        } catch {
          data = null
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        if (data) {
          resolve(data)
          return
        }
        reject(new Error('上传失败：服务器返回异常'))
        return
      }

      const serverError = data?.error || data?.message
      const rawError = !data && raw ? raw.slice(0, 120) : ''
      const detail = serverError || rawError || '上传失败'
      reject(new Error(`${detail} (HTTP ${xhr.status})`))
    })

    xhr.addEventListener('error', () => reject(new Error('网络错误')))
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')))

    xhr.open('POST', `${API_BASE}/upload`)
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }
    if (conversationId) {
      xhr.setRequestHeader('x-conversation-id', conversationId)
    }
    xhr.send(formData)
  })
}

export async function deleteAttachment(fileId: string): Promise<void> {
  if (isDesktopApp()) {
    await invokeTauri<void>('delete_upload', { fileId })
    return
  }

  await request(`/uploads/${fileId}`, { method: 'DELETE' })
}

export function getAttachmentUrl(fileId: string): string {
  return `${API_BASE}/uploads/${fileId}/raw`
}

export async function getAttachmentRawUrl(fileId: string): Promise<string> {
  if (isDesktopApp()) {
    const raw = await invokeTauri<UploadRawResult>('read_upload_raw', { fileId })
    return `data:${raw.mimeType || 'application/octet-stream'};base64,${raw.base64}`
  }

  return getAttachmentUrl(fileId)
}

export function getAttachmentDisplayUrl(fileId: string): Promise<string> | string {
  if (isDesktopApp()) {
    return getAttachmentRawUrl(fileId)
  }
  return getAttachmentUrl(fileId)
}

export async function getAttachmentPath(fileId: string): Promise<UploadPathResult | null> {
  if (isDesktopApp()) {
    return invokeTauri<UploadPathResult>('get_upload_path', { fileId })
  }

  const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(fileId)}/path`)
  if (!res.ok) return null
  return res.json()
}
