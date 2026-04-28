import React, { useEffect, useMemo, useState } from 'react';
import { X, type LucideIcon } from 'lucide-react';

export interface StarterIdeaItem {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
}

export interface StarterIdeaSection {
  id: string;
  label: string;
  items: StarterIdeaItem[];
}

export interface StarterIdeasExtraPanel {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface StarterIdeasAccordionProps {
  sections: StarterIdeaSection[];
  onSelectPrompt: (prompt: string) => void;
  extraPanels?: StarterIdeasExtraPanel[];
  className?: string;
}

const StarterIdeasAccordion: React.FC<StarterIdeasAccordionProps> = ({
  sections,
  onSelectPrompt,
  extraPanels = [],
  className = '',
}) => {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeSectionId) ?? null,
    [activeSectionId, sections]
  );

  const activeExtraPanel = useMemo(
    () => extraPanels.find((panel) => panel.id === activeSectionId) ?? null,
    [activeSectionId, extraPanels]
  );

  useEffect(() => {
    if (
      activeSectionId &&
      !sections.some((section) => section.id === activeSectionId) &&
      !extraPanels.some((panel) => panel.id === activeSectionId)
    ) {
      setActiveSectionId(null);
    }
  }, [activeSectionId, extraPanels, sections]);

  return (
    <div className={className}>
      {(activeSection || activeExtraPanel) && (
        <div className="mb-[12px] overflow-hidden rounded-[16px] border border-[rgba(31,31,30,0.15)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:border-claude-border dark:bg-claude-input">
          <div className="flex items-center justify-between px-[16px] py-[12px]">
            <span className="text-[14px] leading-[19.6px] tracking-[-0.1504px] text-[#605E5A] dark:text-claude-textSecondary">
              {activeSection?.label || activeExtraPanel?.label}
            </span>
            <button
              type="button"
              onClick={() => setActiveSectionId(null)}
              className="flex h-[20px] w-[20px] items-center justify-center rounded-full text-[#7B7974] transition-colors hover:bg-[#f5f4f1] hover:text-[#373734] dark:text-claude-textSecondary dark:hover:bg-white/5 dark:hover:text-claude-text"
              aria-label={`Close ${(activeSection?.label || activeExtraPanel?.label) ?? 'panel'}`}
            >
              <X size={14} />
            </button>
          </div>
          <div className="border-t border-[rgba(31,31,30,0.12)] dark:border-white/10" />
          {activeSection ? (
            <div className="flex flex-col">
              {activeSection.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveSectionId(null);
                      onSelectPrompt(item.prompt);
                    }}
                    className={`flex items-start gap-[12px] px-[16px] py-[12px] text-left transition-colors hover:bg-[#f8f7f4] dark:hover:bg-white/5 ${
                      index < activeSection.items.length - 1 ? 'border-b border-[rgba(31,31,30,0.12)] dark:border-white/10' : ''
                    }`}
                  >
                    <div className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#f3f0ea] text-[#615A4F] dark:bg-[#2A2622] dark:text-[#E6DDD2]">
                      <Icon size={15} strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium leading-[19.6px] tracking-[-0.1504px] text-[#373734] dark:text-claude-text">
                        {item.title}
                      </div>
                      <div className="mt-[2px] text-[12.5px] leading-[18px] text-[#7B7974] dark:text-claude-textSecondary">
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div>{activeExtraPanel?.content}</div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-[8px] pb-[2px]">
        {sections.map((section) => {
          const isActive = activeSectionId === section.id;
          const FirstIcon = section.items[0]?.icon;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSectionId((prev) => (prev === section.id ? null : section.id))}
              className={`group flex h-[32px] shrink-0 items-center gap-[6px] overflow-hidden rounded-[8px] border px-[10px] text-[#373734] transition-all duration-200 hover:-translate-y-[1px] dark:text-claude-text ${
                isActive
                  ? 'border-[rgba(31,31,30,0.25)] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)] dark:border-white/20 dark:bg-claude-input'
                  : 'border-[rgba(31,31,30,0.15)] bg-[#f8f8f6] hover:bg-[#f3f2ee] dark:border-white/10 dark:bg-claude-bg dark:hover:bg-claude-hover'
              }`}
            >
              {FirstIcon ? (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[#615A4F] transition-transform duration-200 group-hover:-translate-y-[1px] dark:text-[#E6DDD2]">
                  <FirstIcon size={15} strokeWidth={1.9} />
                </span>
              ) : null}
              <span className="truncate text-[14px] font-normal leading-[19.6px] tracking-[-0.1504px]">
                {section.label}
              </span>
            </button>
          );
        })}
        {extraPanels.map((panel) => {
          const isActive = activeSectionId === panel.id;
          return (
            <button
              key={panel.id}
              type="button"
              onClick={() => setActiveSectionId((prev) => (prev === panel.id ? null : panel.id))}
              className={`group flex h-[32px] shrink-0 items-center gap-[6px] overflow-hidden rounded-[8px] border px-[10px] text-[#373734] transition-all duration-200 hover:-translate-y-[1px] dark:text-claude-text ${
                isActive
                  ? 'border-[rgba(31,31,30,0.25)] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)] dark:border-white/20 dark:bg-claude-input'
                  : 'border-[rgba(31,31,30,0.15)] bg-[#f8f8f6] hover:bg-[#f3f2ee] dark:border-white/10 dark:bg-claude-bg dark:hover:bg-claude-hover'
              }`}
            >
              <span className="truncate text-[14px] font-normal leading-[19.6px] tracking-[-0.1504px]">
                {panel.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default StarterIdeasAccordion;
