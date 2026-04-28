import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ClipboardList,
  LoaderCircle,
  Plus,
  Search,
  Upload,
  WandSparkles,
} from 'lucide-react';
import skillsImg from '@/assets/customization/landing/skills.png';
import {
  DirectoryNavIcon,
  DirectoryPluginIcon,
  DirectoryUtilityIcon,
  type DirectoryPluginIconKey,
} from './DirectoryAssetIcons';
import {
  type ConnectorId,
  getConnectorStatusMeta,
  type ConnectorRuntimeStatus,
} from '../connectors/catalog';
import {
  buildConnectorDirectoryCards,
  buildSkillDirectoryCards,
  filterConnectorDirectoryCards,
  filterSkillDirectoryCards,
  getConnectorDirectorySourceTabs,
  getSkillDirectorySourceTabs,
  type DirectoryConnectorCard,
  type DirectoryConnectorSource,
  type DirectorySkillCard,
  type DirectorySkillSource,
  type DirectorySkillSummary,
  type DirectorySourceTab,
} from './store';
import { openDesktopExternal } from '@/src/desktop';

export type DirectorySection = 'skills' | 'connectors' | 'plugins';
export type { ConnectorId } from '../connectors/catalog';

interface DirectoryModalProps {
  examples: DirectorySkillSummary[];
  initialSection?: DirectorySection;
  connectorStatuses: Record<string, ConnectorRuntimeStatus | null | undefined>;
  mySkills: DirectorySkillSummary[];
  onClose: () => void;
  onCreateWithClaude: () => void;
  onTriggerConnectorAction: (connectorId: ConnectorId) => void;
  onOpenConnector: (connectorId: ConnectorId) => void;
  onOpenSkill: (skillId: string) => void;
  onToggleSkill: (skillId: string, nextEnabled: boolean) => void;
  onUploadSkill: () => void;
  onWriteSkill: () => void;
  pendingConnectorId?: ConnectorId | null;
  pendingSkillId?: string | null;
}

interface PluginDirectoryCard {
  description: string;
  downloads: string;
  icon: DirectoryPluginIconKey;
  id: string;
  provider: string;
  title: string;
}

interface DirectoryTabButtonProps {
  icon: React.ReactNode;
  isActive: boolean;
  label: string;
  onClick: () => void;
}

interface DirectorySourceTabsProps<TSource extends string> {
  activeSource: TSource;
  onChange: (source: TSource) => void;
  tabs: readonly DirectorySourceTab<TSource>[];
}

interface SkillsActionButtonProps {
  onCreateWithClaude: () => void;
  onUploadSkill: () => void;
  onWriteSkill: () => void;
}

interface SkillCardProps {
  card: DirectorySkillCard;
  isBusy: boolean;
  onAction: (card: DirectorySkillCard) => void;
  onSelect: (card: DirectorySkillCard) => void;
}

interface ConnectorCardProps {
  card: DirectoryConnectorCard;
  isBusy: boolean;
  runtimeStatus?: ConnectorRuntimeStatus | null;
  onTriggerConnectorAction: (connectorId: ConnectorId) => void;
  onSelect: (card: DirectoryConnectorCard) => void;
}

interface PluginCardProps {
  card: PluginDirectoryCard;
}

