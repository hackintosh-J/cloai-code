import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

const handleWindowAction = (action: 'minimize' | 'maximize' | 'close') => {
  const appWindow = getCurrentWindow();
  if (action === 'minimize') {
    appWindow.minimize().catch(() => {});
    return;
  }
  if (action === 'maximize') {
    appWindow.toggleMaximize().catch(() => {});
    return;
  }
  appWindow.close().catch(() => {});
};

const WindowControls = () => (
  <div
    className="ml-auto flex h-full items-stretch pointer-events-auto"
    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
  >
    <button
      type="button"
      aria-label="Minimize"
      onClick={() => handleWindowAction('minimize')}
      className="flex h-full w-[46px] items-center justify-center text-claude-textSecondary transition-colors hover:bg-black/5 hover:text-claude-text dark:hover:bg-white/5"
    >
      <Minus size={15} strokeWidth={1.8} />
    </button>
    <button
      type="button"
      aria-label="Maximize"
      onClick={() => handleWindowAction('maximize')}
      className="flex h-full w-[46px] items-center justify-center text-claude-textSecondary transition-colors hover:bg-black/5 hover:text-claude-text dark:hover:bg-white/5"
    >
      <Square size={13} strokeWidth={1.8} />
    </button>
    <button
      type="button"
      aria-label="Close"
      onClick={() => handleWindowAction('close')}
      className="flex h-full w-[46px] items-center justify-center text-claude-textSecondary transition-colors hover:bg-[#d92d20] hover:text-white"
    >
      <X size={16} strokeWidth={1.9} />
    </button>
  </div>
);

export default WindowControls;
