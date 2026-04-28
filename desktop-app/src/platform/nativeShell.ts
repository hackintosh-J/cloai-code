import { open } from '@tauri-apps/plugin-shell'
import { invokeTauri } from './tauriClient'

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export async function getPlatform() {
  return invokeTauri<string>('get_platform')
}

export async function getAppPath() {
  return invokeTauri<string>('get_app_path')
}

export async function selectDirectory() {
  return invokeTauri<string | null>('select_directory')
}

export async function selectFile(filters?: FileDialogFilter[]) {
  return invokeTauri<string | null>('select_file', { filters })
}

export async function selectBunFile() {
  return invokeTauri<string | null>('select_bun_file')
}

export async function exportWorkspace(
  workspaceId: string,
  contextMarkdown: string,
  defaultFilename: string
) {
  void workspaceId
  void contextMarkdown
  void defaultFilename
  return null
}

export async function showItemInFolder(filePath: string) {
  return invokeTauri<boolean>('show_item_in_folder', { filePath })
}

export async function openFolder(folderPath: string) {
  return invokeTauri<boolean>('open_folder', { folderPath })
}

export async function openExternal(url: string) {
  return open(url)
}

export const getDesktopPlatform = getPlatform
export const getDesktopAppPath = getAppPath
export const selectDesktopDirectory = selectDirectory
export const selectDesktopFile = selectFile
export const selectDesktopBunFile = selectBunFile
export const exportDesktopWorkspace = exportWorkspace
export const showDesktopItemInFolder = showItemInFolder
export const openDesktopFolder = openFolder
export const openDesktopExternal = openExternal
