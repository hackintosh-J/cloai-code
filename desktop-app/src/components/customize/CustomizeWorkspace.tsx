import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Search, Trash2, Sparkles, FileText,
  ChevronRight, ChevronDown, Folder, File, MoreHorizontal, Info, Eye, Code,
  MessageSquare, ClipboardList, Upload, X, FolderPlus
} from 'lucide-react';
import MarkdownRenderer, { CodeBlock } from '@/src/components/MarkdownRenderer';
import DirectoryModal, { type DirectorySection } from './directory/DirectoryBrowserModal';
import ConnectorDetailsPanel from './connectors/ConnectorDetails';
import ConnectorSidebar from './connectors/ConnectorListSidebar';
import {
  connectorCatalog,
  getConnectorCatalogEntry,
  getConnectorRuntimeStatus,
  type ConnectorId,
  type ConnectorRuntimeStatus,
} from './connectorCatalog';
import type { DirectorySkillSummary } from './directory/store';
import {
  connectConnectorViaComposio,
  disconnectGithub,
  getSkills,
  getSkillDetail,
  getSkillFile,
  createSkill,
  updateSkill,
  deleteSkill,
  toggleSkill,
  importSkill,
  getGithubStatus,
  getGithubAuthUrl,
  getConnectorComposioStatus,
  getConnectorMcpStatus,
  getUser,
  installConnectorMcp,
  setConnectorComposioConfig,
  uninstallConnectorComposio,
  uninstallConnectorMcp,
  type ConnectorComposioStatus,
  type ConnectorMcpStatus,
  type Skill,
} from '@/src/services';
import { openDesktopExternal } from '@/src/desktop';
import skillsImg from '@/assets/customization/landing/skills.png';
import connectorsImg from '@/assets/customization/landing/connectors.png';
import customizeMainImg from '@/assets/customization/landing/customize-main.png';
import createSkillsImg from '@/assets/customization/landing/create-skills.png';

