import type { ConnectorComposioStatus, ConnectorMcpStatus } from '@/src/services';

const connectorLogo = (fileName: string) =>
  new URL(`../../../../assets/customization/connector-logos/${fileName}`, import.meta.url).href;

const airtableLogo = connectorLogo('airtable-logo.svg');
const asanaLogo = connectorLogo('asana-logo.svg');
const bitbucketLogo = connectorLogo('bitbucket-logo.svg');
const boxLogo = connectorLogo('box-logo.svg');
const chromeLogo = connectorLogo('chrome-logo.svg');
const confluenceLogo = connectorLogo('confluence-logo.svg');
const dropboxLogo = connectorLogo('dropbox-logo.svg');
const figmaLogo = connectorLogo('figma-logo.svg');
const githubLogo = connectorLogo('github-logo.svg');
const gitlabLogo = connectorLogo('gitlab-logo.svg');
const gmailLogo = connectorLogo('gmail-logo.svg');
const googleCalendarLogo = connectorLogo('google-calendar-logo.svg');
const googleDriveLogo = connectorLogo('google-drive-logo.svg');
const googleMeetLogo = connectorLogo('google-meet-logo.svg');
const hubspotLogo = connectorLogo('hubspot-logo.svg');
const intercomLogo = connectorLogo('intercom-logo.svg');
const jiraLogo = connectorLogo('jira-logo.svg');
const linearLogo = connectorLogo('linear-logo.svg');
const microsoftTeamsLogo = connectorLogo('microsoft-teams-logo.svg');
const miroLogo = connectorLogo('miro-logo.svg');
const mondayLogo = connectorLogo('monday-logo.svg');
const notionLogo = connectorLogo('notion-logo.svg');
const onedriveLogo = connectorLogo('onedrive-logo.svg');
const salesforceLogo = connectorLogo('salesforce-logo.svg');
const slackLogo = connectorLogo('slack-logo.svg');
const trelloLogo = connectorLogo('trello-logo.svg');
const zendeskLogo = connectorLogo('zendesk-logo.svg');
const zoomLogo = connectorLogo('zoom-logo.svg');

export type ConnectorAction = 'github' | 'gdrive';

export type ConnectorCategory =
  | 'communication'
  | 'crm'
  | 'design'
  | 'developer-tools'
  | 'knowledge'
  | 'project-management'
  | 'storage'
  | 'workspace';

export type ConnectorInstallMethod = 'native' | 'workspace' | 'mcp';

export interface ConnectorCatalogEntry {
  id: string;
  title: string;
  provider: string;
  label: string;
  description: string;
  logo: string;
  category: ConnectorCategory;
  installMethod: ConnectorInstallMethod;
  action?: ConnectorAction;
  website: string;
}

