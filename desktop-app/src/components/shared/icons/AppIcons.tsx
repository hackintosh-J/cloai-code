import React from 'react';
import sidebarToggleImg from '@/assets/navigation/app-shell/sidebar-toggle.png';
import newChatImg from '@/assets/navigation/app-shell/new-chat.png';
import codeImg from '@/assets/navigation/app-shell/code.png';

// Sidebar Toggle
export const IconSidebarToggle = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <img src={sidebarToggleImg} width={size} height={size} className={className} alt="Sidebar Toggle" />
);

// New Chat button icon
export const IconPlusCircle = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <img src={newChatImg} width={size} height={size} className={className} alt="New Chat" />
);

// Generic Plus - Keeping SVG for generic use unless requested
export const IconPlus = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// Research icon - magnifying glass with zigzag trend line inside
export const IconResearch = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="10.5" cy="10.5" r="7.5" />
    <line x1="21" y1="21" x2="16" y2="16" />
    <polyline points="6.5 12 9 9 11 11 14.5 7.5" />
  </svg>
);

// Web Search icon - globe with meridian curves. Drawn inline so `currentColor` lets
// callers tint to the blue accent when enabled. Matches the user-provided icon shape
// (globe with vertical + horizontal sweep curves) while staying a proper stroked SVG.
export const IconWebSearch = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// Chats
export const IconChatBubble = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-label="Chats">
    <g className="transition-transform duration-200 ease-out group-hover:-translate-x-[0.54px] group-hover:-translate-y-[0.16px]">
      <path
        d="M16.5445 9.72754C16.4182 9.53266 16.1678 9.44648 15.943 9.53418C15.7183 9.62215 15.5932 9.85502 15.6324 10.084L15.7369 10.3955C15.9073 10.8986 16.0006 11.438 16.0006 12C16.0006 13.1123 15.6376 14.1386 15.024 14.9687C14.8811 15.1621 14.8956 15.4302 15.0592 15.6064L16.3531 17H11.0006C9.54519 17 8.23527 16.3782 7.32091 15.3848L7.07091 15.1103C6.88996 14.9645 6.62535 14.9606 6.43907 15.1143C6.25267 15.2682 6.20668 15.529 6.31603 15.7344L6.58458 16.0625C7.68048 17.253 9.25377 18 11.0006 18H17.5006C17.6991 17.9998 17.8791 17.8822 17.9586 17.7002C18.038 17.5181 18.0018 17.3058 17.8668 17.1602L16.0631 15.2178C16.6554 14.2876 17.0006 13.1837 17.0006 12C17.0006 11.3271 16.8891 10.6792 16.6842 10.0742L16.5445 9.72754Z"
        fill="currentColor"
      />
    </g>
    <g className="transition-transform duration-200 ease-out group-hover:translate-x-[0.54px] group-hover:translate-y-[0.24px]">
      <path
        d="M8.99962 2C12.3133 2 14.9996 4.68629 14.9996 8C14.9996 11.3137 12.3133 14 8.99962 14H2.49962C2.30105 13.9998 2.12113 13.8821 2.04161 13.7002C1.96224 13.5181 1.99835 13.3058 2.1334 13.1602L3.93516 11.2178C3.34317 10.2878 2.99962 9.18343 2.99962 8C2.99962 4.68643 5.68609 2.00022 8.99962 2ZM8.99962 3C6.23838 3.00022 3.99961 5.23871 3.99961 8C3.99961 9.11212 4.36265 10.1386 4.97618 10.9688C5.11884 11.1621 5.1035 11.4293 4.94004 11.6055L3.64512 13H8.99962C11.761 13 13.9996 10.7614 13.9996 8C13.9996 5.23858 11.761 3 8.99962 3Z"
        fill="currentColor"
      />
    </g>
  </svg>
);

