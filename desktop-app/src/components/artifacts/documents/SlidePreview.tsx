import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SlideInfo } from '@/src/components/DocumentCard';

type ColorScheme = {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textDark: string;
};

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  ocean: { primary: '#1A5276', secondary: '#2E86C1', accent: '#3498DB', text: '#FFFFFF', textDark: '#2C3E50' },
  forest: { primary: '#1E8449', secondary: '#27AE60', accent: '#2ECC71', text: '#FFFFFF', textDark: '#1B4332' },
  sunset: { primary: '#E74C3C', secondary: '#E67E22', accent: '#F39C12', text: '#FFFFFF', textDark: '#641E16' },
  lavender: { primary: '#6C3483', secondary: '#8E44AD', accent: '#BB8FCE', text: '#FFFFFF', textDark: '#4A235A' },
  slate: { primary: '#2C3E50', secondary: '#34495E', accent: '#D97757', text: '#FFFFFF', textDark: '#1C2833' },
  coral: { primary: '#C0392B', secondary: '#E74C3C', accent: '#F1948A', text: '#FFFFFF', textDark: '#641E16' },
  teal: { primary: '#008080', secondary: '#20B2AA', accent: '#48D1CC', text: '#FFFFFF', textDark: '#004D4D' },
  midnight: { primary: '#1B2631', secondary: '#2C3E50', accent: '#5DADE2', text: '#FFFFFF', textDark: '#0D1117' },
  rose: { primary: '#C2185B', secondary: '#E91E63', accent: '#F48FB1', text: '#FFFFFF', textDark: '#880E4F' },
  emerald: { primary: '#00695C', secondary: '#00897B', accent: '#4DB6AC', text: '#FFFFFF', textDark: '#004D40' },
  amber: { primary: '#FF8F00', secondary: '#FFA000', accent: '#FFD54F', text: '#FFFFFF', textDark: '#E65100' },
  indigo: { primary: '#283593', secondary: '#3949AB', accent: '#7986CB', text: '#FFFFFF', textDark: '#1A237E' },
  charcoal: { primary: '#37474F', secondary: '#546E7A', accent: '#D97757', text: '#FFFFFF', textDark: '#263238' },
  burgundy: { primary: '#7B1FA2', secondary: '#9C27B0', accent: '#CE93D8', text: '#FFFFFF', textDark: '#4A148C' },
  steel: { primary: '#455A64', secondary: '#607D8B', accent: '#90A4AE', text: '#FFFFFF', textDark: '#263238' },
  professional: { primary: '#1565C0', secondary: '#1976D2', accent: '#42A5F5', text: '#FFFFFF', textDark: '#0D47A1' },
  warm: { primary: '#D97757', secondary: '#E8956A', accent: '#F5C6A8', text: '#FFFFFF', textDark: '#5D3A2A' },
  minimal: { primary: '#424242', secondary: '#616161', accent: '#BDBDBD', text: '#FFFFFF', textDark: '#212121' },
};

interface SlidePreviewProps {
  slides: SlideInfo[];
  title: string;
  colorScheme?: string;
}

type SlideLayout = NonNullable<SlideInfo['layout']>;

interface SlideRenderProps {
  colors: ColorScheme;
  index: number;
  slide: SlideInfo;
  slideCount: number;
}

const parseBullets = (content: string) =>
  content
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.replace(/^[-*•]\s*/, ''));

const firstLineOf = (content: string) => content.split('\n')[0];

const SlideNumber = ({
  className = 'text-[10px] text-right flex-shrink-0',
  color,
  index,
  total,
}: {
  className?: string;
  color?: string;
  index: number;
  total: number;
}) => (
  <div className={className} style={color ? { color } : undefined}>
    {index + 1} / {total}
  </div>
);

const TopRule = ({ color, className = 'w-full h-1 rounded mb-4 flex-shrink-0' }: { color: string; className?: string }) => (
  <div className={className} style={{ backgroundColor: color }} />
);

