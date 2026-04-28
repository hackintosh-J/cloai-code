import { safeGetStorageItem, safeParseStorageJson, safeRemoveStorageItem } from '@/src/utils/safeStorage'

export const API_BASE = '/api'

export function getToken() {
  return safeGetStorageItem('auth_token')
}

export function clearAuthSession() {
  safeRemoveStorageItem('auth_token')
  safeRemoveStorageItem('user')
}

export function redirectToLogin() {
  clearAuthSession()
  window.location.hash = '#/login'
  window.location.reload()
}

export function resolveEnvCreds(): { env_token?: string; env_base_url?: string } {
  const customApiKey = safeGetStorageItem('CUSTOM_API_KEY')
  const anthropicApiKey = safeGetStorageItem('ANTHROPIC_API_KEY')
  const customBaseUrl = safeGetStorageItem('CUSTOM_BASE_URL')
  const anthropicBaseUrl = safeGetStorageItem('ANTHROPIC_BASE_URL')
  return {
    env_token: customApiKey || anthropicApiKey || undefined,
    env_base_url: customBaseUrl || anthropicBaseUrl || undefined,
  }
}

export function getStoredUser() {
  return safeParseStorageJson('user', null)
}

export function getUserProfilePayload() {
  try {
    const profile = {
      ...safeParseStorageJson<Record<string, unknown>>('user', {}),
      ...safeParseStorageJson<Record<string, unknown>>('user_profile', {}),
    }
    const workFunction = profile.work_function
    const personalPreferences = profile.personal_preferences
    return workFunction || personalPreferences
      ? { work_function: workFunction, personal_preferences: personalPreferences }
      : undefined
  } catch {
    return undefined
  }
}

export function authHeaders(headers?: HeadersInit): HeadersInit {
  const token = getToken()
  const nextHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(headers || {}),
  }
  if (token) {
    ;(nextHeaders as any).Authorization = `Bearer ${token}`
  }
  return nextHeaders
}

export async function request(path: string, options: RequestInit = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: authHeaders(options.headers),
    })
    if (res.status === 401) {
      redirectToLogin()
      throw new Error('认证失效')
    }
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.error || `Request failed: ${res.status}`)
    }
    return res
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      console.error('[API] Network error:', err)
      throw new Error('无法连接到服务。')
    }
    throw err
  }
}

export async function jsonRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await request(path, options)
  return res.json()
}

export async function checkedFetch(input: string, options: RequestInit = {}, fallbackMessage = 'Request failed') {
  const res = await fetch(input, options)
  if (res.status === 401) {
    redirectToLogin()
    throw new Error('认证失效')
  }
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || fallbackMessage)
  }
  return res
}
