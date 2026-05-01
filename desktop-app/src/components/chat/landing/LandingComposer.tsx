import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowUp } from 'lucide-react';
import { IconClaudeSparkle } from '@/src/components/Icons';
import FileUploadPreview, { PendingFile } from '@/src/components/FileUploadPreview';
import ModelSelector, { type SelectableModel } from '@/src/components/ModelSelector';
import inputPlusIcon from '@/assets/home/composer/input-plus.svg';

interface ChatLandingPageProps {
  welcomeGreeting: string;
  inputText: string;
  setInputText: (text: string) => void;
  pendingFiles: PendingFile[];
  handleFilesSelected: (files: FileList | File[]) => void;
  handleRemoveFile: (id: string) => void;
  isDragging: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleSend: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  loading: boolean;
  selectorModels: SelectableModel[];
  currentModelString: string;
  handleModelChange: (model: string) => void;
  selectedSkill: { name: string; slug: string; description?: string } | null;
  setSelectedSkill: (skill: { name: string; slug: string; description?: string } | null) => void;
  showPlusMenu: boolean;
  setShowPlusMenu: (show: boolean) => void;
  plusBtnRef: React.RefObject<HTMLButtonElement>;
  plusMenuRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  isVoiceListening: boolean;
  handleVoiceDictationToggle: () => void;
  researchMode: boolean;
  toggleResearchMode: () => void;
  renderPlusMenu: () => React.ReactNode;
  renderSkillInputOverlay: () => React.ReactNode;
  starterIdeasContent?: React.ReactNode;
}

