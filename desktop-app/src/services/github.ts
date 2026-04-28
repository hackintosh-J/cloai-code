import { invokeTauri } from '../platform/tauriClient'
import { API_BASE } from './http/apiClient'

export interface GithubUser {
  login: string;
  avatar_url: string;
  name?: string;
}

export interface GithubStatus {
  connected: boolean;
  user?: GithubUser;
}

export interface GithubAuthUrl {
  url: string;
  state?: string;
}

export interface GithubDisconnectResult {
  ok: boolean;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description?: string | null;
  private?: boolean;
  html_url?: string;
  language?: string | null;
  updated_at?: string;
}

export interface GithubContentEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  download_url?: string | null;
  content?: string;
  encoding?: string;
}

export interface GithubTreeEntry {
  path: string;
  type: string;
  size: number;
}

export interface GithubTree {
  sha?: string;
  truncated?: boolean;
  tree: GithubTreeEntry[];
}

export interface GithubSelection {
  path: string;
  isFolder: boolean;
}

export interface GithubMaterializeResult {
  ok: boolean;
  repoFullName: string;
  ref: string;
  rootDir: string;
  fileCount: number;
  skipped: number;
}

const GITHUB_COMMANDS = {
  status: 'get_github_status',
  authUrl: 'get_github_auth_url',
  disconnect: 'disconnect_github',
  repos: 'get_github_repos',
  tree: 'get_github_tree',
  contents: 'get_github_contents',
  materialize: 'materialize_github',
} as const

export async function getGithubStatus(): Promise<GithubStatus> {
  return invokeTauri<GithubStatus>(GITHUB_COMMANDS.status)
}

export async function getGithubAuthUrl(): Promise<GithubAuthUrl> {
  return invokeTauri<GithubAuthUrl>(GITHUB_COMMANDS.authUrl)
}

export async function disconnectGithub(): Promise<GithubDisconnectResult> {
  return invokeTauri<GithubDisconnectResult>(GITHUB_COMMANDS.disconnect)
}

export async function getGithubRepos(page = 1): Promise<GithubRepo[]> {
  return invokeTauri<GithubRepo[]>(GITHUB_COMMANDS.repos, { page })
}

export async function getGithubTree(owner: string, repo: string, ref = ''): Promise<GithubTree> {
  return invokeTauri<GithubTree>(GITHUB_COMMANDS.tree, { owner, repo, ref })
}

export async function getGithubContents(
  owner: string,
  repo: string,
  path = '',
  ref = ''
): Promise<GithubContentEntry[] | GithubContentEntry> {
  return invokeTauri<GithubContentEntry[] | GithubContentEntry>(GITHUB_COMMANDS.contents, {
    owner,
    repo,
    path,
    ref,
  })
}

export async function materializeGithub(
  conversationId: string,
  repoFullName: string,
  ref: string,
  selections: GithubSelection[]
): Promise<GithubMaterializeResult> {
  return invokeTauri<GithubMaterializeResult>(GITHUB_COMMANDS.materialize, {
    conversationId,
    repoFullName,
    ref,
    selections,
  })
}
