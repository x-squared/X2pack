// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary.js';

function ThrowingChild(): React.ReactElement {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  afterEach(() => cleanup());

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeDefined();
  });

  it('shows reload UI when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeDefined();
    vi.mocked(console.error).mockRestore();
  });

  it('reloads the page when the user clicks Reload app', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { reload },
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: 'Reload app' }));
    expect(reload).toHaveBeenCalledOnce();

    vi.mocked(console.error).mockRestore();
  });
});