const ChatLandingPage: React.FC<ChatLandingPageProps> = ({
  welcomeGreeting,
  inputText,
  setInputText,
  pendingFiles,
  handleFilesSelected,
  handleRemoveFile,
  isDragging,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleSend,
  handleKeyDown,
  handlePaste,
  loading,
  selectorModels,
  currentModelString,
  handleModelChange,
  selectedSkill,
  setSelectedSkill,
  showPlusMenu,
  setShowPlusMenu,
  plusBtnRef,
  plusMenuRef,
  fileInputRef,
  inputRef,
  isVoiceListening,
  handleVoiceDictationToggle,
  researchMode,
  toggleResearchMode,
  renderPlusMenu,
  renderSkillInputOverlay,
  starterIdeasContent,
}) => {
  const [isAnimatingIn, setIsAnimatingIn] = useState(true);

  // 快速入场动画
  useEffect(() => {
    const timer = setTimeout(() => setIsAnimatingIn(false), 50);
    return () => clearTimeout(timer);
  }, []);

  const canSend = useMemo(
    () => (inputText.trim() || pendingFiles.some(f => f.status === 'done')) && !loading && !pendingFiles.some(f => f.status === 'uploading'),
    [inputText, pendingFiles, loading]
  );

  return (
    <div className="flex-1 bg-claude-bg h-full flex flex-col relative overflow-hidden text-claude-text chat-font-scope">
      <div className="flex-1 flex flex-col items-center pt-[112px]">
        <div className="flex w-[672px] flex-col items-center">
          {/* 标题区域 - 快速入场 */}
          <div
            className={`mb-[14px] flex min-h-[44px] w-[672px] items-center justify-center gap-[12px] transition-all duration-150 ease-out ${
              isAnimatingIn ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
            }`}
          >
            <div className="flex h-[32px] w-[32px] items-center justify-center shrink-0 transition-transform duration-500 hover:scale-110 hover:rotate-12">
              <IconClaudeSparkle size={32} className="text-claude-accent" />
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
              {welcomeGreeting}
            </h1>
          </div>

          {/* 输入框容器 - 快速入场 */}
          <div
            className={`relative z-30 w-[672px] group transition-all duration-150 ease-out ${
              isAnimatingIn ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
            }`}
            style={{ transitionDelay: '100ms' }}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={(e) => {
                if (e.target.files) handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />
            <div
              className={`w-[672px] border transition-all duration-300 flex flex-col max-h-[60vh] font-sans bg-white dark:bg-claude-input rounded-[20px] shadow-[0px_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0px_5px_22px_rgba(0,0,0,0.06)] ${
                isDragging
                  ? 'border-[#D97757] bg-orange-50/30 dark:bg-orange-900/20 scale-[1.01]'
                  : 'border-transparent'
              } focus-within:border-[#d9d7d0] dark:focus-within:border-claude-border focus-within:-translate-y-1 focus-within:shadow-[0px_6px_24px_rgba(0,0,0,0.08)]`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex flex-col px-[15px] py-[15px]">
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                  <FileUploadPreview files={pendingFiles} onRemove={handleRemoveFile} />
                  <div className="relative min-h-[48px]">
                    {renderSkillInputOverlay()}
                    <textarea
                      ref={inputRef}
                      className={`w-full pl-[6px] pr-0 pt-[4px] pb-0 placeholder:text-[#7b7974] text-[16px] leading-[24px] tracking-[-0.3125px] outline-none resize-none overflow-hidden bg-transparent font-sans font-normal transition-all duration-200 dark:text-claude-text dark:placeholder:text-[#7b7974] ${
                        inputText.match(/^\/[a-zA-Z0-9_-]+/) ? 'text-transparent caret-claude-text' : 'text-[#373734]'
                      }`}
                      style={{ minHeight: '48px' }}
                      placeholder={selectedSkill ? `Describe what you want ${selectedSkill.name} to do...` : "How can I help you today?"}
                      value={inputText}
                      onChange={(e) => {
                        setInputText(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
                        e.target.style.overflowY = e.target.scrollHeight > 300 ? 'auto' : 'hidden';
                      }}
                      onKeyDown={(e) => {
                        // Backspace deletes entire /skill-name as a unit
                        if (e.key === 'Backspace' && selectedSkill) {
                          const pos = (e.target as HTMLTextAreaElement).selectionStart;
                          const skillPrefix = `/${selectedSkill.slug} `;
                          if (pos > 0 && pos <= skillPrefix.length && inputText.startsWith(skillPrefix.slice(0, pos))) {
                            e.preventDefault();
                            setInputText(inputText.slice(skillPrefix.length));
                            setSelectedSkill(null);
                            return;
                          }
                        }
                        handleKeyDown(e);
                      }}
                      onPaste={handlePaste}
                    />
                  </div>
                </div>
                <div className="mt-[12px] flex h-[32px] items-center justify-between">
                  <div className="relative flex items-center gap-1">
                    <button
                      ref={plusBtnRef}
                      onClick={() => setShowPlusMenu(!showPlusMenu)}
                      className="flex h-[32px] w-[34px] items-center justify-center rounded-[8px] transition-all duration-200 hover:bg-[#f5f4f1] dark:hover:bg-white/5 hover:scale-110 active:scale-95"
                    >
                      <img src={inputPlusIcon} alt="" aria-hidden="true" className="h-[20px] w-[20px] dark:invert dark:brightness-200 transition-transform duration-200" />
                    </button>
                    {showPlusMenu && renderPlusMenu()}
                    {/* Research mode badge */}
                    {researchMode && (
                      <div className="group/research relative ml-1 flex items-center bg-[#DBEAFE] dark:bg-[#1E3A5F] rounded-lg p-1.5 transition-all duration-200 hover:bg-[#BFDBFE] dark:hover:bg-[#1E40AF]">
                        <span className="text-[#2E7CF6] text-xs font-medium">Research</span>
                        <button
                          onClick={toggleResearchMode}
                          className="ml-1 flex items-center justify-center hover:opacity-70 transition-opacity"
                          aria-label="Disable research mode"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#2E7CF6]">
                            <path d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-[8px]">
                    <ModelSelector
                      currentModelString={currentModelString}
                      models={selectorModels}
                      onModelChange={handleModelChange}
                      isNewChat={true}
                      variant="landing"
                    />
                    {canSend && !isVoiceListening ? (
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleSend}
                        disabled={!canSend}
                        className="flex h-[32px] w-[40px] items-center justify-center rounded-[8px] bg-[#2b2926] text-white transition-all duration-200 hover:bg-[#1f1d1a] hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#f2eee7] dark:text-[#1f1d1a] dark:hover:bg-[#e5ddd2]"
                      >
                        <ArrowUp size={18} strokeWidth={2.3} className="transition-transform duration-200 group-hover:-translate-y-0.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={isVoiceListening ? 'Stop voice dictation' : 'Use voice mode'}
                        aria-pressed={isVoiceListening}
                        onClick={handleVoiceDictationToggle}
                        className={`group relative flex h-[32px] w-[36px] items-center justify-center rounded-[8px] transition-all duration-200 ${
                          isVoiceListening
                            ? 'bg-[#f4e3dc] shadow-[inset_0_0_0_1px_rgba(198,97,63,0.08)]'
                            : 'hover:-translate-y-[1px] hover:bg-[#f5f4f1] dark:hover:bg-white/5'
                        } active:scale-95`}
                      >
                        {isVoiceListening && (
                          <span className="absolute inset-0 rounded-[8px] bg-[#f7d9ce] opacity-60 animate-pulse" aria-hidden="true" />
                        )}
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="relative text-[#121212] dark:text-claude-text">
                          <path d="M10 13C11.6569 13 13 11.6569 13 10V5C13 3.34315 11.6569 2 10 2C8.34315 2 7 3.34315 7 5V10C7 11.6569 8.34315 13 10 13Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M16 10C16 13.3137 13.3137 16 10 16M10 16C6.68629 16 4 13.3137 4 10M10 16V18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Starter Ideas - 快速入场 */}
          {starterIdeasContent && (
            <div
              className={`relative z-10 mt-4 w-[672px] transition-all duration-150 ease-out ${
                isAnimatingIn ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
              }`}
              style={{ transitionDelay: '150ms' }}
            >
              {starterIdeasContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatLandingPage;
