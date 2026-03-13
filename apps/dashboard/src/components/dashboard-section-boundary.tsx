'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
}

export class DashboardSectionBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Keep the rest of the dashboard usable if one widget fails.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-border/40 bg-card/60 p-4 text-sm text-muted-foreground">
          {this.props.title ? `${this.props.title} is temporarily unavailable.` : 'This section is temporarily unavailable.'}
        </div>
      );
    }

    return this.props.children;
  }
}
