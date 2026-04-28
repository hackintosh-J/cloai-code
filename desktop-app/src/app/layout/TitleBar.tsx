import React from 'react';
import { ArrowLeft, ArrowRight, Menu } from 'lucide-react';
import { IconSidebarToggle } from '../../components/Icons';
import type { AppMode } from '../types';
import ModeTabs from './ModeTabs';
import Tooltip from './Tooltip';

const TitleBar = ({
  pathname,
  titleBarHeight,
  isMac,
  isSidebarCollapsed,
  canGoBack,
  canGoForward,
  onToggleSidebar,
  onNavBack,
  onNavForward,
  onSelectMode,
}: {
  pathname: string;
  titleBarHeight: number;
  isMac: boolean;
  isSidebarCollapsed: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onToggleSidebar: () => void;
  onNavBack: () => void;
  onNavForward: () => void;
  onSelectMode: (mode: AppMode) => void;
}) => {
  return (
    <div
      className="absolute top-0 left-0 w-full z-50 flex items-center select-none pointer-events-none bg-claude-bg border-b border-claude-border transition-all duration-300"
      style={{ WebkitAppRegion: 'drag', height: `${titleBarHeight}px` } as React.CSSProperties}
    >
      {/* Left Controls inside Title Bar — extra padding on Mac for traffic lights */}
      <div
        className="h-full flex items-center pr-2 gap-0.5"
        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag', paddingLeft: isMac ? '78px' : '4px' } as React.CSSProperties}
      >
        <Tooltip text="Menu">
          <button
            onClick={() => { }}
            className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-md text-claude-textSecondary hover:text-claude-text transition-colors"
          >
            <Menu size={18} className="opacity-80" />
          </button>
        </Tooltip>
        <Tooltip text={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <button
            onClick={onToggleSidebar}
            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-md text-claude-textSecondary hover:text-claude-text transition-colors"
          >
            <IconSidebarToggle size={26} className="dark:invert transition-[filter] duration-200" />
          </button>
        </Tooltip>
        {canGoBack ? (
          <Tooltip text="Back">
            <button
              onClick={onNavBack}
              className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: '#73726C' }}
            >
              <ArrowLeft size={16} strokeWidth={1.5} />
            </button>
          </Tooltip>
        ) : (
          <span className="p-1.5" style={{ color: '#B7B5B0' }}>
            <ArrowLeft size={16} strokeWidth={1.5} />
          </span>
        )}
        {canGoForward ? (
          <Tooltip text="Forward">
            <button
              onClick={onNavForward}
              className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: '#73726C' }}
            >
              <ArrowRight size={16} strokeWidth={1.5} />
            </button>
          </Tooltip>
        ) : (
          <span className="p-1.5" style={{ color: '#B7B5B0' }}>
            <ArrowRight size={16} strokeWidth={1.5} />
          </span>
        )}
      </div>

      <ModeTabs pathname={pathname} onSelect={onSelectMode} />
    </div>
  );
};

export default TitleBar;
