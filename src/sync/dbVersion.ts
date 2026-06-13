/**
 * UI refresh signal after remote sync writes.
 *
 * `WebRTCManager` calls {@link tickDbVersion} after applying any peer message.
 * Screens subscribe via `useSyncExternalStore(subscribeDbVersion, getDbVersion)`
 * and reload IndexedDB data when the version changes.
 *
 * See {@link ./syncArchitecture.ts} for the full apply path.
 *
 * @module dbVersion
 */
let version = 0;
const listeners = new Set<() => void>();

export function getDbVersion(): number {
  return version;
}

/** Increment version and notify all subscribers (called after remote DB applies). */
export function tickDbVersion(): void {
  version++;
  for (const fn of listeners) fn();
}

export function subscribeDbVersion(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
