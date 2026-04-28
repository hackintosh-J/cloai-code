import { isDesktopApp } from '../desktop'
import { invokeTauri } from '../platform/tauriClient'
import { API_BASE } from './http/apiClient'

export async function getSystemStatus(): Promise<{
  desktopVersion?: string;
  platform: string;
  gitBash: { required: boolean; found: boolean; path: string | null };
}> {
  if (isDesktopApp()) {
    return invokeTauri('get_system_status')
  }
  const res = await fetch(`${API_BASE}/system-status`)
  if (!res.ok) throw new Error('Failed to get system status')
  return res.json()
}
