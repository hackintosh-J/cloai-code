import type {
  ConnectorComposioConfigResponse,
  ConnectorComposioStatusResponse,
  ConnectorMcpStatusResponse,
} from '../types/api'
import { isDesktopApp } from '../desktop'
import { invokeTauri } from '../platform/tauriClient'
import { API_BASE } from './http/apiClient'

export type {
  ConnectorComposioStatus,
  ConnectorComposioConfigResponse,
  ConnectorComposioStatusResponse,
  ConnectorMcpStatus,
  ConnectorMcpStatusResponse,
} from '../types/api'

const CONNECTOR_COMMANDS = {
  mcpStatus: 'get_connector_mcp_status',
  mcpInstall: 'install_connector_mcp',
  mcpUninstall: 'uninstall_connector_mcp',
  composioStatus: 'get_connector_composio_status',
  composioConfig: 'get_connector_composio_config',
  composioSetConfig: 'set_connector_composio_config',
  composioConnect: 'connect_connector_via_composio',
  composioUninstall: 'uninstall_connector_composio',
} as const

async function invokeConnector<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isDesktopApp()) {
    return invokeTauri<T>(command, args)
  }
  throw new Error('Native connector command is only available in the desktop app')
}

export async function getConnectorMcpStatus(): Promise<ConnectorMcpStatusResponse> {
  if (isDesktopApp()) return invokeConnector(CONNECTOR_COMMANDS.mcpStatus)
  const res = await fetch(`${API_BASE}/connectors/mcp-status`)
  if (!res.ok) throw new Error('Failed to load connector MCP status')
  return res.json()
}

export async function installConnectorMcp(connectorId: string): Promise<ConnectorMcpStatusResponse> {
  if (isDesktopApp()) return invokeConnector(CONNECTOR_COMMANDS.mcpInstall, { connectorId })
  const res = await fetch(`${API_BASE}/connectors/mcp-install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectorId }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to install connector')
  }
  return res.json()
}

export async function uninstallConnectorMcp(connectorId: string): Promise<ConnectorMcpStatusResponse> {
  if (isDesktopApp()) return invokeConnector(CONNECTOR_COMMANDS.mcpUninstall, { connectorId })
  const res = await fetch(`${API_BASE}/connectors/mcp-uninstall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectorId }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to uninstall connector')
  }
  return res.json()
}

export async function getConnectorComposioStatus(userId: string): Promise<ConnectorComposioStatusResponse> {
  if (isDesktopApp()) return invokeConnector(CONNECTOR_COMMANDS.composioStatus, { userId })
  const url = new URL(`${API_BASE}/connectors/composio-status`)
  if (userId) {
    url.searchParams.set('userId', userId)
  }

  const res = await fetch(url)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to load Composio connector status')
  }
  return res.json()
}

export async function getConnectorComposioConfig(): Promise<ConnectorComposioConfigResponse> {
  if (isDesktopApp()) return invokeConnector(CONNECTOR_COMMANDS.composioConfig)
  const res = await fetch(`${API_BASE}/connectors/composio-config`)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to load Composio config')
  }
  return res.json()
}

export async function setConnectorComposioConfig(apiKey: string): Promise<ConnectorComposioStatusResponse> {
  if (isDesktopApp()) return invokeConnector(CONNECTOR_COMMANDS.composioSetConfig, { payload: { apiKey } })
  const res = await fetch(`${API_BASE}/connectors/composio-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to save Composio config')
  }
  return res.json()
}

export async function connectConnectorViaComposio(
  connectorId: string,
  userId: string
): Promise<ConnectorComposioStatusResponse & { redirectUrl: string; serverName: string }> {
  if (isDesktopApp()) return invokeConnector(CONNECTOR_COMMANDS.composioConnect, { connectorId, userId })
  const res = await fetch(`${API_BASE}/connectors/composio-connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectorId, userId }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to connect connector with Composio')
  }
  return res.json()
}

export async function uninstallConnectorComposio(
  userId: string
): Promise<ConnectorComposioStatusResponse & { serverName: string }> {
  if (isDesktopApp()) return invokeConnector(CONNECTOR_COMMANDS.composioUninstall, { userId })
  const res = await fetch(`${API_BASE}/connectors/composio-uninstall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to remove Composio connector server')
  }
  return res.json()
}
