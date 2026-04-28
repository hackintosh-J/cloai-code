import React, { memo } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { IconResearch } from '@/src/components/Icons';
import MarkdownRenderer from '@/src/components/MarkdownRenderer';

export interface ResearchSource {
    url: string;
    title: string;
    snippet?: string;
    favicon?: string;
}

export interface ResearchSubAgent {
    id: string;
    index?: number;
    sub_question: string;
    status: 'running' | 'done' | 'error';
    sources: ResearchSource[];
    findings: string;
    error?: string;
}

export interface ResearchData {
    plan?: { title?: string; sub_questions: string[] } | null;
    sub_agents: ResearchSubAgent[];
    sources: ResearchSource[];
    phase?: 'planning' | 'gathering' | 'writing' | null;
    phase_label?: string;
    report?: string | null;
    completed?: boolean;
    duration_ms?: number;
    error?: string;
}

interface Props {
    research: ResearchData;
    onClose: () => void;
}

function readHost(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url || 'source';
    }
}

function resolveFavicon(source: ResearchSource): string {
    if (source.favicon) return source.favicon;
    try {
        const { hostname } = new URL(source.url);
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    } catch {
        return '';
    }
}

function pluralize(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function formatDuration(ms?: number): string {
    return ms ? ` · ${(ms / 1000).toFixed(1)}s` : '';
}

const PanelHeading = memo(function PanelHeading({
    icon,
    label,
    meta,
}: {
    icon: React.ReactNode;
    label: string;
    meta?: string;
}) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <div className="text-[#2E7CF6] flex-shrink-0">{icon}</div>
            <h3 className="text-[14px] font-semibold text-claude-text">{label}</h3>
            {meta && <span className="text-[12px] text-claude-textSecondary">{meta}</span>}
        </div>
    );
});

const SourceChip = memo(function SourceChip({ source }: { source: ResearchSource }) {
    const domain = readHost(source.url);
    const favicon = resolveFavicon(source);

    return (
        <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title || domain}
            className="flex max-w-[180px] flex-shrink-0 items-center gap-1.5 rounded-md bg-claude-hover px-2 py-1 transition-colors hover:bg-claude-btnHover"
        >
            {favicon ? (
                <img src={favicon} width={14} height={14} alt="" className="flex-shrink-0 rounded-sm" />
            ) : (
                <span className="h-3.5 w-3.5 flex-shrink-0 rounded-sm bg-claude-textSecondary" />
            )}
            <span className="truncate text-[11px] text-claude-textSecondary">{domain}</span>
        </a>
    );
});

function SourceList({ sources }: { sources: ResearchSource[] }) {
    if (sources.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            {sources.map((source, index) => (
                <SourceChip key={`${source.url}-${index}`} source={source} />
            ))}
        </div>
    );
}

function StatusIcon({ status }: { status: ResearchSubAgent['status'] }) {
    if (status === 'running') {
        return <Loader2 size={14} className="flex-shrink-0 animate-spin text-[#2E7CF6]" />;
    }
    if (status === 'error') {
        return <span className="flex-shrink-0 text-[14px] text-red-500">x</span>;
    }
    return <Check size={14} className="flex-shrink-0 text-claude-textSecondary" />;
}

function ResearchPlan({
    plan,
    active,
}: {
    plan: NonNullable<ResearchData['plan']>;
    active: boolean;
}) {
    return (
        <section>
            <PanelHeading
                icon={active ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                label="Research plan created"
                meta={pluralize(plan.sub_questions.length, 'sub-question')}
            />
            <ol className="ml-6 list-decimal space-y-1.5 text-[12.5px] text-claude-textSecondary">
                {plan.sub_questions.map((question, index) => (
                    <li key={`${question}-${index}`}>{question}</li>
                ))}
            </ol>
        </section>
    );
}

function SubAgentSection({ agent }: { agent: ResearchSubAgent }) {
    return (
        <section className="border-l-2 border-claude-border pl-4">
            <div className="mb-2 flex items-center gap-2">
                <StatusIcon status={agent.status} />
                <h4 className="text-[13px] font-medium text-claude-text">{agent.sub_question}</h4>
            </div>
            {agent.sources.length > 0 && (
                <div className="mb-3">
                    <SourceList sources={agent.sources} />
                </div>
            )}
            {agent.findings && (
                <div className="prose-sm max-w-none text-[12.5px] leading-relaxed text-claude-textSecondary">
                    <MarkdownRenderer content={agent.findings} />
                </div>
            )}
            {agent.error && <div className="text-[12px] italic text-red-500">Error: {agent.error}</div>}
        </section>
    );
}

const ResearchPanel: React.FC<Props> = ({ research, onClose }) => {
    const {
        plan,
        sub_agents: subAgents = [],
        sources = [],
        phase,
        phase_label: phaseLabel,
        report,
        completed,
        error,
        duration_ms: durationMs,
    } = research;
    const planStillActive = !completed && subAgents.length === 0;

    return (
        <div className="flex h-full w-full flex-col bg-transparent">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-claude-border px-5 py-4">
                <div className="flex min-w-0 items-center gap-2">
                    <IconResearch size={18} className="flex-shrink-0 text-[#2E7CF6]" />
                    <h2 className="truncate text-[15px] font-semibold text-claude-text">
                        {plan?.title || 'Research'}
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-shrink-0 rounded-lg p-1.5 text-claude-textSecondary transition-colors hover:bg-claude-hover hover:text-claude-text"
                    title="Close"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                {plan && <ResearchPlan plan={plan} active={planStillActive} />}

                {sources.length > 0 && (
                    <section>
                        <PanelHeading icon={<Check size={16} />} label={`Gathered ${pluralize(sources.length, 'source')}`} />
                        <div className="ml-6">
                            <SourceList sources={sources} />
                        </div>
                    </section>
                )}

                {subAgents.map((agent) => (
                    <SubAgentSection key={agent.id} agent={agent} />
                ))}

                {phase && !completed && (
                    <section className="flex items-center gap-2 text-[12.5px] text-claude-textSecondary">
                        <Loader2 size={14} className="animate-spin text-[#2E7CF6]" />
                        <span>{phaseLabel || phase}</span>
                    </section>
                )}

                {report && (
                    <section>
                        <PanelHeading icon={<Check size={16} />} label="Final report" />
                        <div className="prose prose-sm ml-6 max-w-none text-[13px] dark:prose-invert">
                            <MarkdownRenderer content={report} />
                        </div>
                    </section>
                )}

                {error && (
                    <section className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <p className="text-[12.5px] text-red-700 dark:text-red-300">Research error: {error}</p>
                    </section>
                )}

                {completed && !error && (
                    <section className="pb-4 pt-2 text-center text-[11.5px] text-claude-textSecondary">
                        Research complete{formatDuration(durationMs)}
                    </section>
                )}
            </div>
        </div>
    );
};

export default ResearchPanel;
