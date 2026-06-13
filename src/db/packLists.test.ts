import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasCircularReference,
  isDependedUpon,
  resolveLeafLists,
  savePackList,
  deletePackList,
  getAllPackLists,
  getAllPackListsForSync,
  putPackListDirect,
  deletePackListDirect,
  putPackListSortOrderDirect,
  putPackListMajorDirect,
} from './packLists.js';
import { mockDb, requireStored } from './mockDb.js';
import type { PackList } from '../types/index.js';
import { emitSync } from '../sync/emitter.js';

vi.mock('./db.js', async () => {
  const { mockDb } = await import('./mockDb.js');
  return { getDb: () => Promise.resolve(mockDb) };
});

vi.mock('../sync/emitter.js', () => ({ emitSync: vi.fn() }));

function makeList(id: string, refs: string[] = [], items: string[] = []): PackList {
  return { id, name: id, items, referencedListIds: refs, createdAt: '', updatedAt: '' };
}

describe('hasCircularReference', () => {
  it('returns false when there are no references', () => {
    const lists = [makeList('a')];
    expect(hasCircularReference('a', [], lists)).toBe(false);
  });

  it('returns false for a valid chain a → b → c', () => {
    const lists = [makeList('a', ['b']), makeList('b', ['c']), makeList('c')];
    expect(hasCircularReference('a', ['b'], lists)).toBe(false);
  });

  it('detects direct self-reference', () => {
    const lists = [makeList('a')];
    expect(hasCircularReference('a', ['a'], lists)).toBe(true);
  });

  it('detects indirect cycle a → b → a', () => {
    const lists = [makeList('a', ['b']), makeList('b', ['a'])];
    expect(hasCircularReference('a', ['b'], lists)).toBe(true);
  });

  it('detects three-node cycle a → b → c → a', () => {
    const lists = [makeList('a', ['b']), makeList('b', ['c']), makeList('c', ['a'])];
    expect(hasCircularReference('a', ['b'], lists)).toBe(true);
  });

  it('does not flag sibling references (diamond shape)', () => {
    // a → [b, c], b → d, c → d  (diamond, no cycle)
    const lists = [
      makeList('a', ['b', 'c']),
      makeList('b', ['d']),
      makeList('c', ['d']),
      makeList('d'),
    ];
    expect(hasCircularReference('a', ['b', 'c'], lists)).toBe(false);
  });
});

describe('isDependedUpon', () => {
  it('returns false when no list references the target', () => {
    const lists = [makeList('a'), makeList('b')];
    expect(isDependedUpon('a', lists)).toBe(false);
  });

  it('returns true when another list references the target', () => {
    const lists = [makeList('a', ['b']), makeList('b')];
    expect(isDependedUpon('b', lists)).toBe(true);
  });
});

