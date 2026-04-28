import { invokeTauri } from './tauriClient'

export type DesktopUpdateStatus = {
  type: string;
  version?: string;
  percent?: number;
} | null

export async function resizeWindow(width: number, height: number) {
  return invokeTauri<void>('resize_window', { width, height })
}

export function onUpdateStatus(callback: (status: DesktopUpdateStatus) => void) {
  void callback
  return () => {}
}

export async function installUpdate() {
  return
}

export function onZoomChanged(callback: (factor: number) => void) {
  void callback
  return () => {}
}

export const resizeDesktopWindow = resizeWindow
export const onDesktopUpdateStatus = onUpdateStatus
export const installDesktopUpdate = installUpdate
export const onDesktopZoomChanged = onZoomChanged
