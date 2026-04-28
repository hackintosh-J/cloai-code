import type { Project, ProjectFile } from '../types/api'
import { isDesktopApp } from '../desktop'
import { invokeTauri } from '../platform/tauriClient'
import { API_BASE, getToken, jsonRequest } from './http/apiClient'

export type { Project, ProjectFile }

type NativeProjectFilePayload = {
  filePath: string;
  fileName?: string;
  mimeType?: string;
}

function getNativeFilePath(file: File): string | null {
  const candidate = (file as File & { path?: unknown }).path
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

function toNativeProjectFilePayload(file: File): NativeProjectFilePayload | null {
  const filePath = getNativeFilePath(file)
  if (!filePath) {
    return null
  }

  return {
    filePath,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
  }
}

function fileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() || 'file'
}

export async function getProjects(): Promise<Project[]> {
  if (isDesktopApp()) {
    return invokeTauri<Project[]>('get_projects')
  }
  return jsonRequest('/projects')
}

export async function createProject(name: string, description?: string): Promise<Project> {
  if (isDesktopApp()) {
    return invokeTauri<Project>('create_project', {
      payload: { name, description: description || '' },
    })
  }
  return jsonRequest('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, description: description || '' }),
  })
}

export async function getProject(id: string) {
  if (isDesktopApp()) {
    return invokeTauri(`get_project`, { id })
  }
  return jsonRequest(`/projects/${id}`)
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'is_archived'>>
) {
  if (isDesktopApp()) {
    return invokeTauri<Project>('update_project', { id, payload: data })
  }
  return jsonRequest(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteProject(id: string) {
  if (isDesktopApp()) {
    return invokeTauri('delete_project', { id })
  }
  return jsonRequest(`/projects/${id}`, { method: 'DELETE' })
}

export async function uploadProjectFile(projectId: string, file: File): Promise<ProjectFile> {
  if (isDesktopApp()) {
    const payload = toNativeProjectFilePayload(file)
    if (!payload) {
      throw new Error('This file does not expose a native path for upload')
    }
    return invokeTauri<ProjectFile>('upload_project_file', { projectId, payload })
  }

  const formData = new FormData()
  formData.append('file', file)

  const token = getToken()
  const res = await fetch(`${API_BASE}/projects/${projectId}/files`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export async function uploadProjectFilePath(
  projectId: string,
  filePath: string,
  fileName = fileNameFromPath(filePath),
  mimeType = 'application/octet-stream'
): Promise<ProjectFile> {
  if (!isDesktopApp()) {
    throw new Error('Native project file path uploads are only available in the desktop app')
  }

  return invokeTauri<ProjectFile>('upload_project_file', {
    projectId,
    payload: { filePath, fileName, mimeType } satisfies NativeProjectFilePayload,
  })
}

export async function deleteProjectFile(projectId: string, fileId: string) {
  if (isDesktopApp()) {
    return invokeTauri('delete_project_file', { projectId, fileId })
  }

  return jsonRequest(`/projects/${projectId}/files/${fileId}`, { method: 'DELETE' })
}

export async function getProjectConversations(projectId: string) {
  if (isDesktopApp()) {
    return invokeTauri('get_project_conversations', { id: projectId })
  }
  return jsonRequest(`/projects/${projectId}/conversations`)
}

export async function createProjectConversation(projectId: string, title?: string, model?: string) {
  if (isDesktopApp()) {
    return invokeTauri('create_project_conversation', {
      id: projectId,
      payload: { title, model },
    })
  }
  return jsonRequest(`/projects/${projectId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({ title, model }),
  })
}
