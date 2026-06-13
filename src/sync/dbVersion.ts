/**
 * UI refresh signal after remote sync writes.
 *
 * `WebRTCManager` calls {@link tickDbVersion} with typed {@link DbChange}
 * descriptors after applying peer messages. Screens subscribe via
 * `useSyncExternalStore(subscribeDbVersion, getDbVersion)` and reload IndexedDB
 * data when relevant changes arrive.
 *
 * See {@link ./syncArchitecture.ts} for the full apply path.
 *
 * @module dbVersion
 */

/** Describes what changed in IndexedDB after a remote apply. */
export type DbChange =
  | { readonly kind: 'bulk' }
  | {
      readonly kind: 'pack_list';
      readonly listId: string;
      readonly aspect: 'content' | 'sort' | 'major' | 'deleted';
    }
  | {
      readonly kind: 'packing';
      readonly packingId: string;
      readonly aspect: 'item' | 'meta' | 'structure' | 'deleted';
    };

let version = 0;
const changesByVersion = new Map<number, readonly DbChange[]>();
const listeners = new Set<() => void>();

const MAX_CHANGE_LOG = 50;

export function getDbVersion(): number {
  return version;
}

/** Changes recorded for a specific version tick (for tests and debugging). */
export function getDbChangesAt(v: number): readonly DbChange[] {
  return changesByVersion.get(v) ?? [{ kind: 'bulk' }];
}

/** Union of all changes between two version ticks (exclusive lower bound). */
export function getDbChangesSince(fromVersion: number, toVersion: number): readonly DbChange[] {
  if (toVersion <= fromVersion) return [];
  const merged: DbChange[] = [];
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    merged.push(...getDbChangesAt(v));
  }
  return merged;
}

/** Increment version, record changes, and notify all subscribers. */
export function tickDbVersion(changes: readonly DbChange[] = [{ kind: 'bulk' }]): void {
  version++;
  changesByVersion.set(version, changes);
  while (changesByVersion.size > MAX_CHANGE_LOG) {
    const oldest = Math.min(...changesByVersion.keys());
    changesByVersion.delete(oldest);
  }
  for (const fn of listeners) fn();
}

export function subscribeDbVersion(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isAnyPackingChange(changes: readonly DbChange[]): boolean {
  return changes.some((c) => c.kind === 'bulk' || c.kind === 'packing');
}

export function isPackingChange(changes: readonly DbChange[], packingId: string): boolean {
  return changes.some(
    (c) => c.kind === 'bulk' || (c.kind === 'packing' && c.packingId === packingId),
  );
}

export function isAnyPackListChange(changes: readonly DbChange[]): boolean {
  return changes.some((c) => c.kind === 'bulk' || c.kind === 'pack_list');
}

export function isPackListChange(changes: readonly DbChange[], listId: string | null): boolean {
  return changes.some(
    (c) =>
      c.kind === 'bulk' ||
      (c.kind === 'pack_list' && (listId === null || c.listId === listId)),
  );
}

export function isItemOnlyPackingChange(
  changes: readonly DbChange[],
  packingId: string,
): boolean {
  return (
    changes.length > 0 &&
    changes.every(
      (c) => c.kind === 'packing' && c.packingId === packingId && c.aspect === 'item',
    )
  );
}
