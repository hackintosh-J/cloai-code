import React from 'react';

import {
  connectorCatalog,
  getConnectorStatusMeta,
  type ConnectorCatalogEntry,
  type ConnectorId,
  type ConnectorRuntimeStatus,
} from './catalog';

interface ConnectorSidebarProps {
  connectorStatuses: Record<string, ConnectorRuntimeStatus | null | undefined>;
  onBrowseDirectory: () => void;
  onSelect: (connectorId: ConnectorId) => void;
  selectedConnectorId: ConnectorId;
}

function ConnectorRow({
  connector,
  isActive,
  onSelect,
  secondaryLabel,
  showConnectedDot = false,
}: {
  connector: ConnectorCatalogEntry;
  isActive: boolean;
  onSelect: () => void;
  secondaryLabel: string;
  showConnectedDot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
        isActive ? 'bg-claude-hover' : 'hover:bg-claude-hover/50'
      }`}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-claude-border bg-white/90 dark:bg-[#30302E]">
        <img src={connector.logo} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
      </div>

      <div className="min-w-0 flex-1">
        <div className={`truncate text-[14px] ${isActive ? 'font-medium text-claude-text' : 'text-claude-text'}`}>
          {connector.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-claude-textSecondary">
          <span className="truncate">{secondaryLabel}</span>
          {showConnectedDot && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />}
        </div>
      </div>
    </button>
  );
}

export default function ConnectorSidebar({
  connectorStatuses,
  onBrowseDirectory,
  onSelect,
  selectedConnectorId,
}: ConnectorSidebarProps) {
  const connectedConnectors = connectorCatalog.filter(connector => connectorStatuses[connector.id]?.connected);
  const availableConnectors = connectorCatalog.filter(
    connector => !connectorStatuses[connector.id]?.connected,
  );

  return (
    <div className="w-[300px] flex-shrink-0 border-r border-claude-border bg-claude-bg">
      <div className="flex h-14 items-center justify-between border-b border-claude-border px-4">
        <span className="font-semibold text-claude-text">Connectors</span>
        <button
          type="button"
          onClick={onBrowseDirectory}
          className="rounded-[8px] border border-claude-border px-3 py-1.5 text-[12px] font-medium text-claude-textSecondary transition-colors hover:bg-claude-hover hover:text-claude-text"
        >
          Browse
        </button>
      </div>

      <div className="h-[calc(100%-56px)] overflow-y-auto px-2 pt-4">
        {connectedConnectors.length > 0 && (
          <div className="mb-3">
            <div className="px-3 py-1.5 text-[12px] font-medium uppercase tracking-wider text-claude-textSecondary/80">
              Connected
            </div>
            <div className="mt-1 space-y-1 px-1">
              {connectedConnectors.map(connector => (
                <ConnectorRow
                  key={connector.id}
                  connector={connector}
                  isActive={selectedConnectorId === connector.id}
                  onSelect={() => onSelect(connector.id)}
                  secondaryLabel={getConnectorStatusMeta(connector, connectorStatuses[connector.id] ?? undefined).label}
                  showConnectedDot
                />
              ))}
            </div>
          </div>
        )}

        <div className="mb-2">
          <div className="px-3 py-1.5 text-[12px] font-medium uppercase tracking-wider text-claude-textSecondary/80">
            {connectedConnectors.length > 0 ? 'Directory' : 'Available'}
          </div>
          <div className="mt-1 space-y-1 px-1 pb-4">
            {availableConnectors.map(connector => (
              <ConnectorRow
                key={connector.id}
                connector={connector}
                isActive={selectedConnectorId === connector.id}
                onSelect={() => onSelect(connector.id)}
                secondaryLabel={getConnectorStatusMeta(connector, connectorStatuses[connector.id] ?? undefined).label}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
