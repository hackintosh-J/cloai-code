import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import MainContent from '../../components/MainContent';
import GitBashRequiredModal from '../../components/GitBashRequiredModal';
import Onboarding from '../../components/Onboarding';
import SettingsPage from '../../components/SettingsPage';
import UpgradePlan from '../../components/UpgradePlan';
import DocumentPanel from '../../components/DocumentPanel';
import ArtifactsPanel from '../../components/ArtifactsPanel';
import ArtifactsPage from '../../components/ArtifactsPage';
import DraggableDivider from '../../components/DraggableDivider';
import type { DocumentInfo } from '../../components/DocumentCard';
import ChatsPage from '../../components/ChatsPage';
import CustomizePage from '../../components/CustomizePage';
import ProjectsPage from '../../components/ProjectsPage';
import CoworkPage, { type CoworkLaunchPayload } from '../../components/CoworkPage';
import ScheduledPage from '../../components/ScheduledPage';
import {
  desktopConfigExists,
  getDesktopPreferences,
  getDesktopPlatform,
  isDesktopApp,
  isRuntimeSetupReady,
  onDesktopZoomChanged,
  setDesktopPreferences,
} from '../../desktop';
import { getSystemStatus, getUnreadAnnouncements, markAnnouncementRead } from '../../api';
import CodePage from '../pages/CodePage';
import type { Announcement, AppMode, CodeLaunchPayload } from '../types';
import AnnouncementModal from './AnnouncementModal';
import ChatHeader from './ChatHeader';
import TitleBar from './TitleBar';
import { safeSetStorageItem } from '../../utils/safeStorage';

