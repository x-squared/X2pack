import {
  encodeForQR,
  decodeFromQR,
  filterHostCandidates,
  type PairingPhase,
  type SyncMessage,
} from './protocol.js';
import { setSyncListener } from './emitter.js';
import { tickDbVersion } from './dbVersion.js';
import { notePeerSentAt, resetPeerSkewMs, getPeerSkewMs } from './clockSkew.js';
import { gcTombstones } from '../db/tombstoneGc.js';
import {
  getAllPackListsForSync,
  putPackListDirect,
  putPackListSortOrderDirect,
  putPackListMajorDirect,
  deletePackListDirect,
} from '../db/packLists.js';
import {
  getAllPackingsForSync,
  mergeAndPutPacking,
  deletePackingDirect,
  updatePackingItemDirect,
  updatePackingMetaDirect,
  addPackingItemDirect,
} from '../db/packings.js';

/**
 * WebRTC pairing and DataChannel sync for local (same-network) use.
 *
 * Owns the `RTCPeerConnection`, routes incoming {@link SyncMessage}s to `*Direct`
 * DB helpers, and registers {@link setSyncListener} on connect. Not a React
 * component — provided via {@link SyncContext}.
 *
 * **Architecture overview:** see {@link ./syncArchitecture.ts}.
 */
