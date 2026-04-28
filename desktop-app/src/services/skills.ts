import type {
  Skill,
  SkillFileContent,
  SkillsResponse,
  SkillToggleResult,
  SkillUpsertPayload,
} from '../types/api'
import { isDesktopApp } from '../desktop'
import { invokeTauri } from '../platform/tauriClient'
import { API_BASE, jsonRequest } from './http/apiClient'

export type {
  Skill,
  SkillFileContent,
  SkillsResponse,
  SkillToggleResult,
  SkillUpsertPayload,
}

type RequiredSkillUpsertPayload = SkillUpsertPayload & { name: string }

type NativeSkillImportPayload = {
  filePath: string;
  fileName?: string;
  mimeType?: string;
}

const SKILL_COMMANDS = {
  list: 'get_skills',
  detail: 'get_skill_detail',
  file: 'get_skill_file',
  import: 'import_skill',
  create: 'create_skill',
  update: 'update_skill',
  delete: 'delete_skill',
  toggle: 'toggle_skill',
} as const

function getNativeFilePath(file: File): string | null {
  const candidate = (file as File & { path?: unknown }).path
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

function toNativeSkillImportPayload(file: File): NativeSkillImportPayload | null {
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

async function invokeSkill<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isDesktopApp()) {
    return invokeTauri<T>(command, args)
  }
  throw new Error('Native skill command is only available in the desktop app')
}

export async function getSkills(): Promise<SkillsResponse> {
  if (isDesktopApp()) return invokeSkill(SKILL_COMMANDS.list)
  return jsonRequest<SkillsResponse>('/skills')
}

export async function getSkillDetail(id: string): Promise<Skill> {
  if (isDesktopApp()) return invokeSkill(SKILL_COMMANDS.detail, { id })
  return jsonRequest<Skill>(`/skills/${id}`)
}

export async function getSkillFile(id: string, filePath: string): Promise<SkillFileContent> {
  if (isDesktopApp()) return invokeSkill(SKILL_COMMANDS.file, { id, filePath })
  return jsonRequest<SkillFileContent>(`/skills/${id}/file?path=${encodeURIComponent(filePath)}`)
}

async function importSkillViaHttp(file: File): Promise<Skill> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/skills/import`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Import failed')
  }
  return res.json()
}

export async function importSkill(file: File): Promise<Skill> {
  if (isDesktopApp()) {
    const payload = toNativeSkillImportPayload(file)
    if (!payload) {
      throw new Error('This file does not expose a native path for import')
    }
    return invokeSkill(SKILL_COMMANDS.import, { payload })
  }

  return importSkillViaHttp(file)
}

export async function createSkill(data: RequiredSkillUpsertPayload): Promise<Skill> {
  if (isDesktopApp()) return invokeSkill(SKILL_COMMANDS.create, { payload: data })
  return jsonRequest<Skill>('/skills', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateSkill(id: string, data: SkillUpsertPayload): Promise<Skill> {
  if (isDesktopApp()) return invokeSkill(SKILL_COMMANDS.update, { id, payload: data })
  return jsonRequest<Skill>(`/skills/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteSkill(id: string): Promise<{ ok: boolean }> {
  if (isDesktopApp()) return invokeSkill(SKILL_COMMANDS.delete, { id })
  return jsonRequest<{ ok: boolean }>(`/skills/${id}`, { method: 'DELETE' })
}

export async function toggleSkill(id: string, enabled: boolean): Promise<SkillToggleResult> {
  if (isDesktopApp()) return invokeSkill(SKILL_COMMANDS.toggle, { id, enabled })
  return jsonRequest<SkillToggleResult>(`/skills/${id}/toggle`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
}
