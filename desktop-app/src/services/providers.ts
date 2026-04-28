import {
  createDesktopProvider,
  deleteDesktopProvider,
  getDesktopProviderModels,
  getDesktopProviderPresets,
  getDesktopProviders,
  importDesktopCloaiProviders,
  isDesktopApp,
  startDesktopOpenAIOAuthProvider,
  testDesktopProviderWebSearch,
  updateDesktopProvider,
} from '../desktop'
import type { Provider, ProviderModelListItem, ProviderPreset, WebSearchTestResult } from '../types/api'
import { API_BASE } from './http/apiClient'

export type { Provider, ProviderModel, ProviderModelListItem, ProviderPreset, WebSearchTestResult } from '../types/api'

export async function testProviderWebSearch(id: string): Promise<WebSearchTestResult> {
  if (isDesktopApp()) {
    return testDesktopProviderWebSearch(id)
  }
  const res = await fetch(`${API_BASE}/providers/${id}/test-websearch`, { method: 'POST' })
  if (!res.ok) return { ok: false, reason: 'HTTP ' + res.status }
  return res.json()
}

export async function getProviders(): Promise<Provider[]> {
  if (isDesktopApp()) {
    return getDesktopProviders<Provider[]>()
  }
  const res = await fetch(`${API_BASE}/providers`)
  return res.json()
}

export async function createProvider(provider: Partial<Provider>): Promise<Provider> {
  if (isDesktopApp()) {
    return createDesktopProvider<Provider>(provider as Record<string, unknown>)
  }
  const res = await fetch(`${API_BASE}/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provider),
  })
  return res.json()
}

export async function updateProvider(id: string, provider: Partial<Provider>): Promise<Provider> {
  if (isDesktopApp()) {
    return updateDesktopProvider<Provider>(id, provider as Record<string, unknown>)
  }
  const res = await fetch(`${API_BASE}/providers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provider),
  })
  return res.json()
}

export async function deleteProvider(id: string): Promise<void> {
  if (isDesktopApp()) {
    await deleteDesktopProvider(id)
    return
  }
  await fetch(`${API_BASE}/providers/${id}`, { method: 'DELETE' })
}

export async function getProviderPresets(): Promise<ProviderPreset[]> {
  if (isDesktopApp()) {
    return getDesktopProviderPresets<ProviderPreset[]>()
  }
  const res = await fetch(`${API_BASE}/providers/presets`)
  return res.json()
}

export async function importCloaiProviders(
  path?: string
): Promise<{ ok: boolean; path: string; importedCount: number; providers: Provider[]; error?: string }> {
  if (isDesktopApp()) {
    const result = await importDesktopCloaiProviders(path)
    return result as { ok: boolean; path: string; importedCount: number; providers: Provider[]; error?: string }
  }
  const res = await fetch(`${API_BASE}/providers/import-cloai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(path ? { path } : {}),
  })
  return res.json()
}

export async function getProviderModels(): Promise<ProviderModelListItem[]> {
  if (isDesktopApp()) {
    return getDesktopProviderModels()
  }
  const res = await fetch(`${API_BASE}/providers/models`)
  return res.json()
}

export async function startOpenAIOAuthProvider(): Promise<{ ok: boolean; provider: Provider; redirectUrl: string }> {
  if (!isDesktopApp()) {
    throw new Error('OpenAI OAuth provider setup is only available in the desktop app')
  }
  return startDesktopOpenAIOAuthProvider<Provider>()
}