const BulletRows = ({
  bullets,
  marker,
  markerClassName = 'mt-1 flex-shrink-0 text-[10px]',
  markerColor,
  rowClassName = 'flex items-start gap-2 mb-1.5',
  textClassName,
}: {
  bullets: string[];
  marker: string;
  markerClassName?: string;
  markerColor: string;
  rowClassName?: string;
  textClassName: string;
}) => (
  <>
    {bullets.map((bullet, bulletIndex) => (
      <div key={bulletIndex} className={rowClassName}>
        <span className={markerClassName} style={{ color: markerColor }}>
          {marker}
        </span>
        <span className={textClassName}>{bullet}</span>
      </div>
    ))}
  </>
);

const CoverSlide = ({ colors, slide }: SlideRenderProps) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: colors.primary }}>
    <div className="w-full h-1 absolute top-0" style={{ backgroundColor: colors.accent }} />
    <h2 className="text-[20px] font-bold text-center px-6" style={{ color: colors.text }}>
      {slide.title}
    </h2>
    {slide.content && (
      <p className="text-[13px] mt-2 px-6 text-center" style={{ color: colors.accent }}>
        {firstLineOf(slide.content)}
      </p>
    )}
    <div className="w-full h-1 absolute bottom-0" style={{ backgroundColor: colors.accent }} />
  </div>
);

const SectionSlide = ({ colors, index, slide, slideCount }: SlideRenderProps) => (
  <div className="absolute inset-0 flex flex-col justify-center p-6" style={{ backgroundColor: colors.secondary }}>
    <h2 className="text-[18px] font-bold mb-2" style={{ color: colors.text }}>
      {slide.title}
    </h2>
    <div className="w-12 h-0.5 mb-3" style={{ backgroundColor: colors.accent }} />
    {slide.content && (
      <p className="text-[12px]" style={{ color: colors.accent }}>
        {firstLineOf(slide.content)}
      </p>
    )}
    <SlideNumber
      className="absolute bottom-3 right-4 text-[10px]"
      color="rgba(255,255,255,0.5)"
      index={index}
      total={slideCount}
    />
  </div>
);

const TwoColumnSlide = ({ colors, index, slide, slideCount }: SlideRenderProps) => {
  const leftBullets = parseBullets(slide.left_content || '');
  const rightBullets = parseBullets(slide.right_content || '');

  return (
    <div className="absolute inset-0 p-6 flex flex-col bg-white">
      <TopRule color={colors.primary} className="w-full h-1 rounded mb-3 flex-shrink-0" />
      <h3 className="text-[15px] font-bold mb-1 flex-shrink-0" style={{ color: colors.textDark }}>
        {slide.title}
      </h3>
      <div className="w-16 h-0.5 mb-3 flex-shrink-0" style={{ backgroundColor: colors.primary }} />
      <div className="flex-1 flex gap-3 overflow-hidden">
        <div className="flex-1">
          <BulletRows
            bullets={leftBullets}
            marker="●"
            markerClassName="mt-0.5 flex-shrink-0 text-[10px]"
            markerColor={colors.primary}
            rowClassName="flex items-start gap-1.5 mb-1"
            textClassName="text-[11px] text-[#444] leading-relaxed"
          />
        </div>
        <div className="w-px flex-shrink-0" style={{ backgroundColor: '#DDD' }} />
        <div className="flex-1">
          <BulletRows
            bullets={rightBullets}
            marker="●"
            markerClassName="mt-0.5 flex-shrink-0 text-[10px]"
            markerColor={colors.accent}
            rowClassName="flex items-start gap-1.5 mb-1"
            textClassName="text-[11px] text-[#444] leading-relaxed"
          />
        </div>
      </div>
      <SlideNumber className="text-[10px] text-[#999] text-right flex-shrink-0" index={index} total={slideCount} />
    </div>
  );
};

