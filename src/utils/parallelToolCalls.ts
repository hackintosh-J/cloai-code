import { getInitialSettings } from './settings/settings.js'

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off'])

function getParallelToolCallsEnvOverride(): boolean | undefined {
  const raw = process.env.CLOAI_OPENAI_PARALLEL_TOOL_CALLS?.trim().toLowerCase()
  if (!raw) return undefined
  if (ENABLED_VALUES.has(raw)) return true
  if (DISABLED_VALUES.has(raw)) return false
  return undefined
}

export function areParallelToolCallsEnabled(): boolean {
  const envOverride = getParallelToolCallsEnvOverride()
  if (envOverride !== undefined) {
    return envOverride
  }
  return getInitialSettings().parallelToolCalls === true
}
