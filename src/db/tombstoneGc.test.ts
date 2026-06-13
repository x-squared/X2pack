import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gcTombstones } from './tombstoneGc.js';
import { mockDb } from './mockDb.js';

vi.mock('./db.js', async () => {
  const { mockDb } = await import('./mockDb.js');
  return { getDb: () => Promise.resolve(mockDb) };
});

describe('gcTombstones', () => {
  beforeEach(() => mockDb.clear());

  it('hard-deletes tombstones older than maxAgeMs', async () => {
    await mockDb.put('packLists', {
      id: 'old',
      name: '',
      items: [],
      referencedListIds: [],
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
      deletedAt: '2020-01-01T00:00:00.000Z',
    });
    await mockDb.put('packLists', {
      id: 'recent',
      name: '',
      items: [],
      referencedListIds: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      deletedAt: new Date().toISOString(),
    });
    await mockDb.put('packings', {
      id: 'p-old',
      name: '',
      fromDate: '2020-01-01',
      toDate: '2020-01-01',
      packListIds: [],
      items: [],
      status: 'done',
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
      deletedAt: '2020-01-01T00:00:00.000Z',
    });

    const result = await gcTombstones(30 * 24 * 60 * 60 * 1000);

    expect(result).toEqual({ packLists: 1, packings: 1 });
    expect(await mockDb.get('packLists', 'old')).toBeUndefined();
    expect(await mockDb.get('packLists', 'recent')).toBeDefined();
    expect(await mockDb.get('packings', 'p-old')).toBeUndefined();
  });

  it('leaves active records untouched', async () => {
    await mockDb.put('packLists', {
      id: 'live',
      name: 'Clothes',
      items: ['Shirt'],
      referencedListIds: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const result = await gcTombstones();
    expect(result).toEqual({ packLists: 0, packings: 0 });
    expect(await mockDb.get('packLists', 'live')).toBeDefined();
  });
});
