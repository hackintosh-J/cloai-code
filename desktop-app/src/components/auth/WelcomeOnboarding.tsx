import React, { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderOpen,
  Loader2,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react'
import ClaudeLogo from '@/src/components/ClaudeLogo'
import {
  getDesktopPreferences,
  getDesktopPlatform,
  getDesktopWorkspaceConfig,
  getRuntimeSetupStatus,
  openDesktopExternal,
  resizeDesktopWindow,
  RuntimeSetupStatus,
  selectDesktopBunFile,
  selectDesktopDirectory,
  setDesktopPreferences,
  setDesktopWorkspaceConfig,
  setRuntimeConfig,
} from '@/src/desktop'
import { safeSetStorageItem } from '@/src/utils/safeStorage'

interface OnboardingProps {
  onComplete: () => void
}

type ThemeChoice = 'system' | 'light' | 'dark'
type RuntimePanel = 'bun' | 'runtime' | 'workspace'

const PLATFORM_INSTALL_COMMANDS: Record<string, { label: string; command: string }> = {
  windows: {
    label: 'Windows',
    command: 'powershell -c "irm bun.sh/install.ps1 | iex"',
  },
  macos: {
    label: 'macOS',
    command: 'curl -fsSL https://bun.sh/install | bash',
  },
  linux: {
    label: 'Linux',
    command: 'curl -fsSL https://bun.sh/install | bash',
  },
}

const PLATFORM_RUNTIME_GUIDE: Record<string, string[]> = {
  windows: [
    'git clone https://github.com/hackintosh-J/cloai-code.git',
    'cd cloai-code',
    'bun install',
    'bun run version',
  ],
  macos: [
    'git clone https://github.com/hackintosh-J/cloai-code.git',
    'cd cloai-code',
    'bun install',
    'bun run version',
  ],
  linux: [
    'git clone https://github.com/hackintosh-J/cloai-code.git',
    'cd cloai-code',
    'bun install',
    'bun run version',
  ],
}

function detectPlatformKey(platform: string) {
  if (platform === 'darwin' || platform === 'macos') return 'macos'
  if (platform === 'linux') return 'linux'
  return 'windows'
}

const ThemeStep = ({
  theme,
  setTheme,
  onContinue,
}: {
  theme: ThemeChoice
  setTheme: (theme: ThemeChoice) => void
  onContinue: () => void
}) => {
  const themeCards = [
    {
      id: 'system' as const,
      label: '跟随系统',
      preview: (
        <div className="w-full h-[80px] rounded-lg overflow-hidden flex">
          <div className="flex-1 bg-[#F8F8F6] flex items-end p-2"><div className="w-full h-3 rounded bg-[#E8E5DE]" /></div>
          <div className="flex-1 bg-[#2A2A28] flex items-end p-2"><div className="w-full h-3 rounded bg-[#3A3A38]" /></div>
        </div>
      ),
    },
    {
      id: 'light' as const,
      label: 'Light',
      preview: (
        <div className="w-full h-[80px] rounded-lg bg-[#F8F8F6] flex flex-col justify-end p-2 gap-1.5">
          <div className="w-[70%] h-2.5 rounded bg-[#E8E5DE]" />
          <div className="w-[45%] h-2.5 rounded bg-[#E8E5DE]" />
        </div>
      ),
    },
    {
      id: 'dark' as const,
      label: 'Dark',
      preview: (
        <div className="w-full h-[80px] rounded-lg bg-[#1A1A18] flex flex-col justify-end p-2 gap-1.5">
          <div className="w-[70%] h-2.5 rounded bg-[#2E2E2C]" />
          <div className="w-[45%] h-2.5 rounded bg-[#2E2E2C]" />
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-[24px] font-semibold text-claude-text tracking-[-0.02em] mb-1.5">
        选择外观
      </h2>
      <p className="text-[14px] text-claude-textSecondary mb-7">
        之后可以在设置中随时更改。
      </p>
      <div className="flex gap-3 w-full max-w-[420px]">
        {themeCards.map((item) => (
          <button
            key={item.id}
            onClick={() => setTheme(item.id)}
            className={`flex-1 flex flex-col gap-2.5 p-3 rounded-xl border transition-all ${
              theme === item.id
                ? 'border-[#3b82f6]/80 scale-[1.02] bg-claude-bg shadow-sm'
                : 'border-claude-border hover:border-[#CCC] bg-claude-bg hover:-translate-y-[2px]'
            }`}
          >
            {item.preview}
            <span className={`text-[13px] font-medium text-center ${theme === item.id ? 'text-claude-text' : 'text-claude-textSecondary'}`}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
      <button
        onClick={onContinue}
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#333] px-5 py-2 text-[13.5px] font-medium text-white transition-all hover:bg-[#444] dark:bg-[#e0e0e0] dark:text-[#1a1a1a] dark:hover:bg-[#ccc]"
      >
        开始使用
        <ChevronRight size={15} />
      </button>
    </div>
  )
}

function RuntimeAccordion({
  open,
  setOpen,
  title,
  subtitle,
  complete,
  icon,
  children,
}: {
  open: boolean
  setOpen: () => void
  title: string
  subtitle: string
  complete: boolean
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[18px] border border-claude-border bg-claude-bg/55 dark:bg-[#1f1d1a]/55 overflow-hidden">
      <button
        type="button"
        onClick={setOpen}
        className="w-full flex items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-[#f4f2ed] dark:hover:bg-[#2a2824]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white dark:bg-[#2A2622] shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-claude-text">{title}</div>
            <div className="mt-0.5 text-[13px] leading-5 text-claude-textSecondary">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${
            complete
              ? 'bg-[#4B9C68]/10 text-[#4B9C68]'
              : 'bg-[#efe7dc] text-[#8b6f5e] dark:bg-[#332b25] dark:text-[#d6b89c]'
          }`}>
            {complete ? <Check size={12} /> : 'Pending'}
          </div>
          <ChevronDown
            size={16}
            className={`text-claude-textSecondary transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>
      {open && (
        <div className="border-t border-claude-border px-4 py-4">
          {children}
        </div>
      )}
    </div>
  )
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [platform, setPlatform] = useState('windows')
  const [theme, setTheme] = useState<ThemeChoice>('system')
  const [step, setStep] = useState<'runtime' | 'theme'>('runtime')
  const [status, setStatus] = useState<RuntimeSetupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bunPath, setBunPath] = useState('')
  const [runtimePath, setRuntimePath] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')
  const [openPanel, setOpenPanel] = useState<RuntimePanel>('bun')
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  useEffect(() => {
    resizeDesktopWindow(860, 840).catch(() => {})
  }, [])

  useEffect(() => {
    getDesktopPreferences()
      .then((preferences) => {
        const nextTheme = preferences.theme as ThemeChoice | undefined
        if (nextTheme === 'system' || nextTheme === 'light' || nextTheme === 'dark') {
          setTheme(nextTheme)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark')
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light')
      root.classList.remove('dark')
    } else {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      root.classList.toggle('dark', prefersDark)
    }
    safeSetStorageItem('theme', theme)
    setDesktopPreferences({ theme }).catch(() => {})
  }, [theme])

  const refreshStatus = async (preservePaths = false) => {
    setLoading(true)
    try {
      const [runtimeStatus, workspaceConfig, detectedPlatform] = await Promise.all([
        getRuntimeSetupStatus(),
        getDesktopWorkspaceConfig().catch(() => null),
        getDesktopPlatform().catch(() => 'windows'),
      ])

      setPlatform(detectPlatformKey(detectedPlatform))

      if (runtimeStatus) {
        setStatus(runtimeStatus)
        // 如果 preservePaths 为 true，只在当前路径为空时才更新
        if (!preservePaths) {
          setBunPath(runtimeStatus.bun.path || '')
          setRuntimePath(runtimeStatus.runtime.path || '')
          setWorkspacePath(runtimeStatus.workspace.path || workspaceConfig?.workspacesDir || workspaceConfig?.defaultDir || '')
        } else {
          // 保留用户手动选择的路径，只更新检测状态
          if (!bunPath) setBunPath(runtimeStatus.bun.path || '')
          if (!runtimePath) setRuntimePath(runtimeStatus.runtime.path || '')
          if (!workspacePath) setWorkspacePath(runtimeStatus.workspace.path || workspaceConfig?.workspacesDir || workspaceConfig?.defaultDir || '')
        }
      } else if (workspaceConfig && !preservePaths) {
        setWorkspacePath(workspaceConfig.workspacesDir || workspaceConfig.defaultDir || '')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshStatus().catch(() => setLoading(false))
  }, [])

  const installCommand = PLATFORM_INSTALL_COMMANDS[platform]
  const runtimeGuide = PLATFORM_RUNTIME_GUIDE[platform]
  const bunReady = !!status?.bun.detected
  const runtimeReady = !!status?.runtime.detected && !!status?.runtime.version
  const workspaceReady = !!workspacePath.trim()
  const canContinue = !!bunPath.trim() && !!runtimePath.trim() && !!workspacePath.trim() && !!status?.runtime.version

  const progress = useMemo(() => {
    return [bunReady, runtimeReady, workspaceReady].filter(Boolean).length
  }, [bunReady, runtimeReady, workspaceReady])

  const handleBrowseBun = async () => {
    const selected = await selectDesktopBunFile()
    if (!selected) return
    setBunPath(selected)
    setStatus((prev) => prev ? {
      ...prev,
      bun: {
        ...prev.bun,
        path: selected,
        detected: true,
      },
    } : prev)
  }

  const handleBrowseRuntime = async () => {
    const selected = await selectDesktopDirectory()
    if (!selected) return
    setRuntimePath(selected)
    // 立即保存配置并校验运行时
    try {
      await setRuntimeConfig({
        bunPath,
        runtimePath: selected,
        workspacesDir: workspacePath,
      })
      await refreshStatus(true)
    } catch (err) {
      console.error('Failed to save runtime config:', err)
      await refreshStatus(true)
    }
  }

  const handleBrowseWorkspace = async () => {
    const selected = await selectDesktopDirectory()
    if (!selected) return
    setWorkspacePath(selected)
  }

  const handleContinue = async () => {
    if (!canContinue) return
    setSaving(true)
    try {
      await setRuntimeConfig({
        bunPath,
        runtimePath,
        workspacesDir: workspacePath,
      })
      await setDesktopWorkspaceConfig(workspacePath)
      safeSetStorageItem('workspace_path', workspacePath)
      await refreshStatus(false)
      setStep('theme')
    } finally {
      setSaving(false)
    }
  }

  const finishThemeStep = () => {
    setDesktopPreferences({ onboardingDone: true, theme }).catch(() => {})
    resizeDesktopWindow(1300, 780).catch(() => {})
    onComplete()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCommand(text)
      setTimeout(() => setCopiedCommand(null), 2000)
    }).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-[999] bg-claude-bg flex flex-col select-none overflow-hidden">
      <style>{`
        @keyframes onboarding-fade-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .onboarding-enter {
          animation: onboarding-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <div className="absolute top-0 left-0 right-0 h-[44px] z-10" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 540px 380px at 50% 22%, rgba(0, 0, 0, 0.018) 0%, transparent 72%)' }} />

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-10 relative onboarding-enter">
        <div className="mx-auto max-w-[760px]">
          <div className="flex flex-col items-center mb-8">
            <div className="w-[42px] h-[42px] mb-4">
              <ClaudeLogo color="#D97757" maxScale={0.15} />
            </div>
            <h1 className="text-[15px] tracking-[0.12em] uppercase text-claude-textSecondary/60 font-medium">
              Welcome to Cloai Desktop
            </h1>
          </div>

          {step === 'runtime' ? (
            <div className="rounded-[28px] border border-claude-border bg-white/92 p-6 shadow-[0_24px_64px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:bg-[#24211d]/92">
              <div className="flex items-start justify-between gap-6 mb-6">
                <div>
                  <h2 className="text-[24px] font-semibold text-claude-text tracking-[-0.02em] mb-1.5">
                    配置运行时
                  </h2>
                  <p className="text-[14px] text-claude-textSecondary max-w-[520px] leading-6">
                    先完成本机运行时确认。我们会按顺序检查 Bun、定位 cloai-code 运行时，并设置工作区目录，然后再进入主题选择。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => refreshStatus()}
                  className="inline-flex h-[36px] items-center gap-2 rounded-[12px] border border-black/10 bg-[#faf8f4] px-3 text-[13px] text-claude-text transition-colors hover:bg-[#f2eee8] dark:border-white/10 dark:bg-[#2A2622] dark:hover:bg-[#312c27]"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  <span>{loading ? '检测中…' : '重新检测'}</span>
                </button>
              </div>

              <div className="mb-6 rounded-[16px] border border-claude-border bg-claude-bg/70 px-4 py-4 dark:bg-[#1f1d1a]/60">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[13px] font-medium text-claude-textSecondary">准备进度</div>
                    <div className="mt-1 text-[20px] font-semibold text-claude-text">{progress} / 3</div>
                  </div>
                  <div className="w-[220px] h-2 rounded-full bg-claude-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#D97757] transition-all duration-300"
                      style={{ width: `${(progress / 3) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <RuntimeAccordion
                  open={openPanel === 'bun'}
                  setOpen={() => setOpenPanel(openPanel === 'bun' ? 'bun' : 'bun')}
                  title="1. Bun"
                  subtitle={bunReady ? '已检测到 Bun，可直接使用' : '优先从常见安装位置检测，未命中时可手动选择'}
                  complete={bunReady}
                  icon={<Terminal size={16} className="text-claude-textSecondary" />}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-[12px] border border-black/8 bg-white px-3 py-2 text-[13px] text-claude-text dark:border-white/10 dark:bg-[#201d19]">
                      {bunPath || '尚未检测到 Bun'}
                    </div>
                    <button
                      type="button"
                      onClick={handleBrowseBun}
                      className="inline-flex h-[38px] items-center gap-2 rounded-[12px] border border-black/10 bg-[#faf8f4] px-3.5 text-[13px] text-claude-text transition-colors hover:bg-[#f2eee8] dark:border-white/10 dark:bg-[#2A2622] dark:hover:bg-[#312c27]"
                    >
                      <FolderOpen size={14} />
                      <span>选择 Bun</span>
                    </button>
                  </div>
                  {!bunReady && (
                    <div className="mt-4 rounded-[14px] border border-dashed border-claude-border px-4 py-3">
                      <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-claude-textSecondary">{installCommand.label}</div>
                      <div className="mt-2 group relative">
                        <div className="rounded-[10px] bg-[#f4efe7] px-3 py-2 pr-10 font-mono text-[12px] text-[#6b4e3d] dark:bg-[#2b2520] dark:text-[#e0c5b0]">
                          {installCommand.command}
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(installCommand.command)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-white/80 dark:bg-[#1a1714]/80 hover:bg-white dark:hover:bg-[#1a1714] transition-colors opacity-0 group-hover:opacity-100"
                          title="复制命令"
                        >
                          {copiedCommand === installCommand.command ? (
                            <Check size={14} className="text-[#4B9C68]" />
                          ) : (
                            <Copy size={14} className="text-claude-textSecondary" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </RuntimeAccordion>

                <RuntimeAccordion
                  open={openPanel === 'runtime'}
                  setOpen={() => setOpenPanel(openPanel === 'runtime' ? 'runtime' : 'runtime')}
                  title="2. cloai 运行时"
                  subtitle={runtimeReady ? `运行时版本 ${status?.runtime.version}` : '请选择一个已安装完成的 cloai-code 运行时目录'}
                  complete={runtimeReady}
                  icon={<Search size={16} className="text-claude-textSecondary" />}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-[12px] border border-black/8 bg-white px-3 py-2 text-[13px] text-claude-text dark:border-white/10 dark:bg-[#201d19]">
                      {runtimePath || '尚未检测到运行时目录'}
                    </div>
                    <button
                      type="button"
                      onClick={handleBrowseRuntime}
                      className="inline-flex h-[38px] items-center gap-2 rounded-[12px] border border-black/10 bg-[#faf8f4] px-3.5 text-[13px] text-claude-text transition-colors hover:bg-[#f2eee8] dark:border-white/10 dark:bg-[#2A2622] dark:hover:bg-[#312c27]"
                    >
                      <FolderOpen size={14} />
                      <span>选择运行时</span>
                    </button>
                    {runtimePath && !runtimeReady && (
                      <button
                        type="button"
                        onClick={() => refreshStatus(true)}
                        className="inline-flex h-[38px] items-center gap-2 rounded-[12px] border border-black/10 bg-[#faf8f4] px-3.5 text-[13px] text-claude-text transition-colors hover:bg-[#f2eee8] dark:border-white/10 dark:bg-[#2A2622] dark:hover:bg-[#312c27]"
                        title="重新检测运行时版本"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                        </svg>
                        <span>重新检测</span>
                      </button>
                    )}
                  </div>
                  {runtimeReady ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#4B9C68]/10 px-3 py-1 text-[12px] font-medium text-[#4B9C68]">
                      <Check size={12} />
                      <span>运行时版本 {status?.runtime.version}</span>
                    </div>
                  ) : runtimePath ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 text-amber-600 dark:text-amber-500">⚠️</div>
                          <div>
                            <div className="text-[13px] font-medium text-amber-900 dark:text-amber-200">运行时未构建</div>
                            <div className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">
                              检测到所选目录中的运行时尚未构建。请在该目录下执行以下命令完成构建，然后点击"重新检测"按钮。
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-[14px] border border-dashed border-claude-border px-4 py-3">
                        <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-claude-textSecondary">构建命令</div>
                        <div className="mt-2 space-y-2">
                          {runtimeGuide.map((guideStep, idx) => (
                            <div key={idx} className="group relative">
                              <div className="rounded-[10px] bg-[#f4efe7] px-3 py-2 pr-10 font-mono text-[12px] text-[#6b4e3d] dark:bg-[#2b2520] dark:text-[#e0c5b0]">
                                {guideStep}
                              </div>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(guideStep)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-white/80 dark:bg-[#1a1714]/80 hover:bg-white dark:hover:bg-[#1a1714] transition-colors opacity-0 group-hover:opacity-100"
                                title="复制命令"
                              >
                                {copiedCommand === guideStep ? (
                                  <Check size={14} className="text-[#4B9C68]" />
                                ) : (
                                  <Copy size={14} className="text-claude-textSecondary" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[14px] border border-dashed border-claude-border px-4 py-3">
                      <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-claude-textSecondary">从源码安装</div>
                      <div className="mt-2 space-y-2">
                        {runtimeGuide.map((guideStep, idx) => (
                          <div key={idx} className="group relative">
                            <div className="rounded-[10px] bg-[#f4efe7] px-3 py-2 pr-10 font-mono text-[12px] text-[#6b4e3d] dark:bg-[#2b2520] dark:text-[#e0c5b0]">
                              {guideStep}
                            </div>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(guideStep)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-white/80 dark:bg-[#1a1714]/80 hover:bg-white dark:hover:bg-[#1a1714] transition-colors opacity-0 group-hover:opacity-100"
                              title="复制命令"
                            >
                              {copiedCommand === guideStep ? (
                                <Check size={14} className="text-[#4B9C68]" />
                              ) : (
                                <Copy size={14} className="text-claude-textSecondary" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </RuntimeAccordion>

                <RuntimeAccordion
                  open={openPanel === 'workspace'}
                  setOpen={() => setOpenPanel(openPanel === 'workspace' ? 'workspace' : 'workspace')}
                  title="3. 工作区路径"
                  subtitle={workspaceReady ? workspacePath : '选择 Cloai 用于托管工作区的目录'}
                  complete={workspaceReady}
                  icon={<Wrench size={16} className="text-claude-textSecondary" />}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-[12px] border border-black/8 bg-white px-3 py-2 text-[13px] text-claude-text dark:border-white/10 dark:bg-[#201d19]">
                      {workspacePath || '请选择工作区路径'}
                    </div>
                    <button
                      type="button"
                      onClick={handleBrowseWorkspace}
                      className="inline-flex h-[38px] items-center gap-2 rounded-[12px] border border-black/10 bg-[#faf8f4] px-3.5 text-[13px] text-claude-text transition-colors hover:bg-[#f2eee8] dark:border-white/10 dark:bg-[#2A2622] dark:hover:bg-[#312c27]"
                    >
                      <FolderOpen size={14} />
                      <span>选择路径</span>
                    </button>
                  </div>
                </RuntimeAccordion>
              </div>

              <div className="mt-6 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => openDesktopExternal('https://bun.sh').catch(() => {})}
                  className="text-[13px] text-claude-textSecondary transition-colors hover:text-claude-text hover:underline"
                >
                  查看 Bun 安装文档
                </button>
                <button
                  type="button"
                  disabled={!canContinue || saving}
                  onClick={handleContinue}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-[13.5px] font-medium transition-all ${
                    canContinue && !saving
                      ? 'bg-[#333] text-white hover:bg-[#444] dark:bg-[#e0e0e0] dark:text-[#1a1a1a] dark:hover:bg-[#ccc]'
                      : 'cursor-not-allowed bg-claude-border/50 text-claude-textSecondary/40'
                  }`}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  <span>{saving ? '保存中…' : '继续'}</span>
                  {!saving ? <ChevronRight size={15} /> : null}
                </button>
              </div>
            </div>
          ) : (
            <ThemeStep theme={theme} setTheme={setTheme} onContinue={finishThemeStep} />
          )}
        </div>
      </div>
    </div>
  )
}

export default Onboarding
