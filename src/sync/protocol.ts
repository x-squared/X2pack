/**
 * Sync wire protocol and QR/SDP pairing utilities.
 *
 * **Architecture overview:** see {@link ./syncArchitecture.ts}.
 *
 * @module protocol
 */
import type { PackList, Packing, PackingItemStatus } from '../types/index.js';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

/** Bump when the wire protocol changes incompatibly. See syncArchitecture.ts. */
export const SYNC_PROTOCOL_VERSION = 2;

export type ProtocolCompatibility = 'ok' | 'warn' | 'incompatible';

/**
 * Assess whether a peer's {@link SYNC_PROTOCOL_VERSION} can sync with this app.
 * Missing version (older peers) yields `warn` — sync proceeds with a user-visible caution.
 */
export function assessProtocolCompatibility(peerVersion: number | undefined): ProtocolCompatibility {
  if (peerVersion === undefined) return 'warn';
  if (peerVersion === SYNC_PROTOCOL_VERSION) return 'ok';
  if (peerVersion < SYNC_PROTOCOL_VERSION) return 'warn';
  return 'incompatible';
}

/** User-facing message when {@link assessProtocolCompatibility} is not `ok`. */
export function protocolMismatchMessage(peerVersion: number | undefined): string {
  const compat = assessProtocolCompatibility(peerVersion);
  if (compat === 'ok') return '';
  if (compat === 'incompatible') {
    return `Cannot sync: the other device uses sync protocol v${peerVersion}, but this app uses v${SYNC_PROTOCOL_VERSION}. Update both devices to the latest version.`;
  }
  if (peerVersion === undefined) {
    return 'The other device is running an older version of X2pack. Sync may not work correctly — update both devices if you see missing data.';
  }
  return `The other device uses sync protocol v${peerVersion} (this app uses v${SYNC_PROTOCOL_VERSION}). Sync may not work correctly.`;
}

/** JSON messages sent over the WebRTC DataChannel. See syncArchitecture.ts for semantics. */
export type SyncMessage =
  | { type: 'sync_meta'; sentAt: string; appVersion: string; protocolVersion: number }
  | { type: 'full_state'; sentAt?: string; appVersion?: string; protocolVersion?: number; packLists: PackList[]; packings: Packing[] }
  | { type: 'save_pack_list'; data: PackList }
  | { type: 'update_pack_list_sort_orders'; updates: { id: string; sortOrder: number; updatedAt: string }[] }
  | { type: 'update_pack_list_major'; id: string; isMajor: boolean; updatedAt: string }
  | { type: 'delete_pack_list'; id: string; deletedAt: string; updatedAt: string }
  | { type: 'create_packing'; data: Packing }
  | { type: 'update_packing_meta'; id: string; name: string; fromDate: string; toDate: string; updatedAt: string }
  | { type: 'update_packing_item'; packingId: string; listId: string; text: string; status: PackingItemStatus; updatedAt: string }
  | { type: 'add_packing_item'; packingId: string; text: string }
  | { type: 'delete_packing'; id: string; deletedAt: string; updatedAt: string };

/** UI + manager state for the local QR pairing flow. */
export type PairingPhase =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'   // peer dropped — user did not initiate
  | 'error'
  | 'creating-offer'
  | 'showing-offer-qr'
  | 'scanning-answer'
  | 'scanning-offer'
  | 'creating-answer'
  | 'showing-answer-qr';

/** Compress SDP for QR encoding (lz-string, URI-safe). */
export function encodeForQR(sdp: string): string {
  return compressToEncodedURIComponent(sdp);
}

/** Decompress SDP scanned from a QR code. Returns empty string if invalid. */
export function decodeFromQR(encoded: string): string {
  return decompressFromEncodedURIComponent(encoded) ?? '';
}

/**
 * Strip ICE candidates unsuitable for same-LAN pairing.
 * Keeps IPv4 host candidates and `.local` mDNS names; removes srflx, relay, IPv6.
 */
export function filterHostCandidates(sdp: string): string {
  return sdp
    .split('\n')
    .filter((line) => {
      if (!line.startsWith('a=candidate:')) return true;
      if (line.includes(' typ srflx') || line.includes(' typ relay')) return false;
      const parts = line.split(' ');
      const addr = parts[4];
      if (!addr) return false;
      return /^\d+\.\d+\.\d+\.\d+$/.test(addr) || addr.endsWith('.local');
    })
    .join('\n');
}
