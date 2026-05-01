import React, { useState, useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import ModelSelector, { type SelectableModel } from '@/src/components/ModelSelector';

interface UnifiedInputContainerProps {
  children: React.ReactNode;
  bottomActions: React.ReactNode;
  modelOptions: SelectableModel[];
  currentModel: string;
  onModelChange: (model: string) => void;
  canSend: boolean;
  onSend: () => void;
  rightActions?: React.ReactNode;
  bottomInfo?: React.ReactNode;
  isDragging?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

/**
 * 统一的输入框容器组件
 * 使用Code页面的设计风格和快速动画
 */
export const UnifiedInputContainer: React.FC<UnifiedInputContainerProps> = ({
  children,
  bottomActions,
  modelOptions,
  currentModel,
  onModelChange,
  canSend,
  onSend,
  rightActions,
  bottomInfo,
  isDragging = false,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  return (
    <div
      className={`w-[672px] rounded-[24px] border transition-all duration-300 bg-white shadow-[0px_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0px_5px_22px_rgba(0,0,0,0.06)] dark:bg-claude-input ${
        isDragging
          ? 'border-[#D97757] bg-orange-50/30 dark:bg-orange-900/20 scale-[1.01]'
          : 'border-transparent'
      } focus-within:border-[#d9d7d0] dark:focus-within:border-claude-border focus-within:-translate-y-1 focus-within:shadow-[0px_6px_24px_rgba(0,0,0,0.08)]`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex flex-col px-[15px] py-[15px]">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {children}
        </div>
        <div className="mt-[12px] flex min-h-[32px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {bottomActions}
          </div>
          <div className="flex items-center gap-[8px]">
            <ModelSelector
              currentModelString={currentModel}
              models={modelOptions}
              onModelChange={onModelChange}
              isNewChat={true}
              variant="landing"
            />
            {rightActions}
            <button
              type="button"
              disabled={!canSend}
              onClick={onSend}
              className={`flex h-[32px] w-[40px] items-center justify-center rounded-[8px] text-white transition-all duration-200 active:scale-95 ${
                canSend
                  ? 'bg-[#2b2926] hover:bg-[#1f1d1a] hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 dark:bg-[#f2eee7] dark:text-[#1f1d1a] dark:hover:bg-[#e5ddd2]'
                  : 'bg-[#efcbc0] disabled:cursor-not-allowed disabled:opacity-40'
              }`}
            >
              <ArrowUp size={18} strokeWidth={2.3} className="transition-transform duration-200" />
            </button>
          </div>
        </div>
        {bottomInfo && (
          <div className="mt-[10px] flex items-center justify-between gap-3 border-t border-[rgba(31,31,30,0.08)] pt-[10px] text-[12px] text-claude-textSecondary dark:border-white/5 transition-colors">
            {bottomInfo}
          </div>
        )}
      </div>
    </div>
  );
};

interface UnifiedLandingLayoutProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  starterIdeas?: React.ReactNode;
  errorMessage?: string;
  className?: string;
}

/**
 * 统一的Landing页面布局
 * 快速入场动画（150ms）
 */
export const UnifiedLandingLayout: React.FC<UnifiedLandingLayoutProps> = ({
  title,
  subtitle,
  icon,
  children,
  starterIdeas,
  errorMessage,
  className = '',
}) => {
  const [isAnimatingIn, setIsAnimatingIn] = useState(true);

  // 快速入场动画
  useEffect(() => {
    const timer = setTimeout(() => setIsAnimatingIn(false), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`flex-1 h-full overflow-y-auto bg-claude-bg chat-font-scope ${className}`}>
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-6 pb-16 pt-[112px]">
        {/* 标题区域 - 快速入场 */}
        <div
          className={`mb-[14px] flex min-h-[44px] w-[672px] items-center justify-center gap-[12px] transition-all duration-150 ease-out ${
            isAnimatingIn ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="flex h-[32px] w-[32px] items-center justify-center shrink-0 text-claude-accent transition-transform duration-500 hover:scale-110 hover:rotate-12">
            {icon}
          </div>
          <h1
            className="whitespace-nowrap text-[#373734] dark:!text-[#d6cec3]"
            style={{
              fontFamily: '"Anthropic Serif", "Source Serif 4", "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
              fontSize: '36px',
              fontStyle: 'normal',
              fontWeight: 400,
              lineHeight: '48px',
            }}
          >
            {title}
          </h1>
        </div>

        {/* 副标题 - 快速入场 */}
        {subtitle && (
          <div
            className={`mb-5 text-[12.5px] font-medium text-claude-textSecondary transition-all duration-150 ease-out ${
              isAnimatingIn ? 'opacity-0' : 'opacity-100'
            }`}
            style={{ transitionDelay: '50ms' }}
          >
            {subtitle}
          </div>
        )}

        {/* 错误提示 */}
        {errorMessage && (
          <div className="mb-4 w-[672px] rounded-[16px] border border-[#e5b0a1] bg-[#fff1ec] px-4 py-3 text-[13px] text-[#a0452e] dark:border-[#8A4C3A] dark:bg-[#3A2620] dark:text-[#F3B29D] animate-in fade-in slide-in-from-top-2 duration-200">
            {errorMessage}
          </div>
        )}

        {/* 输入框容器 - 快速入场 */}
        <div
          className={`relative z-30 w-[672px] transition-all duration-150 ease-out ${
            isAnimatingIn ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}
          style={{ transitionDelay: '100ms' }}
        >
          {children}
        </div>

        {/* Starter Ideas - 快速入场 */}
        {starterIdeas && (
          <div
            className={`relative z-10 mt-4 w-[672px] transition-all duration-150 ease-out ${
              isAnimatingIn ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
            }`}
            style={{ transitionDelay: '150ms' }}
          >
            {starterIdeas}
          </div>
        )}
      </div>
    </div>
  );
};