describe('resolveLeafLists', () => {
  it('returns a list itself when it has no references', () => {
    const lists = [makeList('a', [], ['item1', 'item2'])];
    const leaves = resolveLeafLists(['a'], lists);
    expect(leaves.map((l) => l.id)).toEqual(['a']);
  });

  it('expands one level of references', () => {
    const lists = [makeList('a', ['b', 'c']), makeList('b'), makeList('c')];
    const leaves = resolveLeafLists(['a'], lists);
    expect(leaves.map((l) => l.id).sort((a, b) => a.localeCompare(b))).toEqual(['b', 'c']);
  });

  it('expands transitively', () => {
    // a → b → c (c is the only leaf)
    const lists = [makeList('a', ['b']), makeList('b', ['c']), makeList('c')];
    const leaves = resolveLeafLists(['a'], lists);
    expect(leaves.map((l) => l.id)).toEqual(['c']);
  });

  it('deduplicates shared leaves (diamond shape)', () => {
    const lists = [
      makeList('a', ['b', 'c']),
      makeList('b', ['d']),
      makeList('c', ['d']),
      makeList('d'),
    ];
    const leaves = resolveLeafLists(['a'], lists);
    expect(leaves.map((l) => l.id)).toEqual(['d']);
  });

  it('handles multiple root ids', () => {
    const lists = [makeList('a'), makeList('b')];
    const leaves = resolveLeafLists(['a', 'b'], lists);
    expect(leaves.map((l) => l.id).sort((a, b) => a.localeCompare(b))).toEqual(['a', 'b']);
  });

  it('returns empty array for unknown root id', () => {
    const lists = [makeList('a')];
    const leaves = resolveLeafLists(['unknown'], lists);
    expect(leaves).toHaveLength(0);
  });

  it('includes a list that has both direct items and references', () => {
    // 'parent' has its own items AND references 'child' — both should appear
    const lists = [
      makeList('parent', ['child'], ['item-from-parent']),
      makeList('child', [], ['item-from-child']),
    ];
    const leaves = resolveLeafLists(['parent'], lists);
    expect(leaves.map((l) => l.id).sort((a, b) => a.localeCompare(b))).toEqual(['child', 'parent']);
  });

  it('returns empty when references form a cycle with no leaf lists', () => {
    const lists = [makeList('a', ['b']), makeList('b', ['a'])];
    expect(resolveLeafLists(['a'], lists)).toHaveLength(0);
  });

  it('skips missing referenced ids without throwing', () => {
    const lists = [makeList('a', ['missing'])];
    expect(resolveLeafLists(['a'], lists)).toHaveLength(0);
  });

  it('ignores direct self-reference when expanding', () => {
    const lists = [makeList('a', ['a'], ['item'])];
    const leaves = resolveLeafLists(['a'], lists);
    expect(leaves.map((l) => l.id)).toEqual(['a']);
  });
});

describe('savePackList', () => {
  beforeEach(() => {
    mockDb.clear();
  });

  it('preserves isMajor when editing a list without passing isMajor', async () => {
    const created = await savePackList({ name: 'Camping', items: ['Tent'], referencedListIds: [], isMajor: true });
    expect(created.isMajor).toBe(true);

    const updated = await savePackList({ name: 'Camping updated', items: ['Tent', 'Stove'], referencedListIds: [] }, created.id);
    expect(updated.isMajor).toBe(true);
  });

  it('allows explicitly clearing isMajor when editing', async () => {
    const created = await savePackList({ name: 'Camping', items: [], referencedListIds: [], isMajor: true });
    const updated = await savePackList({ name: 'Camping', items: [], referencedListIds: [], isMajor: false }, created.id);
    expect(updated.isMajor).toBe(false);
  });

  it('does not set isMajor on new lists when not specified', async () => {
    const created = await savePackList({ name: 'Camping', items: [], referencedListIds: [] });
    expect(created.isMajor).toBeUndefined();
  });
});

// ─── Direct helpers (used by WebRTCManager to apply remote writes) ────────────

describe('putPackListDirect', () => {
  beforeEach(() => mockDb.clear());

  it('inserts when no local copy exists', async () => {
    const list = makeList('l1');
    await putPackListDirect(list);
    expect(await mockDb.get('packLists', 'l1')).toBeDefined();
  });

  it('replaces local when remote is strictly newer', async () => {
    await mockDb.put('packLists', { ...makeList('l1'), name: 'Old', updatedAt: '2026-01-01' });
    await putPackListDirect({ ...makeList('l1'), name: 'New', updatedAt: '2026-01-02' });
    const stored = requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1');
    expect(stored.name).toBe('New');
  });

  it('keeps local when local is strictly newer', async () => {
    await mockDb.put('packLists', { ...makeList('l1'), name: 'Local', updatedAt: '2026-01-02' });
    await putPackListDirect({ ...makeList('l1'), name: 'Remote', updatedAt: '2026-01-01' });
    const stored = requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1');
    expect(stored.name).toBe('Local');
  });

  it('replaces local when timestamps are equal (remote >= local boundary)', async () => {
    await mockDb.put('packLists', { ...makeList('l1'), name: 'Old', updatedAt: '2026-01-01' });
    await putPackListDirect({ ...makeList('l1'), name: 'Same-time', updatedAt: '2026-01-01' });
    const stored = requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1');
    expect(stored.name).toBe('Same-time');
  });
});

