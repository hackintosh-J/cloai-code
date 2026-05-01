import React from 'react';
import { IconSidebarToggle } from '../../components/Icons';
import type { AppMode } from '../types';
import ModeTabs from './ModeTabs';
import Tooltip from './Tooltip';
import WindowControls from './WindowControls';

const TitleBar = ({
  pathname,
  titleBarHeight,
  isMac,
  isSidebarCollapsed,
  onToggleSidebar,
  onSelectMode,
}: {
  pathname: string;
  titleBarHeight: number;
  isMac: boolean;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onSelectMode: (mode: AppMode) => void;
}) => {
  return (
    <div
      className="absolute top-0 left-0 w-full z-50 flex items-center select-none pointer-events-none bg-transparent transition-all duration-300"
      style={{ WebkitAppRegion: 'drag', height: `${titleBarHeight}px` } as React.CSSProperties}
    >
      {/* Left Controls inside Title Bar — extra padding on Mac for traffic lights */}
      <div
        className="h-full flex items-center pr-2"
        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag', paddingLeft: isMac ? '78px' : '7px' } as React.CSSProperties}
      >
        <Tooltip text={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <button
            onClick={onToggleSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-md text-claude-textSecondary transition-colors hover:bg-black/5 hover:text-claude-text dark:hover:bg-white/5"
          >
            <IconSidebarToggle size={24} className="dark:invert transition-[filter] duration-200" />
          </button>
        </Tooltip>
      </div>

      <ModeTabs pathname={pathname} onSelect={onSelectMode} />

      <div
        id="code-titlebar-toolbar"
        className={`${pathname.startsWith('/code') ? 'flex' : 'hidden'} h-full min-w-0 flex-1 items-center justify-end gap-2 px-2`}
        style={{ pointerEvents: 'auto', WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {!isMac && <WindowControls />}
    </div>
  );
};

export default TitleBar;
