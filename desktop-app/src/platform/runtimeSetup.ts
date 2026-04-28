import { invokeTauri } from './tauriClient'

export interface RuntimeSetupStatus {
  bun: {
    detected: boolean;
    path: string | null;
    version: string | null;
  };
  runtime: {
    detected: boolean;
    path: string | null;
    version: string | null;
  };
  workspace: {
    path: string;
  };
}

export interface WorkspaceConfig {
  workspacesDir: string;
  defaultDir: string;
}

export interface RuntimeConfigPatch {
  bunPath?: string | null;
  runtimePath?: string | null;
  workspacesDir?: string | null;
}

export async function getWorkspaceConfig() {
  return invokeTauri<WorkspaceConfig>('get_workspace_config')
}

export async function setWorkspaceConfig(dir: string) {
  return invokeTauri<void>('set_workspace_config', { payload: { dir } })
}

export async function getRuntimeSetupStatus(): Promise<RuntimeSetupStatus | null> {
  return invokeTauri<RuntimeSetupStatus>('get_runtime_setup_status')
}

export async function desktopConfigExists() {
  return invokeTauri<boolean>('desktop_config_exists')
}

export async function setRuntimeConfig(payload: RuntimeConfigPatch) {
  return invokeTauri<void>('set_runtime_config', {
    payload: {
      bunPath: payload.bunPath ?? undefined,
      runtimePath: payload.runtimePath ?? undefined,
      workspacesDir: payload.workspacesDir ?? undefined,
    },
  })
}

export async function isRuntimeSetupReady() {
  const status = await getRuntimeSetupStatus().catch(() => null)
  if (!status) return false

  return Boolean(
    status.bun.detected &&
    status.runtime.detected &&
    status.runtime.version &&
    status.workspace.path?.trim()
  )
}

export const getDesktopWorkspaceConfig = getWorkspaceConfig
export const setDesktopWorkspaceConfig = setWorkspaceConfig
