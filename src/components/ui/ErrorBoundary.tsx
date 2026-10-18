import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
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
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="card p-6 border border-rose-500/30 my-4 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} aria-hidden="true" className="shrink-0 text-error-text" />
            <h2 className="section-title">{this.props.fallbackTitle || 'This section couldn’t load'}</h2>
          </div>
          <p className="text-sm text-content-secondary">
            Something went wrong while showing it. Your data is safe. Try again, or reload the page if it keeps happening.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn-secondary min-h-11 text-xs"
            >
              <RefreshCw size={14} aria-hidden="true" /> Try again
            </button>
            <button type="button" onClick={() => window.location.reload()} className="btn-ghost min-h-11 text-xs">
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