describe('putPackListSortOrderDirect', () => {
  beforeEach(() => mockDb.clear());

  it('updates sortOrder and preserves all other fields', async () => {
    await mockDb.put('packLists', { ...makeList('l1'), name: 'Keep Me', sortOrder: 10, updatedAt: '2026-01-01' });
    await putPackListSortOrderDirect('l1', 99, '2026-01-02');
    const stored = requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1');
    expect(stored.sortOrder).toBe(99);
    expect(stored.name).toBe('Keep Me');
    expect(stored.updatedAt).toBe('2026-01-02');
  });

  it('does nothing when the id does not exist', async () => {
    await expect(putPackListSortOrderDirect('missing', 5, '2026-01-02')).resolves.toBeUndefined();
  });

  it('skips when remote updatedAt is older', async () => {
    await mockDb.put('packLists', { ...makeList('l1'), sortOrder: 10, updatedAt: '2026-01-02' });
    await putPackListSortOrderDirect('l1', 99, '2026-01-01');
    expect(requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1').sortOrder).toBe(10);
  });
});

describe('putPackListMajorDirect', () => {
  beforeEach(() => mockDb.clear());

  it('sets isMajor to true', async () => {
    await mockDb.put('packLists', { ...makeList('l1'), updatedAt: '2026-01-01' });
    await putPackListMajorDirect('l1', true, '2026-01-02');
    const stored = requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1');
    expect(stored.isMajor).toBe(true);
    expect(stored.updatedAt).toBe('2026-01-02');
  });

  it('sets isMajor to false', async () => {
    await mockDb.put('packLists', { ...makeList('l1'), isMajor: true, updatedAt: '2026-01-01' });
    await putPackListMajorDirect('l1', false, '2026-01-02');
    expect(requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1').isMajor).toBe(false);
  });

  it('does nothing when the id does not exist', async () => {
    await expect(putPackListMajorDirect('missing', true, '2026-01-02')).resolves.toBeUndefined();
  });
});

describe('deletePackList (soft delete)', () => {
  beforeEach(() => mockDb.clear());

  it('sets deletedAt and hides from getAllPackLists', async () => {
    await mockDb.put('packLists', makeList('l1'));
    await deletePackList('l1');
    const stored = requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1');
    expect(stored.deletedAt).toBeDefined();
    expect(await getAllPackLists()).toHaveLength(0);
    expect(await getAllPackListsForSync()).toHaveLength(1);
  });

  it('emits delete_pack_list with timestamps', async () => {
    await mockDb.put('packLists', makeList('l1'));
    vi.mocked(emitSync).mockClear();
    await deletePackList('l1');
    expect(emitSync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'delete_pack_list', id: 'l1', deletedAt: expect.any(String) }),
    );
  });
});

describe('deletePackListDirect', () => {
  beforeEach(() => mockDb.clear());

  it('soft-deletes an existing list when remote is newer', async () => {
    await mockDb.put('packLists', { ...makeList('l1'), updatedAt: '2026-01-01' });
    await deletePackListDirect('l1', '2026-01-02', '2026-01-02');
    expect(requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1').deletedAt).toBe('2026-01-02');
  });

  it('skips when remote is older than local', async () => {
    await mockDb.put('packLists', { ...makeList('l1'), updatedAt: '2026-01-02' });
    await deletePackListDirect('l1', '2026-01-01', '2026-01-01');
    expect(requireStored(await mockDb.get('packLists', 'l1'), 'pack list l1').deletedAt).toBeUndefined();
  });
});

describe('savePackList emitSync', () => {
  beforeEach(() => mockDb.clear());

  it('emits save_pack_list after create', async () => {
    vi.mocked(emitSync).mockClear();
    await savePackList({ name: 'Camping', items: ['Tent'], referencedListIds: [] });
    expect(emitSync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'save_pack_list', data: expect.objectContaining({ name: 'Camping' }) }),
    );
  });
});