export const connectorCatalog = [
  {
    id: 'github',
    title: 'GitHub',
    provider: 'GitHub',
    label: 'Built in',
    description: 'Connect Claude to repositories, pull requests, issues, and project context with the native GitHub flow.',
    logo: githubLogo,
    category: 'developer-tools',
    installMethod: 'native',
    action: 'github',
    website: 'https://github.com/',
  },
  {
    id: 'google-drive',
    title: 'Google Drive',
    provider: 'Google Workspace',
    label: 'Available',
    description: 'Browse shared files, docs, and folders from Google Drive so Claude can ground answers in your workspace.',
    logo: googleDriveLogo,
    category: 'storage',
    installMethod: 'workspace',
    action: 'gdrive',
    website: 'https://workspace.google.com/products/drive/',
  },
  {
    id: 'gmail',
    title: 'Gmail',
    provider: 'Google Workspace',
    label: 'Workspace',
    description: 'Search conversations, summarize inbox context, and pull important messages into your Claude workflow.',
    logo: gmailLogo,
    category: 'communication',
    installMethod: 'workspace',
    website: 'https://workspace.google.com/products/gmail/',
  },
  {
    id: 'google-calendar',
    title: 'Google Calendar',
    provider: 'Google Workspace',
    label: 'Workspace',
    description: 'Review schedules, meeting context, and upcoming events directly from your team calendar.',
    logo: googleCalendarLogo,
    category: 'workspace',
    installMethod: 'workspace',
    website: 'https://workspace.google.com/products/calendar/',
  },
  {
    id: 'google-meet',
    title: 'Google Meet',
    provider: 'Google Workspace',
    label: 'Meetings',
    description: 'Bring meeting links and collaboration context closer to Claude when planning sessions with your team.',
    logo: googleMeetLogo,
    category: 'communication',
    installMethod: 'workspace',
    website: 'https://workspace.google.com/products/meet/',
  },
  {
    id: 'slack',
    title: 'Slack',
    provider: 'Salesforce',
    label: 'Popular',
    description: 'Search channels, capture conversations, and give Claude real workspace context from your team chat.',
    logo: slackLogo,
    category: 'communication',
    installMethod: 'mcp',
    website: 'https://slack.com/',
  },
  {
    id: 'notion',
    title: 'Notion',
    provider: 'Notion',
    label: 'Knowledge',
    description: 'Connect your wiki, docs, tasks, and project notes so Claude can work from your team knowledge base.',
    logo: notionLogo,
    category: 'knowledge',
    installMethod: 'mcp',
    website: 'https://www.notion.so/',
  },
  {
    id: 'jira',
    title: 'Jira',
    provider: 'Atlassian',
    label: 'Planning',
    description: 'Use issues, tickets, and project state from Jira to keep Claude aligned with active engineering work.',
    logo: jiraLogo,
    category: 'project-management',
    installMethod: 'mcp',
    website: 'https://www.atlassian.com/software/jira',
  },
  {
    id: 'confluence',
    title: 'Confluence',
    provider: 'Atlassian',
    label: 'Knowledge',
    description: 'Index runbooks, specs, and internal documentation so Claude can answer with your team’s source material.',
    logo: confluenceLogo,
    category: 'knowledge',
    installMethod: 'mcp',
    website: 'https://www.atlassian.com/software/confluence',
  },
  {
    id: 'linear',
    title: 'Linear',
    provider: 'Linear',
    label: 'Product',
    description: 'Bring roadmap, issue, and project context from Linear into Claude for faster product and engineering work.',
    logo: linearLogo,
    category: 'project-management',
    installMethod: 'mcp',
    website: 'https://linear.app/',
  },
  {
    id: 'airtable',
    title: 'Airtable',
    provider: 'Airtable',
    label: 'Operations',
    description: 'Work with structured team data, lightweight workflows, and operational records stored in Airtable.',
    logo: airtableLogo,
    category: 'workspace',
    installMethod: 'mcp',
    website: 'https://www.airtable.com/',
  },
  {
    id: 'asana',
    title: 'Asana',
    provider: 'Asana',
    label: 'Tasks',
    description: 'Sync project plans, task lists, and team execution status to keep Claude focused on current work.',
    logo: asanaLogo,
    category: 'project-management',
    installMethod: 'mcp',
    website: 'https://asana.com/',
  },
  {
    id: 'microsoft-teams',
    title: 'Microsoft Teams',
    provider: 'Microsoft 365',
    label: 'Workspace',
    description: 'Use Microsoft Teams as a collaboration layer for chats, meetings, and shared team knowledge.',
    logo: microsoftTeamsLogo,
    category: 'communication',
    installMethod: 'workspace',
    website: 'https://www.microsoft.com/microsoft-teams/',
  },
  {
    id: 'onedrive',
    title: 'OneDrive',
    provider: 'Microsoft 365',
    label: 'Storage',
    description: 'Give Claude access to Microsoft 365 files, shared folders, and cloud document context from OneDrive.',
    logo: onedriveLogo,
    category: 'storage',
    installMethod: 'workspace',
    website: 'https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage',
  },
  {
    id: 'figma',
    title: 'Figma',
    provider: 'Figma',
    label: 'Design',
    description: 'Bring design files, components, and product specs into Claude for design-aware implementation workflows.',
    logo: figmaLogo,
    category: 'design',
    installMethod: 'mcp',
    website: 'https://www.figma.com/',
  },
  {
    id: 'zoom',
    title: 'Zoom',
    provider: 'Zoom',
    label: 'Meetings',
    description: 'Anchor meeting workflows and follow-up context around the calls and recordings your team already uses.',
    logo: zoomLogo,
    category: 'communication',
    installMethod: 'mcp',
    website: 'https://zoom.us/',
  },
  {
    id: 'chrome',
    title: 'Google Chrome',
    provider: 'Google',
    label: 'Browser',
    description: 'Connect browser workflows for live research, web navigation, and page-level automation support.',
    logo: chromeLogo,
    category: 'workspace',
    installMethod: 'mcp',
    website: 'https://www.google.com/chrome/',
  },
  {
    id: 'dropbox',
    title: 'Dropbox',
    provider: 'Dropbox',
    label: 'Storage',
    description: 'Sync shared folders and file archives from Dropbox into Claude’s broader workspace context.',
    logo: dropboxLogo,
    category: 'storage',
    installMethod: 'workspace',
    website: 'https://www.dropbox.com/',
  },
  {
    id: 'trello',
    title: 'Trello',
    provider: 'Atlassian',
    label: 'Boards',
    description: 'Track cards, boards, and lightweight planning workflows from Trello alongside your other tools.',
    logo: trelloLogo,
    category: 'project-management',
    installMethod: 'mcp',
    website: 'https://trello.com/',
  },
  {
    id: 'miro',
    title: 'Miro',
    provider: 'Miro',
    label: 'Collaboration',
    description: 'Reference boards, workshops, and visual planning artifacts so Claude can work with team whiteboards too.',
    logo: miroLogo,
    category: 'workspace',
    installMethod: 'mcp',
    website: 'https://miro.com/',
  },
  {
    id: 'salesforce',
    title: 'Salesforce',
    provider: 'Salesforce',
    label: 'CRM',
    description: 'Bring account, pipeline, and support context into Claude for sales, customer success, and ops teams.',
    logo: salesforceLogo,
    category: 'crm',
    installMethod: 'mcp',
    website: 'https://www.salesforce.com/',
  },
  {
    id: 'hubspot',
    title: 'HubSpot',
    provider: 'HubSpot',
    label: 'CRM',
    description: 'Use customer records, deal flow, and lifecycle signals from HubSpot to ground go-to-market work.',
    logo: hubspotLogo,
    category: 'crm',
    installMethod: 'mcp',
    website: 'https://www.hubspot.com/',
  },
  {
    id: 'intercom',
    title: 'Intercom',
    provider: 'Intercom',
    label: 'Support',
    description: 'Connect tickets, customer conversations, and support workflows so Claude can assist with response work.',
    logo: intercomLogo,
    category: 'communication',
    installMethod: 'mcp',
    website: 'https://www.intercom.com/',
  },
  {
    id: 'monday',
    title: 'monday.com',
    provider: 'monday.com',
    label: 'Work OS',
    description: 'Give Claude visibility into cross-functional boards, statuses, and execution plans from monday.com.',
    logo: mondayLogo,
    category: 'project-management',
    installMethod: 'mcp',
    website: 'https://monday.com/',
  },
  {
    id: 'zendesk',
    title: 'Zendesk',
    provider: 'Zendesk',
    label: 'Support',
    description: 'Pull customer support queues and service operations context into Claude for faster resolution workflows.',
    logo: zendeskLogo,
    category: 'communication',
    installMethod: 'mcp',
    website: 'https://www.zendesk.com/',
  },
  {
    id: 'gitlab',
    title: 'GitLab',
    provider: 'GitLab',
    label: 'Developer',
    description: 'Connect repositories, merge requests, and project planning from GitLab into your coding workflow.',
    logo: gitlabLogo,
    category: 'developer-tools',
    installMethod: 'mcp',
    website: 'https://gitlab.com/',
  },
  {
    id: 'bitbucket',
    title: 'Bitbucket',
    provider: 'Atlassian',
    label: 'Developer',
    description: 'Bring source control context from Bitbucket into Claude for code review and project coordination.',
    logo: bitbucketLogo,
    category: 'developer-tools',
    installMethod: 'mcp',
    website: 'https://bitbucket.org/product/',
  },
  {
    id: 'box',
    title: 'Box',
    provider: 'Box',
    label: 'Storage',
    description: 'Connect secure enterprise documents and shared content from Box to Claude’s workspace understanding.',
    logo: boxLogo,
    category: 'storage',
    installMethod: 'workspace',
    website: 'https://www.box.com/',
  },
] as const satisfies readonly ConnectorCatalogEntry[];