const pluginCards: PluginDirectoryCard[] = [
  {
    id: 'productivity',
    title: 'Productivity',
    provider: 'Anthropic',
    downloads: '604.1K',
    description: 'Manage tasks, plan your day, and build up memory of important context about your work. Syncs with your daily workflow.',
    icon: 'productivity',
  },
  {
    id: 'design',
    title: 'Design',
    provider: 'Anthropic',
    downloads: '550.2K',
    description: 'Accelerate design workflows — critique, design system management, UX writing, accessibility audits, and research.',
    icon: 'design',
  },
  {
    id: 'marketing',
    title: 'Marketing',
    provider: 'Anthropic',
    downloads: '463.6K',
    description: 'Create content, plan campaigns, and analyze performance across marketing channels. Maintain brand consistency faster.',
    icon: 'marketing',
  },
  {
    id: 'data',
    title: 'Data',
    provider: 'Anthropic',
    downloads: '447.2K',
    description: 'Write SQL, explore datasets, and generate insights faster. Build visualizations and dashboards, and turn raw data into action.',
    icon: 'data',
  },
  {
    id: 'engineering',
    title: 'Engineering',
    provider: 'Anthropic',
    downloads: '431.3K',
    description: 'Streamline engineering workflows — standups, code review, architecture decisions, incident response, and documentation.',
    icon: 'engineering',
  },
  {
    id: 'finance',
    title: 'Finance',
    provider: 'Anthropic',
    downloads: '379.8K',
    description: 'Streamline finance and accounting workflows, from journal entries and reconciliation to financial statement support.',
    icon: 'finance',
  },
  {
    id: 'product-management',
    title: 'Product management',
    provider: 'Anthropic',
    downloads: '355.7K',
    description: 'Write feature specs, plan roadmaps, and synthesize user research faster. Keep stakeholders aligned and moving.',
    icon: 'product-management',
  },
  {
    id: 'operations',
    title: 'Operations',
    provider: 'Anthropic',
    downloads: '330.5K',
    description: 'Optimize business operations — vendor management, process documentation, change management, capacity planning, and more.',
    icon: 'operations',
  },
  {
    id: 'enterprise-search',
    title: 'Enterprise search',
    provider: 'Anthropic',
    downloads: '219.4K',
    description: 'Search across all of your company\'s tools in one place so answers are easier to find and easier to trust.',
    icon: 'enterprise-search',
  },
  {
    id: 'human-resources',
    title: 'Human resources',
    provider: 'Anthropic',
    downloads: '183.1K',
    description: 'Streamline people operations — recruiting, onboarding, performance reviews, internal policies, and employee support.',
    icon: 'human-resources',
  },
  {
    id: 'pdf-plugin',
    title: 'Pdf viewer',
    provider: 'Anthropic',
    downloads: '179.9K',
    description: 'View, annotate, and sign PDFs in a live interactive viewer with search, navigation, and form support.',
    icon: 'pdf-viewer',
  },
  {
    id: 'customer-support',
    title: 'Customer support',
    provider: 'Anthropic',
    downloads: '160.6K',
    description: 'Triage tickets, draft responses, escalate issues, and keep support teams aligned across channels.',
    icon: 'customer-support',
  },
  {
    id: 'apollo',
    title: 'Apollo',
    provider: 'Apollo.io',
    downloads: '115.3K',
    description: 'Prospect, enrich leads, and load outreach sequences faster with Apollo context directly in Claude.',
    icon: 'apollo',
  },
  {
    id: 'slack-salesforce',
    title: 'Slack by salesforce',
    provider: 'Salesforce',
    downloads: '114.2K',
    description: 'Slack integration for searching messages, sending communications, managing canvases, and more.',
    icon: 'slack',
  },
  {
    id: 'common-room',
    title: 'Common room',
    provider: 'Common Room',
    downloads: '107.5K',
    description: 'Turn Common Room into your GTM copilot. Research accounts and contacts, prep for calls, and draft personalized outreach.',
    icon: 'common-room',
  },
  {
    id: 'bio-research',
    title: 'Bio research',
    provider: 'Anthropic',
    downloads: '58.3K',
    description: 'Connect to preclinical research tools and databases to accelerate early-stage life sciences R&D.',
    icon: 'bio-research',
  },
  {
    id: 'zoom-plugin',
    title: 'Zoom plugin',
    provider: 'Zoom',
    downloads: '27.1K',
    description: 'Plan, build, and debug Zoom integrations across REST APIs, Meeting SDK, Video SDK, webhooks, bots, and MCP workflows.',
    icon: 'zoom',
  },
];

const sectionSearchPlaceholder: Record<DirectorySection, string> = {
  skills: 'Search skills...',
  connectors: 'Search connectors...',
  plugins: 'Search plugins...',
};

const cardLineClampClass =
  'overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]';

const interactiveButtonClass =
  'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#121212]/25 dark:focus-visible:ring-white/20';

const statusToneClass: Record<'connected' | 'ready' | 'manual' | 'preview', string> = {
  connected: 'border-[#B8D8C0] bg-[#F1F8F3] text-[#275437] dark:border-[#355c40] dark:bg-[#263328] dark:text-[#B8E0C1]',
  ready: 'border-[#D7D1C4] bg-[#F6F3EC] text-[#5C5140] dark:border-[#5A5247] dark:bg-[#34302A] dark:text-[#D8CFBE]',
  manual: 'border-[rgba(31,31,30,0.12)] bg-[#F8F8F6] text-[#6F6B63] dark:border-[#4A4A48] dark:bg-[#2B2B29] dark:text-[#B1AAA0]',
  preview: 'border-[#D3DCEB] bg-[#F1F5FB] text-[#34537D] dark:border-[#415067] dark:bg-[#273140] dark:text-[#B9C9E7]',
};

