/**
 * Local-write → peer broadcast bridge.
 *
 * DB write functions call {@link emitSync} after persisting. When connected,
 * `WebRTCManager` registers a listener that forwards messages over the
 * DataChannel. See {@link ./syncArchitecture.ts} for the full write/apply flow.
 *
 * @module emitter
 */
import type { SyncMessage } from './protocol.js';

type SyncListener = (event: SyncMessage) => void;
let listener: SyncListener | null = null;
let suppressDepth = 0;

/** Register the callback that sends outgoing sync messages (set by WebRTCManager on connect). */
export function setSyncListener(fn: SyncListener | null): void {
  listener = fn;
}

/** Increment suppress depth — all {@link emitSync} calls are skipped until depth returns to 0. */
export function suppressNextEmit(): void {
  suppressDepth++;
}

export function releaseSuppressEmit(): void {
  if (suppressDepth > 0) suppressDepth--;
}

/** Run `fn` without broadcasting any {@link emitSync} calls made inside it. */
export async function withSuppressEmit<T>(fn: () => Promise<T>): Promise<T> {
  suppressDepth++;
  try {
    return await fn();
  } finally {
    releaseSuppressEmit();
  }
}

/** Broadcast a sync message to the peer when connected and not suppressed. */
export function emitSync(event: SyncMessage): void {
  if (suppressDepth > 0) return;
  listener?.(event);
}

/** @internal test helper */
export function resetSuppressDepth(): void {
  suppressDepth = 0;
}

/** @internal test helper */
export function getSuppressDepth(): number {
  return suppressDepth;
}
