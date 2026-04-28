import {
  connectorCatalog,
  type ConnectorCatalogEntry,
  type ConnectorRuntimeStatus,
} from '../connectors/catalog';

export interface DirectorySkillSummary {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isExample?: boolean;
  sourceDir?: string | null;
}

export type DirectorySkillSource = 'official' | 'community' | 'custom';
export type DirectoryConnectorSource = 'official' | 'community' | 'installed';

export interface DirectorySourceTab<TSource extends string> {
  count: number;
  id: TSource;
  label: string;
}

export type DirectorySkillCardAction =
  | 'create-with-claude'
  | 'open-skill'
  | 'upload-skill'
  | 'write-skill-instructions';

export interface DirectorySkillCard {
  action: DirectorySkillCardAction;
  badge: string;
  description: string;
  id: string;
  isEnabled: boolean;
  source: DirectorySkillSource;
  subtitle: string;
  title: string;
}

export interface DirectoryConnectorCard extends ConnectorCatalogEntry {
  isInstalled: boolean;
  source: Exclude<DirectoryConnectorSource, 'installed'>;
}

interface BuildSkillDirectoryCardsOptions {
  examples: readonly DirectorySkillSummary[];
  mySkills: readonly DirectorySkillSummary[];
}

interface FilterDirectoryCardsOptions<TSource extends string> {
  query?: string;
  source?: TSource;
}

interface BuildConnectorDirectoryCardsOptions {
  connectorStatuses: Record<string, ConnectorRuntimeStatus | null | undefined>;
}

const skillSourceLabels: Record<DirectorySkillSource, string> = {
  official: 'Official',
  community: 'Community',
  custom: 'Custom',
};

const connectorSourceLabels: Record<DirectoryConnectorSource, string> = {
  official: 'Official',
  community: 'Community',
  installed: 'Installed',
};

const officialSkillShortcuts: readonly DirectorySkillCard[] = [
  {
    action: 'create-with-claude',
    badge: 'Built in',
    description: 'Start a guided skill draft with Claude and jump back into the main Customize workspace when you are ready to refine it.',
    id: 'create-with-claude',
    isEnabled: false,
    source: 'official',
    subtitle: 'Guided setup',
    title: 'Create with Claude',
  },
  {
    action: 'write-skill-instructions',
    badge: 'Built in',
    description: 'Open the structured editor for a local skill package with prompt, references, and supporting files in one place.',
    id: 'write-skill-instructions',
    isEnabled: false,
    source: 'official',
    subtitle: 'Manual authoring',
    title: 'Write skill instructions',
  },
  {
    action: 'upload-skill',
    badge: 'Built in',
    description: 'Import an existing skill bundle and keep it managed inside this app without leaving the directory flow.',
    id: 'upload-skill',
    isEnabled: false,
    source: 'official',
    subtitle: 'Import package',
    title: 'Upload a skill',
  },
] as const;

function createSkillCard(
  skill: DirectorySkillSummary,
  source: Exclude<DirectorySkillSource, 'official'>,
): DirectorySkillCard {
  return {
    action: 'open-skill',
    badge: skill.enabled ? 'Enabled' : source === 'custom' ? 'Draft' : 'Available',
    description: skill.description,
    id: skill.id,
    isEnabled: skill.enabled,
    source,
    subtitle: source === 'custom' ? 'Your skill' : 'Example skill',
    title: skill.name,
  };
}

function matchesQuery(query: string, fields: readonly string[]) {
  if (!query) {
    return true;
  }

  return fields.some((field) => field.toLowerCase().includes(query));
}

export function buildSkillDirectoryCards({
  examples,
  mySkills,
}: BuildSkillDirectoryCardsOptions): DirectorySkillCard[] {
  return [
    ...officialSkillShortcuts,
    ...examples.map((skill) => createSkillCard(skill, 'community')),
    ...mySkills.map((skill) => createSkillCard(skill, 'custom')),
  ];
}

export function getSkillDirectorySourceTabs(
  cards: readonly DirectorySkillCard[],
): DirectorySourceTab<DirectorySkillSource>[] {
  return (['official', 'community', 'custom'] as const).map((source) => ({
    count: cards.filter((card) => card.source === source).length,
    id: source,
    label: skillSourceLabels[source],
  }));
}

export function filterSkillDirectoryCards(
  cards: readonly DirectorySkillCard[],
  { query = '', source }: FilterDirectoryCardsOptions<DirectorySkillSource>,
): DirectorySkillCard[] {
  const normalizedQuery = query.trim().toLowerCase();

  return cards.filter((card) => {
    if (source && card.source !== source) {
      return false;
    }

    return matchesQuery(normalizedQuery, [
      card.title,
      card.description,
      card.subtitle,
      card.badge,
    ]);
  });
}

function getConnectorPrimarySource(
  connector: ConnectorCatalogEntry,
  status?: ConnectorRuntimeStatus | null,
): Exclude<DirectoryConnectorSource, 'installed'> {
  if (status?.kind === 'composio' || status?.kind === 'native') {
    return 'official';
  }

  return connector.installMethod === 'mcp' ? 'community' : 'official';
}

function getConnectorInstalledState(
  status?: ConnectorRuntimeStatus | null,
) {
  return Boolean(status?.installed || status?.connected);
}

export function buildConnectorDirectoryCards({
  connectorStatuses,
}: BuildConnectorDirectoryCardsOptions): DirectoryConnectorCard[] {
  return connectorCatalog.map((connector) => ({
    ...connector,
    isInstalled: getConnectorInstalledState(connectorStatuses[connector.id]),
    source: getConnectorPrimarySource(connector, connectorStatuses[connector.id]),
  }));
}

export function getConnectorDirectorySourceTabs(
  cards: readonly DirectoryConnectorCard[],
): DirectorySourceTab<DirectoryConnectorSource>[] {
  return (['official', 'community', 'installed'] as const).map((source) => ({
    count:
      source === 'installed'
        ? cards.filter((card) => card.isInstalled).length
        : cards.filter((card) => card.source === source).length,
    id: source,
    label: connectorSourceLabels[source],
  }));
}

export function filterConnectorDirectoryCards(
  cards: readonly DirectoryConnectorCard[],
  { query = '', source }: FilterDirectoryCardsOptions<DirectoryConnectorSource>,
): DirectoryConnectorCard[] {
  const normalizedQuery = query.trim().toLowerCase();

  return cards.filter((card) => {
    if (source === 'installed' && !card.isInstalled) {
      return false;
    }

    if (source && source !== 'installed' && card.source !== source) {
      return false;
    }

    return matchesQuery(normalizedQuery, [
      card.title,
      card.description,
      card.provider,
      card.label,
      card.category,
    ]);
  });
}
