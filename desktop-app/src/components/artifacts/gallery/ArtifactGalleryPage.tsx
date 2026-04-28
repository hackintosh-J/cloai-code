import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  FileCode,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import inspirationsData from '@/assets/fixtures/artifact-gallery/inspirations.json';
import { buildArtifactHtml, loadArtifactCode } from '@/src/components/artifacts/runtime/artifactRenderer';
import { copyToClipboard } from '@/src/components/shared/utils/clipboard';
import { getArtifactContent, getUserArtifacts } from '@/src/services';
import { safeSetStorageItem } from '@/src/utils/safeStorage';

interface InspirationItem {
  artifact_id: string;
  chat_id: string;
  category: string;
  name: string;
  description: string;
  starting_prompt: string;
  img_src: string;
  content_uuid?: string;
  code_file?: string;
}

interface ArtifactsPageProps {
  onTryPrompt?: (prompt: string) => void;
}

type TabId = 'inspiration' | 'your_artifacts';

const CATEGORY_ORDER = ['all', 'learn', 'life-hacks', 'games', 'creative', 'touch-grass'];
const CATEGORY_META: Record<string, { label: string; tone: string }> = {
  all: { label: 'All', tone: 'bg-claude-text text-claude-bg' },
  learn: { label: 'Learn', tone: 'bg-[#E8F1FF] text-[#2459A6] dark:bg-[#14243A] dark:text-[#9DC0F7]' },
  'life-hacks': { label: 'Workflows', tone: 'bg-[#EAF5EE] text-[#2D6B45] dark:bg-[#132B1E] dark:text-[#99D2AE]' },
  games: { label: 'Games', tone: 'bg-[#FFF0E5] text-[#9A4B21] dark:bg-[#392111] dark:text-[#E8B58F]' },
  creative: { label: 'Creative', tone: 'bg-[#F3ECFF] text-[#6942A5] dark:bg-[#261A3A] dark:text-[#C5AEF0]' },
  'touch-grass': { label: 'Explore', tone: 'bg-[#E8F5F3] text-[#276A61] dark:bg-[#102B28] dark:text-[#92D7CD]' },
};

function ArtifactIframe({
  html,
  reloadKey,
  title,
}: {
  html: string;
  reloadKey: number;
  title: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html, reloadKey]);

  if (!blobUrl) return null;

  return (
    <iframe
      src={blobUrl}
      className="h-[520px] w-full border-0 bg-white"
      title={title}
    />
  );
}

function categoryLabel(category: string): string {
  return CATEGORY_META[category]?.label || category;
}

function categoryTone(category: string): string {
  return CATEGORY_META[category]?.tone || 'bg-claude-hover text-claude-textSecondary';
}

function buildCategoryCounts(items: InspirationItem[]) {
  const counts: Record<string, number> = { all: items.length };
  for (const item of items) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }
  return counts;
}

function storeArtifactRemix(payload: unknown) {
  safeSetStorageItem('artifact_remix', JSON.stringify(payload), 'session');
}

function PromptPanel({
  copied,
  item,
  onCopy,
}: {
  copied: boolean;
  item: InspirationItem;
  onCopy: () => void;
}) {
  return (
    <section className="min-w-[320px] flex-1">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-claude-text">Starting prompt</h2>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1.5 rounded-lg border border-claude-border px-2.5 py-1.5 text-[12px] text-claude-textSecondary transition-colors hover:bg-claude-hover hover:text-claude-text"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="max-h-[320px] overflow-y-auto rounded-lg border border-claude-border bg-claude-input p-4">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-claude-textSecondary">
          {item.starting_prompt}
        </p>
      </div>
    </section>
  );
}

function DetailPreview({
  artifactHtml,
  artifactLoading,
  item,
  onOpenWindow,
  onRefresh,
  reloadKey,
}: {
  artifactHtml: string | null;
  artifactLoading: boolean;
  item: InspirationItem;
  onOpenWindow: () => void;
  onRefresh: () => void;
  reloadKey: number;
}) {
  return (
    <div className="mb-8 overflow-hidden rounded-xl border border-claude-border bg-claude-input">
      <div className="flex h-9 items-center justify-between border-b border-claude-border bg-[#1B1B19] px-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F06A5F]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#F2BE4B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#63C76A]" />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-6 w-6 items-center justify-center rounded text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={onOpenWindow}
            className="flex h-6 w-6 items-center justify-center rounded text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            title="Open in new window"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      {artifactLoading ? (
        <div className="flex h-[420px] items-center justify-center bg-white dark:bg-[#1a1a19]">
          <Loader2 size={24} className="animate-spin text-claude-textSecondary" />
        </div>
      ) : artifactHtml ? (
        <ArtifactIframe html={artifactHtml} reloadKey={reloadKey} title={item.name} />
      ) : (
        <img
          src={`./artifact-gallery/previews/${item.img_src}`}
          alt={item.name}
          className="h-[420px] w-full object-cover"
          onError={(event) => {
            const image = event.target as HTMLImageElement;
            image.style.display = 'none';
          }}
        />
      )}
    </div>
  );
}

