/**
 * React context exposing the singleton {@link WebRTCManager}.
 *
 * Wrap the app in `<SyncProvider>` so screens can call `useSyncManager()` for
 * sync phase state and pairing. See {@link ./syncArchitecture.ts}.
 *
 * @module SyncContext
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { WebRTCManager } from './WebRTCManager.js';

const SyncContext = createContext<WebRTCManager | null>(null);

export function SyncProvider({ children }: { children: ReactNode }): React.ReactElement {
  const manager = useMemo(() => new WebRTCManager(), []);
  return <SyncContext.Provider value={manager}>{children}</SyncContext.Provider>;
}

export function useSyncManager(): WebRTCManager {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncManager must be used inside SyncProvider');
  return ctx;
}
