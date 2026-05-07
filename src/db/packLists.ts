import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import type { PackList } from '../types/index.js';

export async function getAllPackLists(): Promise<PackList[]> {
  const db = await getDb();
  return db.getAll('packLists');
}

export async function getPackList(id: string): Promise<PackList | undefined> {
  const db = await getDb();
  return db.get('packLists', id);
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
    ...data,
  };
  await db.put('packLists', list);
  return list;
}

export async function updatePackListSortOrders(
  updates: ReadonlyArray<{ id: string; sortOrder: number }>,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('packLists', 'readwrite');
  await Promise.all(
    updates.map(async ({ id, sortOrder }) => {
      const list = await tx.store.get(id);
      if (list) await tx.store.put({ ...list, sortOrder });
    }),
  );
  await tx.done;
}

export async function updatePackListMajor(id: string, isMajor: boolean): Promise<void> {
  const db = await getDb();
  const list = await db.get('packLists', id);
  if (list) await db.put('packLists', { ...list, isMajor });
}

export async function deletePackList(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('packLists', id);
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
      visit(refId);
    }
  }

  for (const id of rootIds) visit(id);
  return leaves;
}
