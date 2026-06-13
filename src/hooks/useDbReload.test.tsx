// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDbReload } from './useDbReload.js';
import { tickDbVersion } from '../sync/dbVersion.js';

function Probe({
  load,
  isRelevant,
}: {
  readonly load: () => Promise<void>;
  readonly isRelevant?: (changes: readonly import('../sync/dbVersion.js').DbChange[]) => boolean;
}): React.ReactElement {
  const { loadError, loading, retry } = useDbReload(load, [], { isRelevant });
  return (
    <div>
      <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
      <span data-testid="error">{loadError ? 'yes' : 'no'}</span>
      <button type="button" onClick={retry}>Retry</button>
    </div>
  );
}

describe('useDbReload', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('reloads when dbVersion ticks', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    render(<Probe load={load} />);

    await waitFor(() => expect(load).toHaveBeenCalledOnce());

    tickDbVersion();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('skips reload when changes are not relevant', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    render(
      <Probe
        load={load}
        isRelevant={(changes) =>
          changes.some((c) => c.kind === 'packing' && c.packingId === 'p1')
        }
      />,
    );

    await waitFor(() => expect(load).toHaveBeenCalledOnce());

    tickDbVersion([{ kind: 'pack_list', listId: 'l1', aspect: 'content' }]);
    await waitFor(() => expect(load).toHaveBeenCalledOnce());

    tickDbVersion([{ kind: 'packing', packingId: 'p1', aspect: 'item' }]);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('surfaces loadError when reload rejects', async () => {
    const load = vi.fn().mockRejectedValue(new Error('IDB failed'));
    render(<Probe load={load} />);

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('yes');
    });
  });

  it('retries after the user clicks Retry', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<Probe load={load} />);

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('yes');
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('no');
      expect(load).toHaveBeenCalledTimes(2);
    });
  });
});
