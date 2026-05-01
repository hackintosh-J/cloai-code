import React from 'react';
import type { AppMode } from '../types';

const ModeTabs = ({
  pathname,
  onSelect,
}: {
  pathname: string;
  onSelect: (mode: AppMode) => void;
}) => {
  const currentMode: AppMode =
    pathname.startsWith('/code')
        ? 'code'
        : 'chat';

  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 mode-tabs-container"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="flex items-center rounded-full border border-claude-border bg-claude-bg/95 p-1 shadow-sm backdrop-blur transition-all duration-300">
        {(['chat', 'code'] as const).map((mode) => {
          const active = currentMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium capitalize transition-all duration-200 ${
                active ? 'bg-claude-hover text-claude-text scale-105' : 'text-claude-textSecondary hover:text-claude-text hover:scale-102'
              }`}
            >
              {mode}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ModeTabs;
