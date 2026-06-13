import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPacking,
  updatePackingItem,
  addPackingItem,
  addPackingItemDirect,
  deletePacking,
  deletePackingDirect,
  getAllPackings,
  getAllPackingsForSync,
  mergeAndPutPacking,
  updatePackingMetaDirect,
  updatePackingItemDirect,
} from './packings.js';
import { mockDb } from './mockDb.js';
import type { Packing, PackingItem } from '../types/index.js';
import { emitSync } from '../sync/emitter.js';

vi.mock('./db.js', async () => {
  const { mockDb } = await import('./mockDb.js');
  return { getDb: () => Promise.resolve(mockDb) };
});

vi.mock('./packLists.js', () => ({
  getAllPackLists: vi.fn().mockResolvedValue([
    { id: 'list-1', name: 'Clothes', items: ['Shirt', 'Pants'], referencedListIds: [], createdAt: '', updatedAt: '' },
  ]),
  resolveLeafLists: (ids: string[], lists: { id: string }[]) =>
    lists.filter((l) => ids.includes(l.id)),
}));

vi.mock('../sync/emitter.js', () => ({ emitSync: vi.fn() }));

function makePacking(overrides: Partial<Packing> & { id: string }): Packing {
  return {
    name: 'Trip',
    fromDate: '2026-01-01',
    toDate: '2026-01-07',
    packListIds: [],
    items: [],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('packings db', () => {
  beforeEach(() => {
    mockDb.clear();
  });

  // ─── createPacking ───────────────────────────────────────────────────────────

  describe('createPacking', () => {
    it('creates a packing with items from the resolved leaf lists', async () => {
      const p = await createPacking('Summer Trip', '2026-07-01', '2026-07-14', ['list-1']);
      expect(p.name).toBe('Summer Trip');
      expect(p.fromDate).toBe('2026-07-01');
      expect(p.status).toBe('active');
      const texts = p.items.map((i) => i.text);
      expect(texts).toContain('Shirt');
      expect(texts).toContain('Pants');
    });

    it('marks all created items as pending', async () => {
      const p = await createPacking('Trip', '2026-01-01', '2026-01-07', ['list-1']);
      expect(p.items.every((i) => i.status === 'pending')).toBe(true);
    });

    it('persists the packing to the db', async () => {
      const p = await createPacking('Persisted', '2026-01-01', '2026-01-01', ['list-1']);
      const stored = await mockDb.get('packings', p.id);
      expect(stored).toBeDefined();
      expect(stored.name).toBe('Persisted');
    });
  });

  // ─── updatePackingItem ────────────────────────────────────────────────────────

  describe('updatePackingItem', () => {
    it('updates the targeted item status', async () => {
      const p = makePacking({
        id: 'p1',
        items: [
          { listId: 'l', text: 'Shirt', status: 'pending' },
          { listId: 'l', text: 'Pants', status: 'pending' },
        ],
      });
      await mockDb.put('packings', p);

      const updated = await updatePackingItem('p1', 'l', 'Shirt', 'packed');
      expect(updated.items[0]!.status).toBe('packed');
      expect(updated.items[1]!.status).toBe('pending');
    });

    it('throws when the item key is not found', async () => {
      const p = makePacking({
        id: 'p1',
        items: [{ listId: 'l', text: 'Shirt', status: 'pending' }],
      });
      await mockDb.put('packings', p);
      await expect(updatePackingItem('p1', 'l', 'Missing', 'packed')).rejects.toThrow(/not found/);
    });

    it('leaves packing active when at least one item is still pending', async () => {
      const p = makePacking({
        id: 'p1',
        items: [
          { listId: 'l', text: 'A', status: 'pending' },
          { listId: 'l', text: 'B', status: 'pending' },
        ],
      });
      await mockDb.put('packings', p);

      const updated = await updatePackingItem('p1', 'l', 'A', 'packed');
      expect(updated.status).toBe('active');
    });

    it('sets status to done when all items become non-pending', async () => {
      const p = makePacking({
        id: 'p1',
        items: [
          { listId: 'l', text: 'A', status: 'packed' },
          { listId: 'l', text: 'B', status: 'pending' },
        ],
      });
      await mockDb.put('packings', p);

      const updated = await updatePackingItem('p1', 'l', 'B', 'discarded');
      expect(updated.status).toBe('done');
    });

    it('treats not_used as non-pending for the done calculation', async () => {
      const p = makePacking({
        id: 'p1',
        items: [
          { listId: 'l', text: 'A', status: 'packed' },
          { listId: 'l', text: 'B', status: 'pending' },
        ],
      });
      await mockDb.put('packings', p);

      const updated = await updatePackingItem('p1', 'l', 'B', 'not_used');
      expect(updated.status).toBe('done');
    });
  });

  // ─── addPackingItem ───────────────────────────────────────────────────────────

  describe('addPackingItem', () => {
    it('appends a pending item with __additional__ listId', async () => {
      await mockDb.put('packings', makePacking({ id: 'p1' }));

      const updated = await addPackingItem('p1', 'Sunscreen');
      expect(updated.items).toHaveLength(1);
      expect(updated.items[0]).toEqual({ listId: '__additional__', text: 'Sunscreen', status: 'pending' });
    });

    it('reactivates a done packing when an item is added', async () => {
      await mockDb.put('packings', makePacking({ id: 'p1', status: 'done' }));

      const updated = await addPackingItem('p1', 'Extra item');
      expect(updated.status).toBe('active');
    });
  });

  describe('addPackingItemDirect', () => {
    it('appends when the item is new', async () => {
      await mockDb.put('packings', makePacking({ id: 'p1' }));
      await addPackingItemDirect('p1', 'Sunscreen');
      const stored = await mockDb.get('packings', 'p1');
      expect(stored.items).toHaveLength(1);
    });

    it('does not duplicate an existing additional item', async () => {
      await mockDb.put('packings', makePacking({
        id: 'p1',
        items: [{ listId: '__additional__', text: 'Sunscreen', status: 'pending' }],
      }));
      await addPackingItemDirect('p1', 'Sunscreen');
      const stored = await mockDb.get('packings', 'p1');
      expect(stored.items).toHaveLength(1);
    });
  });

  describe('updatePackingMetaDirect', () => {
    it('updates metadata when remote is newer', async () => {
      await mockDb.put('packings', makePacking({ id: 'p1', name: 'Old', updatedAt: '2026-01-01T00:00:00Z' }));
      await updatePackingMetaDirect('p1', 'New', '2026-02-01', '2026-02-07', '2026-01-02T00:00:00Z');
      const stored = await mockDb.get('packings', 'p1');
      expect(stored.name).toBe('New');
      expect(stored.updatedAt).toBe('2026-01-02T00:00:00Z');
    });

    it('skips when remote is older than local', async () => {
      await mockDb.put('packings', makePacking({ id: 'p1', name: 'Local', updatedAt: '2026-01-02T00:00:00Z' }));
      await updatePackingMetaDirect('p1', 'Remote', '2026-01-01', '2026-01-07', '2026-01-01T00:00:00Z');
      expect((await mockDb.get('packings', 'p1')).name).toBe('Local');
    });
  });

  describe('updatePackingItemDirect', () => {
    it('updates item status by listId and text', async () => {
      await mockDb.put('packings', makePacking({
        id: 'p1',
        updatedAt: '2026-01-01T00:00:00Z',
        items: [
          { listId: 'l', text: 'Shirt', status: 'pending' },
          { listId: 'l', text: 'Pants', status: 'pending' },
        ],
      }));
      await updatePackingItemDirect('p1', 'l', 'Shirt', 'packed', '2026-01-02T00:00:00Z');
      const stored = await mockDb.get('packings', 'p1');
      expect(stored.items.find((i: PackingItem) => i.text === 'Shirt')!.status).toBe('packed');
      expect(stored.items.find((i: PackingItem) => i.text === 'Pants')!.status).toBe('pending');
    });

    it('skips when remote updatedAt is older than local packing', async () => {
      await mockDb.put('packings', makePacking({
        id: 'p1',
        updatedAt: '2026-01-02T00:00:00Z',
        items: [{ listId: 'l', text: 'Shirt', status: 'pending' }],
      }));
      await updatePackingItemDirect('p1', 'l', 'Shirt', 'packed', '2026-01-01T00:00:00Z');
      expect((await mockDb.get('packings', 'p1')).items[0]!.status).toBe('pending');
    });
  });

  // ─── deletePacking ────────────────────────────────────────────────────────────

  describe('deletePacking', () => {
    it('soft-deletes and hides from getAllPackings', async () => {
      await mockDb.put('packings', makePacking({ id: 'p1' }));
      await deletePacking('p1');
      expect((await mockDb.get('packings', 'p1')).deletedAt).toBeDefined();
      expect(await getAllPackings()).toHaveLength(0);
      expect(await getAllPackingsForSync()).toHaveLength(1);
    });

    it('emits delete_packing with timestamps', async () => {
      await mockDb.put('packings', makePacking({ id: 'p1' }));
      vi.mocked(emitSync).mockClear();
      await deletePacking('p1');
      expect(emitSync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'delete_packing', id: 'p1' }),
      );
    });
  });

  describe('deletePackingDirect', () => {
    it('soft-deletes when remote is newer', async () => {
      await mockDb.put('packings', makePacking({ id: 'p1', updatedAt: '2026-01-01T00:00:00Z' }));
      await deletePackingDirect('p1', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z');
      expect((await mockDb.get('packings', 'p1')).deletedAt).toBe('2026-01-02T00:00:00Z');
    });
  });

  // ─── mergeAndPutPacking ───────────────────────────────────────────────────────

  describe('mergeAndPutPacking', () => {
    it('inserts when no local copy exists', async () => {
      const remote = makePacking({ id: 'p1', name: 'Remote Trip' });
      await mergeAndPutPacking(remote);
      const stored = await mockDb.get('packings', 'p1');
      expect(stored.name).toBe('Remote Trip');
    });

    it('keeps the newer remote version (metadata)', async () => {
      const local = makePacking({ id: 'p1', name: 'Old', updatedAt: '2026-01-01T00:00:00Z' });
      const remote = makePacking({ id: 'p1', name: 'New', updatedAt: '2026-01-02T00:00:00Z' });
      await mockDb.put('packings', local);
      await mergeAndPutPacking(remote);
      expect((await mockDb.get('packings', 'p1')).name).toBe('New');
    });

    it('keeps the newer local version (metadata)', async () => {
      const local = makePacking({ id: 'p1', name: 'Local', updatedAt: '2026-01-02T00:00:00Z' });
      const remote = makePacking({ id: 'p1', name: 'Remote', updatedAt: '2026-01-01T00:00:00Z' });
      await mockDb.put('packings', local);
      await mergeAndPutPacking(remote);
      expect((await mockDb.get('packings', 'p1')).name).toBe('Local');
    });

    it('union-merges items from both sides', async () => {
      const localItems: PackingItem[] = [
        { listId: 'l', text: 'Shirt', status: 'packed' },
        { listId: 'l', text: 'Pants', status: 'pending' },
      ];
      const remoteItems: PackingItem[] = [
        { listId: 'l', text: 'Shirt', status: 'pending' },
        { listId: 'l', text: 'Shoes', status: 'packed' },
      ];
      const local = makePacking({ id: 'p1', updatedAt: '2026-01-02T00:00:00Z', items: localItems });
      const remote = makePacking({ id: 'p1', updatedAt: '2026-01-01T00:00:00Z', items: remoteItems });
      await mockDb.put('packings', local);
      await mergeAndPutPacking(remote);

      const stored: Packing = await mockDb.get('packings', 'p1');
      const texts = stored.items.map((i) => i.text);
      expect(texts).toContain('Shirt');
      expect(texts).toContain('Pants');
      expect(texts).toContain('Shoes');
    });

    it('promotes a pending item to non-pending when the other side has it non-pending', async () => {
      // remote is base (newer) with Shirt=pending; local (other) has Shirt=packed → packed wins
      const local = makePacking({
        id: 'p1',
        updatedAt: '2026-01-01T00:00:00Z',
        items: [{ listId: 'l', text: 'Shirt', status: 'packed' }],
      });
      const remote = makePacking({
        id: 'p1',
        updatedAt: '2026-01-02T00:00:00Z',
        items: [{ listId: 'l', text: 'Shirt', status: 'pending' }],
      });
      await mockDb.put('packings', local);
      await mergeAndPutPacking(remote);

      const stored: Packing = await mockDb.get('packings', 'p1');
      expect(stored.items.find((i) => i.text === 'Shirt')!.status).toBe('packed');
    });

    it('does not downgrade a non-pending item back to pending', async () => {
      // local is base (newer) with Shirt=packed; remote (other) also has Shirt=pending → stay packed
      const local = makePacking({
        id: 'p1',
        updatedAt: '2026-01-02T00:00:00Z',
        items: [{ listId: 'l', text: 'Shirt', status: 'packed' }],
      });
      const remote = makePacking({
        id: 'p1',
        updatedAt: '2026-01-01T00:00:00Z',
        items: [{ listId: 'l', text: 'Shirt', status: 'pending' }],
      });
      await mockDb.put('packings', local);
      await mergeAndPutPacking(remote);

      const stored: Packing = await mockDb.get('packings', 'p1');
      expect(stored.items.find((i) => i.text === 'Shirt')!.status).toBe('packed');
    });

    it('applies remote soft-delete when remote is newer', async () => {
      const local = makePacking({ id: 'p1', updatedAt: '2026-01-01T00:00:00Z' });
      const remote = makePacking({
        id: 'p1',
        updatedAt: '2026-01-02T00:00:00Z',
        deletedAt: '2026-01-02T00:00:00Z',
      });
      await mockDb.put('packings', local);
      await mergeAndPutPacking(remote);
      expect((await mockDb.get('packings', 'p1')).deletedAt).toBe('2026-01-02T00:00:00Z');
    });

    it('bumps updatedAt when item union merge changes items', async () => {
      const local = makePacking({
        id: 'p1',
        updatedAt: '2026-01-02T00:00:00Z',
        items: [{ listId: 'l', text: 'Shirt', status: 'pending' }],
      });
      const remote = makePacking({
        id: 'p1',
        updatedAt: '2026-01-01T00:00:00Z',
        items: [{ listId: 'l', text: 'Pants', status: 'pending' }],
      });
      await mockDb.put('packings', local);
      await mergeAndPutPacking(remote);
      const stored: Packing = await mockDb.get('packings', 'p1');
      expect(stored.items.map((i) => i.text)).toContain('Pants');
      expect(stored.updatedAt >= '2026-01-02T00:00:00Z').toBe(true);
    });
  });
});
