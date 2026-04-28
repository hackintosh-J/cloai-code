import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { getStreamingIds } from '@/src/components/chat/streaming/streamingRegistry';
import {
  IconSidebarToggle,
  IconChatBubble,
  IconCode,
  IconPlusCircle,
  IconArtifactsExact,
  IconProjects,
  IconDotsHorizontal,
  IconStarOutline,
  IconPencil,
  IconTrash
} from '@/src/components/Icons';
import { CalendarDays, Send as DispatchIcon, Pin, Sparkles } from 'lucide-react';
import claudeImg from '@/assets/branding/claude-mark.png';
import searchIconImg from '@/assets/navigation/app-shell/search.png';
import customizeIconImg from '@/assets/customization/landing/customize-icon.png';
import figmaProjectsIcon from '@/assets/navigation/sidebar/classic/projects.svg';
import figmaScheduledIcon from '@/assets/navigation/sidebar/classic/scheduled.svg';
import figmaCustomizeIcon from '@/assets/navigation/sidebar/classic/customize.svg';
import figmaDispatchIcon from '@/assets/navigation/sidebar/classic/dispatch.svg';
import coworkNewTaskIcon from '@/assets/navigation/sidebar/cowork/new-task-plus.svg';
import recentConversationRingIcon from '@/assets/navigation/sidebar/shared/recent-conversation-ring.svg';
import { NAV_ITEMS } from '@/src/components/navigation/navigationConstants';
import { ChevronUp } from 'lucide-react';
import { getConversations, deleteConversation, updateConversation, getUser, getUserUsage, logout, getUserProfile, generateConversationTitle } from '@/src/services';
import settingsMenuIcon from '@/assets/profile-menu/settings.svg';
import languageMenuIcon from '@/assets/profile-menu/language.svg';
import chevronRightIcon from '@/assets/profile-menu/chevron-right.svg';
import helpMenuIcon from '@/assets/profile-menu/help.svg';
import upgradeMenuIcon from '@/assets/profile-menu/upgrade.svg';
import extensionsMenuIcon from '@/assets/profile-menu/extensions.svg';
import giftMenuIcon from '@/assets/profile-menu/gift.svg';
import infoMenuIcon from '@/assets/profile-menu/info.svg';
import logoutMenuIcon from '@/assets/profile-menu/logout.svg';

import SearchModal from '@/src/components/SearchModal';
import { installDesktopUpdate, onDesktopUpdateStatus, openDesktopExternal } from '@/src/desktop';

interface SidebarProps {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  refreshTrigger: number;
  onNewChatClick?: () => void;
  onOpenSettings?: () => void;
  onOpenUpgrade?: () => void;
  onCloseOverlays?: () => void;
  tunerConfig?: any;
  setTunerConfig?: (config: any) => void;
}

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newTitle: string) => void;
  initialTitle: string;
}