export const IconProjects = ({ size = 20, className = "" }: { size?: number, className?: string }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-label="Projects">
      <g className="transition-transform duration-200 ease-out group-hover:translate-y-[0.36px]">
        <path
          d="M15.8198 7C16.6885 7.00025 17.3624 7.73158 17.3178 8.57617L17.2993 8.74707L16.1332 15.7471C16.0126 16.4699 15.3865 16.9996 14.6538 17H5.34711C4.6142 16.9998 3.98833 16.47 3.86762 15.7471L2.7016 8.74707C2.54922 7.83277 3.25418 7 4.18109 7H15.8198ZM4.18109 8C3.87216 8 3.63722 8.27731 3.68793 8.58203L4.85394 15.582C4.89413 15.8229 5.10291 15.9998 5.34711 16H14.6538C14.8978 15.9996 15.1068 15.8228 15.1469 15.582L16.3129 8.58203L16.3188 8.46973C16.3036 8.21259 16.0899 8.00023 15.8198 8H4.18109Z"
          fill="currentColor"
        />
      </g>
      <g className="transition-transform duration-200 ease-out group-hover:-translate-y-[0.34px]">
        <path
          d="M16.0004 5.5C16.0004 5.224 15.7764 5.00024 15.5004 5H4.50043C4.22428 5 4.00043 5.22386 4.00043 5.5C4.00043 5.77614 4.22428 6 4.50043 6H15.5004C15.7764 5.99976 16.0004 5.776 16.0004 5.5Z"
          fill="currentColor"
        />
      </g>
      <g className="transition-transform duration-200 ease-out group-hover:-translate-y-[0.44px]">
        <path
          d="M14.5004 3.5C14.5004 3.224 14.2764 3.00024 14.0004 3H6.00043C5.72428 3 5.50043 3.22386 5.50043 3.5C5.50043 3.77614 5.72428 4 6.00043 4H14.0004C14.2764 3.99976 14.5004 3.776 14.5004 3.5Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

// Artifacts
export const IconArtifacts = ({ size = 20, className = "" }: { size?: number, className?: string }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-label="Artifacts">
      <g className="transition-transform duration-200 ease-out group-hover:-translate-x-[0.36px] group-hover:-translate-y-[0.2px]">
        <path
          d="M6.35352 3.1464L9.35352 6.14642C9.43935 6.25103 9.5 6.36003 9.5 6.50091C9.4998 6.6332 9.44704 6.75988 9.35352 6.85346L6.35352 9.85347C6.14584 10.0609 5.85611 10.0243 5.64648 9.85347L2.64648 6.85346C2.55296 6.75988 2.5002 6.6332 2.5 6.50091C2.5 6.36841 2.55285 6.24017 2.64648 6.14642L5.64648 3.1464C5.8552 2.97421 6.14635 2.93936 6.35352 3.1464ZM6 8.79194L3.70703 6.49994L6 4.20696L8.29297 6.49994L6 8.79194Z"
          fill="currentColor"
        />
      </g>
      <g className="transition-transform duration-200 ease-out group-hover:translate-y-[0.18px]">
        <path
          d="M16.8984 3.7509C16.9875 3.90632 16.986 4.09826 16.8955 4.25286L15.5791 6.49994L16.8955 8.74702C16.986 8.90159 16.9874 9.09354 16.8984 9.24898C16.8093 9.40436 16.643 9.49996 16.4638 9.49996H11.5C11.3198 9.49996 11.1532 9.4028 11.0644 9.24605C10.976 9.08949 10.9789 8.89736 11.0713 8.74312L12.417 6.49994L11.0713 4.25676C10.9789 4.1025 10.976 3.91037 11.0644 3.75383C11.1532 3.59717 11.3199 3.49992 11.5 3.49992H16.4638C16.6429 3.51309 16.8055 3.58909 16.8984 3.7509ZM13.4287 6.2431C13.5152 6.4107 13.5166 6.58638 13.4287 6.75678L12.3828 8.49995H15.5918L14.5683 6.75287C14.477 6.59683 14.477 6.40303 14.5683 6.24701L15.5918 4.49993H12.3828L13.4287 6.2431Z"
          fill="currentColor"
        />
      </g>
      <g className="transition-transform duration-200 ease-out group-hover:-translate-x-[0.16px] group-hover:translate-y-[0.34px]">
        <path
          d="M7.25293 10.9668C7.40708 10.8793 7.59647 10.8801 7.75 10.9687C7.90356 11.0574 7.99869 11.2211 8 11.3984L8.01074 12.8388L9.30762 13.6054C9.42811 13.6994 9.49994 13.8448 9.5 14C9.5 14.1773 9.40587 14.3418 9.25293 14.4316L8.01074 15.1601L7.99512 16.667C7.97406 16.8184 7.88446 16.9536 7.75 17.0312C7.59642 17.1199 7.40713 17.1207 7.25293 17.0332L6 16.3203L4.74707 17.0332C4.59287 17.1207 4.40358 17.1199 4.25 17.0312C4.09643 16.9425 4.00124 16.7789 4 16.6015L3.99023 15.1601L2.74707 14.4316C2.59413 14.3418 2.5 14.1773 2.5 14C2.50006 13.8448 2.57188 13.6994 2.69238 13.6054L3.99023 12.8388L4 11.3984C4.00131 11.2211 4.09644 11.0574 4.25 10.9687C4.40353 10.8801 4.59292 10.8793 4.74707 10.9668L6 11.6787L7.25293 10.9668ZM4.99512 12.2568L5.75293 12.6884C5.90608 12.7754 6.09392 12.7754 6.24707 12.6884L7.00586 12.2568L7.01172 13.1308C7.01308 13.3068 7.10706 13.4695 7.25879 13.5586L8.01172 14L7.25879 14.4414C7.10706 14.5304 7.01315 14.6932 7.01172 14.8691L7.00586 15.7422L6.24707 15.3115C6.09397 15.2246 5.90603 15.2246 5.75293 15.3115L4.99512 15.7422L4.98828 14.8691C4.98703 14.7152 4.91459 14.5716 4.79492 14.4785L3.98926 14L4.74121 13.5586C4.87421 13.4805 4.96267 13.3457 4.9834 13.1953L4.99512 12.2568Z"
          fill="currentColor"
        />
      </g>
      <g className="transition-transform duration-200 ease-out group-hover:translate-x-[0.3px] group-hover:translate-y-[0.3px]">
        <path
          d="M14 11C15.6568 11 16.9999 12.3432 17 14C17 15.6568 15.6569 17 14 17C12.3431 17 11 15.6568 11 14C11.0001 12.3432 12.3432 11 14 11ZM12 14C12.0001 12.8955 12.8955 12 14 12C15.1045 12 15.9999 12.8955 16 14C16 15.1045 15.1046 16 14 16C12.8954 16 12 15.1045 12 14Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

// Artifacts Exact (Sidebar)
export const IconArtifactsExact = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <IconArtifacts size={size} className={className} />
);


// Code
export const IconCode = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <img src={codeImg} width={size} height={size} className={className} alt="Code" />
);

