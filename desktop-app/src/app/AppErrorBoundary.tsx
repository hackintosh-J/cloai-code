import React from 'react';

interface AppErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Desktop] React render failed', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-claude-bg px-8 text-claude-text">
        <div className="w-full max-w-[720px] rounded-lg border border-claude-border bg-claude-input p-6 shadow-sm">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-claude-textSecondary">
            Desktop startup error
          </div>
          <h1 className="mt-3 text-[24px] font-semibold">Cloai failed to render</h1>
          <p className="mt-2 text-[14px] leading-6 text-claude-textSecondary">
            The app is running, but React hit a startup error. Check the message below and the dev console logs.
          </p>
          <pre className="mt-5 max-h-[320px] overflow-auto rounded-md border border-claude-border bg-black/[0.04] p-4 text-[12px] leading-5 text-claude-text dark:bg-black/30">
            {this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