export type ConnectorId = (typeof connectorCatalog)[number]['id'];

export interface ConnectorStatusMeta {
  label: string;
  description: string;
  tone: 'connected' | 'ready' | 'manual' | 'preview';
}

export interface ConnectorRuntimeStatus {
  available: boolean;
  configured?: boolean;
  connected: boolean;
  connectedAccountId?: string | null;
  installed: boolean;
  kind: 'native' | 'mcp' | 'composio' | 'manual';
  serverName?: string | null;
}

const defaultCapabilitiesByCategory: Record<ConnectorCategory, readonly string[]> = {
  communication: [
    'Search conversations, meetings, and follow-up context without leaving Claude.',
    'Use live team communication to ground summaries, plans, and next steps.',
    'Keep chat and meeting artifacts close to the work you are already doing.',
  ],
  crm: [
    'Bring account, deal, and customer records into Claude sessions.',
    'Ground sales, support, and revenue work in current CRM context.',
    'Turn pipeline signals into faster drafts, summaries, and action items.',
  ],
  design: [
    'Reference design files, handoff details, and component context in Claude.',
    'Keep design review, implementation, and QA closer together.',
    'Use product specs and design language to shape better engineering output.',
  ],
  'developer-tools': [
    'Bring repositories, reviews, and issue context into Claude.',
    'Use source-control state to guide implementation and code review work.',
    'Keep engineering conversations grounded in the systems your team already uses.',
  ],
  knowledge: [
    'Search internal docs, wikis, and team notes from inside Claude.',
    'Use your knowledge base as grounding context for answers and drafts.',
    'Keep specs, runbooks, and institutional memory within easy reach.',
  ],
  'project-management': [
    'Reference issues, boards, and active execution plans in Claude.',
    'Connect delivery status to planning, writing, and engineering workflows.',
    'Keep roadmap and ticket context tied to the work currently in motion.',
  ],
  storage: [
    'Browse shared files, folders, and document context alongside Claude.',
    'Ground responses in the documents your team already stores centrally.',
    'Keep file references connected to the conversation instead of hopping between tools.',
  ],
  workspace: [
    'Bring cross-functional workspace context into Claude.',
    'Use shared productivity data to support planning and execution.',
    'Keep your broader work stack visible while you write, plan, and research.',
  ],
};

