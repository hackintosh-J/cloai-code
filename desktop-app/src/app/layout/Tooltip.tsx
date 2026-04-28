import React, { useState } from 'react';

const Tooltip = ({ children, text, shortcut }: { children: React.ReactNode; text: string; shortcut?: string }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-[200] pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap bg-[#2a2a2a] text-white dark:bg-[#e8e8e8] dark:text-[#1a1a1a] shadow-lg">
            <span>{text}</span>
            {shortcut && <span className="opacity-60 text-[11px]">{shortcut}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tooltip;
