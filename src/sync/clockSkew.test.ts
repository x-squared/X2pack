import { describe, it, expect, beforeEach } from 'vitest';
import {
  estimatePeerSkewMs,
  notePeerSentAt,
  resetPeerSkewMs,
  remoteWins,
  remoteLoses,
  getPeerSkewMs,
} from './clockSkew.js';

describe('clockSkew', () => {
  beforeEach(() => resetPeerSkewMs());

  it('estimates positive skew when peer clock is ahead', () => {
    const receivedAt = Date.parse('2026-06-01T12:00:00.000Z');
    expect(estimatePeerSkewMs('2026-06-01T12:00:05.000Z', receivedAt)).toBe(5000);
  });

  it('averages successive sentAt samples', () => {
    notePeerSentAt('2026-06-01T12:00:10.000Z', Date.parse('2026-06-01T12:00:00.000Z'));
    notePeerSentAt('2026-06-01T12:00:20.000Z', Date.parse('2026-06-01T12:00:00.000Z'));
    expect(getPeerSkewMs()).toBe(15000);
  });

  it('remoteWins adjusts remote timestamp by peer skew', () => {
    notePeerSentAt('2026-06-01T12:00:10.000Z', Date.parse('2026-06-01T12:00:00.000Z'));
    // Peer is 10s ahead — remote wall time must exceed local + skew to win.
    expect(remoteWins('2026-06-01T12:00:14.000Z', '2026-06-01T12:00:04.000Z')).toBe(true);
    expect(remoteLoses('2026-06-01T12:00:13.000Z', '2026-06-01T12:00:04.000Z')).toBe(true);
  });

  it('remoteWins without skew uses raw timestamps', () => {
    expect(remoteWins('2026-06-01T12:00:02.000Z', '2026-06-01T12:00:01.000Z')).toBe(true);
    expect(remoteWins('2026-06-01T12:00:01.000Z', '2026-06-01T12:00:01.000Z')).toBe(true);
  });
});
