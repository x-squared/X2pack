// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import PackingScreen from './PackingScreen.js';
import ListsScreen from './ListsScreen.js';
import HomeScreen from './HomeScreen.js';
import NewPackingScreen from './NewPackingScreen.js';
import { mockDb, requireStored } from '../db/mockDb.js';
import { WebRTCManager } from '../sync/WebRTCManager.js';
import * as packingsDb from '../db/packings.js';
import type { PackList, Packing } from '../types/index.js';

vi.mock('../db/db.js', async () => {
  const { mockDb } = await import('../db/mockDb.js');
  return { getDb: () => Promise.resolve(mockDb) };
});

vi.mock('../sync/emitter.js', () => ({ emitSync: vi.fn() }));

const manager = new WebRTCManager();

vi.mock('../sync/SyncContext.js', () => ({
  useSyncManager: () => manager,
  SyncProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../components/PwaInstallBanner.js', () => ({
  default: () => null,
}));

vi.mock('../components/HelpDialog.js', () => ({
  default: () => null,
}));

vi.mock('../components/WhatsNewDialog.js', () => ({
  default: () => null,
  shouldShowWhatsNew: () => false,
}));

function makeList(overrides: Partial<PackList> & { id: string }): PackList {
  return {
    name: 'Clothes',
    items: ['Shirt', 'Pants'],
    referencedListIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePacking(overrides: Partial<Packing> & { id: string }): Packing {
  return {
    name: 'Weekend',
    fromDate: '2026-07-01',
    toDate: '2026-07-07',
    packListIds: ['list-1'],
    items: [
      { listId: 'list-1', text: 'Shirt', status: 'pending' },
      { listId: 'list-1', text: 'Pants', status: 'pending' },
    ],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('screen integration — packing lifecycle', () => {
  afterEach(() => {
    cleanup();
    mockDb.clear();
  });

  beforeEach(async () => {
    mockDb.clear();
    await mockDb.put('packLists', makeList({ id: 'list-1' }));
    await mockDb.put('packings', makePacking({ id: 'p1' }));
  });

  it('marks packing done after all items are checked off', async () => {
    const user = userEvent.setup();
    render(<PackingScreen packingId="p1" onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Shirt')).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: /Shirt — tap to cycle status/ }));
    await user.click(screen.getByRole('button', { name: /Pants — tap to cycle status/ }));

    await waitFor(() => {
      expect(screen.getByText('✓ Done')).toBeDefined();
    });

    const stored = requireStored(await mockDb.get('packings', 'p1'), 'packing p1');
    expect(stored.status).toBe('done');
    expect(stored.items.every((i) => i.status !== 'pending')).toBe(true);
  });
});

describe('screen integration — list import', () => {
  afterEach(() => {
    cleanup();
    mockDb.clear();
  });

  it('imports markdown lists via file upload', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ListsScreen onNavigate={vi.fn()} onBack={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/No lists yet/)).toBeDefined();
    });

    const markdown = '# Beach trip\n- Towel\n- Sunscreen\n';
    const file = new File([markdown], 'lists.md', { type: 'text/markdown' });
    const input = container.querySelector('.lists-screen__file-input') as HTMLInputElement;
    expect(input).toBeDefined();

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Beach trip')).toBeDefined();
    });

    const lists = await mockDb.getAll('packLists');
    expect(lists).toHaveLength(1);
    expect(lists[0]!.name).toBe('Beach trip');
    expect(lists[0]!.items).toEqual(['Towel', 'Sunscreen']);
  });
});

describe('screen integration — home', () => {
  afterEach(() => {
    cleanup();
    mockDb.clear();
  });

  it('shows active packings from the database', async () => {
    await mockDb.put('packLists', makeList({ id: 'list-1' }));
    await mockDb.put('packings', makePacking({ id: 'p1', name: 'Summer trip' }));

    render(<HomeScreen onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Summer trip')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDefined();
    });
  });
});

describe('screen integration — create packing flow', () => {
  afterEach(() => {
    cleanup();
    mockDb.clear();
  });

  it('creates a packing and navigates to the packing screen', async () => {
    await mockDb.put('packLists', makeList({ id: 'list-1', name: 'Weekend bag' }));

    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NewPackingScreen onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('Weekend bag')).toBeDefined();
    });

    await user.type(screen.getByLabelText('Name'), 'Barcelona');
    await user.click(screen.getByRole('checkbox', { name: /Weekend bag/ }));
    await user.click(screen.getAllByRole('button', { name: 'Start Packing' }).at(-1)!);

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'packing', packingId: expect.any(String) }),
      );
    });

    const packings = await mockDb.getAll('packings');
    expect(packings).toHaveLength(1);
    expect(packings[0]!.name).toBe('Barcelona');
    expect(packings[0]!.items.map((i) => i.text)).toEqual(['Shirt', 'Pants']);
  });
});

describe('screen integration — db load error', () => {
  afterEach(() => {
    cleanup();
    mockDb.clear();
    vi.restoreAllMocks();
  });

  it('shows retry UI when home screen load fails', async () => {
    vi.spyOn(packingsDb, 'getAllPackings').mockRejectedValueOnce(new Error('IDB unavailable'));

    render(<HomeScreen onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
    });
  });
});
