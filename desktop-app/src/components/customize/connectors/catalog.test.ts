import assert from 'node:assert/strict';
import test from 'node:test';

import {
  connectorCatalog,
  getConnectorRuntimeStatus,
  getConnectorCapabilities,
  getConnectorSetupSteps,
  getConnectorStatusMeta,
} from './catalog';

test('connector catalog ships a broad workspace directory with local brand logos', () => {
  assert.ok(
    connectorCatalog.length >= 20,
    `expected at least 20 connector entries, received ${connectorCatalog.length}`
  );

  const ids = new Set<string>();

  for (const connector of connectorCatalog) {
    assert.ok(connector.title.length > 0, `missing title for connector ${connector.id}`);
    assert.ok(connector.description.length > 0, `missing description for connector ${connector.id}`);
    assert.ok(connector.logo.endsWith('.svg'), `expected local svg logo for ${connector.id}`);
    assert.ok(!ids.has(connector.id), `duplicate connector id ${connector.id}`);
    ids.add(connector.id);
  }

  const requiredEntries = ['github', 'google-drive', 'slack', 'notion', 'jira', 'linear'];
  for (const connectorId of requiredEntries) {
    assert.ok(
      connectorCatalog.some(connector => connector.id === connectorId),
      `missing required workspace connector ${connectorId}`
    );
  }
});

test('connector catalog exposes enough metadata to render in-app setup details', () => {
  for (const connector of connectorCatalog) {
    const capabilities = getConnectorCapabilities(connector);
    const setupSteps = getConnectorSetupSteps(connector);
    const status = getConnectorStatusMeta(
      connector,
      getConnectorRuntimeStatus({
        connector,
        githubConnected: false,
      }),
    );

    assert.ok(connector.installMethod.length > 0, `missing install method for ${connector.id}`);
    assert.ok(connector.website.startsWith('https://'), `missing website for ${connector.id}`);
    assert.ok(capabilities.length >= 2, `expected at least two capabilities for ${connector.id}`);
    assert.ok(setupSteps.length >= 2, `expected at least two setup steps for ${connector.id}`);
    assert.ok(status.label.length > 0, `missing status label for ${connector.id}`);
    assert.ok(status.description.length > 0, `missing status description for ${connector.id}`);
  }

  const github = connectorCatalog.find(connector => connector.id === 'github');
  const slack = connectorCatalog.find(connector => connector.id === 'slack');

  assert.ok(github, 'expected GitHub connector to exist');
  assert.ok(slack, 'expected Slack connector to exist');

  const githubConnected = getConnectorStatusMeta(
    github,
    getConnectorRuntimeStatus({
      connector: github,
      githubConnected: true,
    }),
  );
  const githubDisconnected = getConnectorStatusMeta(
    github,
    getConnectorRuntimeStatus({
      connector: github,
      githubConnected: false,
    }),
  );
  const slackStatus = getConnectorStatusMeta(
    slack,
    getConnectorRuntimeStatus({
      composioConfigured: false,
      composioStatus: {
        available: true,
        connected: false,
        connectedAccountId: null,
        installed: false,
        serverName: null,
        toolkitSlug: 'slack',
      },
      connector: slack,
      githubConnected: false,
    }),
  );

  assert.equal(githubConnected.label, 'Connected');
  assert.equal(githubDisconnected.label, 'Ready to connect');
  assert.equal(slackStatus.label, 'Manual setup');
});
