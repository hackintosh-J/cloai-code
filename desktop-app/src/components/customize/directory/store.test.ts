import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConnectorDirectoryCards,
  buildSkillDirectoryCards,
  filterConnectorDirectoryCards,
  filterSkillDirectoryCards,
  getConnectorDirectorySourceTabs,
  getSkillDirectorySourceTabs,
  type DirectorySkillSummary,
} from './store.ts';
import type { ConnectorRuntimeStatus } from '../connectors/catalog';

const exampleSkills: DirectorySkillSummary[] = [
  {
    id: 'skill-creator',
    name: 'Skill Creator',
    description: 'Scaffold a production-ready skill package.',
    enabled: true,
    isExample: true,
    sourceDir: 'skill-creator',
  },
  {
    id: 'research-assistant',
    name: 'Research Assistant',
    description: 'Summarize notes and extract insights.',
    enabled: false,
    isExample: true,
    sourceDir: 'research-assistant',
  },
];

const customSkills: DirectorySkillSummary[] = [
  {
    id: 'team-playbook',
    name: 'Team Playbook',
    description: 'Internal process notes for product launches.',
    enabled: true,
    sourceDir: 'team-playbook',
  },
];

test('skill directory cards expose official shortcuts plus real community/custom entries', () => {
  const cards = buildSkillDirectoryCards({
    examples: exampleSkills,
    mySkills: customSkills,
  });

  const sourceTabs = getSkillDirectorySourceTabs(cards);
  const officialCards = filterSkillDirectoryCards(cards, {
    source: 'official',
  });
  const communityCards = filterSkillDirectoryCards(cards, {
    source: 'community',
  });
  const customCards = filterSkillDirectoryCards(cards, {
    source: 'custom',
  });

  assert.equal(sourceTabs.length, 3);
  assert.deepEqual(
    sourceTabs.map((tab) => [tab.id, tab.count]),
    [
      ['official', 3],
      ['community', 2],
      ['custom', 1],
    ],
  );

  assert.deepEqual(
    officialCards.map((card) => card.id),
    ['create-with-claude', 'write-skill-instructions', 'upload-skill'],
  );
  assert.deepEqual(
    communityCards.map((card) => card.id),
    ['skill-creator', 'research-assistant'],
  );
  assert.deepEqual(customCards.map((card) => card.id), ['team-playbook']);

  const searchResults = filterSkillDirectoryCards(cards, {
    query: 'upload',
    source: 'official',
  });
  assert.deepEqual(searchResults.map((card) => card.id), ['upload-skill']);
});

test('connector directory cards support official, community, and installed views', () => {
  const connectorStatuses: Record<string, ConnectorRuntimeStatus> = {
    github: { available: true, connected: true, installed: true, kind: 'native' },
    notion: {
      available: true,
      configured: true,
      connected: true,
      connectedAccountId: 'ca_notion',
      installed: true,
      kind: 'composio',
      serverName: 'composio',
    },
    slack: {
      available: true,
      configured: true,
      connected: false,
      installed: true,
      kind: 'composio',
      serverName: 'composio',
    },
    figma: {
      available: true,
      configured: true,
      connected: false,
      installed: false,
      kind: 'composio',
      serverName: null,
    },
  };

  const cards = buildConnectorDirectoryCards({
    connectorStatuses,
  });

  const sourceTabs = getConnectorDirectorySourceTabs(cards);
  const installedCards = filterConnectorDirectoryCards(cards, {
    source: 'installed',
  });
  const officialCards = filterConnectorDirectoryCards(cards, {
    source: 'official',
  });
  const communityCards = filterConnectorDirectoryCards(cards, {
    source: 'community',
  });

  assert.deepEqual(
    sourceTabs.map((tab) => [tab.id, tab.count]),
    [
      ['official', 12],
      ['community', 16],
      ['installed', 3],
    ],
  );

  assert.ok(officialCards.some((card) => card.id === 'github'));
  assert.ok(officialCards.some((card) => card.id === 'google-drive'));
  assert.ok(officialCards.some((card) => card.id === 'notion'));
  assert.deepEqual(
    installedCards.map((card) => card.id).sort(),
    ['github', 'notion', 'slack'],
  );

  const searchResults = filterConnectorDirectoryCards(cards, {
    query: 'figma',
    source: 'official',
  });
  assert.deepEqual(searchResults.map((card) => card.id), ['figma']);
});
