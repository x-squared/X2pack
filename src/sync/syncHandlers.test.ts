import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyFullState, applyIncrementalSyncMessage, dbChangesForMessage } from './syncHandlers.js';
import { putPackListDirect } from '../db/packLists.js';
import { mergeAndPutPacking } from '../db/packings.js';
import { gcTombstones } from '../db/tombstoneGc.js';
import type { PackList, Packing } from '../types/index.js';

vi.mock('../db/packLists.js', () => ({
  putPackListDirect: vi.fn().mockResolvedValue(undefined),
  putPackListSortOrderDirect: vi.fn().mockResolvedValue(undefined),
  putPackListMajorDirect: vi.fn().mockResolvedValue(undefined),
  deletePackListDirect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/packings.js', () => ({
  mergeAndPutPacking: vi.fn().mockResolvedValue(undefined),
  deletePackingDirect: vi.fn().mockResolvedValue(undefined),
  updatePackingItemDirect: vi.fn().mockResolvedValue(undefined),
  updatePackingMetaDirect: vi.fn().mockResolvedValue(undefined),
  addPackingItemDirect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/tombstoneGc.js', () => ({
  gcTombstones: vi.fn().mockResolvedValue({ packLists: 0, packings: 0 }),
}));

const list: PackList = {
  id: 'l1',
  name: 'Clothes',
  items: ['Shirt'],
  referencedListIds: [],
  createdAt: '',
  updatedAt: '',
};

const packing: Packing = {
  id: 'p1',
  name: 'Trip',
  fromDate: '2026-01-01',
  toDate: '2026-01-07',
  packListIds: ['l1'],
  items: [{ listId: 'l1', text: 'Shirt', status: 'pending' }],
  status: 'active',
  createdAt: '',
  updatedAt: '',
};

describe('syncHandlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applyFullState merges lists and packings then runs GC', async () => {
    await applyFullState({ type: 'full_state', packLists: [list], packings: [packing] });
    expect(putPackListDirect).toHaveBeenCalledWith(list);
    expect(mergeAndPutPacking).toHaveBeenCalledWith(packing);
    expect(gcTombstones).toHaveBeenCalledOnce();
  });

  it('applyIncrementalSyncMessage routes save_pack_list', async () => {
    await applyIncrementalSyncMessage({ type: 'save_pack_list', data: list });
    expect(putPackListDirect).toHaveBeenCalledWith(list);
  });

  it('applyIncrementalSyncMessage is a no-op for sync_meta', async () => {
    await applyIncrementalSyncMessage({
      type: 'sync_meta',
      sentAt: '2026-01-01T00:00:00Z',
      appVersion: '1.0.0',
      protocolVersion: 1,
    });
    expect(putPackListDirect).not.toHaveBeenCalled();
    expect(mergeAndPutPacking).not.toHaveBeenCalled();
  });

  it('dbChangesForMessage maps update_packing_item to a scoped packing change', () => {
    expect(
      dbChangesForMessage({
        type: 'update_packing_item',
        packingId: 'p1',
        listId: 'l1',
        text: 'Shirt',
        status: 'packed',
        updatedAt: '',
      }),
    ).toEqual([{ kind: 'packing', packingId: 'p1', aspect: 'item' }]);
  });

  it('dbChangesForMessage returns empty for sync_meta', () => {
    expect(
      dbChangesForMessage({
        type: 'sync_meta',
        sentAt: '',
        appVersion: '1.0.0',
        protocolVersion: 1,
      }),
    ).toEqual([]);
  });
});