function InspirationCard({ item, onOpen }: { item: InspirationItem; onOpen: () => void }) {
  return (
    <button type="button" className="group text-left" onClick={onOpen}>
      <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-lg border border-claude-border bg-claude-input">
        <img
          src={`./artifact-gallery/previews/${item.img_src}`}
          alt={item.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
          onError={(event) => {
            const image = event.target as HTMLImageElement;
            image.style.display = 'none';
            image.parentElement?.classList.add('bg-gradient-to-br', 'from-claude-hover', 'to-claude-input');
          }}
        />
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryTone(item.category)}`}>
          {categoryLabel(item.category)}
        </span>
      </div>
      <h3 className="truncate text-[14px] font-semibold text-claude-text group-hover:underline">
        {item.name}
      </h3>
      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-claude-textSecondary">
        {item.description}
      </p>
    </button>
  );
}

function UserArtifactCard({ artifact, onOpen }: { artifact: any; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-lg border border-claude-border bg-claude-input p-4 text-left transition-colors hover:bg-claude-hover"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-claude-bg">
          <FileCode size={20} className="text-claude-textSecondary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-medium text-claude-text group-hover:underline">
            {artifact.title}
          </h3>
          <div className="mt-1 flex items-center gap-1.5">
            <MessageSquare size={12} className="text-claude-textSecondary" />
            <span className="truncate text-[12px] text-claude-textSecondary">{artifact.conversation_title}</span>
          </div>
          <span className="mt-1 block text-[11px] text-claude-textSecondary/70">
            {new Date(artifact.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </button>
  );
}

const ArtifactsPage: React.FC<ArtifactsPageProps> = ({ onTryPrompt }) => {
  const [activeTab, setActiveTab] = useState<TabId>('inspiration');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<InspirationItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [artifactHtml, setArtifactHtml] = useState<string | null>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [userArtifacts, setUserArtifacts] = useState<any[]>([]);
  const [userArtifactsLoading, setUserArtifactsLoading] = useState(false);
  const items = inspirationsData.items as InspirationItem[];
  const counts = useMemo(() => buildCategoryCounts(items), [items]);

  useEffect(() => {
    if (activeTab !== 'your_artifacts') return;
    setUserArtifactsLoading(true);
    getUserArtifacts()
      .then((data) => setUserArtifacts(Array.isArray(data) ? data : []))
      .catch(() => setUserArtifacts([]))
      .finally(() => setUserArtifactsLoading(false));
  }, [activeTab]);

  useEffect(() => {
    let active = true;

    if (!selectedItem?.code_file) {
      setArtifactHtml(null);
      setArtifactLoading(false);
      return () => {
        active = false;
      };
    }

    setArtifactLoading(true);
    setArtifactHtml(null);
    loadArtifactCode(selectedItem.code_file)
      .then((data) => {
        if (!active) return;
        setArtifactHtml(data ? buildArtifactHtml(data.content, data.type) : null);
      })
      .finally(() => {
        if (active) setArtifactLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedItem]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    return items.filter((item) => item.category === activeFilter);
  }, [activeFilter, items]);

  const handleOpenUserArtifact = async (artifact: any) => {
    try {
      const data = await getArtifactContent(artifact.file_path);
      if (!data?.content || !onTryPrompt) return;
      storeArtifactRemix({
        name: artifact.title,
        description: '',
        code: { content: data.content, type: 'text/html', title: artifact.title },
        prompt: '',
      });
      onTryPrompt('__remix__');
    } catch {}
  };

  const handleTryIt = (prompt: string) => {
    onTryPrompt?.(prompt);
  };

  const handleCopyPrompt = async (prompt: string) => {
    await copyToClipboard(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  const handleCustomize = async (item: InspirationItem) => {
    let artifactCode: any = null;
    if (item.code_file) {
      try {
        const response = await fetch(`./artifact-gallery/code/${item.code_file}`);
        if (response.ok) artifactCode = await response.json();
      } catch {}
    }

    storeArtifactRemix({
      name: item.name,
      description: item.description,
      code: artifactCode,
      prompt: item.starting_prompt,
    });

    onTryPrompt?.('__remix__');
  };

  if (selectedItem) {
    return (
      <div className="h-full flex-1 overflow-y-auto bg-claude-bg">
        <div className="mx-auto max-w-[980px] px-4 py-6 md:px-8 md:py-10">
          <button
            type="button"
            onClick={() => setSelectedItem(null)}
            className="mb-6 flex items-center gap-1.5 text-[14px] text-claude-textSecondary transition-colors hover:text-claude-text"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${categoryTone(selectedItem.category)}`}>
                  {categoryLabel(selectedItem.category)}
                </span>
                <span className="text-[12px] text-claude-textSecondary">Example artifact</span>
              </div>
              <h1 className="mb-2 text-[24px] font-semibold leading-tight text-claude-text">{selectedItem.name}</h1>
              <p className="max-w-[680px] text-[14px] leading-relaxed text-claude-textSecondary">{selectedItem.description}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => handleTryIt(selectedItem.starting_prompt)}
                className="rounded-lg border border-claude-border px-3.5 py-2 text-[13px] font-medium text-claude-text transition-colors hover:bg-claude-hover"
              >
                Use prompt
              </button>
              <button
                type="button"
                onClick={() => handleCustomize(selectedItem)}
                className="flex items-center gap-2 rounded-lg bg-claude-text px-3.5 py-2 text-[13px] font-medium text-claude-bg transition-opacity hover:opacity-90"
              >
                <Sparkles size={14} />
                Customize
              </button>
            </div>
          </div>

          <DetailPreview
            artifactHtml={artifactHtml}
            artifactLoading={artifactLoading}
            item={selectedItem}
            onOpenWindow={() => {
              if (!artifactHtml) return;
              const blob = new Blob([artifactHtml], { type: 'text/html;charset=utf-8' });
              window.open(URL.createObjectURL(blob), '_blank');
            }}
            onRefresh={() => setReloadKey((key) => key + 1)}
            reloadKey={reloadKey}
          />

          <div className="flex flex-col gap-8 lg:flex-row">
            <PromptPanel copied={copied} item={selectedItem} onCopy={() => handleCopyPrompt(selectedItem.starting_prompt)} />
            <aside className="w-full flex-shrink-0 lg:w-[240px]">
              <h2 className="mb-3 text-[15px] font-semibold text-claude-text">Actions</h2>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleCustomize(selectedItem)}
                  className="flex w-full items-center justify-between rounded-lg border border-claude-border px-4 py-2.5 text-[13px] font-medium text-claude-text transition-colors hover:bg-claude-hover"
                >
                  Remix artifact
                  <Sparkles size={13} className="text-claude-textSecondary" />
                </button>
                <a
                  href="https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-between rounded-lg border border-claude-border px-4 py-2.5 text-[13px] font-medium text-claude-text transition-colors hover:bg-claude-hover"
                >
                  Artifact guide
                  <ExternalLink size={13} className="text-claude-textSecondary" />
                </a>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex-1 overflow-y-auto bg-claude-bg">
      <div className="mx-auto max-w-[1040px] px-4 py-8 md:px-8 md:py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-[Spectral] text-[32px] font-medium text-claude-text">Artifacts</h1>
            <p className="mt-1 text-[13px] text-claude-textSecondary">
              Browse {items.length} interactive examples and remix the ones that fit your workflow.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleTryIt('Create a new interactive artifact.')}
            className="w-fit rounded-lg bg-claude-text px-3.5 py-2 text-[14px] font-medium text-claude-bg transition-opacity hover:opacity-90"
          >
            New artifact
          </button>
        </div>

        <div className="mb-6 flex items-center gap-2 border-b border-claude-border">
          {[
            { id: 'inspiration' as const, label: 'Inspiration' },
            { id: 'your_artifacts' as const, label: 'Your artifacts' },
          ].map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 pb-3 text-[14px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-claude-text text-claude-text'
                  : 'border-transparent text-claude-textSecondary hover:text-claude-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'inspiration' ? (
          <>
            <div className="mb-8 flex flex-wrap items-center gap-2">
              {CATEGORY_ORDER.map((id) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => setActiveFilter(id)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    activeFilter === id
                      ? 'bg-claude-text text-claude-bg'
                      : 'bg-claude-input text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text'
                  }`}
                >
                  {CATEGORY_META[id].label}
                  <span className="ml-1 opacity-70">{counts[id] || 0}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <InspirationCard
                  key={item.artifact_id}
                  item={item}
                  onOpen={() => {
                    setCopied(false);
                    setReloadKey(0);
                    setSelectedItem(item);
                  }}
                />
              ))}
            </div>
          </>
        ) : userArtifactsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-claude-textSecondary" />
          </div>
        ) : userArtifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-claude-textSecondary">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-claude-hover">
              <FileCode size={24} className="opacity-45" />
            </div>
            <p className="mb-1 text-[15px] font-medium text-claude-text">No artifacts yet</p>
            <p className="text-[13px]">HTML files created by CloAI will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {userArtifacts.map((artifact) => (
              <UserArtifactCard key={artifact.id} artifact={artifact} onOpen={() => handleOpenUserArtifact(artifact)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtifactsPage;
