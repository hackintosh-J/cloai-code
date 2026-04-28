import React from 'react';

// Overlay that mirrors textarea text: /skill-name in blue, rest in normal color
const SkillInputOverlay: React.FC<{ text: string; className?: string; style?: React.CSSProperties }> = ({ text, className, style }) => {
  const match = text.match(/^(\/[a-zA-Z0-9_-]+)([\s\S]*)$/);
  if (!match) return null;

  return (
    <div className={className} style={{ ...style, pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} aria-hidden>
      <span className="text-[#4B9EFA]">{match[1]}</span>
      <span className="text-claude-text">{match[2] || ''}</span>
    </div>
  );
};

export default SkillInputOverlay;
