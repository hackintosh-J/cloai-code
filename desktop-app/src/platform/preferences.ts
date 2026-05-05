import { invokeTauri } from './tauriClient'

export interface AppPreferences {
  onboardingDone?: boolean | null;
  theme?: string | null;
  sendKey?: string | null;
  newlineKey?: string | null;
  chatFont?: string | null;
  defaultModel?: string | null;
  userMode?: string | null;
  // Config settings
  parallelToolCalls?: boolean | null;
  modelContextWindowOverride?: string | null; // 'auto' | '4k' | '32k' | '200k' | '1m'
  samplingTemperature?: number | string | null; // number (0-2) | 'default' | 'off'
  maxConsecutiveIdenticalToolCalls?: number | string | null; // number | 'default'
  maxApiRetries?: number | string | null; // number | 'default' | 'off' | 'always'
  openAIResponsesIncrementalWebSocket?: boolean | null;
  openAIPrefixDebug?: boolean | null;
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
      // Config settings
      parallelToolCalls: payload.parallelToolCalls ?? undefined,
      modelContextWindowOverride: payload.modelContextWindowOverride ?? undefined,
      samplingTemperature: payload.samplingTemperature ?? undefined,
      maxConsecutiveIdenticalToolCalls: payload.maxConsecutiveIdenticalToolCalls ?? undefined,
      maxApiRetries: payload.maxApiRetries ?? undefined,
      openAIResponsesIncrementalWebSocket: payload.openAIResponsesIncrementalWebSocket ?? undefined,
      openAIPrefixDebug: payload.openAIPrefixDebug ?? undefined,
    },
  })
}

export const getDesktopPreferences = getPreferences
export const setDesktopPreferences = setPreferences
