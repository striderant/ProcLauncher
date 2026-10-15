import React from 'react';

// Catches render crashes inside tab content so one bad tab blanks the
// page instead of unmounting the entire app. Shows the actual error
// (message + stack) with copy/retry actions for diagnosis.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      console.error(`[ErrorBoundary:${this.props.name || 'tab'}]`, error, info?.componentStack);
    } catch {}
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = String(error?.message || error || 'Unknown error');
    const stack = String(error?.stack || '');
    const details = `Tab: ${this.props.name || 'unknown'}\nError: ${message}\n${stack}`;

    return (
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-lg rounded-2xl bg-red-500/10 p-5">
          <div className="text-[14px] font-bold text-red-300">Something went wrong</div>
          <div className="text-[16px] text-red-200/70 mt-1 break-words">{message}</div>
          {stack && (
            <details className="mt-3">
              <summary className="text-[15px] text-white/40 cursor-pointer hover:text-white/70">
                Technical details
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto text-[14px] font-mono text-white/40 whitespace-pre-wrap break-words bg-black/40 rounded-lg p-3">
                {stack}
              </pre>
            </details>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-3.5 py-1.5 rounded-xl bg-white text-black text-[16px] font-bold hover:bg-white/90 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => {
                try { navigator.clipboard?.writeText(details).catch(() => {}); } catch {}
              }}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[16px] font-semibold text-white transition-colors"
            >
              Copy error
            </button>
          </div>
        </div>
      </div>
    );
  }
}