export const IconNewChat = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <img src={newChatImg} width={size} height={size} className={className} alt="New Chat" />
);

export const IconVoice = ({ size = 20, className = "", active = false }: { size?: number, className?: string; active?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <style>
      {`
        @keyframes voice-wave-bar {
          0%, 100% { transform: scaleY(0.72); opacity: 0.9; }
          50% { transform: scaleY(1.18); opacity: 1; }
        }
      `}
    </style>
    {[
      { x: 1.2, y: 7.1, h: 5.8, delay: '0ms' },
      { x: 4.35, y: 5.15, h: 9.7, delay: '90ms' },
      { x: 7.5, y: 2.4, h: 15.2, delay: '180ms' },
      { x: 10.65, y: 5.15, h: 9.7, delay: '270ms' },
      { x: 13.8, y: 2.4, h: 15.2, delay: '360ms' },
      { x: 16.95, y: 7.1, h: 5.8, delay: '450ms' },
    ].map((bar, index) => (
      <rect
        key={index}
        x={bar.x}
        y={bar.y}
        width="0.95"
        height={bar.h}
        rx="0.475"
        fill="currentColor"
        className={`origin-center transition-transform duration-200 ease-out ${!active ? (index % 2 === 0 ? 'group-hover:-translate-y-[0.85px] group-hover:scale-y-[1.08]' : 'group-hover:translate-y-[0.65px] group-hover:scale-y-[0.94]') : ''}`}
        style={active ? { animation: `voice-wave-bar 1.15s ease-in-out infinite`, animationDelay: bar.delay, transformOrigin: 'center' } : undefined}
      />
    ))}
  </svg>
);

export const IconDotsHorizontal = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);

