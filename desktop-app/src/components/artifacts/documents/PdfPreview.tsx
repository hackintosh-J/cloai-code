import React from 'react';
import { PdfSection } from '@/src/components/DocumentCard';

interface PdfPreviewProps {
  sections: PdfSection[];
  title: string;
}

const BODY_FONT = "'Helvetica Neue', Arial, 'PingFang SC', sans-serif";
const ACCENT = '#4472C4';

const sheetStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 560,
  background: '#fff',
  borderRadius: 4,
  boxShadow: '0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)',
  padding: '40px 48px',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: BODY_FONT,
};

const coverStyle: React.CSSProperties = {
  ...sheetStyle,
  minHeight: 420,
  justifyContent: 'center',
  alignItems: 'center',
};

const textFromSection = (section: PdfSection) =>
  typeof section.content === 'string' ? section.content : '';

const paragraphsFrom = (section: PdfSection) =>
  textFromSection(section)
    .split('\n\n')
    .map(para => para.trim())
    .filter(Boolean);

const listItemsFrom = (section: PdfSection) => {
  if (Array.isArray(section.content)) return section.content;
  if (typeof section.content !== 'string') return [];
  return section.content.split('\n').filter(line => line.trim());
};

const renderHeading = (section: PdfSection, key: number) => {
  const level = section.level || 1;
  const content = textFromSection(section);

  if (level === 1) {
    return (
      <h1
        key={key}
        className="text-[20px] font-bold mt-7 mb-3"
        style={{ fontFamily: BODY_FONT, color: ACCENT, lineHeight: 1.3 }}
      >
        {content}
      </h1>
    );
  }

  if (level === 2) {
    return (
      <h2
        key={key}
        className="text-[16px] font-bold text-[#2D2D2D] mt-6 mb-2"
        style={{ fontFamily: BODY_FONT, lineHeight: 1.3 }}
      >
        {content}
      </h2>
    );
  }

  return (
    <h3
      key={key}
      className="text-[13.5px] font-bold text-[#444] mt-4 mb-1.5"
      style={{ fontFamily: BODY_FONT }}
    >
      {content}
    </h3>
  );
};

const renderParagraphs = (section: PdfSection, key: number) => (
  <div key={key}>
    {paragraphsFrom(section).map((paragraph, paragraphIndex) => (
      <p
        key={paragraphIndex}
        className="text-[12px] text-[#2D2D2D] mb-2"
        style={{ fontFamily: BODY_FONT, lineHeight: 1.7, textAlign: 'justify' }}
      >
        {paragraph}
      </p>
    ))}
  </div>
);

const renderTable = (section: PdfSection, key: number) => {
  const headers = section.headers || [];
  const rows = section.rows || [];

  return (
    <div key={key} className="overflow-x-auto my-3">
      <table className="w-full border-collapse text-[11px]" style={{ fontFamily: BODY_FONT }}>
        {headers.length > 0 && (
          <thead>
            <tr style={{ background: ACCENT }}>
              {headers.map((header, headerIndex) => (
                <th
                  key={headerIndex}
                  className="px-2.5 py-1.5 text-left font-medium text-white text-[11px]"
                  style={{ border: '0.5px solid #D9D9D9' }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ background: rowIndex % 2 === 1 ? '#F5F7FA' : '#fff' }}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-2.5 py-1.5 text-[11px] text-[#2D2D2D]"
                  style={{ border: '0.5px solid #D9D9D9' }}
                >
                  {cell ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const renderList = (section: PdfSection, key: number) => {
  const ListTag = section.ordered ? 'ol' : 'ul';
  const markerClass = section.ordered ? 'list-decimal' : 'list-disc';

  return (
    <ListTag key={key} className={`${markerClass} pl-5 mb-2 space-y-0.5`}>
      {listItemsFrom(section).map((item, itemIndex) => (
        <li
          key={itemIndex}
          className="text-[12px] text-[#2D2D2D]"
          style={{ fontFamily: BODY_FONT, lineHeight: 1.6 }}
        >
          {item}
        </li>
      ))}
    </ListTag>
  );
};

const renderSection = (section: PdfSection, index: number) => {
  switch (section.type) {
    case 'heading':
      return renderHeading(section, index);
    case 'paragraph':
      return renderParagraphs(section, index);
    case 'table':
      return renderTable(section, index);
    case 'list':
      return renderList(section, index);
    case 'pagebreak':
      return <div key={index} className="my-6 border-t-2 border-dashed border-[#D9D9D9]" />;
    default:
      return null;
  }
};

const PdfPreview: React.FC<PdfPreviewProps> = ({ sections, title }) => (
  <div className="flex flex-col items-center gap-5 pb-8">
    <div style={coverStyle}>
      <div className="w-16 h-[2px] mb-8" style={{ background: ACCENT }} />
      <h1
        className="text-[26px] font-bold text-[#2D2D2D] text-center leading-tight mb-3"
        style={{ fontFamily: BODY_FONT }}
      >
        {title}
      </h1>
      <div className="w-16 h-[2px] mt-8" style={{ background: ACCENT }} />
    </div>

    <div style={sheetStyle}>
      <div className="flex justify-between pb-1.5 mb-3 border-b" style={{ borderColor: ACCENT }}>
        <span className="text-[9px] text-[#999]" style={{ fontFamily: BODY_FONT }}>
          {title}
        </span>
      </div>
      <div className="flex-1">{sections.map(renderSection)}</div>
      <div className="flex justify-center pt-2 mt-4 border-t border-[#D9D9D9]">
        <span className="text-[9px] text-[#999]" style={{ fontFamily: BODY_FONT }}>
          Page 1
        </span>
      </div>
    </div>
  </div>
);

export default PdfPreview;
