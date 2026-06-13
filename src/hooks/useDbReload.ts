import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  subscribeDbVersion,
  getDbVersion,
  getDbChangesSince,
  type DbChange,
} from '../sync/dbVersion.js';

export type DbLoadResult = {
  readonly loadError: boolean;
  readonly loading: boolean;
  readonly retry: () => void;
};

export type UseDbReloadOptions = {
  /** When set, remote sync ticks that do not match skip the reload. Mount, retry, and extraDeps always reload. */
  readonly isRelevant?: (changes: readonly DbChange[]) => boolean;
};

/**
 * Reload screen data when IndexedDB changes locally or after remote sync applies.
 *
 * Subscribes to {@link tickDbVersion} via `useSyncExternalStore` and re-runs
 * `reload` when the DB version changes (and changes are relevant), or when
 * any `extraDeps` value changes. Surfaces load failures so screens can show a
 * retry affordance.
 */
export function useDbReload(
  reload: (changes?: readonly DbChange[]) => void | Promise<void>,
  extraDeps: readonly unknown[] = [],
  options: UseDbReloadOptions = {},
): DbLoadResult {
  const { isRelevant } = options;
  const dbVersion = useSyncExternalStore(subscribeDbVersion, getDbVersion);
  const lastSeenVersion = useRef(dbVersion);
  const [retryKey, setRetryKey] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  useEffect(() => {
    const fromVersion = lastSeenVersion.current;
    const versionChanged = fromVersion !== dbVersion;
    lastSeenVersion.current = dbVersion;

    let syncChanges: readonly DbChange[] | undefined;
    if (versionChanged) {
      syncChanges = getDbChangesSince(fromVersion, dbVersion);
      if (isRelevant && syncChanges.length > 0 && !isRelevant(syncChanges)) {
        return;
      }
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    Promise.resolve()
      .then(() => reload(syncChanges))
      .then(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadError(false);
        }
      })
      .catch((err: unknown) => {
        console.warn('[useDbReload] load failed', err);
        if (!cancelled) {
          setLoading(false);
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is intentionally caller-defined; extraDeps cover screen inputs
  }, [dbVersion, retryKey, ...extraDeps]);

  return { loadError, loading, retry };
}
