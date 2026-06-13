import { describe, it, expect } from 'vitest';
import { checkIncomingSeq, isSyncEnvelope, wrapSyncEnvelope } from './syncSeq.js';

describe('checkIncomingSeq', () => {
  it('accepts seq 1 on a new session', () => {
    const r = checkIncomingSeq(null, 0, 'sess-a', 1);
    expect(r.result).toEqual({ action: 'accept', newLastSeq: 1 });
    expect(r.lastSeq).toBe(1);
  });

  it('flags gap when a new session starts above seq 1', () => {
    const r = checkIncomingSeq(null, 0, 'sess-a', 3);
    expect(r.result).toEqual({ action: 'gap', expected: 1, received: 3 });
  });

  it('accepts consecutive seq in the same session', () => {
    const r = checkIncomingSeq('sess-a', 1, 'sess-a', 2);
    expect(r.result).toEqual({ action: 'accept', newLastSeq: 2 });
  });

  it('treats replay as duplicate', () => {
    const r = checkIncomingSeq('sess-a', 2, 'sess-a', 2);
    expect(r.result).toEqual({ action: 'duplicate' });
  });

  it('detects a gap in the same session', () => {
    const r = checkIncomingSeq('sess-a', 2, 'sess-a', 5);
    expect(r.result).toEqual({ action: 'gap', expected: 3, received: 5 });
    expect(r.lastSeq).toBe(2);
  });

  it('resets when sessionId changes', () => {
    const r = checkIncomingSeq('sess-a', 5, 'sess-b', 1);
    expect(r.result).toEqual({ action: 'accept', newLastSeq: 1 });
    expect(r.peerSessionId).toBe('sess-b');
  });
});

describe('isSyncEnvelope', () => {
  it('recognises a valid envelope', () => {
    const env = wrapSyncEnvelope('s1', 1, {
      type: 'sync_meta',
      sentAt: '2026-01-01T00:00:00Z',
      appVersion: '1.0.0',
      protocolVersion: 2,
    });
    expect(isSyncEnvelope(env)).toBe(true);
  });

  it('rejects bare sync messages', () => {
    expect(isSyncEnvelope({ type: 'sync_meta', sentAt: 'x', appVersion: '1', protocolVersion: 2 })).toBe(false);
  });
});
