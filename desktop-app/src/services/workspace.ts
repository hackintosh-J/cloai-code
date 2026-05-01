import { invokeTauri } from '../platform/tauriClient'

export type WorkspaceEntry = {
  name: string
  path: string
  isDir: boolean
  size: number
  modified?: number | null
  extension?: string | null
}

export type WorkspaceDirectoryListing = {
  path: string
  entries: WorkspaceEntry[]
  truncated: boolean
}

export type WorkspaceFileContent = {
  path: string
  name: string
  content: string
  size: number
  isBinary: boolean
  truncated: boolean
  extension?: string | null
}

export type WorkspaceFileDataUrl = {
  path: string
  name: string
  dataUrl: string
  mimeType: string
  size: number
  extension?: string | null
}

export type WorkspaceGitFile = {
  path: string
  oldPath?: string | null
  index: string
  workingTree: string
  staged: boolean
  unstaged: boolean
  label: string
}

export type WorkspaceGitStatus = {
  isRepo: boolean
  branch?: string | null
  entries: WorkspaceGitFile[]
  truncated: boolean
  error?: string | null
}

export type WorkspaceGitDiff = {
  isRepo: boolean
  path?: string | null
  staged: boolean
  diff: string
  truncated: boolean
  error?: string | null
}

export type WorkspaceEntryKind = 'file' | 'directory'

export function listWorkspaceEntries(root: string, path = '') {
  return invokeTauri<WorkspaceDirectoryListing>('workspace_list_entries', {
    payload: { root, path },
  })
}

export function readWorkspaceFile(root: string, path: string) {
  return invokeTauri<WorkspaceFileContent>('workspace_read_file', {
    payload: { root, path },
  })
}

export function readWorkspaceFileDataUrl(root: string, path: string) {
  return invokeTauri<WorkspaceFileDataUrl>('workspace_read_file_data_url', {
    payload: { root, path },
  })
}

export function writeWorkspaceFile(root: string, path: string, content: string) {
  return invokeTauri<WorkspaceFileContent>('workspace_write_file', {
    payload: { root, path, content },
  })
}

export function createWorkspaceEntry(root: string, parent: string, name: string, kind: WorkspaceEntryKind) {
  return invokeTauri<WorkspaceEntry>('workspace_create_entry', {
    payload: { root, parent, name, kind },
  })
}

export function deleteWorkspacePath(root: string, path: string) {
  return invokeTauri<boolean>('workspace_delete_path', {
    payload: { root, path },
  })
}

export function renameWorkspacePath(root: string, path: string, newName: string) {
  return invokeTauri<WorkspaceEntry>('workspace_rename_path', {
    payload: { root, path, newName },
  })
}

export function getWorkspaceGitStatus(root: string) {
  return invokeTauri<WorkspaceGitStatus>('workspace_git_status', {
    payload: { root },
  })
}

export function getWorkspaceGitDiff(root: string, path?: string | null, staged = false) {
  return invokeTauri<WorkspaceGitDiff>('workspace_git_diff', {
    payload: { root, path, staged },
  })
}

export function setWorkspaceGitStaged(root: string, path: string, staged: boolean) {
  return invokeTauri<boolean>('workspace_git_stage', {
    payload: { root, path, staged },
  })
}
