import { invokeTauri } from './tauriClient'

export interface AppPreferences {
  onboardingDone?: boolean | null;
  theme?: string | null;
  sendKey?: string | null;
  newlineKey?: string | null;
  chatFont?: string | null;
  defaultModel?: string | null;
  userMode?: string | null;
}

export type DesktopPreferences = AppPreferences

export async function getPreferences() {
  return invokeTauri<AppPreferences>('get_desktop_preferences')
}

export async function setPreferences(payload: AppPreferences) {
  return invokeTauri<void>('set_desktop_preferences', {
    payload: {
      onboardingDone: payload.onboardingDone ?? undefined,
      theme: payload.theme ?? undefined,
      sendKey: payload.sendKey ?? undefined,
      newlineKey: payload.newlineKey ?? undefined,
      chatFont: payload.chatFont ?? undefined,
      defaultModel: payload.defaultModel ?? undefined,
      userMode: payload.userMode ?? undefined,
    },
  })
}

export const getDesktopPreferences = getPreferences
export const setDesktopPreferences = setPreferences
