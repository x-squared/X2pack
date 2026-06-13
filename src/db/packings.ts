import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { resolveLeafLists, getAllPackLists } from './packLists.js';
import type { Packing, PackingItem } from '../types/index.js';
import { emitSync } from '../sync/emitter.js';
import { remoteLoses, remoteWins } from '../sync/clockSkew.js';

/**
 * Packing session persistence. User-facing writes call {@link emitSync}; peer applies
 * use `*Direct` helpers and {@link mergeAndPutPacking}. Sync model: `src/sync/syncArchitecture.ts`.
 */
export async function getAllPackings(): Promise<Packing[]> {
  const db = await getDb();
  return (await db.getAll('packings')).filter((p) => !p.deletedAt);
}

/** Includes soft-deleted tombstones — used for sync full_state. */
export async function getAllPackingsForSync(): Promise<Packing[]> {
  const db = await getDb();
  return db.getAll('packings');
}

export async function getPacking(id: string): Promise<Packing | undefined> {
  const db = await getDb();
  const packing = await db.get('packings', id);
  if (!packing || packing.deletedAt) return undefined;
  return packing;
}

export async function createPacking(
  name: string,
  fromDate: string,
  toDate: string,
  packListIds: readonly string[],
): Promise<Packing> {
  const db = await getDb();
  const allLists = await getAllPackLists();
  const leaves = resolveLeafLists(packListIds, allLists);

  const items: PackingItem[] = leaves.flatMap((list) =>
    list.items.map((text) => ({ listId: list.id, text, status: 'pending' as const })),
  );

  const now = new Date().toISOString();
  const packing: Packing = {
    id: uuidv4(),
    name,
    fromDate,
    toDate,
    packListIds,
    items,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await db.put('packings', packing);
  emitSync({ type: 'create_packing', data: packing });
  return packing;
}

export async function updatePackingMeta(
  id: string,
  name: string,
  fromDate: string,
  toDate: string,
): Promise<Packing> {
  const db = await getDb();
  const packing = await db.get('packings', id);
  if (!packing || packing.deletedAt) throw new Error(`Packing ${id} not found`);
  const updated: Packing = {
    ...packing,
    name,
    fromDate,
    toDate,
    updatedAt: new Date().toISOString(),
  };
  await db.put('packings', updated);
  emitSync({ type: 'update_packing_meta', id, name, fromDate, toDate, updatedAt: updated.updatedAt });
  return updated;
}

function applyItemStatusUpdate(
  packing: Packing,
  listId: string,
  text: string,
  status: PackingItem['status'],
): Packing {
  const updatedItems = packing.items.map((item) =>
    item.listId === listId && item.text === text ? { ...item, status } : item,
  );

  const allDone = updatedItems.every((item) => item.status !== 'pending');
  return {
    ...packing,
    items: updatedItems,
    status: allDone ? 'done' : 'active',
    updatedAt: new Date().toISOString(),
  };
}

export async function updatePackingItem(
  packingId: string,
  listId: string,
  text: string,
  status: PackingItem['status'],
): Promise<Packing> {
  const db = await getDb();
  const packing = await db.get('packings', packingId);
  if (!packing || packing.deletedAt) throw new Error(`Packing ${packingId} not found`);
  if (!packing.items.some((item) => item.listId === listId && item.text === text)) {
    throw new Error(`Item "${text}" not found in packing ${packingId}`);
  }

  const updated = applyItemStatusUpdate(packing, listId, text, status);
  await db.put('packings', updated);
  emitSync({ type: 'update_packing_item', packingId, listId, text, status, updatedAt: updated.updatedAt });
  return updated;
}

export async function updatePackingItemDirect(
  packingId: string,
  listId: string,
  text: string,
  status: PackingItem['status'],
  updatedAt: string,
): Promise<void> {
  const db = await getDb();
  const packing = await db.get('packings', packingId);
  if (!packing || packing.deletedAt) return;
  if (!packing.items.some((item) => item.listId === listId && item.text === text)) return;
  if (remoteLoses(updatedAt, packing.updatedAt)) return;

  const updated = applyItemStatusUpdate(packing, listId, text, status);
  await db.put('packings', { ...updated, updatedAt });
}

export async function updatePackingMetaDirect(
  id: string,
  name: string,
  fromDate: string,
  toDate: string,
  updatedAt: string,
): Promise<void> {
  const db = await getDb();
  const packing = await db.get('packings', id);
  if (!packing || packing.deletedAt || remoteLoses(updatedAt, packing.updatedAt)) return;
  await db.put('packings', { ...packing, name, fromDate, toDate, updatedAt });
}

export async function addPackingItem(packingId: string, text: string): Promise<Packing> {
  const db = await getDb();
  const packing = await db.get('packings', packingId);
  if (!packing || packing.deletedAt) throw new Error(`Packing ${packingId} not found`);
  const newItem: PackingItem = { listId: '__additional__', text, status: 'pending' };
  const updated: Packing = {
    ...packing,
    items: [...packing.items, newItem],
    status: 'active',
    updatedAt: new Date().toISOString(),
  };
  await db.put('packings', updated);
  emitSync({ type: 'add_packing_item', packingId, text });
  return updated;
}

export async function addPackingItemDirect(packingId: string, text: string): Promise<void> {
  const db = await getDb();
  const packing = await db.get('packings', packingId);
  if (!packing || packing.deletedAt) return;
  if (packing.items.some((item) => item.listId === '__additional__' && item.text === text)) return;

  const newItem: PackingItem = { listId: '__additional__', text, status: 'pending' };
  await db.put('packings', {
    ...packing,
    items: [...packing.items, newItem],
    status: 'active',
    updatedAt: new Date().toISOString(),
  });
}

export async function deletePacking(id: string): Promise<void> {
  const db = await getDb();
  const packing = await db.get('packings', id);
  if (!packing || packing.deletedAt) return;
  const now = new Date().toISOString();
  const tombstone: Packing = { ...packing, deletedAt: now, updatedAt: now };
  await db.put('packings', tombstone);
  emitSync({ type: 'delete_packing', id, deletedAt: now, updatedAt: now });
}

export async function deletePackingDirect(id: string, deletedAt: string, updatedAt: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('packings', id);
  if (existing && remoteLoses(updatedAt, existing.updatedAt)) return;
  if (existing) {
    await db.put('packings', { ...existing, deletedAt, updatedAt });
    return;
  }
  await db.put('packings', {
    id,
    name: '',
    fromDate: deletedAt.slice(0, 10),
    toDate: deletedAt.slice(0, 10),
    packListIds: [],
    items: [],
    status: 'done',
    createdAt: deletedAt,
    updatedAt,
    deletedAt,
  });
}

function mergePackingItems(
  base: Packing,
  other: Packing,
): { items: PackingItem[]; changed: boolean } {
  const merged = [...base.items];
  let changed = false;
  for (const otherItem of other.items) {
    const idx = merged.findIndex(
      (i) => i.listId === otherItem.listId && i.text === otherItem.text,
    );
    if (idx === -1) {
      merged.push(otherItem);
      changed = true;
    } else {
      const cur = merged[idx];
      if (cur?.status === 'pending' && otherItem.status !== 'pending') {
        merged[idx] = { ...cur, status: otherItem.status };
        changed = true;
      }
    }
  }
  return { items: merged, changed };
}

/**
 * Merge a remote packing into local storage (used by `full_state` and `create_packing`).
 * Metadata: LWW by `updatedAt`. Items: union merge by `(listId, text)` — see syncArchitecture.ts.
 */
export async function mergeAndPutPacking(remote: Packing): Promise<void> {
  const db = await getDb();
  const local = await db.get('packings', remote.id);
  if (!local) {
    await db.put('packings', remote);
    return;
  }

  const localWins = !remoteWins(remote.updatedAt, local.updatedAt);
  const winner = localWins ? local : remote;
  const loser = localWins ? remote : local;

  if (winner.deletedAt) {
    await db.put('packings', winner);
    return;
  }

  const { items, changed } = loser.deletedAt
    ? { items: winner.items, changed: false }
    : mergePackingItems(winner, loser);

  await db.put('packings', {
    ...winner,
    items,
    updatedAt: changed ? new Date().toISOString() : winner.updatedAt,
  });
}