const defaultSetupByMethod: Record<ConnectorInstallMethod, readonly string[]> = {
  native: [
    'Start the built-in connection flow from this page.',
    'Authorize access in the provider browser window when prompted.',
    'Return to Claude Desktop and confirm the connector status updates to connected.',
  ],
  workspace: [
    'Review the connector details here instead of bouncing to a website first.',
    'Use the official workspace app as the source of truth while this fork’s dedicated auth flow is being expanded.',
    'Come back to this panel to track status and centralize future setup work.',
  ],
  mcp: [
    'Choose the app’s MCP server or another trusted integration path for this workspace tool.',
    'Add the connector to your Claude-compatible MCP configuration using the provider’s setup guide.',
    'Return to this in-app directory to keep the app catalog and setup status in one place.',
  ],
};

const connectorSpecificCapabilities: Record<string, readonly string[]> = {
  github: [
    'Connect repositories, pull requests, and issues through the native GitHub flow.',
    'Use repository context directly in Claude sessions without manual copy-paste.',
    'Keep coding, review, and project context tied to your GitHub account.',
  ],
  'google-drive': [
    'Browse shared files and folders from your workspace inside Claude.',
    'Ground answers in docs and assets your team already stores in Drive.',
    'Keep file access and follow-up work closer to the conversation.',
  ],
  slack: [
    'Search channels and thread history directly from the connector workspace.',
    'Bring live team communication into summaries, planning, and drafting tasks.',
    'Keep follow-up work grounded in the actual conversations happening across your team.',
  ],
  notion: [
    'Use team docs, notes, and project context as part of Claude’s working set.',
    'Search knowledge, tasks, and lightweight databases from a single app directory.',
    'Keep product thinking and documentation visible while you write or plan.',
  ],
  jira: [
    'Reference active tickets, sprint work, and engineering status in Claude.',
    'Tie implementation discussions back to real issue tracking state.',
    'Keep project execution context available while planning, coding, or reviewing.',
  ],
  figma: [
    'Pull design files and handoff context closer to implementation work.',
    'Keep product specs, components, and layout references visible in Claude.',
    'Support design-aware engineering workflows without losing the app directory context.',
  ],
};

const connectorSpecificSetup: Record<string, readonly string[]> = {
  github: [
    'Use the native GitHub connect button from this detail page.',
    'Approve the browser authorization flow for the repositories you want to expose.',
    'Return here and confirm GitHub shows as connected before leaving the connector workspace.',
  ],
  'google-drive': [
    'Keep Google Drive in the in-app directory while the dedicated workspace auth flow is being filled in.',
    'Use this page as the connector source of truth instead of immediately opening an external site.',
    'When the built-in Drive flow is expanded, it can slot into the same panel without changing the catalog UI.',
  ],
};

export function getConnectorCatalogEntry(id: ConnectorId): ConnectorCatalogEntry | undefined {
  return connectorCatalog.find(connector => connector.id === id);
}

