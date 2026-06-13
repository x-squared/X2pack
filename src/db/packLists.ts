import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import type { PackList } from '../types/index.js';
import { emitSync } from '../sync/emitter.js';
import { remoteLoses, remoteWins } from '../sync/clockSkew.js';

/**
 * Pack list persistence. User-facing writes call {@link emitSync}; peer applies
 * use `*Direct` helpers (no re-broadcast). Sync model: `src/sync/syncArchitecture.ts`.
 */
export async function getAllPackLists(): Promise<PackList[]> {
  const db = await getDb();
  return (await db.getAll('packLists')).filter((l) => !l.deletedAt);
}

/** Includes soft-deleted tombstones — used for sync full_state. */
export async function getAllPackListsForSync(): Promise<PackList[]> {
  const db = await getDb();
  return db.getAll('packLists');
}

export async function getPackList(id: string): Promise<PackList | undefined> {
  const db = await getDb();
  const list = await db.get('packLists', id);
  if (!list || list.deletedAt) return undefined;
  return list;
}

export async function savePackList(
  data: { name: string; items: readonly string[]; referencedListIds: readonly string[]; isMajor?: boolean },
  existingId?: string,
): Promise<PackList> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = existingId ? await db.get('packLists', existingId) : undefined;

  let sortOrder = existing?.sortOrder;
  if (sortOrder === undefined) {
    const all = await db.getAll('packLists');
    const max = all.reduce((m, l) => Math.max(m, l.sortOrder ?? 0), -1);
    sortOrder = max + 10;
  }

  const list: PackList = {
    id: existingId ?? uuidv4(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sortOrder,
    ...(existing?.isMajor === undefined ? {} : { isMajor: existing.isMajor }),
    ...data,
  };
  await db.put('packLists', list);
  emitSync({ type: 'save_pack_list', data: list });
  return list;
}

export async function updatePackListSortOrders(
  updates: ReadonlyArray<{ id: string; sortOrder: number }>,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('packLists', 'readwrite');
  const applied: { id: string; sortOrder: number; updatedAt: string }[] = [];
  for (const { id, sortOrder } of updates) {
    const list = await tx.store.get(id);
    if (!list || list.deletedAt) continue;
    const updatedAt = new Date().toISOString();
    await tx.store.put({ ...list, sortOrder, updatedAt });
    applied.push({ id, sortOrder, updatedAt });
  }
  await tx.done;
  if (applied.length > 0) {
    emitSync({ type: 'update_pack_list_sort_orders', updates: applied });
  }
}

export async function updatePackListMajor(id: string, isMajor: boolean): Promise<void> {
  const db = await getDb();
  const list = await db.get('packLists', id);
  if (!list || list.deletedAt) return;
  const updatedAt = new Date().toISOString();
  await db.put('packLists', { ...list, isMajor, updatedAt });
  emitSync({ type: 'update_pack_list_major', id, isMajor, updatedAt });
}

export async function deletePackList(id: string): Promise<void> {
  const db = await getDb();
  const list = await db.get('packLists', id);
  if (!list || list.deletedAt) return;
  const now = new Date().toISOString();
  const tombstone: PackList = { ...list, deletedAt: now, updatedAt: now };
  await db.put('packLists', tombstone);
  emitSync({ type: 'delete_pack_list', id, deletedAt: now, updatedAt: now });
}

export async function putPackListDirect(list: PackList): Promise<void> {
  const db = await getDb();
  const existing = await db.get('packLists', list.id);
  if (!existing || remoteWins(list.updatedAt, existing.updatedAt)) {
    await db.put('packLists', list);
  }
}

/** Apply a remote soft-delete tombstone (LWW by `updatedAt`). */
export async function deletePackListDirect(id: string, deletedAt: string, updatedAt: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('packLists', id);
  if (existing && remoteLoses(updatedAt, existing.updatedAt)) return;
  if (existing) {
    await db.put('packLists', { ...existing, deletedAt, updatedAt });
    return;
  }
  await db.put('packLists', {
    id,
    name: '',
    items: [],
    referencedListIds: [],
    createdAt: deletedAt,
    updatedAt,
    deletedAt,
  });
}

export async function putPackListSortOrderDirect(
  id: string,
  sortOrder: number,
  updatedAt: string,
): Promise<void> {
  const db = await getDb();
  const list = await db.get('packLists', id);
  if (!list || list.deletedAt || remoteLoses(updatedAt, list.updatedAt)) return;
  await db.put('packLists', { ...list, sortOrder, updatedAt });
}

export async function putPackListMajorDirect(
  id: string,
  isMajor: boolean,
  updatedAt: string,
): Promise<void> {
  const db = await getDb();
  const list = await db.get('packLists', id);
  if (!list || list.deletedAt || remoteLoses(updatedAt, list.updatedAt)) return;
  await db.put('packLists', { ...list, isMajor, updatedAt });
}

export function hasCircularReference(
  candidateId: string,
  referencedListIds: readonly string[],
  allLists: readonly PackList[],
): boolean {
  // Build a map with the candidate's new refs applied
  const simulatedList: PackList = {
    id: candidateId,
    name: '',
    items: [],
    referencedListIds,
    createdAt: '',
    updatedAt: '',
  };
  const listMap = new Map(
    [...allLists.filter((l) => l.id !== candidateId), simulatedList].map((l) => [l.id, l]),
  );

  // DFS with inPath tracking — a node in the current path means a back-edge (cycle).
  // Using a separate `done` set avoids re-traversing already-explored subtrees (diamond shapes).
  function dfs(currentId: string, inPath: Set<string>, done: Set<string>): boolean {
    if (inPath.has(currentId)) return true;
    if (done.has(currentId)) return false;
    inPath.add(currentId);
    const list = listMap.get(currentId);
    if (list) {
      for (const refId of list.referencedListIds) {
        if (dfs(refId, inPath, done)) return true;
      }
    }
    inPath.delete(currentId);
    done.add(currentId);
    return false;
  }

  return dfs(candidateId, new Set(), new Set());
}

export function isDependedUpon(id: string, allLists: readonly PackList[]): boolean {
  return allLists.some((l) => l.referencedListIds.includes(id));
}

export function resolveLeafLists(
  rootIds: readonly string[],
  allLists: readonly PackList[],
): PackList[] {
  const listMap = new Map(allLists.map((l) => [l.id, l]));
  const visited = new Set<string>();
  const leaves: PackList[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const list = listMap.get(id);
    if (!list) return;
    if (list.referencedListIds.length === 0 || list.items.length > 0) {
      leaves.push(list);
    }
    for (const refId of list.referencedListIds) {
      if (refId === id) continue;
      visit(refId);
    }
  }

  for (const id of rootIds) visit(id);
  return leaves;
}