export const IconStarOutline = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);

export const IconPencil = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

export const IconTrash = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

export const IconCoworkSparkle = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <g clipPath="url(#cowork-sparkle-clip)">
      <path d="M6.272 21.28L12.576 17.76L12.672 17.44L12.576 17.28H12.256L11.2 17.216L7.616 17.12L4.48 16.96L1.44 16.8L0.672 16.64L0 15.68L0.064 15.2L0.704 14.784L1.632 14.848L3.648 15.008L6.688 15.2L8.896 15.328L12.16 15.712H12.672L12.736 15.488L12.576 15.36L12.448 15.232L9.28 13.12L5.888 10.88L4.096 9.568L3.136 8.928L2.656 8.288L2.464 6.944L3.328 5.984L4.512 6.08L4.8 6.144L5.984 7.072L8.544 9.024L11.84 11.52L12.32 11.904L12.512 11.776L12.544 11.68L12.32 11.328L10.56 8L8.64 4.672L7.776 3.296L7.552 2.464C7.456 2.144 7.424 1.824 7.424 1.504L8.384 0.16L8.96 0L10.304 0.192L10.816 0.64L11.648 2.56L12.96 5.536L15.04 9.568L15.68 10.784L16 11.872L16.096 12.192H16.32V12.032L16.48 9.728L16.8 6.944L17.12 3.36L17.216 2.336L17.728 1.12L18.688 0.48L19.52 0.832L20.16 1.76L20.064 2.336L19.712 4.8L18.88 8.672L18.4 11.296H18.688L19.008 10.944L20.32 9.216L22.528 6.464L23.488 5.344L24.64 4.16L25.376 3.584H26.752L27.744 5.088L27.296 6.656L25.888 8.448L24.704 9.952L23.008 12.224L21.984 14.048L22.08 14.176H22.304L26.144 13.344L28.192 12.992L30.624 12.576L31.744 13.088L31.872 13.6L31.424 14.688L28.8 15.328L25.728 15.968L21.152 17.024L21.088 17.056L21.152 17.152L23.2 17.344L24.096 17.408H26.272L30.304 17.728L31.36 18.368L31.968 19.232L31.872 19.872L30.24 20.704L28.064 20.192L22.944 18.976L21.216 18.56H20.96V18.688L22.432 20.128L25.088 22.528L28.48 25.632L28.64 26.4L28.224 27.04L27.776 26.976L24.832 24.736L23.68 23.776L21.12 21.6H20.96V21.824L21.536 22.688L24.672 27.392L24.832 28.832L24.608 29.28L23.776 29.6L22.912 29.408L21.056 26.848L19.136 23.968L17.632 21.344L17.472 21.472L16.544 31.136L16.128 31.616L15.168 32L14.368 31.36L13.92 30.4L14.368 28.416L14.88 25.856L15.296 23.808L15.68 21.28L15.904 20.448V20.384H15.68L13.76 23.04L10.88 26.976L8.576 29.408L8.032 29.632L7.072 29.152L7.168 28.256L7.68 27.52L10.88 23.424L12.8 20.896L14.08 19.424L14.048 19.264H13.952L5.504 24.768L4 24.96L3.36 24.32L3.424 23.36L3.744 23.04L6.304 21.28H6.272Z" fill="#D97757"/>
    </g>
    <defs>
      <clipPath id="cowork-sparkle-clip">
        <rect width="32" height="32" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);