export function getConnectorRuntimeStatus({
  connector,
  composioConfigured = false,
  composioStatus,
  githubConnected,
  mcpStatus,
}: {
  connector: ConnectorCatalogEntry;
  composioConfigured?: boolean;
  composioStatus?: ConnectorComposioStatus | null;
  githubConnected: boolean;
  mcpStatus?: ConnectorMcpStatus | null;
}): ConnectorRuntimeStatus {
  if (composioStatus?.available && (composioConfigured || composioStatus.connected || composioStatus.installed)) {
    return {
      available: true,
      configured: composioConfigured,
      connected: composioStatus.connected,
      connectedAccountId: composioStatus.connectedAccountId,
      installed: composioStatus.installed,
      kind: 'composio',
      serverName: composioStatus.serverName,
    };
  }

  if (connector.id === 'github') {
    return {
      available: true,
      connected: githubConnected,
      installed: githubConnected,
      kind: 'native',
      serverName: null,
    };
  }

  if (mcpStatus) {
    return {
      available: true,
      connected: false,
      installed: mcpStatus.installed,
      kind: 'mcp',
      serverName: mcpStatus.serverName,
    };
  }

  return {
    available: false,
    connected: false,
    installed: false,
    kind: 'manual',
    serverName: null,
  };
}

export function getConnectorCapabilities(connector: ConnectorCatalogEntry): readonly string[] {
  return connectorSpecificCapabilities[connector.id] ?? defaultCapabilitiesByCategory[connector.category];
}

export function getConnectorSetupSteps(connector: ConnectorCatalogEntry): readonly string[] {
  return connectorSpecificSetup[connector.id] ?? defaultSetupByMethod[connector.installMethod];
}

export function getConnectorStatusMeta(
  connector: ConnectorCatalogEntry,
  runtimeStatus?: Partial<ConnectorRuntimeStatus>,
): ConnectorStatusMeta {
  const status: ConnectorRuntimeStatus = {
    available: false,
    configured: true,
    connected: false,
    installed: false,
    kind:
      connector.id === 'github'
        ? 'native'
        : connector.installMethod === 'mcp'
          ? 'mcp'
          : 'manual',
    ...runtimeStatus,
  };

  if (status.kind === 'native') {
    if (status.connected) {
      return {
        label: 'Connected',
        description: 'GitHub is already connected in this app and ready to provide repository context.',
        tone: 'connected',
      };
    }

    return {
      label: 'Ready to connect',
      description: 'This is the only connector in the directory that already has a native OAuth flow wired into this fork.',
      tone: 'ready',
    };
  }

  if (status.kind === 'composio') {
    if (!status.configured) {
      return {
        label: 'Composio setup needed',
        description: 'This connector is mapped to Composio, but this app does not have a Composio API key configured yet.',
        tone: 'manual',
      };
    }

    if (status.connected) {
      return {
        label: 'Connected',
        description: 'This connector is connected through Composio and ready to expose its tools inside Claude.',
        tone: 'connected',
      };
    }

    if (status.installed) {
      return {
        label: 'Ready to connect',
        description: 'The shared Composio MCP server is already installed. Finish provider authorization to activate this connector.',
        tone: 'ready',
      };
    }

    return {
      label: '1-click connect',
      description: 'This connector can use Composio managed auth and a shared MCP server instead of a one-off setup flow.',
      tone: 'ready',
    };
  }

  if (status.installed) {
    return {
      label: 'Installed',
      description: 'This connector is already written into your Claude MCP configuration and is ready for the underlying provider authentication flow.',
      tone: 'connected',
    };
  }

  if (status.available) {
    return {
      label: 'Ready to install',
      description: 'This connector can be added directly to your Claude MCP configuration from this page instead of sending you to an external setup flow first.',
      tone: 'ready',
    };
  }

  if (connector.installMethod === 'workspace') {
    return {
      label: 'In-app preview',
      description: 'The connector now opens into a dedicated in-app details panel instead of sending you straight to an external website.',
      tone: 'preview',
    };
  }

  return {
    label: 'Manual setup',
    description: 'Bring this app in through its MCP server or another trusted integration path, then keep the catalog state here in-app.',
    tone: 'manual',
  };
}

export function getConnectorInstallMethodLabel(connector: ConnectorCatalogEntry): string {
  switch (connector.installMethod) {
    case 'native':
      return 'Native connector';
    case 'workspace':
      return 'Workspace connector';
    case 'mcp':
      return 'MCP connector';
  }
}
