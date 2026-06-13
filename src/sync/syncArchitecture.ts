/**
 * # X2pack local P2P sync — architecture reference
 *
 * Documentation-only module. Read this before changing anything under `src/sync/`
 * or the sync-related helpers in `src/db/`. Implementation lives in the other
 * files listed in the **Module map** section at the bottom.
 *
 * ---
 *
 * ## Purpose
 *
 * Two phones on the same WiFi or hotspot can share pack lists and packing sessions
 * in real time. There is no backend: once paired, phones talk directly over a
 * WebRTC `RTCDataChannel`. Pairing uses QR codes to exchange SDP (session
 * descriptions); no internet is required for local sync.
 *
 * Remote sync (different networks) is **not implemented** — it would need a
 * signaling server plus STUN/TURN for NAT traversal.
 *
 * ### Sequence numbers (protocol v2+)
 *
 * Each DataChannel open gets a new `sessionId`. Outbound messages increment `seq`.
 * If the receiver detects a gap (`seq` ≠ last + 1), it pushes `full_state` to
 * recover. `full_state` is also always sent on connect. Send failures and a full
 * outbound buffer trigger the same resync.
 *
 * ---
 *
 * ## Pairing (local QR flow)
 *
 * 1. **Offerer** creates an `RTCPeerConnection` (no STUN — host candidates only),
 *    opens a DataChannel named `sync`, generates an offer, waits for ICE gathering,
 *    strips non-LAN candidates, compresses SDP, and shows it as a QR code.
 * 2. **Answerer** scans the offer QR, creates a peer connection, generates an
 *    answer, and shows the answer as a second QR code.
 * 3. **Offerer** scans the answer QR and completes the handshake.
 * 4. When the DataChannel opens on both sides, each peer sends a `full_state`
 *    message (see below) and registers a sync listener for subsequent local writes.
 *
 * UI phases are tracked in `PairingPhase` (`protocol.ts`) and rendered by
 * `PairScreen`. Connection health is monitored via DataChannel events and
 * `RTCPeerConnection.connectionState` / `iceConnectionState`.
 *
 * ---
 *
 * ## Wire protocol (`SyncMessage`)
 *
 * All messages are JSON sent over the DataChannel inside a sequenced envelope
 * (`sessionId`, `seq`, `payload`). See `syncSeq.ts`. Types are defined in
 * `protocol.ts`.
 *
 * | Message | When sent |
 * |---------|-----------|
 * | `sync_meta` | On connect — `sentAt`, `appVersion`, `protocolVersion` for clock skew and compatibility |
 * | `full_state` | On connect — complete snapshot including tombstones (+ metadata) |
 * | `save_pack_list` | After `savePackList` |
 * | `update_pack_list_sort_orders` | After reordering lists (includes `updatedAt` per row) |
 * | `update_pack_list_major` | After toggling major flag |
 * | `delete_pack_list` | After soft-delete (includes `deletedAt`, `updatedAt`) |
 * | `create_packing` | After `createPacking` |
 * | `update_packing_meta` | After renaming or changing dates |
 * | `update_packing_item` | After toggling item status — keyed by `(listId, text)`, not index |
 * | `add_packing_item` | After adding an ad-hoc item |
 * | `delete_packing` | After soft-delete |
 *
 * ---
 *
 * ## Write path: local → peer
 *
 * ```
 * Screen → db/*.ts write function → IndexedDB put → emitSync(message)
 *                                              ↓
 *                              WebRTCManager listener → DataChannel.send
 * ```
 *
 * - Every user-facing write in `packLists.ts` / `packings.ts` calls `emitSync`
 *   after persisting locally.
 * - `WebRTCManager` registers `setSyncListener` when the DataChannel opens and
 *   clears it on disconnect/error.
 *
 * ---
 *
 * ## Apply path: peer → local
 *
 * ```
 * DataChannel.onmessage → WebRTCManager.onMessage → *Direct helpers → IndexedDB
 *                                                   → tickDbVersion(changes)
 * ```
 *
 * - **`full_state`**: merges every list via `putPackListDirect`, every packing
 *   via `mergeAndPutPacking`.
 * - **Incremental messages**: routed to `*Direct` helpers in `packLists.ts` /
 *   `packings.ts`. These **never** call `emitSync` (avoids re-broadcast loops).
 * - After any remote apply, `tickDbVersion(changes)` notifies subscribed screens
 *   with typed {@link DbChange} descriptors (packing/list IDs and aspect).
 *
 * Screens subscribe with `useSyncExternalStore(subscribeDbVersion, getDbVersion)`
 * and reload when changes are relevant to the mounted screen (`useDbReload`).
 *
 * ---
 *
 * ## Conflict resolution
 *
 * ### Last-write-wins (LWW) — metadata and deletes
 *
 * Every syncable record carries `updatedAt` (ISO 8601). When two versions of the
 * same entity disagree, the one with the **newer `updatedAt` wins** (`>=` on tie
 * favours the incoming copy in `putPackListDirect`).
 *
 * Remote timestamps are adjusted by the estimated **peer clock skew** before
 * comparing (see `clockSkew.ts`). Peers exchange `sentAt` in `sync_meta` and
 * `full_state`; the receiver estimates `peerSkewMs = peerTime − localTime`.
 *
 * Applies to: pack list fields, packing name/dates, soft deletes, sort order,
 * major flag.
 *
 * ### Soft deletes (`deletedAt`)
 *
 * Deletes do **not** remove rows from IndexedDB. Instead:
 *
 * - `deletePackList` / `deletePacking` set `deletedAt = updatedAt = now`.
 * - UI queries (`getAllPackLists`, `getPackList`, etc.) filter out rows with
 *   `deletedAt` set.
 * - Sync snapshots (`getAll*ForSync`) **include** tombstones so reconnecting
 *   peers learn about deletes they missed while offline.
 * - Saving/editing a tombstoned entity omits `deletedAt` and bumps `updatedAt` —
 *   a normal LWW **revive** if the edit is newer than the delete.
 *
 * ### Tombstone garbage collection
 *
 * After each `full_state` merge, `gcTombstones()` hard-deletes tombstones whose
 * `deletedAt` is older than 90 days (default). Both peers should have converged
 * via sync before GC runs, so recent deletes are still propagated.
 *
 * ### Packing items — union merge
 *
 * Metadata uses LWW, but the `items` array uses **union merge** (not pure LWW):
 *
 * 1. Start from the items of the side with the newer packing `updatedAt`.
 * 2. For each item on the other side (matched by `listId` + `text`):
 *    - Append if missing.
 *    - If both exist, prefer the non-`pending` status (`packed` / `discarded` /
 *      `not_used` beats `pending`).
 * 3. If the union changed anything, bump the merged packing's `updatedAt`.
 *
 * Incremental `update_packing_item` messages identify items by `(listId, text)`
 * so toggles stay correct after ad-hoc items shift array indices.
 *
 * Remote `add_packing_item` deduplicates on `(packingId, __additional__, text)`.
 *
 * ---
 *
 * ## Emitter suppress depth
 *
 * `emitSync` broadcasts local writes to the peer. When applying remote writes
 * that still go through functions which emit (legacy delete paths), use
 * `withSuppressEmit` or increment `suppressDepth` so applied changes are not
 * echoed back. Direct helpers avoid this entirely.
 *
 * ---
 *
 * ## Module map
 *
 * | File | Role |
 * |------|------|
 * | `syncArchitecture.ts` | This document |
 * | `protocol.ts` | `SyncMessage`, `PairingPhase`, SDP/QR helpers |
 * | `syncSeq.ts` | Sequenced wire envelopes and gap detection |
 * | `clockSkew.ts` | Peer skew estimation; LWW comparison helpers |
 * | `emitter.ts` | `emitSync`, `setSyncListener`, suppress depth |
 * | `syncHandlers.ts` | Incoming message routing to `*Direct` DB helpers |
 * | `WebRTCManager.ts` | Pairing, DataChannel, listener registration |
 * | `SyncContext.tsx` | React provider for a singleton manager |
 * | `dbVersion.ts` | Counter ticked after remote applies; drives UI reload |
 * | `db/packLists.ts` | List writes, `*Direct` helpers, `getAll*ForSync` |
 * | `db/packings.ts` | Packing writes, `mergeAndPutPacking`, `*Direct` helpers |
 * | `db/tombstoneGc.ts` | Hard-delete old soft-delete tombstones |
 * | `components/SyncButton.tsx` | Header sync entry point |
 * | `screens/PairScreen.tsx` | Pairing UI |
 *
 * @module syncArchitecture
 */

/** Marker export so this file is a valid module. Not imported at runtime. */
export const SYNC_ARCHITECTURE_DOC = true;
