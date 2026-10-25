import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Wrench } from 'lucide-react';
import { isBuildFileError, repairBuildFiles } from '@/lib/assetRecovery';
import { reportError } from '@/lib/errorReporting';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  /** 'page' = the whole app failed: a full-screen card with only Reload (nothing to retry into). */
  variant?: 'section' | 'page';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    // A build file that failed to load (an update landed): repair and reload on its own.
    if (isBuildFileError(error)) {
      repairBuildFiles({ automatic: true });
      return;
    }
    reportError(error, { componentStack: errorInfo.componentStack, boundary: this.props.variant ?? 'section' });
  }

  /** The error's own words, short, so a screenshot of the card shows what failed. */
  private detail() {
    const { error } = this.state;
    if (!error) return null;
    const text = `${error.name}: ${error.message}`.slice(0, 200);
    return <p className="text-xs text-content-muted break-words">{text}</p>;
  }

  private repairButton(className: string) {
    return (
      <button type="button" onClick={() => repairBuildFiles({ automatic: false })} className={className}>
        <Wrench size={14} aria-hidden="true" /> Repair app
      </button>
    );
  }

  public render() {
    if (this.state.hasError && this.props.variant === 'page') {
      return (
        <div className="min-h-dvh bg-bg-900 flex items-center justify-center p-4">
          <div role="alert" className="card p-6 border border-rose-500/30 max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={22} aria-hidden="true" className="shrink-0 text-error-text" />
              <h1 className="section-title">{this.props.fallbackTitle || 'AscendDay couldn’t load'}</h1>
            </div>
            <p className="text-sm text-content-secondary">
              Something went wrong while showing the app. Your data is safe. Repair app reloads it with fresh app
              files; your sign-in and data stay.
            </p>
            {this.detail()}
            {this.repairButton('btn-primary min-h-11 text-xs')}
          </div>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div role="alert" className="card p-6 border border-rose-500/30 my-4 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} aria-hidden="true" className="shrink-0 text-error-text" />
            <h2 className="section-title">{this.props.fallbackTitle || 'This section couldn’t load'}</h2>
          </div>
          <p className="text-sm text-content-secondary">
            Something went wrong while showing it. Your data is safe. Try again, or repair the app if it keeps happening:
            it reloads with fresh app files, and your sign-in and data stay.
          </p>
          {this.detail()}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn-secondary min-h-11 text-xs"
            >
              <RefreshCw size={14} aria-hidden="true" /> Try again
            </button>
            {this.repairButton('btn-ghost min-h-11 text-xs')}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
