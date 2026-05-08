import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { resolveLeafLists, getAllPackLists } from './packLists.js';
import type { Packing, PackingItem } from '../types/index.js';

export async function getAllPackings(): Promise<Packing[]> {
  const db = await getDb();
  return db.getAll('packings');
}

export async function getPacking(id: string): Promise<Packing | undefined> {
  const db = await getDb();
  return db.get('packings', id);
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
  if (!packing) throw new Error(`Packing ${id} not found`);
  const updated: Packing = {
    ...packing,
    name,
    fromDate,
    toDate,
    updatedAt: new Date().toISOString(),
  };
  await db.put('packings', updated);
  return updated;
}

export async function updatePackingItem(
  packingId: string,
  itemIndex: number,
  status: PackingItem['status'],
): Promise<Packing> {
  const db = await getDb();
  const packing = await db.get('packings', packingId);
  if (!packing) throw new Error(`Packing ${packingId} not found`);

  const updatedItems = packing.items.map((item, i) =>
    i === itemIndex ? { ...item, status } : item,
  );

  const allDone = updatedItems.every((item) => item.status !== 'pending');
  const updated: Packing = {
    ...packing,
    items: updatedItems,
    status: allDone ? 'done' : 'active',
    updatedAt: new Date().toISOString(),
  };
  await db.put('packings', updated);
  return updated;
}

export async function addPackingItem(packingId: string, text: string): Promise<Packing> {
  const db = await getDb();
  const packing = await db.get('packings', packingId);
  if (!packing) throw new Error(`Packing ${packingId} not found`);
  const newItem: PackingItem = { listId: '__additional__', text, status: 'pending' };
  const updated: Packing = {
    ...packing,
    items: [...packing.items, newItem],
    status: 'active',
    updatedAt: new Date().toISOString(),
  };
  await db.put('packings', updated);
  return updated;
}

export async function deletePacking(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('packings', id);
}
