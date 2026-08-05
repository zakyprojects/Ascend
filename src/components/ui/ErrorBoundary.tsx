import React, { Component, ErrorInfo, ReactNode } from 'react';
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
        <div className="card p-6 border border-rose-500/30 bg-rose-500/10 text-slate-200 rounded-xl my-4 space-y-4">
          <div className="flex items-center gap-3 text-rose-400">
            <AlertTriangle size={24} />
            <h3 className="font-bold text-lg">{this.props.fallbackTitle || 'Something went wrong rendering this section'}</h3>
          </div>
          <p className="text-xs text-slate-400">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-secondary text-xs flex items-center gap-2 py-1.5 px-3"
          >
            <RefreshCw size={14} /> Retry Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
