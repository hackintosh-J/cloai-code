export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  workspace_path: string;
  is_archived: number;
  file_count?: number;
  chat_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface SkillFileNode {
  name: string;
  type: 'file' | 'folder';
  children?: SkillFileNode[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  content?: string;
  is_example?: boolean;
  source?: 'bundled' | 'local' | 'user' | string;
  source_dir?: string;
  dir_path?: string;
  user_id?: string | null;
  enabled: boolean;
  created_at?: string;
  files?: SkillFileNode[];
}

export interface SkillsResponse {
  examples: Skill[];
  my_skills: Skill[];
}

export interface SkillFileContent {
  content: string;
  path: string;
}

export interface SkillUpsertPayload {
  name?: string;
  description?: string;
  content?: string;
}

export interface SkillToggleResult {
  ok: boolean;
  enabled: boolean;
}

export interface ConversationWorkspaceConfig {
  mode: 'managed' | 'existing-folder';
  folderPath?: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  enabled?: boolean;
}

export interface Provider {
  id: string;
  providerKey?: string;
  providerRef?: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  format: 'anthropic' | 'openai';
  models: ProviderModel[];
  enabled: boolean;
  icon?: string;
  kind?: 'openai-like' | 'anthropic-like' | 'gemini-like';
  authMode?: 'chat-completions' | 'responses' | 'oauth' | 'api-key' | 'vertex-compatible' | 'gemini-cli-oauth';
  variant?:
    | 'claude-official'
    | 'openai-official-responses'
    | 'openai-oauth'
    | 'gemini-cli-oauth'
    | 'gemini-antigravity-oauth'
    | 'gemini-ai-studio'
    | 'github-copilot-oauth'
    | 'custom-anthropic-like'
    | 'custom-openai-chat'
    | 'custom-openai-responses'
    | 'custom-google-vertex-like';
  providerManagedByStorage?: boolean;
  oauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    accountId?: string;
    enterpriseDomain?: string;
    projectId?: string;
    email?: string;
  };
  reasoning?: {
    reasoningEffort?: string;
    reasoningSummary?: string | null;
    textVerbosity?: string | null;
  };
  supportsWebSearch?: boolean;
  webSearchStrategy?: 'dashscope' | 'bigmodel' | 'anthropic_native' | null;
  webSearchTestedAt?: number;
  webSearchTestReason?: string | null;
}

export interface ProviderPreset {
  id: string;
  name: string;
  format: 'anthropic' | 'openai';
  baseUrl: string;
  kind?: Provider['kind'];
  authMode?: Provider['authMode'];
  variant?: string;
  models?: ProviderModel[];
}

export interface ProviderModelListItem {
  id: string;
  name: string;
  providerId: string;
  providerKey?: string;
  providerRef?: string;
  providerName: string;
}

export interface WebSearchTestResult {
  ok: boolean;
  strategy?: 'dashscope' | 'bigmodel' | 'anthropic_native' | null;
  hitCount?: number;
  reason?: string;
}

export interface ConnectorMcpStatus {
  installed: boolean;
  serverName: string;
}

export interface ConnectorMcpStatusResponse {
  configPath: string | null;
  connectors: Record<string, ConnectorMcpStatus>;
}

export interface ConnectorComposioStatus {
  available: boolean;
  connected: boolean;
  connectedAccountId: string | null;
  installed: boolean;
  serverName: string | null;
  toolkitSlug: string | null;
}

export interface ConnectorComposioStatusResponse {
  configPath: string | null;
  configured: boolean;
  connectors: Record<string, ConnectorComposioStatus>;
  mcpUrl: string | null;
  serverInstalled: boolean;
  sessionId: string | null;
}

export interface ConnectorComposioConfigResponse {
  configPath: string | null;
  configured: boolean;
  source: string | null;
}

export interface UploadResult {
  fileId: string;
  fileName: string;
  fileType: 'image' | 'document' | 'text';
  mimeType: string;
  localPath?: string;
  size: number;
}

export interface UploadPathResult {
  localPath?: string;
  folder?: string;
}

export interface UploadRawResult {
  fileId: string;
  mimeType: string;
  base64: string;
  size: number;
}

export interface StreamCallbacks {
  onDelta: (delta: string, full: string) => void;
  onDone: (full: string) => void;
  onError: (err: string) => void;
  onThinking?: (thinking: string, full: string) => void;
  onSystem?: (event: string, message: string, data: any) => void;
  onCitations?: (
    citations: Array<{ url: string; title: string; cited_text?: string }>,
    query?: string,
    tokens?: number
  ) => void;
  onDocument?: (document: {
    id: string;
    title: string;
    filename: string;
    url: string;
    content?: string;
    format?: 'markdown' | 'docx' | 'pptx';
    slides?: Array<{ title: string; content: string; notes?: string }>;
  }) => void;
  onDocumentDraft?: (draft: {
    draft_id: string;
    title?: string;
    format?: string;
    preview?: string;
    preview_available?: boolean;
    done?: boolean;
    document?: any;
  }) => void;
  onCodeExecution?: (data: {
    type: string;
    executionId: string;
    code?: string;
    language?: string;
    files?: Array<{ id: string; name: string }>;
    stdout?: string;
    stderr?: string;
    images?: string[];
    error?: string | null;
  }) => void;
  onToolUse?: (event: {
    type: 'start' | 'input' | 'done';
    tool_use_id: string;
    tool_name?: string;
    tool_input?: any;
    content?: string;
    is_error?: boolean;
    textBefore?: string;
  }) => void;
}
