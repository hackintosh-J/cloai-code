import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '@/src/components/shared/utils/clipboard';

type DiffKind = 'added' | 'removed' | 'context';

interface DiffLine {
  type: DiffKind;
  content: string;
}

interface NumberedDiffLine extends DiffLine {
  oldNum: number | null;
  newNum: number | null;
}

interface ToolDiffViewProps {
  toolName: string;
  input: any;
  result?: string | any;
}

type ThemePalette = ReturnType<typeof getThemePalette>;

const MAX_LCS_CELLS = 500_000;
const MAX_READ_LINES = 200;
const MAX_BASH_OUTPUT = 3_000;

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => (
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  ));

  useEffect(() => {
    const refresh = () => setIsDark(document.documentElement.classList.contains('dark'));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function useCopyButton() {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    await copyToClipboard(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return { copied, copy };
}

function getThemePalette(isDark: boolean) {
  return {
    shell: isDark ? 'border-[#383836] bg-[#1e1e1e]' : 'border-[#E5E5E5] bg-[#FCFCFA]',
    header: isDark ? 'bg-[#2d2d2d] border-b border-[#383836]' : 'bg-[#f5f5f0] border-b border-[#E5E5E5]',
    button: isDark ? 'hover:bg-[#404040] text-[#999]' : 'hover:bg-[#e8e8e4] text-[#666]',
    file: isDark ? 'text-[#e0a370]' : 'text-[#b35c2a]',
    muted: isDark ? 'text-[#666]' : 'text-[#999]',
    lineNo: isDark ? 'text-[#555] border-r border-[#333]' : 'text-[#bbb] border-r border-[#eee]',
    body: isDark ? 'text-[#ccc]' : 'text-[#333]',
    output: isDark ? 'text-[#aaa]' : 'text-[#555]',
    addedRow: isDark ? 'bg-[#1a3a2a]' : 'bg-[#e6ffec]',
    removedRow: isDark ? 'bg-[#3a1a1a]' : 'bg-[#ffebe9]',
    addedMark: isDark ? 'text-[#7ee787]' : 'text-[#1a7f37]',
    removedMark: isDark ? 'text-[#f47067]' : 'text-[#cf222e]',
    addedText: isDark ? 'text-[#afd8af]' : 'text-[#1a3a1a]',
    removedText: isDark ? 'text-[#d8afaf]' : 'text-[#3a1a1a]',
  };
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

function fileExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const oldCount = oldLines.length;
  const newCount = newLines.length;

  if (oldCount * newCount > MAX_LCS_CELLS) {
    return [
      ...oldLines.map((content) => ({ type: 'removed' as const, content })),
      ...newLines.map((content) => ({ type: 'added' as const, content })),
    ];
  }

  const width = newCount + 1;
  const table = new Uint32Array((oldCount + 1) * width);

  for (let oldIndex = 1; oldIndex <= oldCount; oldIndex += 1) {
    for (let newIndex = 1; newIndex <= newCount; newIndex += 1) {
      const offset = oldIndex * width + newIndex;
      if (oldLines[oldIndex - 1] === newLines[newIndex - 1]) {
        table[offset] = table[(oldIndex - 1) * width + newIndex - 1] + 1;
      } else {
        table[offset] = Math.max(table[(oldIndex - 1) * width + newIndex], table[oldIndex * width + newIndex - 1]);
      }
    }
  }

  const reversed: DiffLine[] = [];
  let oldIndex = oldCount;
  let newIndex = newCount;

  while (oldIndex > 0 || newIndex > 0) {
    if (oldIndex > 0 && newIndex > 0 && oldLines[oldIndex - 1] === newLines[newIndex - 1]) {
      reversed.push({ type: 'context', content: oldLines[oldIndex - 1] });
      oldIndex -= 1;
      newIndex -= 1;
      continue;
    }

    const canAdd = newIndex > 0;
    const shouldAdd = oldIndex === 0 || table[oldIndex * width + newIndex - 1] >= table[(oldIndex - 1) * width + newIndex];
    if (canAdd && shouldAdd) {
      reversed.push({ type: 'added', content: newLines[newIndex - 1] });
      newIndex -= 1;
    } else {
      reversed.push({ type: 'removed', content: oldLines[oldIndex - 1] });
      oldIndex -= 1;
    }
  }

  return reversed.reverse();
}

function attachLineNumbers(lines: DiffLine[]): NumberedDiffLine[] {
  let oldLine = 1;
  let newLine = 1;

  return lines.map((line) => {
    const numbered: NumberedDiffLine = { ...line, oldNum: null, newNum: null };
    if (line.type === 'context') {
      numbered.oldNum = oldLine;
      numbered.newNum = newLine;
      oldLine += 1;
      newLine += 1;
    } else if (line.type === 'removed') {
      numbered.oldNum = oldLine;
      oldLine += 1;
    } else {
      numbered.newNum = newLine;
      newLine += 1;
    }
    return numbered;
  });
}

function formatDiffForCopy(lines: DiffLine[]): string {
  return lines
    .map((line) => `${line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '} ${line.content}`)
    .join('\n');
}

function CopyButton({
  copied,
  onCopy,
  palette,
}: {
  copied: boolean;
  onCopy: () => void;
  palette: ThemePalette;
}) {
  return (
    <button type="button" onClick={onCopy} className={`rounded p-1 transition-colors ${palette.button}`}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function CodeFrame({
  header,
  palette,
  copyText,
  children,
}: {
  header: React.ReactNode;
  palette: ThemePalette;
  copyText?: string;
  children: React.ReactNode;
}) {
  const { copied, copy } = useCopyButton();

  return (
    <div className={`overflow-hidden rounded-md border font-mono text-[12px] ${palette.shell}`}>
      <div className={`flex items-center justify-between px-3 py-1.5 ${palette.header}`}>
        <div className="flex min-w-0 items-center gap-2">{header}</div>
        {copyText !== undefined && (
          <CopyButton copied={copied} onCopy={() => copy(copyText)} palette={palette} />
        )}
      </div>
      {children}
    </div>
  );
}

function rowClasses(line: DiffLine, palette: ThemePalette): string {
  if (line.type === 'added') return palette.addedRow;
  if (line.type === 'removed') return palette.removedRow;
  return '';
}

function markerClasses(line: DiffLine, palette: ThemePalette): string {
  if (line.type === 'added') return palette.addedMark;
  if (line.type === 'removed') return palette.removedMark;
  return palette.lineNo.split(' ')[0];
}

function textClasses(line: DiffLine, palette: ThemePalette): string {
  if (line.type === 'added') return palette.addedText;
  if (line.type === 'removed') return palette.removedText;
  return palette.body;
}

function markerForLine(type: DiffKind): string {
  if (type === 'added') return '+';
  if (type === 'removed') return '-';
  return ' ';
}

function DiffTable({ lines, palette }: { lines: NumberedDiffLine[]; palette: ThemePalette }) {
  return (
    <div className="max-h-[400px] overflow-auto">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className={rowClasses(line, palette)}>
              <td className={`w-[1%] select-none whitespace-nowrap px-2 text-right ${palette.lineNo}`}>{line.oldNum ?? ''}</td>
              <td className={`w-[1%] select-none whitespace-nowrap px-2 text-right ${palette.lineNo}`}>{line.newNum ?? ''}</td>
              <td className={`w-[1%] select-none px-1 text-center ${markerClasses(line, palette)}`}>{markerForLine(line.type)}</td>
              <td className={`break-all px-2 whitespace-pre-wrap ${textClasses(line, palette)}`}>{line.content || '\u00A0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineTable({
  lines,
  palette,
  marker,
  markerClass,
  textClass,
  truncatedCount = 0,
}: {
  lines: string[];
  palette: ThemePalette;
  marker?: string;
  markerClass?: string;
  textClass?: string;
  truncatedCount?: number;
}) {
  const colSpan = marker ? 3 : 2;

  return (
    <div className="max-h-[400px] overflow-auto">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className={marker === '+' ? palette.addedRow : ''}>
              <td className={`w-[1%] select-none whitespace-nowrap px-2 text-right ${palette.lineNo}`}>{index + 1}</td>
              {marker && <td className={`w-[1%] select-none px-1 text-center ${markerClass}`}>{marker}</td>}
              <td className={`break-all whitespace-pre-wrap ${marker ? 'px-2' : 'px-3'} ${textClass || palette.body}`}>{line || '\u00A0'}</td>
            </tr>
          ))}
          {truncatedCount > 0 && (
            <tr>
              <td colSpan={colSpan} className={`px-3 py-2 text-center ${palette.muted}`}>
                ...{truncatedCount} more lines truncated
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EditView({ input, palette }: { input: any; palette: ThemePalette }) {
  const oldText = input?.old_string || '';
  const newText = input?.new_string || '';
  const filePath = input?.file_path || '';
  const diffLines = useMemo(() => computeDiff(oldText.split('\n'), newText.split('\n')), [oldText, newText]);
  const numberedLines = useMemo(() => attachLineNumbers(diffLines), [diffLines]);
  const ext = fileExtension(filePath);

  if (!oldText && !newText) return null;

  return (
    <CodeFrame
      palette={palette}
      copyText={formatDiffForCopy(diffLines)}
      header={
        <>
          <span className={palette.file}>{fileNameFromPath(filePath)}</span>
          {ext && <span className={palette.muted}>{ext}</span>}
        </>
      }
    >
      <DiffTable lines={numberedLines} palette={palette} />
    </CodeFrame>
  );
}

function WriteView({ input, palette }: { input: any; palette: ThemePalette }) {
  const content = input?.content || '';
  const filePath = input?.file_path || '';
  if (!content) return null;

  return (
    <CodeFrame
      palette={palette}
      copyText={content}
      header={
        <>
          <span className={palette.addedMark}>+ New file</span>
          <span className={palette.file}>{fileNameFromPath(filePath)}</span>
        </>
      }
    >
      <LineTable lines={content.split('\n')} palette={palette} marker="+" markerClass={palette.addedMark} textClass={palette.addedText} />
    </CodeFrame>
  );
}

function BashView({ input, result, palette }: { input: any; result: string | any; palette: ThemePalette }) {
  const command = input?.command || '';
  const rawOutput = typeof result === 'string' ? result : result != null ? JSON.stringify(result) : '';
  const output = rawOutput.length > MAX_BASH_OUTPUT ? `${rawOutput.slice(0, MAX_BASH_OUTPUT)}\n...(truncated)` : rawOutput;

  if (!command && !output) return null;

  return (
    <div className={`overflow-hidden rounded-md border font-mono text-[12px] ${palette.shell}`}>
      {command && (
        <div className={`px-3 py-2 ${palette.header}`}>
          <span className={palette.addedMark}>$</span>
          <span className={`ml-2 ${palette.body}`}>{command}</span>
        </div>
      )}
      {output && (
        <div className={`max-h-[400px] overflow-auto break-all px-3 py-2 whitespace-pre-wrap ${palette.output}`}>
          {output}
        </div>
      )}
    </div>
  );
}

function ReadView({ input, result, palette }: { input: any; result: string | any; palette: ThemePalette }) {
  const output = typeof result === 'string' ? result : '';
  if (!output) return null;

  const lines = output.split('\n');
  const displayLines = lines.slice(0, MAX_READ_LINES);
  const truncatedCount = Math.max(0, lines.length - displayLines.length);

  return (
    <CodeFrame
      palette={palette}
      header={<span className={palette.file}>{fileNameFromPath(input?.file_path || '')}</span>}
    >
      <LineTable lines={displayLines} palette={palette} truncatedCount={truncatedCount} />
    </CodeFrame>
  );
}

const ToolDiffView: React.FC<ToolDiffViewProps> = ({ toolName, input, result }) => {
  const palette = getThemePalette(useDarkMode());

  if (toolName === 'Edit' || toolName === 'MultiEdit') {
    return <EditView input={input} palette={palette} />;
  }
  if (toolName === 'Write') {
    return <WriteView input={input} palette={palette} />;
  }
  if (toolName === 'Bash') {
    return <BashView input={input} result={result} palette={palette} />;
  }
  if (toolName === 'Read') {
    return <ReadView input={input} result={result} palette={palette} />;
  }
  return null;
};

export function shouldUseDiffView(toolName: string, input: any): boolean {
  if (toolName === 'Edit' || toolName === 'MultiEdit') {
    return !!(input?.old_string || input?.new_string);
  }
  if (toolName === 'Write') {
    return !!input?.content;
  }
  if (toolName === 'Bash') {
    return !!input?.command;
  }
  if (toolName === 'Read') {
    return !!input?.file_path;
  }
  return false;
}

export function hasExpandableContent(toolName: string, input: any, result: any): boolean {
  if (result != null && result !== '') return true;
  return shouldUseDiffView(toolName, input);
}

export function getToolStats(toolName: string, input: any): { added: number; removed: number } | null {
  if (toolName === 'Edit' || toolName === 'MultiEdit') {
    const oldText = input?.old_string || '';
    const newText = input?.new_string || '';
    if (!oldText && !newText) return null;
    return {
      added: newText ? newText.split('\n').length : 0,
      removed: oldText ? oldText.split('\n').length : 0,
    };
  }

  if (toolName === 'Write') {
    const content = input?.content || '';
    if (!content) return null;
    return { added: content.split('\n').length, removed: 0 };
  }

  return null;
}

export default ToolDiffView;
