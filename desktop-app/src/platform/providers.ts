import { invokeTauri } from './tauriClient'

export interface ImportedProviderModel {
  id: string;
  name: string;
  enabled?: boolean;
}

export interface ImportedProvider {
  id: string;
  providerKey?: string;
  providerRef?: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  format: 'anthropic' | 'openai';
  models: ImportedProviderModel[];
  enabled: boolean;
  kind?: 'openai-like' | 'anthropic-like' | 'gemini-like';
  authMode?: 'chat-completions' | 'responses' | 'oauth' | 'api-key' | 'vertex-compatible' | 'gemini-cli-oauth';
  variant?: string;
  providerManagedByStorage?: boolean;
  oauth?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  supportsWebSearch?: boolean;
  webSearchStrategy?: string | null;
  webSearchTestedAt?: number;
  webSearchTestReason?: string | null;
}

export interface CloaiProviderImportResult {
  ok: boolean;
  path: string;
  importedCount: number;
  providers: ImportedProvider[];
  error?: string | null;
}

export interface ProviderModelListItem {
  id: string;
  name: string;
  providerId: string;
  providerKey?: string;
  providerRef?: string;
  providerName: string;
}

export interface ProviderOAuthStartResult<TProvider = ImportedProvider> {
  ok: boolean
  provider: TProvider
  redirectUrl: string
}

export async function importCloaiProviders(path?: string | null) {
  return invokeTauri<CloaiProviderImportResult>('import_cloai_providers', {
    path: path ?? undefined,
  })
}

export async function getProviders<T>() {
  return invokeTauri<T>('get_providers')
}

export async function createProvider<T>(payload: Record<string, unknown>) {
  return invokeTauri<T>('create_provider', { payload })
}

export async function updateProvider<T>(id: string, payload: Record<string, unknown>) {
  return invokeTauri<T>('update_provider', { id, payload })
}

export async function deleteProvider(id: string) {
  return invokeTauri<boolean>('delete_provider', { id })
}

export async function getProviderModels() {
  return invokeTauri<ProviderModelListItem[]>('get_provider_models')
}

export async function testProviderWebSearch(id: string) {
  return invokeTauri<{
    ok: boolean
    strategy?: 'dashscope' | 'bigmodel' | 'anthropic_native' | null
    hitCount?: number
    reason?: string
  }>(
    'test_provider_websearch',
    { id }
  )
}

export async function getProviderPresets<T>() {
  return invokeTauri<T>('get_provider_presets')
}

export async function startOpenAIOAuthProvider<T>() {
  return invokeTauri<ProviderOAuthStartResult<T>>('start_openai_oauth_provider')
}

export const importDesktopCloaiProviders = importCloaiProviders
export const getDesktopProviders = getProviders
export const createDesktopProvider = createProvider
export const updateDesktopProvider = updateProvider
export const deleteDesktopProvider = deleteProvider
export const getDesktopProviderModels = getProviderModels
export const testDesktopProviderWebSearch = testProviderWebSearch
export const getDesktopProviderPresets = getProviderPresets
export const startDesktopOpenAIOAuthProvider = startOpenAIOAuthProvider
