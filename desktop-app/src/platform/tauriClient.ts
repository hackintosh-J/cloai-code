import { invoke, isTauri } from '@tauri-apps/api/core'

export type TauriCommandArgs = Record<string, unknown>

export function isTauriRuntime() {
  if (typeof window === 'undefined') return false
  return isTauri()
}

export const isTauriDesktop = isTauriRuntime

export function isDesktopApp() {
  return isTauriRuntime()
}

export async function invokeTauri<T>(command: string, args?: TauriCommandArgs): Promise<T> {
  return invoke<T>(command, args)
}
