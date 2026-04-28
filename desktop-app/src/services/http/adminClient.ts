import { safeGetStorageItem, safeRemoveStorageItem } from '@/src/utils/safeStorage'

const API_BASE = '/api/admin'

function getToken() {
  return safeGetStorageItem('auth_token')
}

export async function adminRequest(path: string, options: RequestInit = {}) {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (token) {
    ;(headers as any).Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (res.status === 401) {
    safeRemoveStorageItem('auth_token')
    safeRemoveStorageItem('user')
    window.location.href = '/login'
    throw new Error('认证失效')
  }
  if (res.status === 403) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '无权限')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed: ${res.status}`)
  }
  return res.json()
}
