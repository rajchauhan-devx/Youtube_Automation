import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
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
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-red-500/30 bg-surface text-gray-300 my-4">
          <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
          <h3 className="text-base font-semibold text-white mb-1">
            {this.props.fallbackLabel || 'Something went wrong in this section'}
          </h3>
          <p className="text-xs text-red-300/80 mb-4 max-w-md break-words font-mono">
            {this.state.error?.message || 'Unknown render error'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/80 transition-all shadow-md"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