const RenameModal = ({ isOpen, onClose, onSave, initialTitle }: RenameModalProps) => {
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      // Focus and select all text after a short delay to ensure modal is rendered
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, initialTitle]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-claude-input rounded-2xl shadow-xl w-[400px] p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-[18px] font-semibold text-claude-text mb-4">Rename chat</h3>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (title.trim()) onSave(title.trim());
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          className="w-full px-3 py-2 bg-transparent border border-claude-border rounded-lg text-claude-text focus:outline-none focus:border-blue-500 mb-6 text-[15px]"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[14px] font-medium text-claude-text hover:bg-claude-hover rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (title.trim()) onSave(title.trim());
            }}
            disabled={!title.trim()}
            className="px-4 py-2 text-[14px] font-medium text-white bg-[#333333] hover:bg-[#1a1a1a] dark:bg-[#FFFFFF] dark:text-black dark:hover:bg-[#e5e5e5] rounded-lg transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const Sidebar = ({ isCollapsed, toggleSidebar, refreshTrigger, onNewChatClick, onOpenSettings, onOpenUpgrade, onCloseOverlays, tunerConfig, setTunerConfig }: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const codeJumpUrl = ((import.meta as any).env?.VITE_CODE_JUMP_URL || '/code/').trim();
  const [chats, setChats] = useState<any[]>([]);
  const [activeMenuIndex, setActiveMenuIndex] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number, left: number } | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const [renameInitialTitle, setRenameInitialTitle] = useState('');
  const [userUser, setUserUser] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState<{ bottom: number; left: number } | null>(null);
  const [planLabel, setPlanLabel] = useState('Free plan');
  const [usageData, setUsageData] = useState<{ token_used: number; token_quota: number } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isRecentsCollapsed, setIsRecentsCollapsed] = useState(false);
  const [isNewChatAnimating, setIsNewChatAnimating] = useState(false);
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());
  const [updateStatus, setUpdateStatus] = useState<{ type: string; version?: string; percent?: number } | null>(null);

  // Listen for streaming state changes. When a stream JUST ended (set size shrunk),
  // also refetch usage so the bottom-left progress bar reflects the new spend.
  // Remote API usage is recorded asynchronously; wait briefly before reading.
  useEffect(() => {
    let prevSize = getStreamingIds().size;
    const handler = () => {
      const newIds = new Set(getStreamingIds());
      setStreamingIds(newIds);
      if (newIds.size < prevSize) {
        setTimeout(() => fetchPlan(), 1500);
      }
      prevSize = newIds.size;
    };
    window.addEventListener('streaming-change', handler);
    return () => window.removeEventListener('streaming-change', handler);
  }, []);

  // Listen for auto-update events
  useEffect(() => {
    return onDesktopUpdateStatus((status: any) => setUpdateStatus(status));
  }, []);

  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userBtnRef = useRef<HTMLButtonElement>(null);

  // Map labels to the correct custom icon
  const getIcon = (label: string, size: number) => {
    const className = "text-[#121212] dark:text-claude-text transition-colors duration-200";
    switch (label) {
      case 'Chats': return <IconChatBubble size={size} className={className} />;
      case 'Projects': return <IconProjects size={size} className={className} />;
      case 'Artifacts': return <IconArtifactsExact size={size} className={className} />;
      case 'Code': return <IconCode size={size} className={className} />;
      default: return <IconChatBubble size={size} className={className} />;
    }
  };

  const isCoworkSection = location.pathname.startsWith('/cowork') || location.pathname === '/scheduled';
  const isCodeSection = location.pathname.startsWith('/code');
  const conversationPath = (id: string) => isCoworkSection ? `/cowork/${id}` : isCodeSection ? `/code/${id}` : `/chat/${id}`;
  const projectsPath = isCoworkSection ? '/cowork/projects' : isCodeSection ? '/code/projects' : '/projects';
  const customizePath = isCoworkSection ? '/cowork/customize' : isCodeSection ? '/code/customize' : '/customize';

  const handleNewChat = () => {
    setIsNewChatAnimating(true);
    setTimeout(() => setIsNewChatAnimating(false), 300);
    if (onNewChatClick) onNewChatClick();
    navigate(isCoworkSection ? '/cowork' : isCodeSection ? '/code' : '/');
  };

  const updateTuner = (key: string, value: number) => {
    if (setTunerConfig && tunerConfig) {
      setTunerConfig({ ...tunerConfig, [key]: value });
    }
  };

  const handleNavClick = (label: string) => {
    if (label === 'Chats') {
      navigate('/chats');
      return;
    }
    if (label === 'Projects') {
      navigate(projectsPath);
      return;
    }
    if (label === 'Artifacts') {
      navigate('/artifacts');
      return;
    }
    if (label === 'Code') {
      // Disabled temporarily
      return;
    }
  };

  useEffect(() => {
    setUserUser(getUser());
    fetchChats();
    fetchPlan();
    getUserProfile().then((data: any) => {
      const p = data?.user || data;
      if (p?.role === 'admin' || p?.role === 'superadmin') setIsAdmin(true);
      if (p?.nickname || p?.full_name) {
        setUserUser((prev: any) => ({ ...prev, ...p }));
      }
    }).catch(() => { });

    // 监听标题更新事件
    const handleTitleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string; title?: string }>;
      const id = customEvent.detail?.id;
      const title = customEvent.detail?.title;
      if (id && title) {
        setChats(prev => prev.map(chat => chat.id === id ? { ...chat, title } : chat));
        return;
      }
      console.log('[Sidebar] Title update event received, fetching conversations...');
      fetchChats();
    };

    // 监听用户资料更新事件
    const handleProfileUpdate = () => {
      setUserUser(getUser());
      getUserProfile().then((data: any) => {
        const p = data?.user || data;
        if (p?.role === 'admin' || p?.role === 'superadmin') setIsAdmin(true);
        if (p?.nickname || p?.full_name) {
          setUserUser((prev: any) => ({ ...prev, ...p }));
        }
      }).catch(() => { });
    };

    window.addEventListener('conversationTitleUpdated', handleTitleUpdate);
    window.addEventListener('userProfileUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('conversationTitleUpdated', handleTitleUpdate);
      window.removeEventListener('userProfileUpdated', handleProfileUpdate);
    };
  }, [refreshTrigger]);

  useEffect(() => {
    const handleOpenSearch = () => setShowSearch(true);
    window.addEventListener('openSidebarSearch', handleOpenSearch);
    return () => window.removeEventListener('openSidebarSearch', handleOpenSearch);
  }, []);

  const fetchChats = async () => {
    try {
      const data = await getConversations();
      console.log('[Sidebar] Fetched conversations:', data);
      if (Array.isArray(data)) {
        setChats(data);
      }
    } catch (e) {
      console.error("Failed to fetch chats", e);
    }
  };

  const fetchPlan = async () => {
    try {
      const data = await getUserUsage();
      setUsageData({
        token_used: Number(data?.token_used) || 0,
        token_quota: Number(data?.token_quota) || 0,
      });
      if (data.plan && data.plan.name) {
        const nameMap: Record<string, string> = {
          '体验包': 'Trail plan',
          '基础月卡': 'Pro plan',
          '专业月卡': 'Max x5 plan',
          '尊享月卡': 'Max x20 plan',
        };
        setPlanLabel(nameMap[data.plan.name] || data.plan.name);
      } else {
        setPlanLabel('Free plan');
      }
    } catch (e) {
      // 获取失败保持默认
    }
  };

  const handleRenameClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (chats[index]) {
      setRenameChatId(chats[index].id);
      setRenameInitialTitle(chats[index].title || 'New Chat');
      setShowRenameModal(true);
    }
    setActiveMenuIndex(null);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!renameChatId) return;

    try {
      // Optimistic update
      setChats(chats.map(c => c.id === renameChatId ? { ...c, title: newTitle } : c));
      await updateConversation(renameChatId, { title: newTitle });

      // Notify other components (like Header) about the title change if it's the active chat
      if (location.pathname === conversationPath(renameChatId)) {
        window.dispatchEvent(new CustomEvent('conversationTitleUpdated'));
      }
    } catch (err) {
      console.error('Failed to rename chat:', err);
      // Revert on failure
      fetchChats();
    }
    setShowRenameModal(false);
    setRenameChatId(null);
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setChats(chats.filter(c => c.id !== id));
      setActiveMenuIndex(null);
      if (location.pathname === conversationPath(id)) {
        navigate(isCoworkSection ? '/cowork' : isCodeSection ? '/code' : '/');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateTitle = async (id: string) => {
    try {
      const result = await generateConversationTitle(id);
      if (result?.title) {
        setChats(prev => prev.map(chat => chat.id === id ? { ...chat, title: result.title } : chat));
        window.dispatchEvent(new CustomEvent('conversationTitleUpdated', {
          detail: { id, title: result.title }
        }));
      }
    } catch (err) {
      console.error('Failed to generate title:', err);
    }
    setActiveMenuIndex(null);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 忽略用户按钮本身的点击（由按钮 onClick 处理）
      if (userBtnRef.current && userBtnRef.current.contains(event.target as Node)) {
        return;
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuIndex(null);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    // Close on scroll
    const handleScroll = () => {
      if (activeMenuIndex !== null) setActiveMenuIndex(null);
      if (showUserMenu) setShowUserMenu(false);
    };

    if (activeMenuIndex !== null || showUserMenu) {
      document.addEventListener('click', handleClickOutside);
      // Attach scroll listener to the sidebar scroll container
      const scrollEl = scrollRef.current;
      scrollEl?.addEventListener('scroll', handleScroll);
      window.addEventListener('resize', handleScroll);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      const scrollEl = scrollRef.current;
      scrollEl?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [activeMenuIndex, showUserMenu]);

  const handleMenuClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();

    if (activeMenuIndex === index) {
      setActiveMenuIndex(null);
      return;
    }

    const button = e.currentTarget as HTMLElement;
    const buttonRect = button.getBoundingClientRect();
    const parentElement = button.parentElement;

    let leftPos = buttonRect.right - 200; // Fallback to button alignment

    if (parentElement) {
      const parentRect = parentElement.getBoundingClientRect();
      // Align right edge of menu (200px wide) with the right edge of the chat item container
      leftPos = parentRect.right - 200;
    }

    const menuHeight = 120; // Approximate height of the menu
    let topPos = buttonRect.bottom + 4;

    // Check if menu would overflow bottom of viewport
    if (topPos + menuHeight > window.innerHeight) {
      // Position above the button instead
      topPos = buttonRect.top - menuHeight - 4;
    }

    setMenuPosition({
      top: topPos,
      left: leftPos,
    });
    setActiveMenuIndex(index);
  };

  const openExternalUrl = (url: string) => {
    openDesktopExternal(url).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  const closeUserMenu = () => setShowUserMenu(false);
  const toggleUserMenu = () => {
    if (!showUserMenu && userBtnRef.current) {
      const rect = userBtnRef.current.getBoundingClientRect();
      setUserMenuPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
    }
    setShowUserMenu(!showUserMenu);
  };
  const standardSidebarWidth = `${tunerConfig?.sidebarWidth || 280}px`;
  const sidebarWidth = isCollapsed ? '46px' : standardSidebarWidth;

  const profileMenuSections = [
    [
      {
        key: 'settings',
        label: 'Settings',
        icon: settingsMenuIcon,
        rightText: '⇧⌘,',
        onClick: () => {
          closeUserMenu();
          onOpenSettings?.();
        },
      },
      {
        key: 'language',
        label: 'Language',
        icon: languageMenuIcon,
        trailingChevron: true,
        onClick: () => {
          closeUserMenu();
          onOpenSettings?.();
        },
      },
      {
        key: 'help',
        label: 'Get help',
        icon: helpMenuIcon,
        onClick: () => {
          closeUserMenu();
          setShowHelpModal(true);
        },
      },
    ],
    [
      {
        key: 'upgrade',
        label: 'Upgrade plan',
        icon: upgradeMenuIcon,
        onClick: () => {
          closeUserMenu();
          onOpenUpgrade?.();
        },
      },
      {
        key: 'extensions',
        label: 'Get apps and extensions',
        icon: extensionsMenuIcon,
        onClick: () => {
          closeUserMenu();
          navigate(customizePath);
        },
      },
      {
        key: 'gift',
        label: 'Gift Claude',
        icon: giftMenuIcon,
        onClick: () => {
          closeUserMenu();
          openExternalUrl('https://claude.ai');
        },
      },
      {
        key: 'learn-more',
        label: 'Learn more',
        icon: infoMenuIcon,
        trailingChevron: true,
        onClick: () => {
          closeUserMenu();
          openExternalUrl('https://www.anthropic.com/claude');
        },
      },
    ],
    [
      {
        key: 'logout',
        label: 'Log out',
        icon: logoutMenuIcon,
        onClick: () => {
          closeUserMenu();
          setShowLogoutConfirm(true);
        },
      },
    ],
  ];

  return (
    <>
      <div
        className={`
          h-screen bg-claude-sidebar border-r border-claude-border flex-shrink-0 text-claude-text antialiased flex flex-col transition-all duration-200 ease-in-out overflow-hidden relative
        `}
        style={{
          width: sidebarWidth,
        }}
      >
        <>
        {/* New Chat - Fixed */}
        <div
          className="flex-shrink-0"
          style={{
            marginTop: isCollapsed ? '58px' : '52px',
            paddingLeft: '9px',
            paddingRight: '9px',
            marginBottom: '2px'
          }}
        >
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-start text-claude-text hover:bg-claude-hover rounded-lg transition-colors group overflow-hidden whitespace-nowrap"
            style={{
              paddingTop: '2px',
              paddingBottom: '2px',
              paddingLeft: '0px',
              gap: '8px'
            }}
          >
            <div className={`text-claude-text flex-shrink-0 flex items-center justify-center`} style={{ width: '20px', height: '20px' }}>
              {isCoworkSection ? (
                <img
                  src={coworkNewTaskIcon}
                  alt=""
                  width={16}
                  height={16}
                  className={`dark:invert transition-all duration-200 group-hover:brightness-90 ${isNewChatAnimating ? "rotate-90 scale-100" : "group-hover:scale-110 group-hover:-rotate-3"}`}
                />
              ) : isCodeSection ? (
                <IconPlusCircle
                  size={27}
                  className={`transition-all duration-200 group-hover:brightness-90 ${isNewChatAnimating ? "rotate-90 scale-100" : "group-hover:scale-110 group-hover:-rotate-3"}`}
                />
              ) : (
                <IconPlusCircle
                  size={27}
                  className={`transition-all duration-200 group-hover:brightness-90 ${isNewChatAnimating ? "rotate-90 scale-100" : "group-hover:scale-110 group-hover:-rotate-3"}`}
                />
              )}
            </div>
            <span
              className={`leading-none transition-opacity duration-200 text-left ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 block'}`}
              style={{ fontSize: '14px', fontWeight: 400 }}
            >
              {isCoworkSection ? 'New task' : isCodeSection ? 'New session' : 'New chat'}
            </span>
          </button>
        </div>

        {/* Search - Fixed */}
        <div
          className="flex-shrink-0"
          style={{
            marginTop: '2px',
            paddingLeft: '9px',
            paddingRight: '9px',
            marginBottom: '2px'
          }}
        >
          <button
            onClick={() => setShowSearch(true)}
            className="w-full flex items-center justify-start text-claude-text hover:bg-claude-hover rounded-lg transition-colors group overflow-hidden whitespace-nowrap"
            style={{
              paddingTop: '2px',
              paddingBottom: '2px',
              paddingLeft: '0px',
              gap: '8px'
            }}
          >
            <div className={`text-claude-text flex-shrink-0 flex items-center justify-center`} style={{ width: '27px', height: '27px' }}>
              <img
                src={searchIconImg}
                alt="Search"
                style={{ width: '16px', height: '16px' }}
                className="object-contain dark:invert transition-[filter] duration-200"
              />
            </div>
            <span
              className={`leading-none transition-opacity duration-200 text-left ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 block'}`}
              style={{ fontSize: '14px', fontWeight: 400 }}
            >
              Search
            </span>
          </button>
        </div>

        {/* Customize - Fixed */}
        <div
          className="flex-shrink-0"
          style={{
            marginTop: '2px',
            paddingLeft: '9px',
            paddingRight: '9px',
            marginBottom: '16px'
          }}
        >
          <button
            onClick={() => navigate(customizePath)}
            className={`w-full flex items-center justify-start text-claude-text hover:bg-claude-hover rounded-lg transition-colors group overflow-hidden whitespace-nowrap ${location.pathname === customizePath ? 'bg-claude-hover' : ''}`}
            style={{
              paddingTop: '2px',
              paddingBottom: '2px',
              paddingLeft: '0px',
              gap: '8px'
            }}
          >
            <div className={`text-claude-text flex-shrink-0 flex items-center justify-center`} style={{ width: '27px', height: '27px' }}>
              <img
                src={customizeIconImg}
                alt="Customize"
                style={{ width: '24px', height: '24px' }}
                className="object-contain dark:invert transition-all duration-200 group-hover:brightness-90 group-hover:scale-110 group-hover:-rotate-3 group-active:rotate-12 group-active:scale-90"
              />
            </div>
            <span
              className={`leading-none transition-opacity duration-200 text-left ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 block'}`}
              style={{ fontSize: '14px', fontWeight: 400 }}
            >
              Customize
            </span>
          </button>
        </div>

        {/* Scrollable Area containing Nav and Recents */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto sidebar-scroll min-h-0 pb-6"
          style={{
            paddingLeft: '9px',
            paddingRight: '9px',
            paddingTop: '0px'
          }}
        >

          {/* Navigation Links */}
          <nav className="space-y-px mb-6">
            {(isCoworkSection
              ? [
                  { label: 'Projects', icon: <img src={figmaProjectsIcon} alt="" width={18} height={17} className="dark:invert transition-[filter] duration-200" />, onClick: () => navigate(projectsPath), active: location.pathname === projectsPath },
                  { label: 'Scheduled', icon: <img src={figmaScheduledIcon} alt="" width={18} height={18} className="dark:invert transition-[filter] duration-200" />, onClick: () => navigate('/scheduled'), active: location.pathname === '/scheduled' },
                  { label: 'Customize', icon: <img src={figmaCustomizeIcon} alt="" width={18} height={16} className="dark:invert transition-[filter] duration-200" />, onClick: () => navigate(customizePath), active: location.pathname === customizePath },
                  { label: 'Dispatch', icon: <img src={figmaDispatchIcon} alt="" width={12} height={18} className="dark:invert transition-[filter] duration-200" />, onClick: undefined, active: false },
                ]
              : NAV_ITEMS.map((item) => ({
                  label: item.label,
                  icon: <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-[#121212] transition-colors">{getIcon(item.label, 20)}</div>,
                  onClick: () => handleNavClick(item.label),
                  active: (location.pathname === '/chats' && item.label === 'Chats') || (location.pathname === projectsPath && item.label === 'Projects') || (location.pathname === '/artifacts' && item.label === 'Artifacts'),
                }))
            ).map((item) => (
              <button
                key={item.label}
                onClick={item.onClick}
                disabled={!item.onClick}
                className={`group flex h-8 w-full items-center justify-start overflow-hidden whitespace-nowrap rounded-[6px] text-[#373734] dark:text-claude-text transition-colors hover:bg-claude-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${item.active ? 'bg-claude-hover' : ''}`}
                style={{
                  columnGap: '12px',
                  fontFamily: '"Anthropic Sans", "Figtree", sans-serif',
                  fontWeight: 400,
                  paddingLeft: '8px',
                  paddingRight: '8px'
                }}
              >
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-[#121212] dark:text-claude-text transition-colors">
                  {item.icon}
                </div>
                <span
                  className={`leading-none transition-opacity duration-200 text-left ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 block'}`}
                  style={{
                    fontFamily: '"Anthropic Sans", "Figtree", sans-serif',
                    fontSize: '14px',
                    letterSpacing: '-0.1504px',
                    lineHeight: '20px'
                  }}
                >
                  {item.label}
                </span>
              </button>
            ))}
          </nav>

          {/* Cowork: Pinned section */}
          {isCoworkSection && !isCollapsed && (
            <div className="mb-4">
              <div
                className="flex items-center gap-2 px-3 pb-2 select-none"
                style={{ paddingLeft: `${tunerConfig?.recentsPl || 12}px`, paddingRight: '12px' }}
              >
                <span className="text-[13px] font-medium text-claude-textSecondary">Pinned</span>
              </div>
              <button
                type="button"
                disabled
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-claude-textSecondary/70 cursor-not-allowed"
                style={{ paddingLeft: `${tunerConfig?.recentsPl || 12}px` }}
              >
                <Pin size={14} strokeWidth={1.6} />
                <span>Drag to pin</span>
              </button>
            </div>
          )}

          {/* Recents Section Header */}
          <div
            className={`group flex items-center gap-3 px-3 pb-2 transition-opacity duration-200 select-none ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}
            style={{
              marginTop: `${tunerConfig?.recentsMt || 0}px`,
              paddingLeft: `${tunerConfig?.recentsPl || 12}px`,
              paddingRight: '12px'
            }}
          >
            <span className="text-[13px] font-medium text-claude-textSecondary">
              {isCoworkSection ? 'Recent tasks' : isCodeSection ? 'Recent sessions' : 'Recents'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsRecentsCollapsed(!isRecentsCollapsed);
              }}
              className="text-[13px] font-medium text-claude-textSecondary opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity cursor-pointer outline-none"
            >
              {isRecentsCollapsed ? 'Show' : 'Hide'}
            </button>
          </div>

          {/* Recents List */}
          <div className={`space-y-0.5 pb-2 transition-all duration-200 ${isCollapsed || isRecentsCollapsed ? 'opacity-0 hidden h-0 overflow-hidden' : 'opacity-100'}`}>
            {chats.slice(0, 30).map((chat, index) => {
              const chatPath = conversationPath(chat.id);
              const isActive = location.pathname === chatPath;
              return (
                <div
                  key={chat.id}
                  onClick={() => { onCloseOverlays?.(); navigate(chatPath); }}
                  className={`
                    relative group flex items-center w-full rounded-lg transition-colors cursor-pointer min-h-[32px]
                    ${isActive || activeMenuIndex === index ? 'bg-claude-hover' : 'hover:bg-claude-hover'}
                  `}
                  style={{
                    paddingTop: `${tunerConfig?.recentsItemPy || 6}px`,
                    paddingBottom: `${tunerConfig?.recentsItemPy || 6}px`,
                    paddingLeft: `${tunerConfig?.recentsPl || 12}px`,
                    paddingRight: `${tunerConfig?.recentsPl || 12}px`
                  }}
                >
                  <span className="mr-2 flex h-5 w-5 flex-shrink-0 items-center justify-center">
                    <img
                      alt=""
                      className={`h-[14px] w-[14px] object-contain opacity-70 dark:invert dark:brightness-[0.82] ${streamingIds.has(chat.id) ? 'animate-spin' : ''}`}
                      src={recentConversationRingIcon}
                      style={streamingIds.has(chat.id) ? { animationDuration: '2.4s' } : undefined}
                    />
                  </span>
                  {/* Chat Title */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div
                      className="text-claude-text truncate leading-snug"
                      style={{ fontSize: `${tunerConfig?.recentsFontSize || 13}px` }}
                    >
                      {chat.title || 'New Chat'}
                    </div>
                    {chat.project_name && (
                      <div className="text-[11px] text-claude-textSecondary truncate leading-snug mt-0.5 opacity-60">
                        {chat.project_name}
                      </div>
                    )}
                  </div>

                  {/* Three Dots Button */}
                  <button
                    onClick={(e) => handleMenuClick(e, index)}
                    className={`
                      absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-opacity duration-150 z-10
                      text-claude-textSecondary hover:text-claude-text hover:bg-claude-hover
                      ${activeMenuIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                    `}
                    style={{ transform: 'translateY(-50%)' }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.transform = 'translateY(-50%) scale(0.95)';
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = 'translateY(-50%)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(-50%)';
                    }}
                  >
                    <IconDotsHorizontal size={16} />
                  </button>
                </div>
              );
            })}
            {chats.length > 30 && (
              <button
                onClick={() => { onCloseOverlays?.(); navigate('/chats'); }}
                className="w-full flex items-center gap-2 rounded-lg hover:bg-claude-hover transition-colors text-claude-textSecondary hover:text-claude-text"
                style={{
                  paddingTop: `${tunerConfig?.recentsItemPy || 6}px`,
                  paddingBottom: `${tunerConfig?.recentsItemPy || 6}px`,
                  paddingLeft: `${tunerConfig?.recentsPl || 12}px`,
                }}
              >
                <IconDotsHorizontal size={18} className="opacity-60" />
                <span style={{ fontSize: `${tunerConfig?.recentsFontSize || 13}px` }} className="leading-tight">All chats</span>
              </button>
            )}
          </div>

        </div>

        {/* Update status banner */}
        {updateStatus && !isCollapsed && (updateStatus.type === 'available' || updateStatus.type === 'progress' || updateStatus.type === 'downloaded') && (
          <div className="mx-3 mb-2 mt-auto">
            {(updateStatus.type === 'available' || updateStatus.type === 'progress') && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-claude-hover">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-claude-textSecondary flex-shrink-0 animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-claude-textSecondary leading-tight">
                    Downloading update...{updateStatus.percent != null ? ` ${updateStatus.percent}%` : ''}
                  </div>
                  {updateStatus.percent != null && (
                    <div className="mt-1.5 h-[3px] rounded-full bg-claude-border overflow-hidden">
                      <div className="h-full rounded-full bg-claude-textSecondary transition-all duration-300" style={{ width: `${updateStatus.percent}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )}
            {updateStatus.type === 'downloaded' && (
              <div className="px-3 py-3 rounded-lg bg-claude-hover">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-claude-text flex-shrink-0">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <div className="text-[13px] text-claude-text font-medium leading-tight">Updated to {updateStatus.version}</div>
                </div>
                <div className="text-[11.5px] text-claude-textSecondary mb-2.5 ml-6">Relaunch to apply</div>
                <button
                  onClick={() => { installDesktopUpdate().catch(() => {}); }}
                  className="w-full px-3 py-1.5 rounded-md bg-claude-bg border border-claude-border text-[13px] text-claude-text font-medium hover:bg-claude-btnHover transition-colors"
                >
                  Relaunch
                </button>
              </div>
            )}
          </div>
        )}

        {/* User Profile Footer */}
        <div
          className={`${!updateStatus || isCollapsed || (updateStatus.type !== 'available' && updateStatus.type !== 'progress' && updateStatus.type !== 'downloaded') ? 'mt-auto' : ''} border-t border-claude-border flex-shrink-0 relative transition-all duration-200`}
          style={{
            paddingTop: `${tunerConfig?.profilePy || 12}px`,
            paddingBottom: `${tunerConfig?.profilePy || 12}px`,
            paddingLeft: isCollapsed ? '0px' : `${tunerConfig?.profilePx || 12}px`,
            paddingRight: isCollapsed ? '0px' : `${tunerConfig?.profilePx || 12}px`,
          }}
        >
          <button
            ref={userBtnRef}
            onClick={toggleUserMenu}
            className={`w-full flex items-center gap-2 hover:bg-claude-hover rounded-lg transition-all duration-200 overflow-hidden whitespace-nowrap`}
            style={{
              padding: isCollapsed ? '8px 0px 8px 5px' : '8px'
            }}
          >
            <div
              className="rounded-full bg-claude-avatar text-claude-avatarText flex items-center justify-center text-[15px] font-medium flex-shrink-0"
              style={{ width: `${tunerConfig?.userAvatarSize || 32}px`, height: `${tunerConfig?.userAvatarSize || 32}px` }}
            >
              {(userUser?.display_name || userUser?.full_name || userUser?.nickname || 'U').charAt(0).toUpperCase()}
            </div>
            <div className={`flex items-center justify-between w-full transition-opacity duration-200 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>
              <div className="text-left overflow-hidden flex-1 min-w-0">
                <div
                  className="font-medium text-claude-text leading-tight"
                  style={{ fontSize: `${tunerConfig?.userNameSize || 15}px`, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
                >
                  {userUser?.display_name || userUser?.full_name || userUser?.nickname || 'User'}
                </div>
                {true ? (
                  <div className="text-[13px] text-claude-textSecondary mt-1 leading-tight">Self-hosted</div>
                ) : usageData && usageData.token_quota > 0 ? (
                  <div className="mt-1.5 mr-3">
                    <div className="h-1 w-full rounded-full bg-claude-hover overflow-hidden">
                      <div
                        className="h-full bg-neutral-700 dark:bg-neutral-300 transition-[width] duration-300"
                        style={{ width: `${Math.min(100, (usageData.token_used / usageData.token_quota) * 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-claude-textSecondary mt-1 leading-none tabular-nums">
                      ${usageData.token_used.toFixed(2)} / ${usageData.token_quota.toFixed(2)}
                    </div>
                  </div>
                ) : (
                  <div className="text-[13px] text-claude-textSecondary mt-1 leading-tight">{planLabel}</div>
                )}
              </div>
              <ChevronUp size={16} className="text-claude-textSecondary shrink-0 ml-1" />
            </div>
          </button>
          </div>
        </>
      </div >

      {showUserMenu && userMenuPos && (
        <div
          ref={userMenuRef}
          className="fixed z-[70] w-[270px] overflow-hidden rounded-[12px] border border-[rgba(31,31,30,0.3)] dark:border-white/15 bg-white dark:bg-claude-input shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
          style={{
            bottom: `${userMenuPos.bottom}px`,
            left: `${userMenuPos.left}px`,
          }}
        >
          <div className="px-[14px] pb-[8px] pt-[10px]">
            <p className="truncate text-[12px] leading-[16.8px] text-[#7b7974] dark:text-claude-textSecondary">
              {userUser?.email || ''}
            </p>
          </div>

          {profileMenuSections.map((section, sectionIndex) => (
            <div key={`section-${sectionIndex}`}>
              {sectionIndex > 0 && (
                <div className="mx-[14px] h-px bg-[rgba(31,31,30,0.15)] dark:bg-white/10" />
              )}
              <div className="px-[6px] py-[6.5px]">
                {section.map((item) => (
                  <button
                    key={item.key}
                    onClick={item.onClick}
                    className="flex h-[32px] w-full items-center rounded-[8px] px-[8px] text-left transition-colors hover:bg-[#f5f4f1] dark:hover:bg-white/5"
                  >
                    <div className="mr-[8px] flex h-5 w-5 shrink-0 items-center justify-center">
                      <img src={item.icon} alt="" aria-hidden="true" className="h-5 w-5 dark:invert dark:brightness-200" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[14px] leading-5 tracking-[-0.1504px] text-[#373734] dark:text-claude-text">
                      {item.label}
                    </span>
                    {item.rightText && (
                      <span className="ml-2 text-[12px] leading-[16.8px] text-[#7b7974] dark:text-claude-textSecondary">
                        {item.rightText}
                      </span>
                    )}
                    {item.trailingChevron && (
                      <img src={chevronRightIcon} alt="" aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 dark:invert dark:brightness-150" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fixed Context Menu Portal */}
      {
        activeMenuIndex !== null && menuPosition && chats[activeMenuIndex] && (
          <div
            ref={menuRef}
            className="fixed z-50 bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] py-1.5 flex flex-col w-[200px]"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`
            }}
          >
            <button className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group">
              <IconStarOutline size={16} className="text-claude-textSecondary group-hover:text-claude-text" />
              <span className="text-[13px] text-claude-text">Star</span>
            </button>
            <button
              onClick={(e) => handleRenameClick(e, activeMenuIndex as number)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group"
            >
              <IconPencil size={16} className="text-claude-textSecondary group-hover:text-claude-text" />
              <span className="text-[13px] text-claude-text">Rename</span>
            </button>
            <button
              onClick={() => handleGenerateTitle(chats[activeMenuIndex].id)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group"
            >
              <Sparkles size={16} className="text-claude-textSecondary group-hover:text-claude-text" />
              <span className="text-[13px] text-claude-text">Generate title</span>
            </button>
            <div className="h-[1px] bg-claude-border my-1 mx-3" />
            <button
              onClick={(e) => handleDeleteChat(chats[activeMenuIndex].id, e)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group"
            >
              <IconTrash size={16} className="text-[#B9382C]" />
              <span className="text-[13px] text-[#B9382C]">Delete</span>
            </button>
          </div>
        )
      }
      {/* Fixed Layout Tuner (Removed) */}

      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        chats={chats}
      />

      {/* Rename Modal */}
      <RenameModal
        isOpen={showRenameModal}
        onClose={() => {
          setShowRenameModal(false);
          setRenameChatId(null);
        }}
        onSave={handleRenameSubmit}
        initialTitle={renameInitialTitle}
      />

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="bg-claude-input rounded-2xl shadow-xl w-[360px] p-6">
            <h3 className="text-[16px] font-semibold text-claude-text mb-2">确定退出登录？</h3>
            <p className="text-[14px] text-claude-textSecondary mb-6">此操作将清除您的登录状态。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-[13px] text-claude-text bg-claude-btn-hover hover:bg-claude-hover rounded-lg transition-colors"
              // Using btn-hover for light gray bg? 
              >
                取消
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); logout(); }}
                className="px-4 py-2 text-[13px] text-white bg-[#B9382C] hover:bg-[#A02E23] rounded-lg transition-colors"
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setShowHelpModal(false)}>
          <div
            className="bg-claude-input rounded-2xl shadow-xl w-[360px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-claude-text mb-2">售后支持</h3>
            <p className="text-[14px] text-claude-textSecondary mb-3">售后 QQ 群号：</p>
            <div className="px-4 py-3 mb-6 rounded-xl bg-claude-btn-hover text-[20px] font-semibold tracking-wide text-claude-text text-center select-all">
              1083610043
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 text-[13px] text-claude-text bg-claude-btn-hover hover:bg-claude-hover rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
