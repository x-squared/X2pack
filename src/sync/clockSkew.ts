/**
 * Clock skew estimation for P2P sync LWW comparisons.
 *
 * Peers exchange `sentAt` (ISO 8601) in `sync_meta` and `full_state`. The receiver
 * estimates how far ahead/behind the peer's clock is and adjusts remote `updatedAt`
 * values before comparing with local timestamps.
 *
 * @see syncArchitecture.ts
 */

let peerSkewMs = 0;
let hasPeerSkew = false;

/** Peer clock minus local clock at receive time (ms). Positive = peer is ahead. */
export function estimatePeerSkewMs(peerSentAt: string, receivedAtMs = Date.now()): number {
  return Date.parse(peerSentAt) - receivedAtMs;
}

/** Update the active skew estimate from a new `sentAt` sample (running average). */
export function notePeerSentAt(peerSentAt: string, receivedAtMs = Date.now()): number {
  const sample = estimatePeerSkewMs(peerSentAt, receivedAtMs);
  peerSkewMs = hasPeerSkew ? Math.round((peerSkewMs + sample) / 2) : sample;
  hasPeerSkew = true;
  return peerSkewMs;
}

export function getPeerSkewMs(): number {
  return peerSkewMs;
}

export function resetPeerSkewMs(): void {
  peerSkewMs = 0;
  hasPeerSkew = false;
}

function effectiveRemoteMs(remoteUpdatedAt: string): number {
  return Date.parse(remoteUpdatedAt) - peerSkewMs;
}

/** True when remote wins LWW (>= after skew adjustment). */
export function remoteWins(remoteUpdatedAt: string, localUpdatedAt: string): boolean {
  return effectiveRemoteMs(remoteUpdatedAt) >= Date.parse(localUpdatedAt);
}

/** True when remote loses LWW (strictly older after skew adjustment). */
export function remoteLoses(remoteUpdatedAt: string, localUpdatedAt: string): boolean {
  return effectiveRemoteMs(remoteUpdatedAt) < Date.parse(localUpdatedAt);
}
