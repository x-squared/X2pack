import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function deleteX2packDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('x2pack');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  vi.resetModules();
  await deleteX2packDb();
});

describe('getDb upgrade', () => {
  it('migrates legacy packing date field to fromDate and toDate', async () => {
    const v1 = await openDB('x2pack', 1, {
      upgrade(db) {
        db.createObjectStore('packLists', { keyPath: 'id' });
        db.createObjectStore('packings', { keyPath: 'id' });
      },
    });
    await v1.put('packings', {
      id: 'p1',
      name: 'Weekend',
      date: '2026-03-15',
      packListIds: [],
      items: [],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    v1.close();

    const { getDb } = await import('./db.js');
    const db = await getDb();
    const packing = await db.get('packings', 'p1');

    expect(packing?.fromDate).toBe('2026-03-15');
    expect(packing?.toDate).toBe('2026-03-15');
    expect((packing as Record<string, unknown> | undefined)?.['date']).toBeUndefined();
  });

  it('creates object stores on fresh install', async () => {
    const { getDb } = await import('./db.js');
    const db = await getDb();
    expect(db.objectStoreNames.contains('packLists')).toBe(true);
    expect(db.objectStoreNames.contains('packings')).toBe(true);
  });
});

describe('legacy records without deletedAt', () => {
  it('are returned by getAllPackLists', async () => {
    const { getDb } = await import('./db.js');
    const db = await getDb();
    await db.put('packLists', {
      id: 'legacy',
      name: 'Legacy list',
      items: ['Item'],
      referencedListIds: [],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    const { getAllPackLists } = await import('./packLists.js');
    const lists = await getAllPackLists();
    expect(lists).toHaveLength(1);
    expect(lists[0]?.name).toBe('Legacy list');
    expect(lists[0]?.deletedAt).toBeUndefined();
  });

  it('are excluded once soft-deleted', async () => {
    const { getDb } = await import('./db.js');
    const db = await getDb();
    await db.put('packLists', {
      id: 'gone',
      name: 'Deleted',
      items: [],
      referencedListIds: [],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      deletedAt: '2026-06-01T00:00:00.000Z',
    });

    const { getAllPackLists } = await import('./packLists.js');
    expect(await getAllPackLists()).toHaveLength(0);
  });
});
