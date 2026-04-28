import { isDesktopApp } from '../desktop'
import { invokeTauri } from '../platform/tauriClient'
import { jsonRequest } from './http/apiClient'
import { getStoredModelId } from '../utils/providerIdentity'

export async function getUserUsage() {
  return {
    plan: { id: 999, name: 'Self-hosted', status: 'active', price: 0 },
    token_used: 0,
    token_quota: 0,
    token_remaining: 0,
    used: 0,
    reset_date: '',
    is_unlimited: true,
  }
}

export async function getUnreadAnnouncements() {
  try {
    return await jsonRequest('/user/announcements')
  } catch (err: any) {
    if (String(err?.message || '').includes('404')) {
      return { announcements: [] }
    }
    throw err
  }
}

export async function markAnnouncementRead(id: number) {
  try {
    return await jsonRequest(`/user/announcements/${id}/read`, { method: 'POST' })
  } catch (err: any) {
    if (String(err?.message || '').includes('404')) {
      return { ok: true }
    }
    throw err
  }
}

export async function getUserModels() {
  if (isDesktopApp()) {
    try {
      const models = await invokeTauri<Array<{ id: string; name: string; providerId: string; providerName: string }>>('get_provider_models')
      return {
        all: models.map((model) => ({
          id: getStoredModelId(model),
          name: model.name || model.id,
          enabled: 1,
        })),
      }
    } catch {
      return { all: [] }
    }
  }
  try {
    return await jsonRequest('/user/models')
  } catch {
    return { all: [] }
  }
}

export async function getSessions() {
  if (isDesktopApp()) {
    return { sessions: [], currentSessionId: '' }
  }
  return jsonRequest('/user/sessions')
}

export async function deleteSession(id: string) {
  if (isDesktopApp()) {
    return { ok: true, id }
  }
  return jsonRequest(`/user/sessions/${id}`, { method: 'DELETE' })
}

export async function logoutOtherSessions() {
  if (isDesktopApp()) {
    return { ok: true }
  }
  return jsonRequest('/user/sessions/logout-others', { method: 'POST' })
}

export async function changePassword(currentPassword: string, newPassword: string) {
  if (isDesktopApp()) {
    throw new Error('Self-hosted desktop mode does not manage remote account passwords.')
  }
  return jsonRequest('/user/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

export async function deleteAccount(password: string) {
  if (isDesktopApp()) {
    throw new Error('Self-hosted desktop mode does not manage remote account deletion.')
  }
  return jsonRequest('/user/delete-account', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}