const skillBadgeToneClass: Record<DirectorySkillSource, string> = {
  official: 'border-[#D7D1C4] bg-[#F6F3EC] text-[#5C5140] dark:border-[#5A5247] dark:bg-[#34302A] dark:text-[#D8CFBE]',
  community: 'border-[#D3DCEB] bg-[#F1F5FB] text-[#34537D] dark:border-[#415067] dark:bg-[#273140] dark:text-[#B9C9E7]',
  custom: 'border-[#B8D8C0] bg-[#F1F8F3] text-[#275437] dark:border-[#355c40] dark:bg-[#263328] dark:text-[#B8E0C1]',
};

function DirectoryTabButton({ icon, isActive, label, onClick }: DirectoryTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${interactiveButtonClass} flex min-w-fit items-center gap-3 rounded-[8px] px-4 py-[6px] text-[14px] leading-5 tracking-[-0.1504px] lg:w-full ${
        isActive
          ? 'bg-[#efeeeb] font-semibold text-[#121212] dark:bg-[#353533] dark:text-white'
          : 'text-[#121212] hover:bg-[#f1f0ed] dark:text-[#EDEAE1] dark:hover:bg-[#2e2e2c]'
      }`}
    >
      <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function DirectorySourceTabs<TSource extends string>({
  activeSource,
  onChange,
  tabs,
}: DirectorySourceTabsProps<TSource>) {
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-[#efeeeb] p-1 dark:bg-[#353533]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`${interactiveButtonClass} inline-flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[14px] leading-5 tracking-[-0.1504px] ${
            activeSource === tab.id
              ? 'bg-white font-medium text-[#121212] shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[#252523] dark:text-white'
              : 'text-[#7b7974] hover:text-[#121212] dark:text-[#ABA499] dark:hover:text-white'
          }`}
        >
          <span>{tab.label}</span>
          <span className="text-[12px] leading-4 opacity-80">{tab.count}</span>
        </button>
      ))}
    </div>
  );
}

function SkillsActionButton({
  onCreateWithClaude,
  onUploadSkill,
  onWriteSkill,
}: SkillsActionButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowMenu((open) => !open)}
        className={`${interactiveButtonClass} inline-flex h-9 items-center gap-3 rounded-[10px] border border-[rgba(31,31,30,0.15)] bg-white px-4 text-[14px] font-medium leading-5 tracking-[-0.1504px] text-[#121212] hover:bg-[#fcfcfb] dark:border-[#4A4A48] dark:bg-[#30302E] dark:text-white dark:hover:bg-[#353533]`}
      >
        <Plus size={15} strokeWidth={2} />
        <span>Add</span>
        <DirectoryUtilityIcon icon="chevron-down" className="h-[14px] w-[14px] opacity-90 dark:brightness-0 dark:invert" />
      </button>

      {showMenu && (
        <>
          <button
            type="button"
            aria-label="Close skill actions"
            onClick={() => setShowMenu(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[240px] rounded-[14px] border border-[rgba(31,31,30,0.15)] bg-white p-2 shadow-[0_10px_30px_rgba(0,0,0,0.12)] dark:border-[#4A4A48] dark:bg-[#30302E]">
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                onCreateWithClaude();
              }}
              className={`${interactiveButtonClass} flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px] text-[#121212] hover:bg-[#f4f3ef] dark:text-white dark:hover:bg-[#353533]`}
            >
              <WandSparkles size={16} strokeWidth={1.8} className="text-[#7b7974] dark:text-[#ABA499]" />
              <span>Create with Claude</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                onWriteSkill();
              }}
              className={`${interactiveButtonClass} flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px] text-[#121212] hover:bg-[#f4f3ef] dark:text-white dark:hover:bg-[#353533]`}
            >
              <ClipboardList size={16} strokeWidth={1.8} className="text-[#7b7974] dark:text-[#ABA499]" />
              <span>Write skill instructions</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                onUploadSkill();
              }}
              className={`${interactiveButtonClass} flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px] text-[#121212] hover:bg-[#f4f3ef] dark:text-white dark:hover:bg-[#353533]`}
            >
              <Upload size={16} strokeWidth={1.8} className="text-[#7b7974] dark:text-[#ABA499]" />
              <span>Upload a skill</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SkillCardArtwork({ card }: { card: DirectorySkillCard }) {
  const wrapperClassName =
    'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[8px] border border-[rgba(31,31,30,0.15)] bg-[#f8f8f6] dark:border-[#4A4A48] dark:bg-[#262624]';

  if (card.action === 'create-with-claude') {
    return (
      <div className={wrapperClassName}>
        <WandSparkles size={18} strokeWidth={1.8} className="text-[#7b7974] dark:text-[#ABA499]" />
      </div>
    );
  }

  if (card.action === 'write-skill-instructions') {
    return (
      <div className={wrapperClassName}>
        <ClipboardList size={18} strokeWidth={1.8} className="text-[#7b7974] dark:text-[#ABA499]" />
      </div>
    );
  }

  if (card.action === 'upload-skill') {
    return (
      <div className={wrapperClassName}>
        <Upload size={18} strokeWidth={1.8} className="text-[#7b7974] dark:text-[#ABA499]" />
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <img src={skillsImg} alt="" aria-hidden="true" className="h-[18px] w-[18px] object-contain dark:invert opacity-85" />
    </div>
  );
}

function SkillCard({ card, isBusy, onAction, onSelect }: SkillCardProps) {
  const isShortcut = card.action !== 'open-skill';

  const handleActionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onAction(card);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(card)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(card);
        }
      }}
      className={`${interactiveButtonClass} flex min-h-[118px] flex-col gap-3 rounded-[16px] border border-[rgba(31,31,30,0.15)] bg-white p-[17px] text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-[rgba(31,31,30,0.3)] hover:bg-[#fcfcfb] active:translate-y-[1px] dark:border-[#4A4A48] dark:bg-[#30302E] dark:hover:bg-[#353533]`}
    >
      <div className="flex items-start gap-3">
        <SkillCardArtwork card={card} />

        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-5 tracking-[-0.1504px] text-[#121212] dark:text-white">{card.title}</div>
          <div className="mt-0.5 text-[12px] leading-4 text-[#7b7974] dark:text-[#ABA499]">{card.subtitle}</div>
        </div>

        <button
          type="button"
          onClick={handleActionClick}
          disabled={isBusy}
          aria-label={isShortcut ? card.title : card.isEnabled ? `Open ${card.title}` : `Enable ${card.title}`}
          className={`${interactiveButtonClass} flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[6px] ${
            !isShortcut && card.isEnabled
              ? 'bg-[#e8f3eb] text-[#275437] hover:bg-[#dcebdd] dark:bg-[#2b3b2e] dark:text-[#B8E0C1] dark:hover:bg-[#324635]'
              : 'text-[#7b7974] hover:bg-[#efeeeb] hover:text-[#121212] dark:hover:bg-[#3a3a38] dark:hover:text-white'
          } ${isBusy ? 'cursor-wait opacity-70' : ''}`}
        >
          {isBusy ? (
            <LoaderCircle size={15} strokeWidth={2} className="animate-spin" />
          ) : !isShortcut && card.isEnabled ? (
            <Check size={16} strokeWidth={2.2} />
          ) : (
            <Plus size={16} strokeWidth={2} />
          )}
        </button>
      </div>

      <p className={`${cardLineClampClass} text-[12px] leading-4 text-[#7b7974] dark:text-[#ABA499]`}>{card.description}</p>

      <div className="mt-auto flex items-center justify-between gap-3">
        <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium leading-4 tracking-[-0.08px] ${skillBadgeToneClass[card.source]}`}>
          {card.badge}
        </span>
        {!isShortcut && card.isEnabled && (
          <span className="text-[11px] leading-4 text-[#7b7974] dark:text-[#ABA499]">
            Available now
          </span>
        )}
      </div>
    </div>
  );
}

function ConnectorCard({
  card,
  isBusy,
  runtimeStatus,
  onTriggerConnectorAction,
  onSelect,
}: ConnectorCardProps) {
  const supportsInAppInstall = runtimeStatus?.kind === 'native' || runtimeStatus?.kind === 'mcp' || runtimeStatus?.kind === 'composio';
  const status = getConnectorStatusMeta(card, runtimeStatus ?? undefined);
  const isActionComplete = Boolean(runtimeStatus?.connected || (runtimeStatus?.kind !== 'manual' && card.isInstalled));

  const handleActionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (isBusy) {
      return;
    }

    if (supportsInAppInstall && (!runtimeStatus?.connected || runtimeStatus.kind === 'mcp' || runtimeStatus.kind === 'composio')) {
      onTriggerConnectorAction(card.id as ConnectorId);
      return;
    }

    onSelect(card);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(card)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(card);
        }
      }}
      className={`${interactiveButtonClass} flex min-h-[118px] flex-col gap-3 rounded-[16px] border border-[rgba(31,31,30,0.15)] bg-white p-[17px] text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-[rgba(31,31,30,0.3)] hover:bg-[#fcfcfb] active:translate-y-[1px] dark:border-[#4A4A48] dark:bg-[#30302E] dark:hover:bg-[#353533]`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[8px] border border-[rgba(31,31,30,0.15)] bg-[#f8f8f6] dark:border-[#4A4A48] dark:bg-[#262624]">
          <img src={card.logo} alt="" aria-hidden="true" className="h-6 w-6 object-contain" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-5 tracking-[-0.1504px] text-[#121212] dark:text-white">{card.title}</div>
          <div className="mt-0.5 flex items-center gap-[6px] text-[12px] leading-4 text-[#7b7974] dark:text-[#ABA499]">
            <span className="truncate">{card.provider}</span>
            <span aria-hidden="true">•</span>
            <span className="whitespace-nowrap">{card.label}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleActionClick}
          disabled={isBusy}
          aria-label={
            supportsInAppInstall && !runtimeStatus?.connected ? `Connect ${card.title}` : `Open ${card.title}`
          }
          className={`${interactiveButtonClass} flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[6px] ${
            isActionComplete
              ? 'bg-[#e8f3eb] text-[#275437] hover:bg-[#dcebdd] dark:bg-[#2b3b2e] dark:text-[#B8E0C1] dark:hover:bg-[#324635]'
              : 'text-[#7b7974] hover:bg-[#efeeeb] hover:text-[#121212] dark:hover:bg-[#3a3a38] dark:hover:text-white'
          } ${isBusy ? 'cursor-wait opacity-70' : ''}`}
        >
          {isBusy ? (
            <LoaderCircle size={15} strokeWidth={2} className="animate-spin" />
          ) : isActionComplete ? (
            <Check size={16} strokeWidth={2.2} />
          ) : (
            <Plus size={16} strokeWidth={2} />
          )}
        </button>
      </div>

      <p className={`${cardLineClampClass} text-[12px] leading-4 text-[#7b7974] dark:text-[#ABA499]`}>{card.description}</p>

      <div className="mt-auto flex items-center justify-between gap-3">
        <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium leading-4 tracking-[-0.08px] ${statusToneClass[status.tone]}`}>
          {status.label}
        </span>
        {supportsInAppInstall && !runtimeStatus?.connected && (
          <span className="text-[11px] leading-4 text-[#7b7974] dark:text-[#ABA499]">
            {runtimeStatus?.kind === 'composio' ? '1-click connect' : '1-click install'}
          </span>
        )}
      </div>
    </div>
  );
}

function PluginCard({ card }: PluginCardProps) {
  return (
    <button
      type="button"
      className={`${interactiveButtonClass} flex min-h-[118px] flex-col gap-3 rounded-[16px] border border-[rgba(31,31,30,0.15)] bg-white p-[17px] text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-[rgba(31,31,30,0.25)] hover:bg-[#fcfcfb] active:translate-y-[1px] dark:border-[#4A4A48] dark:bg-[#30302E] dark:hover:bg-[#353533]`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[8px] border border-[rgba(31,31,30,0.15)] bg-[#f8f8f6] dark:border-[#4A4A48] dark:bg-[#262624]">
          <DirectoryPluginIcon icon={card.icon} className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-5 tracking-[-0.1504px] text-[#121212] dark:text-white">{card.title}</div>
          <div className="mt-0.5 flex items-center gap-[6px] text-[12px] leading-4 text-[#7b7974] dark:text-[#ABA499]">
            <span className="truncate">{card.provider}</span>
            <span aria-hidden="true">•</span>
            <span className="flex items-center gap-0.5 whitespace-nowrap">
              <DirectoryUtilityIcon icon="download" className="h-3 w-3 opacity-90 dark:brightness-0 dark:invert" />
              {card.downloads}
            </span>
          </div>
        </div>
      </div>

      <p className={`${cardLineClampClass} text-[12px] leading-4 text-[#7b7974] dark:text-[#ABA499]`}>{card.description}</p>
    </button>
  );
}

function EmptyResults({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-[16px] border border-dashed border-[rgba(31,31,30,0.15)] bg-white/75 px-6 text-center dark:border-[#4A4A48] dark:bg-[#30302E]/70">
      <div>
        <Search size={24} strokeWidth={1.8} className="mx-auto mb-3 text-[#7b7974] dark:text-[#ABA499]" />
        <div className="text-[15px] font-medium text-[#121212] dark:text-white">{title}</div>
        <p className="mt-2 text-[13px] leading-5 text-[#7b7974] dark:text-[#ABA499]">{description}</p>
      </div>
    </div>
  );
}

export default function DirectoryModal({
  examples,
  initialSection = 'connectors',
  connectorStatuses,
  mySkills,
  onClose,
  onCreateWithClaude,
  onTriggerConnectorAction,
  onOpenConnector,
  onOpenSkill,
  onToggleSkill,
  onUploadSkill,
  onWriteSkill,
  pendingConnectorId = null,
  pendingSkillId = null,
}: DirectoryModalProps) {
  const [activeSection, setActiveSection] = useState<DirectorySection>(initialSection);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSkillSource, setActiveSkillSource] = useState<DirectorySkillSource>('official');
  const [activeConnectorSource, setActiveConnectorSource] = useState<DirectoryConnectorSource>('official');

  useEffect(() => {
    setActiveSection(initialSection);
    setSearchQuery('');
    setActiveSkillSource('official');
    setActiveConnectorSource('official');
  }, [initialSection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const skillCards = useMemo(
    () => buildSkillDirectoryCards({ examples, mySkills }),
    [examples, mySkills],
  );
  const skillSourceTabs = useMemo(
    () => getSkillDirectorySourceTabs(skillCards),
    [skillCards],
  );
  const filteredSkillCards = useMemo(
    () =>
      filterSkillDirectoryCards(skillCards, {
        query: searchQuery,
        source: activeSkillSource,
      }),
    [activeSkillSource, searchQuery, skillCards],
  );

  const connectorCards = useMemo(
    () => buildConnectorDirectoryCards({ connectorStatuses }),
    [connectorStatuses],
  );
  const connectorSourceTabs = useMemo(
    () => getConnectorDirectorySourceTabs(connectorCards),
    [connectorCards],
  );
  const filteredConnectorCards = useMemo(
    () =>
      filterConnectorDirectoryCards(connectorCards, {
        query: searchQuery,
        source: activeConnectorSource,
      }),
    [activeConnectorSource, connectorCards, searchQuery],
  );

  const filteredPlugins = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return pluginCards.filter((card) =>
      !query ||
      card.title.toLowerCase().includes(query) ||
      card.provider.toLowerCase().includes(query) ||
      card.description.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  const handleSectionChange = (section: DirectorySection) => {
    setActiveSection(section);
    setSearchQuery('');

    if (section === 'skills') {
      setActiveSkillSource('official');
    }

    if (section === 'connectors') {
      setActiveConnectorSource('official');
    }
  };

  const openExternalUrl = (url: string) => {
    openDesktopExternal(url).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  const handleSkillCardSelect = (card: DirectorySkillCard) => {
    if (card.action === 'create-with-claude') {
      onCreateWithClaude();
      return;
    }

    if (card.action === 'write-skill-instructions') {
      onWriteSkill();
      return;
    }

    if (card.action === 'upload-skill') {
      onUploadSkill();
      return;
    }

    onOpenSkill(card.id);
  };

  const handleSkillCardAction = (card: DirectorySkillCard) => {
    if (card.action !== 'open-skill') {
      handleSkillCardSelect(card);
      return;
    }

    if (!card.isEnabled) {
      onToggleSkill(card.id, true);
      return;
    }

    onOpenSkill(card.id);
  };

  const handleConnectorSelect = (card: DirectoryConnectorCard) => {
    onOpenConnector(card.id as ConnectorId);
  };

  const openClaudeDesktopDownload = () => {
    openExternalUrl('https://claude.ai/download');
  };

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-[rgba(31,31,30,0.42)] p-3 backdrop-blur-[3px] sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex h-full max-h-[782px] w-full max-w-[1024px] flex-col overflow-hidden rounded-[16px] border border-[rgba(31,31,30,0.15)] bg-[#f8f8f6] p-[25px] shadow-[0px_20px_25px_rgba(0,0,0,0.1),0px_8px_10px_rgba(0,0,0,0.1)] dark:border-[#444341] dark:bg-[#252523]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="directory-title-anthropic text-[#121212] dark:text-white">Directory</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close directory"
            className={`${interactiveButtonClass} flex h-8 w-8 items-center justify-center rounded-[6px] text-[#7b7974] hover:bg-[#efeeeb] hover:text-[#121212] dark:text-[#ABA499] dark:hover:bg-[#353533] dark:hover:text-white`}
          >
            <DirectoryUtilityIcon icon="close" className="h-4 w-4 opacity-90 dark:brightness-0 dark:invert" />
          </button>
        </div>

        <div className="mt-8 flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:gap-8">
          <div className="lg:w-[200px] lg:flex-shrink-0">
            <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              <DirectoryTabButton
                icon={<DirectoryNavIcon icon="skills" className="h-5 w-5 dark:brightness-0 dark:invert" />}
                isActive={activeSection === 'skills'}
                label="Skills"
                onClick={() => handleSectionChange('skills')}
              />
              <DirectoryTabButton
                icon={<DirectoryNavIcon icon="connectors" className="h-5 w-5 dark:brightness-0 dark:invert" />}
                isActive={activeSection === 'connectors'}
                label="Connectors"
                onClick={() => handleSectionChange('connectors')}
              />
              <DirectoryTabButton
                icon={<DirectoryNavIcon icon="plugins" className="h-5 w-5 dark:brightness-0 dark:invert" />}
                isActive={activeSection === 'plugins'}
                label="Plugins"
                onClick={() => handleSectionChange('plugins')}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <label className="flex h-9 items-center rounded-[8px] border border-[rgba(31,31,30,0.15)] bg-white px-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:border-[#4A4A48] dark:bg-[#30302E]">
              <DirectoryUtilityIcon icon="search" className="mr-2 h-4 w-4 opacity-90 dark:brightness-0 dark:invert" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={sectionSearchPlaceholder[activeSection]}
                className="h-full w-full bg-transparent text-[16px] tracking-[-0.3125px] text-[#121212] outline-none placeholder:text-[#7b7974] dark:text-white dark:placeholder:text-[#ABA499]"
              />
            </label>

            {activeSection === 'skills' ? (
              <div className="mt-4 flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-4">
                  <DirectorySourceTabs
                    activeSource={activeSkillSource}
                    onChange={(source) => setActiveSkillSource(source)}
                    tabs={skillSourceTabs}
                  />
                  <SkillsActionButton
                    onCreateWithClaude={onCreateWithClaude}
                    onUploadSkill={onUploadSkill}
                    onWriteSkill={onWriteSkill}
                  />
                </div>

                <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-[11px]">
                  {filteredSkillCards.length > 0 ? (
                    <div className="grid max-w-[731px] grid-cols-1 gap-4 md:grid-cols-2">
                      {filteredSkillCards.map((card) => (
                        <SkillCard
                          key={card.id}
                          card={card}
                          isBusy={pendingSkillId === card.id}
                          onAction={handleSkillCardAction}
                          onSelect={handleSkillCardSelect}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyResults
                      title="No skills found"
                      description="Try a different search term or switch source tabs to browse more skills."
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 flex min-h-0 flex-1 flex-col">
                {activeSection === 'plugins' && (
                  <div className="rounded-[12px] border border-[rgba(31,31,30,0.3)] bg-[#f4f4f1] px-[13px] py-[13px] dark:border-[#5b5955] dark:bg-[#2d2d2b]">
                    <p className="text-[14px] leading-5 tracking-[-0.1504px] text-[#121212] dark:text-[#EDEAE1]">
                      Plugins can be browsed, but are only available for use in the desktop app.{' '}
                      <button
                        type="button"
                        onClick={openClaudeDesktopDownload}
                        className={`${interactiveButtonClass} inline text-[14px] leading-5 tracking-[-0.1504px] text-[#121212] underline underline-offset-[2px] hover:text-black dark:text-white dark:hover:text-[#f3f2ef]`}
                      >
                        Download Claude for Desktop
                      </button>
                    </p>
                  </div>
                )}

                {activeSection === 'connectors' ? (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <DirectorySourceTabs
                        activeSource={activeConnectorSource}
                        onChange={(source) => setActiveConnectorSource(source)}
                        tabs={connectorSourceTabs}
                      />

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          className={`${interactiveButtonClass} flex h-8 items-center gap-3 rounded-[8px] border border-[rgba(31,31,30,0.15)] bg-white px-[13px] text-[14px] leading-5 tracking-[-0.1504px] text-[#7b7974] hover:border-[rgba(31,31,30,0.3)] hover:text-[#121212] dark:border-[#4A4A48] dark:bg-[#30302E] dark:text-[#ABA499] dark:hover:text-white`}
                        >
                          <span>Filter by</span>
                          <DirectoryUtilityIcon icon="chevron-down" className="h-[14px] w-[14px] opacity-90 dark:brightness-0 dark:invert" />
                        </button>
                        <button
                          type="button"
                          className={`${interactiveButtonClass} flex h-8 items-center gap-3 rounded-[8px] border border-[rgba(31,31,30,0.15)] bg-white px-[13px] text-[14px] leading-5 tracking-[-0.1504px] text-[#7b7974] hover:border-[rgba(31,31,30,0.3)] hover:text-[#121212] dark:border-[#4A4A48] dark:bg-[#30302E] dark:text-[#ABA499] dark:hover:text-white`}
                        >
                          <span>Sort by</span>
                          <DirectoryUtilityIcon icon="chevron-down" className="h-[14px] w-[14px] opacity-90 dark:brightness-0 dark:invert" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-[11px]">
                      {filteredConnectorCards.length > 0 ? (
                        <div className="grid max-w-[731px] grid-cols-1 gap-4 md:grid-cols-2">
                          {filteredConnectorCards.map((card) => (
                            <ConnectorCard
                              key={card.id}
                              card={card}
                              isBusy={pendingConnectorId === card.id}
                              runtimeStatus={connectorStatuses[card.id] ?? null}
                              onTriggerConnectorAction={onTriggerConnectorAction}
                              onSelect={handleConnectorSelect}
                            />
                          ))}
                        </div>
                      ) : (
                        <EmptyResults
                          title="No connectors found"
                          description="Try a different search term or switch source tabs to browse more connectors."
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="inline-flex h-[31.594px] items-center rounded-full bg-[#e6e5e0] px-4 text-[14px] leading-5 tracking-[-0.1504px] text-[#121212] dark:bg-[#3a3a38] dark:text-white">
                        Anthropic &amp; Partners
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          className={`${interactiveButtonClass} flex h-8 items-center gap-3 rounded-[8px] border border-[rgba(31,31,30,0.15)] bg-white px-[13px] text-[14px] leading-5 tracking-[-0.1504px] text-[#7b7974] hover:border-[rgba(31,31,30,0.3)] hover:text-[#121212] dark:border-[#4A4A48] dark:bg-[#30302E] dark:text-[#ABA499] dark:hover:text-white`}
                        >
                          <span>Filter by</span>
                          <DirectoryUtilityIcon icon="chevron-down" className="h-[14px] w-[14px] opacity-90 dark:brightness-0 dark:invert" />
                        </button>
                        <button
                          type="button"
                          className={`${interactiveButtonClass} flex h-8 items-center gap-3 rounded-[8px] border border-[rgba(31,31,30,0.15)] bg-white px-[13px] text-[14px] leading-5 tracking-[-0.1504px] text-[#7b7974] hover:border-[rgba(31,31,30,0.3)] hover:text-[#121212] dark:border-[#4A4A48] dark:bg-[#30302E] dark:text-[#ABA499] dark:hover:text-white`}
                        >
                          <span>Sort by</span>
                          <DirectoryUtilityIcon icon="chevron-down" className="h-[14px] w-[14px] opacity-90 dark:brightness-0 dark:invert" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-[11px]">
                      {filteredPlugins.length > 0 ? (
                        <div className="grid max-w-[731px] grid-cols-1 gap-4 md:grid-cols-2">
                          {filteredPlugins.map((card) => (
                            <PluginCard key={card.id} card={card} />
                          ))}
                        </div>
                      ) : (
                        <EmptyResults
                          title="No plugins found"
                          description="Try a different search term or clear the field to browse the plugin directory."
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
