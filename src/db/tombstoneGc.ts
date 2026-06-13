import { getDb } from './db.js';

/** Tombstones older than this are hard-deleted from IndexedDB (default 90 days). */
export const DEFAULT_TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export type TombstoneGcResult = { packLists: number; packings: number };

/**
 * Permanently remove soft-deleted records whose `deletedAt` is older than `maxAgeMs`.
 * Called after a successful `full_state` merge so both peers have converged first.
 */
export async function gcTombstones(maxAgeMs = DEFAULT_TOMBSTONE_MAX_AGE_MS): Promise<TombstoneGcResult> {
  const db = await getDb();
  const cutoff = Date.now() - maxAgeMs;
  let packLists = 0;
  let packings = 0;

  for (const list of await db.getAll('packLists')) {
    if (list.deletedAt && Date.parse(list.deletedAt) < cutoff) {
      await db.delete('packLists', list.id);
      packLists++;
    }
  }

  for (const packing of await db.getAll('packings')) {
    if (packing.deletedAt && Date.parse(packing.deletedAt) < cutoff) {
      await db.delete('packings', packing.id);
      packings++;
    }
  }

  return { packLists, packings };
}