export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private phase: PairingPhase = 'idle';
  private error: string | null = null;
  private peerAppVersion: string | null = null;
  private readonly listeners = new Set<() => void>();
  private userDisconnecting = false;

  getPhase(): PairingPhase {
    return this.phase;
  }

  getError(): string | null {
    return this.error;
  }

  /** App version reported by the peer in the last `sync_meta` / `full_state`. */
  getPeerAppVersion(): string | null {
    return this.peerAppVersion;
  }

  /** Estimated peer clock skew (ms). Positive = peer clock is ahead of local. */
  getPeerClockSkewMs(): number {
    return getPeerSkewMs();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private setPhase(phase: PairingPhase): void {
    this.phase = phase;
    this.notify();
  }

  // --- Local (QR) flow ---

  async startAsOfferer(): Promise<string> {
    this.setPhase('creating-offer');
    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.setupPeerConnection(this.pc);
    this.channel = this.pc.createDataChannel('sync');
    this.setupChannel(this.channel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const sdp = await this.waitForIceGathering(this.pc);
    const filtered = filterHostCandidates(sdp);
    const encoded = encodeForQR(filtered);

    this.setPhase('showing-offer-qr');
    return encoded;
  }

  async startAsAnswerer(encodedOffer: string): Promise<string> {
    this.setPhase('creating-answer');
    const offerSdp = decodeFromQR(encodedOffer);
    if (!offerSdp) throw new Error('Invalid QR code — could not read connection data.');

    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.setupPeerConnection(this.pc);
    this.pc.ondatachannel = (evt) => {
      this.channel = evt.channel;
      this.setupChannel(this.channel);
    };

    await this.pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    const sdp = await this.waitForIceGathering(this.pc);
    const filtered = filterHostCandidates(sdp);
    const encoded = encodeForQR(filtered);

    this.setPhase('showing-answer-qr');
    return encoded;
  }

  async completeHandshake(encodedAnswer: string): Promise<void> {
    if (!this.pc) throw new Error('No peer connection');
    const answerSdp = decodeFromQR(encodedAnswer);
    if (!answerSdp) throw new Error('Invalid QR code — could not read connection data.');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    this.setPhase('connecting');
  }

  disconnect(): void {
    this.userDisconnecting = true;
    setSyncListener(null);
    resetPeerSkewMs();
    this.peerAppVersion = null;
    this.channel?.close();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
    this.userDisconnecting = false;
    this.setPhase('idle');
    this.error = null;
  }

  /** Tear down a failed pairing attempt and surface an error in the UI. */
  setPairingError(message: string): void {
    this.userDisconnecting = true;
    setSyncListener(null);
    resetPeerSkewMs();
    this.peerAppVersion = null;
    this.channel?.close();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
    this.userDisconnecting = false;
    this.error = message;
    this.setPhase('error');
  }

  send(msg: SyncMessage): void {
    if (this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify(msg));
    }
  }

  // --- Private helpers ---

  private setupPeerConnection(pc: RTCPeerConnection): void {
    pc.onconnectionstatechange = () => {
      if (this.userDisconnecting) return;
      const state = pc.connectionState;
      if (state === 'failed') {
        setSyncListener(null);
        this.error = 'Connection failed.';
        this.setPhase('error');
      } else if (state === 'disconnected' && this.phase === 'connected') {
        setSyncListener(null);
        this.setPhase('disconnected');
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (this.userDisconnecting) return;
      if (pc.iceConnectionState === 'failed') {
        setSyncListener(null);
        this.error = 'Connection failed.';
        this.setPhase('error');
      }
    };
  }

  private waitForIceGathering(pc: RTCPeerConnection): Promise<string> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(pc.localDescription?.sdp ?? '');
      }, 5000);

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve(pc.localDescription?.sdp ?? '');
        }
      };

      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        resolve(pc.localDescription?.sdp ?? '');
      }
    });
  }

  private setupChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.setPhase('connected');
      void this.sendFullState();
      setSyncListener((msg) => this.send(msg));
    };

    channel.onclose = () => {
      setSyncListener(null);
      resetPeerSkewMs();
      this.peerAppVersion = null;
      if (!this.userDisconnecting && this.phase === 'connected') {
        this.setPhase('disconnected');
      }
    };

    channel.onerror = (evt) => {
      setSyncListener(null);
      this.error = evt.error?.message ?? 'Connection error';
      this.setPhase('error');
    };

    channel.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as SyncMessage;
        void this.onMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };
  }

  private notePeerMetadata(sentAt: string, appVersion?: string): void {
    notePeerSentAt(sentAt);
    if (appVersion) this.peerAppVersion = appVersion;
  }

  private async sendFullState(): Promise<void> {
    const [packLists, packings] = await Promise.all([
      getAllPackListsForSync(),
      getAllPackingsForSync(),
    ]);
    const sentAt = new Date().toISOString();
    this.send({ type: 'sync_meta', sentAt, appVersion: __APP_VERSION__ });
    this.send({ type: 'full_state', sentAt, appVersion: __APP_VERSION__, packLists, packings });
  }

  private async onMessage(msg: SyncMessage): Promise<void> {
    if (msg.type === 'sync_meta') {
      this.notePeerMetadata(msg.sentAt, msg.appVersion);
      return;
    }

    if (msg.type === 'full_state') {
      if (msg.sentAt) this.notePeerMetadata(msg.sentAt, msg.appVersion);
      for (const list of msg.packLists) {
        await putPackListDirect(list);
      }
      for (const packing of msg.packings) {
        await mergeAndPutPacking(packing);
      }
      await gcTombstones();
      tickDbVersion();
      return;
    }

    await this.applyRemote(msg);
    tickDbVersion();
  }

  private async applyRemote(msg: SyncMessage): Promise<void> {
    switch (msg.type) {
      case 'save_pack_list':
        await putPackListDirect(msg.data);
        break;
      case 'update_pack_list_sort_orders':
        for (const { id, sortOrder, updatedAt } of msg.updates) {
          await putPackListSortOrderDirect(id, sortOrder, updatedAt);
        }
        break;
      case 'update_pack_list_major':
        await putPackListMajorDirect(msg.id, msg.isMajor, msg.updatedAt);
        break;
      case 'create_packing':
        await mergeAndPutPacking(msg.data);
        break;
      case 'update_packing_meta':
        await updatePackingMetaDirect(msg.id, msg.name, msg.fromDate, msg.toDate, msg.updatedAt);
        break;
      case 'update_packing_item':
        await updatePackingItemDirect(msg.packingId, msg.listId, msg.text, msg.status, msg.updatedAt);
        break;
      case 'add_packing_item':
        await addPackingItemDirect(msg.packingId, msg.text);
        break;
      case 'delete_pack_list':
        await deletePackListDirect(msg.id, msg.deletedAt, msg.updatedAt);
        break;
      case 'delete_packing':
        await deletePackingDirect(msg.id, msg.deletedAt, msg.updatedAt);
        break;
    }
  }
}
