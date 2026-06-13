/**
 * Session-scoped sequence numbers for ordered DataChannel delivery.
 *
 * Each channel open gets a new `sessionId`; every wire message carries `seq`.
 * Gaps trigger a {@link full_state} resync in {@link WebRTCManager}.
 *
 * @module syncSeq
 */
import type { SyncMessage } from './protocol.js';

/** Wire wrapper around {@link SyncMessage} — all v2+ traffic uses this shape. */
export type SyncEnvelope = {
  sessionId: string;
  seq: number;
  payload: SyncMessage;
};

export type SeqCheckResult =
  | { action: 'accept'; newLastSeq: number }
  | { action: 'duplicate' }
  | { action: 'gap'; expected: number; received: number };

export function wrapSyncEnvelope(sessionId: string, seq: number, payload: SyncMessage): SyncEnvelope {
  return { sessionId, seq, payload };
}

export function isSyncEnvelope(value: unknown): value is SyncEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  const payload = o.payload;
  return (
    typeof o.sessionId === 'string'
    && typeof o.seq === 'number'
    && Number.isInteger(o.seq)
    && o.seq >= 1
    && payload !== null
    && typeof payload === 'object'
    && typeof (payload as { type?: unknown }).type === 'string'
  );
}

/**
 * Validate incoming sequence for a peer session.
 * Resets tracking when `sessionId` changes (new DataChannel session).
 */
export function checkIncomingSeq(
  peerSessionId: string | null,
  lastSeq: number,
  sessionId: string,
  seq: number,
): { peerSessionId: string; lastSeq: number; result: SeqCheckResult } {
  if (peerSessionId !== sessionId) {
    if (seq !== 1) {
      return {
        peerSessionId: sessionId,
        lastSeq: 0,
        result: { action: 'gap', expected: 1, received: seq },
      };
    }
    return {
      peerSessionId: sessionId,
      lastSeq: 1,
      result: { action: 'accept', newLastSeq: 1 },
    };
  }

  if (seq <= lastSeq) {
    return { peerSessionId, lastSeq, result: { action: 'duplicate' } };
  }

  if (seq !== lastSeq + 1) {
    return {
      peerSessionId,
      lastSeq,
      result: { action: 'gap', expected: lastSeq + 1, received: seq },
    };
  }

  return {
    peerSessionId,
    lastSeq: seq,
    result: { action: 'accept', newLastSeq: seq },
  };
}