interface FileTreeNodeProps {
  skill: Skill;
  isExpanded: boolean;
  onExpand: (e: React.MouseEvent) => void;
  selectedSkillId: string | null;
  detail: Skill | null;
  selectSkill: (id: string) => void;
  selectedFile: string;
  setSelectedFile: (name: string) => void;
  setSelectedSkillId: (id: string) => void;
  loadFileContent: (skillId: string, filePath: string) => void;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  skill, isExpanded, onExpand,
  selectedSkillId, detail, selectSkill,
  selectedFile, setSelectedFile, setSelectedSkillId, loadFileContent
}) => {
  const isSelected = selectedSkillId === skill.id;
  const hasFiles = detail && detail.id === skill.id && detail.files && detail.files.length > 0;
  const isEnabled = skill.enabled;
  const [mockFolderState, setMockFolderState] = useState<Record<string, boolean>>({});

  const toggleMockFolder = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMockFolderState(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="select-none overflow-hidden">
      <div
        onClick={(e) => {
          if (isSelected) {
            onExpand(e);
          } else {
            selectSkill(skill.id);
          }
        }}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-claude-hover' : 'hover:bg-claude-hover/50'}`}
      >
        <div className="flex items-center justify-center w-[24px] h-[24px] rounded-md border border-claude-border bg-black/5 dark:bg-[#30302E] flex-shrink-0">
          <img
            src={skillsImg}
            className={`w-[15.5px] h-[15.5px] ${isEnabled ? 'dark:invert opacity-90' : 'dark:invert opacity-30 invert-[0.3]'}`}
            alt="skill"
          />
        </div>

        <div className="flex-1 min-w-0">
          <span className={`truncate text-[14px] ${isEnabled ? 'text-claude-text font-medium' : 'text-[#262624] dark:text-[#6B6B68]'}`}>
            {skill.name}
          </span>
        </div>

        {isSelected && (
          <ChevronRight size={16} className={`text-claude-textSecondary transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isExpanded && hasFiles ? 'rotate-90' : ''}`} />
        )}
      </div>

      <div className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isExpanded && hasFiles ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
        <div className="overflow-hidden">
          <div className="pl-6 pt-0.5 pb-2 space-y-0.5">
            {(detail?.files || []).map((file) => (
              <div key={file.name}>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (file.type === 'folder') toggleMockFolder(file.name, e);
                    else {
                      setSelectedFile(file.name);
                      setSelectedSkillId(skill.id);
                      loadFileContent(skill.id, file.name);
                    }
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13.5px] group ${selectedSkillId === skill.id && selectedFile === file.name && file.type !== 'folder' ? 'bg-claude-hover' : 'hover:bg-claude-hover/70'}`}
                >
                  <div className="w-[12px]" /> {/* Indent for chevron */}
                  {file.type === 'folder' ? (
                    <Folder size={15.5} className="text-claude-textSecondary fill-claude-textSecondary/10" />
                  ) : (
                    <File size={15.5} className="text-claude-textSecondary group-hover:text-claude-text transition-colors" />
                  )}
                  <span className={`truncate ${selectedSkillId === skill.id && selectedFile === file.name && file.type !== 'folder' ? 'text-claude-text font-medium' : 'text-claude-textSecondary group-hover:text-claude-text transition-colors'}`}>{file.name}</span>
                  {file.type === 'folder' && <ChevronRight size={14} className={`ml-auto text-claude-textSecondary transition-transform duration-200 ${mockFolderState[file.name] ? 'rotate-90' : ''}`} />}
                </div>
                {/* Folder children */}
                {file.type === 'folder' && (
                  <div className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${mockFolderState[file.name] ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                      {file.children && file.children.length > 0 ? (
                        <div className="pl-6 py-0.5 space-y-0.5">
                          {file.children.map((child) => (
                            <div
                              key={child.name}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Build relative path: folder/child
                                const childPath = file.name + '/' + child.name;
                                setSelectedFile(child.name);
                                setSelectedSkillId(skill.id);
                                loadFileContent(skill.id, childPath);
                              }}
                              className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer text-[13px] group ${selectedSkillId === skill.id && selectedFile === child.name ? 'bg-claude-hover' : 'hover:bg-claude-hover/70'}`}
                            >
                              <File size={14} className="text-claude-textSecondary group-hover:text-claude-text transition-colors" />
                              <span className={`truncate ${selectedSkillId === skill.id && selectedFile === child.name ? 'text-claude-text font-medium' : 'text-claude-textSecondary group-hover:text-claude-text transition-colors'}`}>{child.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="pl-12 py-1 pb-2 text-[12px] text-claude-textSecondary/60 italic pointer-events-none">
                          Empty directory
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const CustomizePage = ({ onCreateWithClaude }: { onCreateWithClaude?: () => void }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'overview' | 'skills' | 'connectors'>('overview');
  const [examples, setExamples] = useState<Skill[]>([]);
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Skill | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // GitHub connector state
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<{ login: string; avatar_url?: string; name?: string | null } | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<ConnectorId>('github');
  const [showDirectoryModal, setShowDirectoryModal] = useState(false);
  const [initialDirectorySection, setInitialDirectorySection] = useState<DirectorySection>('connectors');
  const [connectorMcpStatuses, setConnectorMcpStatuses] = useState<Record<string, ConnectorMcpStatus>>({});
  const [connectorMcpConfigPath, setConnectorMcpConfigPath] = useState<string | null>(null);
  const [connectorMcpPendingId, setConnectorMcpPendingId] = useState<ConnectorId | null>(null);
  const [connectorComposioStatuses, setConnectorComposioStatuses] = useState<Record<string, ConnectorComposioStatus>>({});
  const [connectorComposioConfigured, setConnectorComposioConfigured] = useState(false);
  const [connectorComposioConfigPath, setConnectorComposioConfigPath] = useState<string | null>(null);
  const [connectorComposioPendingId, setConnectorComposioPendingId] = useState<ConnectorId | null>(null);
  const [skillTogglePendingId, setSkillTogglePendingId] = useState<string | null>(null);
  const connectorUserId = useMemo(() => {
    const appUser = getUser();
    if (appUser?.id) {
      return String(appUser.id);
    }
    if (appUser?.email) {
      return String(appUser.email);
    }

    try {
      const gatewayUser = JSON.parse(localStorage.getItem('gateway_user') || 'null');
      if (gatewayUser?.id) {
        return String(gatewayUser.id);
      }
      if (gatewayUser?.email) {
        return String(gatewayUser.email);
      }
    } catch {}

    return 'desktop-local-user';
  }, []);

  const selectedConnectorEntry = useMemo(
    () => getConnectorCatalogEntry(selectedConnector) ?? connectorCatalog[0],
    [selectedConnector],
  );
  const connectorRuntimeStatuses = useMemo<Record<string, ConnectorRuntimeStatus>>(
    () =>
      connectorCatalog.reduce((accumulator, connector) => {
        accumulator[connector.id] = getConnectorRuntimeStatus({
          connector,
          composioConfigured: connectorComposioConfigured,
          composioStatus: connectorComposioStatuses[connector.id] ?? null,
          githubConnected,
          mcpStatus: connectorMcpStatuses[connector.id] ?? null,
        });
        return accumulator;
      }, {} as Record<string, ConnectorRuntimeStatus>),
    [connectorComposioConfigured, connectorComposioStatuses, connectorMcpStatuses, githubConnected],
  );
  const selectedConnectorRuntimeStatus = connectorRuntimeStatuses[selectedConnector];
  const directoryExampleSkills = useMemo<DirectorySkillSummary[]>(
    () =>
      examples.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description || '',
        enabled: skill.enabled,
        isExample: skill.is_example,
        sourceDir: skill.source_dir ?? null,
      })),
    [examples],
  );
  const directoryMySkills = useMemo<DirectorySkillSummary[]>(
    () =>
      mySkills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description || '',
        enabled: skill.enabled,
        isExample: skill.is_example,
        sourceDir: skill.source_dir ?? null,
      })),
    [mySkills],
  );

  const openExternalUrl = (url: string) => {
    openDesktopExternal(url).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  useEffect(() => {
    getGithubStatus().then(data => {
      setGithubConnected(data.connected);
      if (data.user) setGithubUser(data.user);
    }).catch(() => { });
    // Poll for connection after OAuth redirect (user might have just authorized in browser)
    const poll = setInterval(() => {
      getGithubStatus().then(data => {
        if (data.connected && !githubConnected) {
          setGithubConnected(true);
          if (data.user) setGithubUser(data.user);
        }
      }).catch(() => { });
    }, 3000);
    return () => clearInterval(poll);
  }, [githubConnected]);

  const refreshConnectorMcpStatus = useCallback(async () => {
    try {
      const data = await getConnectorMcpStatus();
      setConnectorMcpStatuses(data.connectors || {});
      setConnectorMcpConfigPath(data.configPath || null);
    } catch (error) {
      console.error('Connector MCP status error:', error);
    }
  }, []);

  const refreshConnectorComposioStatus = useCallback(async () => {
    try {
      const data = await getConnectorComposioStatus(connectorUserId);
      setConnectorComposioStatuses(data.connectors || {});
      setConnectorComposioConfigured(Boolean(data.configured));
      setConnectorComposioConfigPath(data.configPath || null);
    } catch (error) {
      console.error('Connector Composio status error:', error);
    }
  }, [connectorUserId]);

  useEffect(() => {
    void refreshConnectorMcpStatus();
    void refreshConnectorComposioStatus();
  }, [refreshConnectorComposioStatus, refreshConnectorMcpStatus]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      void refreshConnectorComposioStatus();
    }, 5000);

    return () => window.clearInterval(poll);
  }, [refreshConnectorComposioStatus]);

  const handleGithubConnect = async () => {
    try {
      const { url } = await getGithubAuthUrl();
      openExternalUrl(url);
    } catch (e) { console.error('GitHub auth error:', e); }
  };

  const handleGithubDisconnect = async () => {
    await disconnectGithub();
    setGithubConnected(false);
    setGithubUser(null);
  };

  const connectConnectorByComposio = async (connectorId: ConnectorId) => {
    if (connectorComposioPendingId || connectorMcpPendingId) return;
    setConnectorComposioPendingId(connectorId);
    try {
      const data = await connectConnectorViaComposio(connectorId, connectorUserId);
      setConnectorComposioStatuses(data.connectors || {});
      setConnectorComposioConfigured(true);
      setConnectorComposioConfigPath(data.configPath || null);
      openExternalUrl(data.redirectUrl);
    } catch (error) {
      console.error('Connector Composio connect error:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to connect connector');
    } finally {
      setConnectorComposioPendingId(null);
    }
  };

  const saveConnectorComposioApiKey = async (apiKey: string) => {
    if (connectorComposioPendingId || connectorMcpPendingId) return;
    setConnectorComposioPendingId(selectedConnector);
    try {
      const data = await setConnectorComposioConfig(apiKey);
      setConnectorComposioStatuses(data.connectors || {});
      setConnectorComposioConfigured(Boolean(data.configured));
      setConnectorComposioConfigPath(data.configPath || null);
      await refreshConnectorComposioStatus();
    } catch (error) {
      console.error('Connector Composio config error:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to save Composio API key');
    } finally {
      setConnectorComposioPendingId(null);
    }
  };

  const installConnectorById = async (connectorId: ConnectorId) => {
    const connectorStatus = connectorMcpStatuses[connectorId];
    if (!connectorStatus || connectorMcpPendingId || connectorComposioPendingId) return;
    setConnectorMcpPendingId(connectorId);
    try {
      const data = await installConnectorMcp(connectorId);
      setConnectorMcpStatuses(data.connectors || {});
      setConnectorMcpConfigPath(data.configPath || null);
    } catch (error) {
      console.error('Connector install error:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to install connector');
    } finally {
      setConnectorMcpPendingId(null);
    }
  };

  const uninstallConnectorById = async (connectorId: ConnectorId) => {
    const connectorStatus = connectorMcpStatuses[connectorId];
    if (!connectorStatus || connectorMcpPendingId || connectorComposioPendingId) return;
    setConnectorMcpPendingId(connectorId);
    try {
      const data = await uninstallConnectorMcp(connectorId);
      setConnectorMcpStatuses(data.connectors || {});
      setConnectorMcpConfigPath(data.configPath || null);
    } catch (error) {
      console.error('Connector uninstall error:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to remove connector');
    } finally {
      setConnectorMcpPendingId(null);
    }
  };

  const uninstallComposioConnector = async () => {
    if (connectorComposioPendingId || connectorMcpPendingId) return;
    setConnectorComposioPendingId(selectedConnector);
    try {
      const data = await uninstallConnectorComposio(connectorUserId);
      setConnectorComposioStatuses(data.connectors || {});
      setConnectorComposioConfigPath(data.configPath || null);
    } catch (error) {
      console.error('Connector Composio uninstall error:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to remove Composio connector');
    } finally {
      setConnectorComposioPendingId(null);
    }
  };

  const handlePrimaryConnectorAction = async (connectorId: ConnectorId) => {
    const runtimeStatus = connectorRuntimeStatuses[connectorId];
    if (!runtimeStatus) return;

    if (runtimeStatus.kind === 'native') {
      await handleGithubConnect();
      return;
    }

    if (runtimeStatus.kind === 'composio') {
      await connectConnectorByComposio(connectorId);
      return;
    }

    if (runtimeStatus.kind === 'mcp') {
      await installConnectorById(connectorId);
    }
  };

  const handleInstallConnector = async () => {
    await handlePrimaryConnectorAction(selectedConnector);
  };

  const handleUninstallConnector = async () => {
    if (selectedConnectorRuntimeStatus?.kind === 'composio') {
      await uninstallComposioConnector();
      return;
    }

    await uninstallConnectorById(selectedConnector);
  };

  // Tree state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['examples', 'myskills']));
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string>('SKILL.md'); // For visual selection in tree
  const [fileContent, setFileContent] = useState<string>(''); // Content of selected non-SKILL.md file
  const [showSearchInput, setShowSearchInput] = useState(false);

  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const uploadFileRef = React.useRef<HTMLInputElement>(null);

  // Edit/Create state
  const [creating, setCreating] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  useEffect(() => {
    if (selectedFile) {
      if (selectedFile.endsWith('.md') || selectedFile.endsWith('.mdx')) {
        setViewMode('preview');
      } else {
        setViewMode('code');
      }
    }
  }, [selectedFile]);

  const fetchList = useCallback(async () => {
    try {
      const data = await getSkills();
      const exList: Skill[] = data.examples || [];
      const myList: Skill[] = data.my_skills || [];

      // Sort examples: skill-creator first, then alphabetical
      exList.sort((a, b) => {
        if (a.source_dir === 'skill-creator') return -1;
        if (b.source_dir === 'skill-creator') return 1;
        return a.name.localeCompare(b.name);
      });

      setExamples(exList);
      setMySkills(myList);

      // Auto-select skill-creator if not selected
      if (!selectedSkillId && !creating) {
        const scIndex = exList.findIndex(s => s.source_dir === 'skill-creator');
        if (scIndex !== -1) {
          // Force enabled for skill-creator as per request
          exList[scIndex] = { ...exList[scIndex], enabled: true };
          selectSkill(exList[scIndex].id);
          // Default collapsed as per user request
          // setExpandedSkills(prev => new Set(prev).add(sc.id));
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [creating, selectedSkillId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const loadFileContent = async (skillId: string, filePath: string) => {
    if (filePath === 'SKILL.md') { setFileContent(''); return; }
    try {
      const data = await getSkillFile(skillId, filePath);
      setFileContent(data.content || '');
    } catch (e) {
      setFileContent(`// Failed to load ${filePath}`);
    }
  };

  const selectSkill = async (id: string) => {
    setCreating(false);
    setSelectedSkillId(id);
    setSelectedFile('SKILL.md');
    setFileContent('');
    // Collapse first so animation can play from closed → open
    setExpandedSkills(prev => { const s = new Set(prev); s.delete(id); return s; });
    try {
      const d = await getSkillDetail(id);
      flushSync(() => {
        setDetail(d);
        if (!d.is_example) {
          setEditName(d.name);
          setEditDesc(d.description || '');
          setEditContent(d.content || '');
        }
      });

      // Force layout calculation so the browser registers the grid-rows-[0fr] state
      void document.body.offsetHeight;

      // Delay expanding so that the layout flush is definitively painted before changing to grid-rows-[1fr]
      setTimeout(() => {
        setExpandedSkills(prev => new Set([...prev, id]));
      }, 10);
    } catch (e) { console.error(e); }
  };

  const handleToggle = async (id: string, current: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (skillTogglePendingId && skillTogglePendingId !== id) return;
    try {
      setSkillTogglePendingId(id);
      await toggleSkill(id, !current);
      setExamples(prev => prev.map(s => s.id === id ? { ...s, enabled: !current } : s));
      setMySkills(prev => prev.map(s => s.id === id ? { ...s, enabled: !current } : s));
      if (detail?.id === id) setDetail(prev => prev ? { ...prev, enabled: !current } : prev);
    } catch (e) { console.error(e); }
    finally {
      setSkillTogglePendingId(null);
    }
  };

  const toggleSection = (section: string) => {
    const newSet = new Set(expandedSections);
    if (newSet.has(section)) newSet.delete(section);
    else newSet.add(section);
    setExpandedSections(newSet);
  };

  const toggleSkillExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(expandedSkills);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedSkills(newSet);
  };

  // ... (Create, Save, Delete handlers same as before, simplified for brevity)
  const handleCreate = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const s = await createSkill({ name: editName, description: editDesc, content: editContent });
      setMySkills(prev => [{ ...s, enabled: true }, ...prev]);
      setCreating(false);
      setSelectedSkillId(s.id);
      setDetail({ ...s, enabled: true });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await updateSkill(detail.id, { name: editName, description: editDesc, content: editContent });
      setDetail(prev => prev ? { ...prev, name: editName, description: editDesc, content: editContent } : prev);
      setMySkills(prev => prev.map(s => s.id === detail.id ? { ...s, name: editName, description: editDesc } : s));
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!detail) return;
    if (!confirm('Are you sure you want to delete this skill?')) return;
    try {
      await deleteSkill(detail.id);
      setMySkills(prev => prev.filter(s => s.id !== detail.id));
      setSelectedSkillId(null);
      setDetail(null);
    } catch (e) { console.error(e); }
  };

  const startCreate = () => {
    setCreating(true);
    setSelectedSkillId(null);
    setDetail(null);
    setEditName('');
    setEditDesc('');
    setEditContent('');
  };

  const openDirectory = (section: DirectorySection) => {
    setInitialDirectorySection(section);
    setShowDirectoryModal(true);
  };

  const openConnectorFromDirectory = (connectorId: ConnectorId) => {
    setSelectedConnector(connectorId);
    setTab('connectors');
    setShowDirectoryModal(false);
  };

  const openSkillFromDirectory = (skillId: string) => {
    setTab('skills');
    setShowDirectoryModal(false);
    void selectSkill(skillId);
  };

  const openCreateWithClaudeFromDirectory = () => {
    setShowDirectoryModal(false);
    onCreateWithClaude?.();
  };

  const openWriteSkillFromDirectory = () => {
    setTab('skills');
    setShowDirectoryModal(false);
    startCreate();
  };

  const openUploadSkillFromDirectory = () => {
    setTab('skills');
    setShowDirectoryModal(false);
    setShowUploadModal(true);
  };

  const enableSkillFromDirectory = async (skillId: string, nextEnabled: boolean) => {
    const skill = [...examples, ...mySkills].find((entry) => entry.id === skillId);

    if (!skill || skill.enabled === nextEnabled) {
      openSkillFromDirectory(skillId);
      return;
    }

    await handleToggle(skillId, skill.enabled);

    if (nextEnabled) {
      openSkillFromDirectory(skillId);
    }
  };

  // Filter skills
  const q = search.toLowerCase();
  const filteredExamples = examples.filter(s => s.name.toLowerCase().includes(q));
  const filteredMy = mySkills.filter(s => s.name.toLowerCase().includes(q));

  // --- Render Helpers ---

  const ToggleSwitch = ({ enabled, onToggle, size = 'md' }: { enabled: boolean; onToggle: (e: React.MouseEvent) => void, size?: 'sm' | 'md' }) => (
    <button onClick={onToggle}
      className={`relative inline-flex items-center rounded-full transition-colors duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'} ${size === 'sm' ? 'h-4 w-7' : 'h-5 w-9'}`}>
      <span className={`inline-block rounded-full bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} ${enabled ? (size === 'sm' ? 'translate-x-[14px]' : 'translate-x-[18px]') : 'translate-x-[2px]'}`} />
    </button>
  );


  return (
    <div className="flex h-full w-full bg-claude-bg text-claude-text font-sans">

      {/* 1. Left Navigation (Fixed width) */}
      <div className="w-[240px] border-r border-claude-border flex flex-col pt-4 pb-4 flex-shrink-0 bg-claude-bg">
        <div className="px-4 mb-6">
          <button onClick={() => {
            if (tab !== 'overview') setTab('overview');
            else navigate(-1);
          }}
            className="flex items-center gap-2 text-claude-text font-medium hover:text-claude-text/80 transition-colors">
            <ArrowLeft size={20} />
            <span className="text-lg font-semibold">Customize</span>
          </button>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          <button onClick={() => setTab('skills')}
            className={`w-full flex items-center gap-3 px-3 py-2 text-[15px] font-medium rounded-lg transition-colors ${tab === 'skills' ? 'bg-claude-hover text-claude-text' : 'text-claude-text hover:bg-claude-hover'}`}>
            <img src={skillsImg} alt="" className="w-[22px] h-[22px] dark:invert" />
            Skills
          </button>
          <button onClick={() => setTab('connectors')}
            className={`w-full flex items-center gap-3 px-3 py-2 text-[15px] font-medium rounded-lg transition-colors ${tab === 'connectors' ? 'bg-claude-hover text-claude-text' : 'text-claude-text hover:bg-claude-hover'}`}>
            <img src={connectorsImg} alt="" className="w-[22px] h-[22px] dark:invert" />
            Connectors
          </button>
        </nav>
      </div>

      {/* 2. Middle Column: Skills List or Connectors List */}
      {tab === 'skills' ? (
        <div className="w-[300px] border-r border-claude-border flex flex-col flex-shrink-0 bg-claude-bg">
          {/* Header */}
          <div className="h-14 px-4 flex items-center justify-between border-b border-claude-border">
            <span className="font-semibold text-claude-text">Skills</span>
            <div className="flex items-center gap-2 relative">
              <button
                onClick={() => setShowSearchInput(!showSearchInput)}
                className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary hover:text-claude-text transition-colors group"
              >
                <Search size={21} className="opacity-70 group-hover:opacity-100 transition-opacity" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowPlusMenu(!showPlusMenu)}
                  className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary hover:text-claude-text transition-colors"
                >
                  <Plus size={22} />
                </button>
                {showPlusMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowPlusMenu(false)} />
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-[#202020] rounded-[16px] shadow-[0_4px_24px_rgba(0,0,0,0.15)] border border-claude-border py-2 z-50">
                      <button className="w-full flex items-center gap-3.5 px-4 py-3 text-[14.5px] font-medium text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={() => { setShowPlusMenu(false); onCreateWithClaude?.(); }}>
                        <MessageSquare size={18} className="text-claude-textSecondary" />
                        Create with Claude
                      </button>
                      <button className="w-full flex items-center gap-3.5 px-4 py-3 text-[14.5px] font-medium text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={() => { setShowPlusMenu(false); startCreate(); }}>
                        <ClipboardList size={18} className="text-claude-textSecondary" />
                        Write skill instructions
                      </button>
                      <button className="w-full flex items-center gap-3.5 px-4 py-3 text-[14.5px] font-medium text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={() => { setShowPlusMenu(false); setShowUploadModal(true); }}>
                        <Upload size={18} className="text-claude-textSecondary" />
                        Upload a skill
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Search Input (Conditional) */}
          {showSearchInput && (
            <div className="px-3 py-2 border-b border-claude-border">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter skills..."
                className="w-full px-2 py-1.5 bg-claude-input rounded-md text-sm outline-none border border-transparent focus:border-blue-500"
              />
            </div>
          )}

          {/* List Content */}
          <div className="flex-1 overflow-y-auto py-2">
            {/* Examples Section */}
            {filteredExamples.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => toggleSection('examples')}
                  className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-claude-textSecondary hover:text-claude-text uppercase tracking-wider"
                >
                  <ChevronDown size={14} className={`transition-transform ${expandedSections.has('examples') ? '' : '-rotate-90'}`} />
                  Examples
                </button>

                {expandedSections.has('examples') && (
                  <div className="mt-0.5 px-2 space-y-0.5">
                    {filteredExamples.map(skill => (
                      <FileTreeNode
                        key={skill.id}
                        skill={skill}
                        isExpanded={expandedSkills.has(skill.id)}
                        onExpand={(e) => toggleSkillExpand(skill.id, e)}
                        selectedSkillId={selectedSkillId}
                        detail={detail}
                        selectSkill={selectSkill}
                        selectedFile={selectedFile}
                        setSelectedFile={setSelectedFile}
                        setSelectedSkillId={setSelectedSkillId}
                        loadFileContent={loadFileContent}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* My Skills Section */}
            {filteredMy.length > 0 && (
              <div>
                <button
                  onClick={() => toggleSection('myskills')}
                  className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-claude-textSecondary hover:text-claude-text uppercase tracking-wider"
                >
                  <ChevronDown size={14} className={`transition-transform ${expandedSections.has('myskills') ? '' : '-rotate-90'}`} />
                  My Skills
                </button>

                {expandedSections.has('myskills') && (
                  <div className="mt-0.5 px-2 space-y-0.5 overflow-hidden">
                    <div className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] grid-rows-[1fr] opacity-100`}>
                      <div className="overflow-hidden">
                        {filteredMy.map(skill => (
                          <FileTreeNode
                            key={skill.id}
                            skill={skill}
                            isExpanded={expandedSkills.has(skill.id)}
                            onExpand={(e) => toggleSkillExpand(skill.id, e)}
                            selectedSkillId={selectedSkillId}
                            detail={detail}
                            selectSkill={selectSkill}
                            selectedFile={selectedFile}
                            setSelectedFile={setSelectedFile}
                            setSelectedSkillId={setSelectedSkillId}
                            loadFileContent={loadFileContent}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!filteredExamples.length && !filteredMy.length && (
              <div className="p-4 text-center text-sm text-claude-textSecondary">
                No skills found
              </div>
            )}
          </div>
        </div>
      ) : tab === 'connectors' ? (
        <ConnectorSidebar
          connectorStatuses={connectorRuntimeStatuses}
          onBrowseDirectory={() => openDirectory('connectors')}
          onSelect={(connectorId) => setSelectedConnector(connectorId)}
          selectedConnectorId={selectedConnector}
        />
      ) : null}

      {/* 3. Right Column: Detail / Create / Overview */}
      <div className="flex-1 flex flex-col min-w-0">
        {tab === 'overview' ? (
          <div className="flex h-full flex-col items-center overflow-y-auto bg-claude-bg">
            <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-6 pb-24 pt-[14vh] lg:pt-[220px]">
              <div className="mb-4 flex h-[96px] w-[96px] items-center justify-center">
                <img src={customizeMainImg} alt="Customize" className="w-[96px] h-auto dark:invert opacity-90" />
              </div>

              <div className="mb-10 text-center">
                <h2 className="font-serif text-[29px] font-medium leading-[1.15] text-claude-text">Customize Claude</h2>
                <p className="mt-2 text-[14px] leading-5 text-claude-textSecondary">
                  Skills, connectors, and plugins shape how Claude works with you.
                </p>
              </div>

              <div className="w-full space-y-3">
                <button
                  onClick={() => openDirectory('connectors')}
                  className="w-full rounded-[24px] border border-claude-border bg-white px-5 py-[21px] text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#fcfcfb] dark:bg-[#30302E] dark:hover:bg-[#353533]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-claude-hover">
                      <img src={connectorsImg} className="h-5 w-5 dark:invert opacity-80" alt="Connectors" />
                    </div>
                    <div>
                      <div className="text-[15px] font-medium text-claude-text">Connect your apps</div>
                      <div className="mt-0.5 text-[13.5px] leading-5 text-claude-textSecondary">
                        Let Claude read and write to the tools you already use.
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setTab('skills');
                    startCreate();
                  }}
                  className="w-full rounded-[24px] border border-claude-border bg-white px-5 py-[21px] text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#fcfcfb] dark:bg-[#30302E] dark:hover:bg-[#353533]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-claude-hover">
                      <img src={createSkillsImg} className="h-5 w-5 dark:invert opacity-80" alt="Skills" />
                    </div>
                    <div>
                      <div className="text-[15px] font-medium text-claude-text">Create new skills</div>
                      <div className="mt-0.5 text-[13.5px] leading-5 text-claude-textSecondary">
                        Teach Claude your processes, team norms, and expertise.
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : tab === 'connectors' ? (
          <div className="flex-1 h-full min-w-0 bg-claude-bg">
            <ConnectorDetailsPanel
              connector={selectedConnectorEntry}
              composioConfigured={connectorComposioConfigured}
              githubUser={githubUser}
              mcpConfigPath={connectorComposioConfigPath || connectorMcpConfigPath}
              mcpBusy={
                connectorMcpPendingId === selectedConnector ||
                connectorComposioPendingId === selectedConnector
              }
              runtimeStatus={selectedConnectorRuntimeStatus}
              onConnectConnector={() => void handlePrimaryConnectorAction(selectedConnector)}
              onSaveComposioApiKey={(apiKey) => void saveConnectorComposioApiKey(apiKey)}
              onGithubConnect={handleGithubConnect}
              onGithubDisconnect={handleGithubDisconnect}
              onInstallConnector={handleInstallConnector}
              onOpenWebsite={openExternalUrl}
              onUninstallConnector={handleUninstallConnector}
            />
          </div>
        ) : creating ? (
          // Create Form
          <div className="max-w-3xl mx-auto w-full p-8 space-y-6 overflow-y-auto">
            <h2 className="text-2xl font-semibold text-claude-text">Create new skill</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-claude-textSecondary mb-1.5">Name</label>
                <input
                  value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-claude-border bg-transparent text-claude-text outline-none focus:border-blue-500 transition-colors"
                  placeholder="e.g. code-reviewer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-claude-textSecondary mb-1.5">Description</label>
                <input
                  value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-claude-border bg-transparent text-claude-text outline-none focus:border-blue-500 transition-colors"
                  placeholder="Brief description of what this skill does"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-claude-textSecondary mb-1.5">Content</label>
                <textarea
                  value={editContent} onChange={e => setEditContent(e.target.value)} rows={15}
                  className="w-full px-3 py-2 rounded-lg border border-claude-border bg-transparent text-claude-text font-mono text-sm outline-none focus:border-blue-500 transition-colors resize-y"
                  placeholder="# Skill Title\n\nInstructions for Claude..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleCreate} disabled={saving || !editName.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Creating...' : 'Create Skill'}
                </button>
                <button onClick={() => setCreating(false)}
                  className="px-4 py-2 rounded-lg border border-claude-border text-claude-text hover:bg-claude-hover transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : detail ? (
          // Detail View
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 px-8 py-6 border-b border-transparent">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-bold text-claude-text">{detail.name}</h2>
                <div className="flex items-center gap-4">
                  <ToggleSwitch
                    enabled={detail.enabled}
                    onToggle={(e) => handleToggle(detail.id, detail.enabled, e)}
                  />
                  <button className="text-claude-textSecondary hover:text-claude-text">
                    <MoreHorizontal size={20} />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {detail.is_example && (
                  <div className="text-sm">
                    <span className="text-claude-textSecondary">Added by</span>
                    <div className="font-medium text-claude-text mt-0.5">Anthropic</div>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-1.5 text-sm text-claude-textSecondary mb-1">
                    Description
                    <Info size={14} />
                  </div>
                  <p className="text-sm text-claude-text leading-relaxed">
                    {detail.description || "No description provided."}
                  </p>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-8 pb-8">
              <div className="border border-claude-border rounded-xl bg-white dark:bg-[#30302E] overflow-hidden shadow-sm">
                <div className="flex items-center justify-end px-4 py-2 border-b border-claude-border bg-claude-bg/50">
                  <button
                    onClick={() => setViewMode(viewMode === 'preview' ? 'code' : 'preview')}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-claude-textSecondary hover:bg-claude-hover rounded-md transition-colors"
                  >
                    {viewMode === 'preview' ? <Code size={14} /> : <Eye size={14} />}
                    {viewMode === 'preview' ? 'Code' : 'Preview'}
                  </button>
                </div>

                <div className="p-6 min-h-[400px]">
                  {viewMode === 'preview' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <MarkdownRenderer content={selectedFile === 'SKILL.md' ? (detail.content || '') : (fileContent || '')} />
                    </div>
                  ) : (
                    <div className="mx-auto w-full">
                      <CodeBlock
                        className="!border-transparent !bg-transparent !my-0"
                        language={
                          selectedFile.endsWith('.py') ? 'python' :
                            selectedFile.endsWith('.js') || selectedFile.endsWith('.jsx') ? 'javascript' :
                              selectedFile.endsWith('.ts') || selectedFile.endsWith('.tsx') ? 'typescript' :
                                selectedFile.endsWith('.css') ? 'css' :
                                  selectedFile.endsWith('.html') ? 'html' :
                                    selectedFile.endsWith('.json') ? 'json' :
                                      selectedFile.endsWith('.sh') ? 'bash' : 'text'
                        }
                        code={selectedFile === 'SKILL.md' ? (detail.content || '') : (fileContent || '')}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-claude-textSecondary">
            <div className="text-center">
              <Sparkles size={32} className="mx-auto mb-3 opacity-20" />
              <p>Select a skill to view details</p>
            </div>
          </div>
        )}
      </div>

      {showDirectoryModal && (
        <DirectoryModal
          examples={directoryExampleSkills}
          connectorStatuses={connectorRuntimeStatuses}
          initialSection={initialDirectorySection}
          mySkills={directoryMySkills}
          onClose={() => setShowDirectoryModal(false)}
          onCreateWithClaude={openCreateWithClaudeFromDirectory}
          onTriggerConnectorAction={(connectorId) => void handlePrimaryConnectorAction(connectorId)}
          onOpenConnector={openConnectorFromDirectory}
          onOpenSkill={openSkillFromDirectory}
          onToggleSkill={enableSkillFromDirectory}
          onUploadSkill={openUploadSkillFromDirectory}
          onWriteSkill={openWriteSkillFromDirectory}
          pendingConnectorId={connectorMcpPendingId || connectorComposioPendingId}
          pendingSkillId={skillTogglePendingId}
        />
      )}

      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-claude-bg w-[460px] rounded-[16px] flex flex-col shadow-[0_10px_40px_rgba(0,0,0,0.25)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] relative border border-claude-border overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h3 className="text-[16px] font-semibold text-claude-text tracking-wide">导入 Skill</h3>
              <button onClick={() => { setShowUploadModal(false); setUploadErr(''); }} className="text-claude-textSecondary hover:text-claude-text transition-colors">
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <input ref={uploadFileRef} type="file" accept=".zip,.md" className="hidden" onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadErr(''); setUploading(true);
              try { await importSkill(file); setShowUploadModal(false); await fetchList(); }
              catch (err: any) { setUploadErr(err.message || '导入失败'); }
              finally { setUploading(false); if (uploadFileRef.current) uploadFileRef.current.value = ''; }
            }} />

            <div
              onClick={() => uploadFileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async e => {
                e.preventDefault(); setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                setUploadErr(''); setUploading(true);
                try { await importSkill(file); setShowUploadModal(false); await fetchList(); }
                catch (err: any) { setUploadErr(err.message || '导入失败'); }
                finally { setUploading(false); }
              }}
              className={`mx-6 mb-4 p-8 border border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors group ${dragOver ? 'border-claude-text/50 bg-claude-hover' : 'border-claude-border hover:bg-claude-hover'}`}
            >
              {uploading ? (
                <div className="text-[13px] text-claude-textSecondary">导入中...</div>
              ) : (
                <>
                  <FolderPlus size={22} className="text-claude-textSecondary group-hover:text-claude-text transition-colors mb-3 stroke-[1.5]" />
                  <div className="text-[13px] text-claude-textSecondary group-hover:text-claude-text transition-colors">
                    拖拽或点击上传 .zip / .md 文件
                  </div>
                </>
              )}
            </div>

            {uploadErr && <div className="mx-6 mb-4 text-[12.5px] text-red-400">{uploadErr}</div>}

            <div className="px-6 pb-6">
              <div className="text-[12px] font-medium text-claude-textSecondary mb-2">文件要求</div>
              <ul className="list-disc pl-4 text-[12px] text-claude-textSecondary/70 space-y-1.5 marker:text-claude-textSecondary/30">
                <li>.zip 内需包含 SKILL.md 文件（可在根目录或子目录内）</li>
                <li>.md 文件需包含 YAML 格式的 name 和 description</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomizePage;
