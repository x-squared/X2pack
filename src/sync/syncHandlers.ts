/**
 * Incoming sync message handlers — DB apply logic extracted from WebRTCManager.
 *
 * See {@link ./syncArchitecture.ts} for the full apply path.
 *
 * @module syncHandlers
 */
import { gcTombstones } from '../db/tombstoneGc.js';
import {
  putPackListDirect,
  putPackListSortOrderDirect,
  putPackListMajorDirect,
  deletePackListDirect,
} from '../db/packLists.js';
import {
  mergeAndPutPacking,
  deletePackingDirect,
  updatePackingItemDirect,
  updatePackingMetaDirect,
  addPackingItemDirect,
} from '../db/packings.js';
import type { SyncMessage } from './protocol.js';
import type { DbChange } from './dbVersion.js';

/** Map an incoming sync message to the DB changes it produces (before apply). */
export function dbChangesForMessage(msg: SyncMessage): readonly DbChange[] {
  switch (msg.type) {
    case 'full_state':
      return [{ kind: 'bulk' }];
    case 'save_pack_list':
      return [{ kind: 'pack_list', listId: msg.data.id, aspect: 'content' }];
    case 'update_pack_list_sort_orders':
      return msg.updates.map(({ id }) => ({
        kind: 'pack_list',
        listId: id,
        aspect: 'sort',
      }));
    case 'update_pack_list_major':
      return [{ kind: 'pack_list', listId: msg.id, aspect: 'major' }];
    case 'delete_pack_list':
      return [{ kind: 'pack_list', listId: msg.id, aspect: 'deleted' }];
    case 'create_packing':
      return [{ kind: 'packing', packingId: msg.data.id, aspect: 'structure' }];
    case 'update_packing_meta':
      return [{ kind: 'packing', packingId: msg.id, aspect: 'meta' }];
    case 'update_packing_item':
      return [{ kind: 'packing', packingId: msg.packingId, aspect: 'item' }];
    case 'add_packing_item':
      return [{ kind: 'packing', packingId: msg.packingId, aspect: 'structure' }];
    case 'delete_packing':
      return [{ kind: 'packing', packingId: msg.id, aspect: 'deleted' }];
    case 'sync_meta':
      return [];
  }
}

/** Merge a peer's full snapshot (lists, packings, tombstone GC). */
export async function applyFullState(
  msg: Extract<SyncMessage, { type: 'full_state' }>,
): Promise<void> {
  for (const list of msg.packLists) {
    await putPackListDirect(list);
  }
  for (const packing of msg.packings) {
    await mergeAndPutPacking(packing);
  }
  await gcTombstones();
}

/** Apply a single incremental sync message from the peer. No-op for meta/full_state types. */
export async function applyIncrementalSyncMessage(msg: SyncMessage): Promise<void> {
  switch (msg.type) {
    case 'save_pack_list':
      await putPackListDirect(msg.data);
      break;
    case 'update_pack_list_sort_orders':
      for (const { id, sortOrder, updatedAt } of msg.updates) {
        await putPackListSortOrderDirect(id, sortOrder, updatedAt);
      }
      break;
    case 'update_pack_list_major':
      await putPackListMajorDirect(msg.id, msg.isMajor, msg.updatedAt);
      break;
    case 'create_packing':
      await mergeAndPutPacking(msg.data);
      break;
    case 'update_packing_meta':
      await updatePackingMetaDirect(msg.id, msg.name, msg.fromDate, msg.toDate, msg.updatedAt);
      break;
    case 'update_packing_item':
      await updatePackingItemDirect(msg.packingId, msg.listId, msg.text, msg.status, msg.updatedAt);
      break;
    case 'add_packing_item':
      await addPackingItemDirect(msg.packingId, msg.text);
      break;
    case 'delete_pack_list':
      await deletePackListDirect(msg.id, msg.deletedAt, msg.updatedAt);
      break;
    case 'delete_packing':
      await deletePackingDirect(msg.id, msg.deletedAt, msg.updatedAt);
      break;
    case 'sync_meta':
    case 'full_state':
      break;
  }
}