const AppLayout = () => {
  const [unreadAnnouncements, setUnreadAnnouncements] = useState<Announcement[]>([]);
  const [activeAnnouncementId, setActiveAnnouncementId] = useState<number | null>(null);
  const [isMarkingAnnouncementRead, setIsMarkingAnnouncementRead] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [newChatKey, setNewChatKey] = useState(0);
  const [authChecked, setAuthChecked] = useState(true);
  const [authValid, setAuthValid] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [runtimeSetupReady, setRuntimeSetupReady] = useState<boolean | null>(null);
  const [needsGitBash, setNeedsGitBash] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isCoworkContext = location.pathname.startsWith('/cowork');
  const isCodeContext = location.pathname.startsWith('/code');

  // Check for git-bash on Windows (required by Claude Code SDK)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const status = await getSystemStatus();
        if (cancelled) return;
        if (status.gitBash.required && !status.gitBash.found) {
          setNeedsGitBash(true);
        }
      } catch {
        // Native runtime may still be starting, retry shortly.
        if (!cancelled) setTimeout(check, 1500);
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      desktopConfigExists().catch(() => false),
      getDesktopPreferences().catch(() => null),
      isRuntimeSetupReady().catch(() => false),
    ])
      .then(([configExists, preferences, ready]) => {
        if (cancelled) return;
        const onboardingDone = preferences?.onboardingDone === true;
        const theme = preferences?.theme;
        if (theme) {
          safeSetStorageItem('theme', theme);
        }
        setRuntimeSetupReady(ready);
        setShowOnboarding(!configExists || !onboardingDone);
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeSetupReady(false);
          setShowOnboarding(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Document panel state
  const [documentPanelDoc, setDocumentPanelDoc] = useState<DocumentInfo | null>(null);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [artifacts, setArtifacts] = useState<DocumentInfo[]>([]);
  const [documentPanelWidth, setDocumentPanelWidth] = useState(50); // percent of remaining space (1:1 default)
  const [isChatMode, setIsChatMode] = useState(false);
  const [currentChatTitle, setCurrentChatTitle] = useState('');
  const sidebarWasCollapsedRef = useRef(false);
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Detect macOS for traffic light padding
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    getDesktopPlatform().then((platform) => setIsMac(platform === 'darwin'));
  }, []);

  // Title bar height adjusts inversely to zoom so it stays visually constant
  const [titleBarHeight, setTitleBarHeight] = useState(44);
  useEffect(() => {
    return onDesktopZoomChanged((factor: number) => {
      setTitleBarHeight(Math.round(44 / factor));
    });
  }, []);

  // Navigation history for back/forward buttons
  const [navHistory, setNavHistory] = useState<string[]>([location.pathname + location.search + location.hash]);
  const [navIndex, setNavIndex] = useState(0);
  const isNavAction = useRef(false);

  useEffect(() => {
    const fullPath = location.pathname + location.search;
    if (isNavAction.current) {
      isNavAction.current = false;
      return;
    }
    setNavHistory(prev => {
      const trimmed = prev.slice(0, navIndex + 1);
      if (trimmed[trimmed.length - 1] === fullPath) return trimmed;
      return [...trimmed, fullPath];
    });
    setNavIndex(prev => {
      const trimmed = navHistory.slice(0, prev + 1);
      if (trimmed[trimmed.length - 1] === fullPath) return prev;
      return trimmed.length;
    });
  }, [location.pathname, location.search]);

  const canGoBack = navIndex > 0;
  const canGoForward = navIndex < navHistory.length - 1;

  const handleNavBack = () => {
    if (!canGoBack) return;
    isNavAction.current = true;
    const newIndex = navIndex - 1;
    setNavIndex(newIndex);
    navigate(navHistory[newIndex]);
  };

  const handleNavForward = () => {
    if (!canGoForward) return;
    isNavAction.current = true;
    const newIndex = navIndex + 1;
    setNavIndex(newIndex);
    navigate(navHistory[newIndex]);
  };

  useEffect(() => {
    setShowSettings(false);
    setShowUpgrade(false);
    setDocumentPanelDoc(null);
    setShowArtifacts(false);
  }, [location.pathname]);

  // Listen for open-upgrade event from MainContent paywall
  useEffect(() => {
    const handler = () => { setShowUpgrade(true); setShowSettings(false); };
    window.addEventListener('open-upgrade', handler);
    return () => window.removeEventListener('open-upgrade', handler);
  }, []);

  // Collapse sidebar on Customize page (Removed per user request)
  useEffect(() => {
    // Intentionally empty: do not collapse left sidebar automatically
  }, [location.pathname]);

  const isDesktop = isDesktopApp();
  useEffect(() => {
    if (!isDesktop) return;
    safeSetStorageItem('user_mode', 'selfhosted');
    setAuthValid(true);
  }, [isDesktop]);

  const loadUnreadAnnouncements = useCallback(async () => {
    try {
      const data = await getUnreadAnnouncements();
      setUnreadAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (err) {
      console.error('Failed to fetch announcements:', err);
    }
  }, []);

  useEffect(() => {
    if (!authValid) return;

    loadUnreadAnnouncements();

    const intervalId = window.setInterval(() => {
      loadUnreadAnnouncements();
    }, 15000);

    const handleFocus = () => {
      loadUnreadAnnouncements();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadUnreadAnnouncements();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authValid, loadUnreadAnnouncements]);

  useEffect(() => {
    if (unreadAnnouncements.length === 0) {
      if (activeAnnouncementId !== null) setActiveAnnouncementId(null);
      return;
    }

    if (activeAnnouncementId === null || !unreadAnnouncements.some(item => item.id === activeAnnouncementId)) {
      setActiveAnnouncementId(unreadAnnouncements[0].id);
    }
  }, [unreadAnnouncements, activeAnnouncementId]);

  const activeAnnouncement = unreadAnnouncements.find(item => item.id === activeAnnouncementId) || null;

  const handleAnnouncementRead = useCallback(async () => {
    if (!activeAnnouncement || isMarkingAnnouncementRead) return;

    setIsMarkingAnnouncementRead(true);
    try {
      await markAnnouncementRead(activeAnnouncement.id);
      setUnreadAnnouncements(prev => prev.filter(item => item.id !== activeAnnouncement.id));
    } catch (err: any) {
      alert(err?.message || '公告已读失败，请稍后重试');
    } finally {
      setIsMarkingAnnouncementRead(false);
    }
  }, [activeAnnouncement, isMarkingAnnouncementRead]);

  const refreshSidebar = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleNewChat = () => {
    setNewChatKey(prev => prev + 1);
    setRefreshTrigger(prev => prev + 1);
    setShowSettings(false);
    setShowUpgrade(false);
    setDocumentPanelDoc(null);
    setShowArtifacts(false);
  };

  const handleCoworkStart = (payload: CoworkLaunchPayload) => {
    if (!payload.prompt.trim()) return;
    sessionStorage.setItem('cowork_launch_payload_v1', JSON.stringify(payload));
    handleNewChat();
    navigate('/cowork/new');
  };

  const handleCodeStart = ({ folderPath, prompt, model }: CodeLaunchPayload) => {
    if (!folderPath || !prompt.trim()) return;
    sessionStorage.setItem('code_launch_payload_v1', JSON.stringify({
      folderPath,
      prompt: prompt.trim(),
      model: model || undefined,
    }));
    handleNewChat();
    navigate('/code/new');
  };

  const handleOpenDocument = useCallback((doc: DocumentInfo) => {
    if (!documentPanelDoc && !showArtifacts) {
      sidebarWasCollapsedRef.current = isSidebarCollapsed;
    }
    setShowArtifacts(false);
    setIsSidebarCollapsed(true);
    setDocumentPanelDoc(doc);
  }, [isSidebarCollapsed, documentPanelDoc, showArtifacts]);

  const handleCloseDocument = useCallback(() => {
    setDocumentPanelDoc(null);
    if (!showArtifacts) {
      setIsSidebarCollapsed(sidebarWasCollapsedRef.current);
    }
  }, [showArtifacts]);

  const handleArtifactsUpdate = useCallback((docs: DocumentInfo[]) => {
    setArtifacts(docs);
  }, []);

  const handleOpenArtifacts = useCallback(() => {
    if (showArtifacts) {
      setShowArtifacts(false);
      // Restore sidebar state if it was collapsed by us?
      // For now, simple toggle close.
      if (!documentPanelDoc) {
        setIsSidebarCollapsed(sidebarWasCollapsedRef.current);
      }
      return;
    }

    if (!documentPanelDoc) {
      sidebarWasCollapsedRef.current = isSidebarCollapsed;
    }
    setIsSidebarCollapsed(true);
    setShowArtifacts(true);
    setDocumentPanelDoc(null);
  }, [isSidebarCollapsed, documentPanelDoc, showArtifacts]);

  const handleCloseArtifacts = useCallback(() => {
    setShowArtifacts(false);
    setIsSidebarCollapsed(sidebarWasCollapsedRef.current);
  }, []);

  const handleChatModeChange = useCallback((isChat: boolean) => {
    setIsChatMode(isChat);
  }, []);

  const handleTitleChange = useCallback((title: string) => {
    setCurrentChatTitle(title);
  }, []);

  // Layout Tuner State
  const [tunerConfig, setTunerConfig] = useState({
    sidebarWidth: 288, // tuned value
    recentsMt: 24,
    profilePy: 10,
    profilePx: 12,
    mainContentWidth: 773, // tuned value
    mainContentMt: -100,
    inputRadius: 24,
    welcomeSize: 46,
    welcomeMb: 34,

    recentsFontSize: 14,
    recentsItemPy: 7,
    recentsPl: 6,
    userAvatarSize: 36,
    userNameSize: 15,
    headerPy: 0,

    // Toggle Button (Independent Position)
    toggleSize: 28,
    toggleAbsRight: 10,
    toggleAbsTop: 11,
    toggleAbsLeft: 8, // Collapsed State Left Position
  });

  const handleSelectMode = (mode: AppMode) => {
    if (mode === 'chat') navigate('/');
    if (mode === 'cowork') navigate('/cowork');
    if (mode === 'code') navigate('/code');
  };

  const shouldShowFullWidthHeader = isChatMode && (showArtifacts && !documentPanelDoc) && !showSettings && !showUpgrade;
  const shouldShowMainHeader =
    isChatMode &&
    (!showArtifacts || documentPanelDoc) &&
    !showSettings &&
    !showUpgrade &&
    location.pathname !== '/chats' &&
    location.pathname !== '/customize' &&
    location.pathname !== '/cowork/customize' &&
    location.pathname !== '/code/customize' &&
    location.pathname !== '/projects' &&
    location.pathname !== '/cowork/projects' &&
    location.pathname !== '/code/projects' &&
    location.pathname !== '/artifacts' &&
    !location.pathname.startsWith('/cowork') &&
    location.pathname !== '/scheduled' &&
    !location.pathname.startsWith('/code');

  const mainContent = (
    <MainContent
      onNewChat={refreshSidebar}
      resetKey={newChatKey}
      tunerConfig={tunerConfig}
      onOpenDocument={handleOpenDocument}
      onArtifactsUpdate={handleArtifactsUpdate}
      onOpenArtifacts={handleOpenArtifacts}
      onTitleChange={handleTitleChange}
      onChatModeChange={handleChatModeChange}
    />
  );

  // Git-bash required (Windows): block app until installed
  if (needsGitBash) {
    return <GitBashRequiredModal onResolved={() => setNeedsGitBash(false)} />;
  }

  // Onboarding: show on first launch
  if (runtimeSetupReady === false || showOnboarding) {
    return <Onboarding onComplete={() => {
      setShowOnboarding(false);
      setRuntimeSetupReady(true);
      setDesktopPreferences({ onboardingDone: true }).catch(() => {});
      if (!isDesktop) { setAuthValid(true); return; }
      safeSetStorageItem('user_mode', 'selfhosted');
      setAuthValid(true);
    }} />;
  }

  // Guard: check if logged in
  if (!authChecked) {
    return null; // 验证中，不渲染
  }
  if (!authValid) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <div className="relative flex w-full h-screen overflow-hidden bg-claude-bg font-sans antialiased">
        {/* Custom Solid Title Bar (Unified Full Width) */}
        <TitleBar
          pathname={location.pathname}
          titleBarHeight={titleBarHeight}
          isMac={isMac}
          isSidebarCollapsed={isSidebarCollapsed}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onNavBack={handleNavBack}
          onNavForward={handleNavForward}
          onSelectMode={handleSelectMode}
        />

        <Sidebar
          isCollapsed={isSidebarCollapsed}
          toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          refreshTrigger={refreshTrigger}
          onNewChatClick={handleNewChat}
          onOpenSettings={() => { setShowSettings(true); setShowUpgrade(false); }}
          onOpenUpgrade={() => { setShowUpgrade(true); setShowSettings(false); }}
          onCloseOverlays={() => { setShowSettings(false); setShowUpgrade(false); }}
          tunerConfig={tunerConfig}
          setTunerConfig={setTunerConfig}
        />

        {/* Unified Content Wrapper - takes remaining space after sidebar */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative" style={{ paddingTop: `${titleBarHeight}px` }}>
          {/* Header - moved to allow conditional placement (Full Width Mode) */}
          {shouldShowFullWidthHeader && (
            <ChatHeader
              title={currentChatTitle}
              showArtifacts={showArtifacts}
              documentPanelDoc={documentPanelDoc}
              onOpenArtifacts={handleOpenArtifacts}
              hasArtifacts={artifacts.length > 0}
              onTitleRename={handleTitleChange}
            />
          )}

          <div className="flex-1 flex overflow-hidden relative" ref={contentContainerRef}>

            {/* Main Content Area - takes remaining width after panel */}
            <div className="flex-1 flex flex-col h-full min-w-0">
              {/* Header - Only render here if NOT in Artifacts-only mode */}
              {shouldShowMainHeader && (
                <ChatHeader
                  title={currentChatTitle}
                  showArtifacts={showArtifacts}
                  documentPanelDoc={documentPanelDoc}
                  onOpenArtifacts={handleOpenArtifacts}
                  hasArtifacts={artifacts.length > 0}
                  onTitleRename={handleTitleChange}
                />
              )}

              <div className="flex-1 overflow-hidden">
                {showSettings ? (
                  <SettingsPage onClose={() => setShowSettings(false)} />
                ) : showUpgrade ? (
                  <UpgradePlan onClose={() => setShowUpgrade(false)} />
                ) : location.pathname === '/chats' ? (
                  <ChatsPage />
                ) : location.pathname === '/customize' || location.pathname === '/cowork/customize' || location.pathname === '/code/customize' ? (
                  <CustomizePage onCreateWithClaude={() => {
                    sessionStorage.setItem('prefill_input', '让我们一起使用你的 skill-creator skill 来创建一个 skill 吧。请先问我这个 skill 应该做什么。');
                    handleNewChat();
                    navigate(isCoworkContext ? '/cowork' : isCodeContext ? '/code' : '/');
                  }} />
                ) : location.pathname === '/projects' || location.pathname === '/cowork/projects' || location.pathname === '/code/projects' ? (
                  <ProjectsPage />
                ) : location.pathname === '/cowork' ? (
                  <CoworkPage onStartTask={handleCoworkStart} />
                ) : location.pathname === '/code' ? (
                  <CodePage onStart={handleCodeStart} />
                ) : location.pathname === '/scheduled' ? (
                  <ScheduledPage onNewTask={() => navigate('/cowork')} />
                ) : location.pathname === '/artifacts' ? (
                  <ArtifactsPage onTryPrompt={(prompt) => {
                    if (prompt === '__remix__') {
                      sessionStorage.setItem('artifact_prompt', '__remix__');
                    } else {
                      sessionStorage.setItem('artifact_prompt', prompt);
                    }
                    handleNewChat();
                    window.location.hash = '#/';
                  }} />
                ) : location.pathname.startsWith('/cowork/') || location.pathname.startsWith('/code/') ? (
                  mainContent
                ) : (
                  mainContent
                )}
              </div>
            </div>

            {/* Animated Document Panel Container */}
            <div
              className={`h-full bg-claude-bg transition-all duration-300 ease-out flex z-20 relative ${(documentPanelDoc || showArtifacts) ? 'border-l border-claude-border' : ''}`}
              style={{
                width: documentPanelDoc ? `${documentPanelWidth}%` : showArtifacts ? '360px' : '0px',
                opacity: (documentPanelDoc || showArtifacts) ? 1 : 0,
                overflow: 'hidden'
              }}
            >
              {documentPanelDoc && (
                <div className="absolute left-0 top-0 bottom-0 h-full z-50">
                  <DraggableDivider onResize={setDocumentPanelWidth} containerRef={contentContainerRef} />
                </div>
              )}
              <div className={`w-full h-full flex relative min-w-0 overflow-hidden`}>
                {(documentPanelDoc || showArtifacts) && (
                  <>
                    {documentPanelDoc ? (
                      <DocumentPanel document={documentPanelDoc} onClose={handleCloseDocument} />
                    ) : (
                      <ArtifactsPanel
                        documents={artifacts}
                        onClose={handleCloseArtifacts}
                        onOpenDocument={handleOpenDocument}
                      />
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
      {activeAnnouncement && (
        <AnnouncementModal
          activeAnnouncement={activeAnnouncement}
          unreadCount={unreadAnnouncements.length}
          isMarkingAnnouncementRead={isMarkingAnnouncementRead}
          onAnnouncementRead={handleAnnouncementRead}
        />
      )}
    </>
  );
};

export default AppLayout;