const SummarySlide = ({ colors, index, slide, slideCount }: SlideRenderProps) => (
  <div className="absolute inset-0 p-6 flex flex-col" style={{ backgroundColor: colors.primary }}>
    <TopRule color={colors.accent} />
    <h3 className="text-[16px] font-bold text-center mb-4 flex-shrink-0" style={{ color: colors.text }}>
      {slide.title}
    </h3>
    <div className="flex-1 overflow-hidden flex flex-col items-center">
      {parseBullets(slide.content || '').map((bullet, bulletIndex) => (
        <div key={bulletIndex} className="flex items-start gap-2 mb-2 max-w-[80%]">
          <span className="mt-0.5 flex-shrink-0 text-[11px]" style={{ color: colors.accent }}>
            ✓
          </span>
          <span className="text-[12px] leading-relaxed" style={{ color: colors.accent }}>
            {bullet}
          </span>
        </div>
      ))}
    </div>
    <SlideNumber
      color="rgba(255,255,255,0.5)"
      index={index}
      total={slideCount}
    />
  </div>
);

const ContentSlide = ({ colors, index, slide, slideCount }: SlideRenderProps) => (
  <div className="absolute inset-0 p-6 flex flex-col bg-white">
    <TopRule color={colors.primary} />
    <h3 className="text-[16px] font-bold mb-1 flex-shrink-0" style={{ color: colors.textDark }}>
      {slide.title}
    </h3>
    <div className="w-16 h-0.5 mb-3 flex-shrink-0" style={{ backgroundColor: colors.primary }} />
    <div className="flex-1 overflow-hidden">
      <BulletRows
        bullets={parseBullets(slide.content || '')}
        marker="●"
        markerColor={colors.primary}
        textClassName="text-[13px] text-[#444] leading-relaxed"
      />
    </div>
    <SlideNumber className="text-[11px] text-[#999] text-right flex-shrink-0" index={index} total={slideCount} />
  </div>
);

const SLIDE_LAYOUTS: Record<SlideLayout, React.FC<SlideRenderProps>> = {
  cover: CoverSlide,
  section: SectionSlide,
  content: ContentSlide,
  two_column: TwoColumnSlide,
  summary: SummarySlide,
};

const SlideCanvas = (props: SlideRenderProps) => {
  const layout = props.slide.layout || 'content';
  const Layout = SLIDE_LAYOUTS[layout] || ContentSlide;
  return <Layout {...props} />;
};

const NotesPanel = ({
  expanded,
  notes,
  onToggle,
}: {
  expanded: boolean;
  notes: string;
  onToggle: () => void;
}) => (
  <div className="border-t border-[#E5E5E5]">
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-4 py-2 text-[12px] text-[#777] hover:bg-[#FAFAFA] transition-colors"
    >
      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      演讲者备注
    </button>
    {expanded && (
      <div className="px-4 pb-3 text-[13px] text-[#555] leading-relaxed whitespace-pre-wrap">
        {notes}
      </div>
    )}
  </div>
);

const SlideCard = React.memo(({
  colors,
  expanded,
  index,
  onToggleNotes,
  slide,
  slideCount,
}: SlideRenderProps & {
  expanded: boolean;
  onToggleNotes: (index: number) => void;
}) => (
  <div className="border border-[#E5E5E5] rounded-lg overflow-hidden">
    <div className="relative" style={{ paddingBottom: '56.25%' }}>
      <SlideCanvas colors={colors} index={index} slide={slide} slideCount={slideCount} />
    </div>
    {slide.notes && (
      <NotesPanel expanded={expanded} notes={slide.notes} onToggle={() => onToggleNotes(index)} />
    )}
  </div>
));

const SlidePreview: React.FC<SlidePreviewProps> = ({ slides, colorScheme }) => {
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const colors = useMemo(() => COLOR_SCHEMES[colorScheme || ''] || COLOR_SCHEMES.warm, [colorScheme]);

  const toggleNotes = useCallback((index: number) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="text-[13px] text-[#999] mb-2">{slides.length} slides</div>
      {slides.map((slide, index) => (
        <SlideCard
          key={index}
          colors={colors}
          expanded={expandedNotes.has(index)}
          index={index}
          onToggleNotes={toggleNotes}
          slide={slide}
          slideCount={slides.length}
        />
      ))}
    </div>
  );
};

export default SlidePreview;
