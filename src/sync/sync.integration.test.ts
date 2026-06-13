import { describe, it, expect, vi, beforeEach } from 'vitest';
import { putPackListDirect, getAllPackLists, deletePackListDirect } from '../db/packLists.js';
import { mergeAndPutPacking, getAllPackings, updatePackingItemDirect } from '../db/packings.js';
import { mockDb } from '../db/mockDb.js';
import type { PackList, Packing } from '../types/index.js';

vi.mock('../db/db.js', async () => {
  const { mockDb } = await import('../db/mockDb.js');
  return { getDb: () => Promise.resolve(mockDb) };
});

vi.mock('../sync/emitter.js', () => ({ emitSync: vi.fn() }));

const list: PackList = {
  id: 'list-1',
  name: 'Toiletries',
  items: ['Toothbrush'],
  referencedListIds: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const packing: Packing = {
  id: 'pack-1',
  name: 'Trip',
  fromDate: '2026-06-01',
  toDate: '2026-06-07',
  packListIds: ['list-1'],
  items: [{ listId: 'list-1', text: 'Toothbrush', status: 'pending' }],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('sync reconnect integration (db layer)', () => {
  beforeEach(() => mockDb.clear());

  it('simulates reconnect: remote delete tombstone hides local list', async () => {
    await mockDb.put('packLists', list);
    await putPackListDirect({
      ...list,
      deletedAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    expect(await getAllPackLists()).toHaveLength(0);
  });

  it('simulates reconnect: newer local edit revives a soft-deleted list', async () => {
    await mockDb.put('packLists', {
      ...list,
      deletedAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    await putPackListDirect({
      ...list,
      name: 'Toiletries (updated)',
      updatedAt: '2026-01-03T00:00:00Z',
    });
    const stored = await mockDb.get('packLists', list.id);
    expect(stored.deletedAt).toBeUndefined();
    expect(stored.name).toBe('Toiletries (updated)');
  });

  it('simulates reconnect: remote packing delete tombstone hides local packing', async () => {
    await mockDb.put('packings', packing);
    await mergeAndPutPacking({
      ...packing,
      deletedAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    expect(await getAllPackings()).toHaveLength(0);
  });

  it('simulates live sync: item toggle by listId+text after ad-hoc item added on peer', async () => {
    await mockDb.put('packings', {
      ...packing,
      items: [
        ...packing.items,
        { listId: '__additional__', text: 'Adaptor', status: 'pending' },
      ],
    });
    await updatePackingItemDirect(
      packing.id,
      'list-1',
      'Toothbrush',
      'packed',
      '2026-01-02T00:00:00Z',
    );
    const stored: Packing = await mockDb.get('packings', packing.id);
    expect(stored.items.find((i) => i.text === 'Toothbrush')!.status).toBe('packed');
    expect(stored.items.find((i) => i.text === 'Adaptor')!.status).toBe('pending');
  });

  it('deletePackListDirect on unknown id creates minimal tombstone', async () => {
    await deletePackListDirect('ghost', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z');
    expect((await mockDb.get('packLists', 'ghost')).deletedAt).toBe('2026-01-02T00:00:00Z');
  });
});
