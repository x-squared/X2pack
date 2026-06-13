import { Component, type ErrorInfo, type ReactNode } from 'react';
import './ErrorBoundary.css';

type Props = {
  readonly children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = (): void => {
    globalThis.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1 className="error-boundary__title">Something went wrong</h1>
          <p className="error-boundary__message">
            X2pack hit an unexpected error. Your data is still saved on this device.
          </p>
          <button type="button" className="btn btn--primary error-boundary__reload" onClick={this.handleReload}>
            Reload app
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
