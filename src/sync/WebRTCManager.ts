import {
  encodeForQR,
  decodeFromQR,
  filterHostCandidates,
  SYNC_PROTOCOL_VERSION,
  assessProtocolCompatibility,
  protocolMismatchMessage,
  type PairingPhase,
  type SyncMessage,
} from './protocol.js';
import { setSyncListener } from './emitter.js';
import { tickDbVersion } from './dbVersion.js';
import { dbChangesForMessage } from './syncHandlers.js';
import { notePeerSentAt, resetPeerSkewMs, getPeerSkewMs } from './clockSkew.js';
import { applyFullState, applyIncrementalSyncMessage } from './syncHandlers.js';
import {
  checkIncomingSeq,
  isSyncEnvelope,
  wrapSyncEnvelope,
} from './syncSeq.js';
import { getAllPackListsForSync } from '../db/packLists.js';
import { getAllPackingsForSync } from '../db/packings.js';

/** Pause outbound sends when the DataChannel buffer exceeds this (bytes). */
const MAX_BUFFERED_BYTES = 256 * 1024;

/**
 * WebRTC pairing and DataChannel sync for local (same-network) use.
 *
 * Owns the `RTCPeerConnection`, routes incoming {@link SyncMessage}s to
 * {@link applyFullState} / {@link applyIncrementalSyncMessage}, and registers
 * {@link setSyncListener} on connect. Not a React component — provided via
 * {@link SyncContext}.
 *
 * **Architecture overview:** see {@link ./syncArchitecture.ts}.
 */
export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private phase: PairingPhase = 'idle';
  private error: string | null = null;
  private peerAppVersion: string | null = null;
  private peerProtocolVersion: number | undefined;
  private protocolMismatch: string | null = null;
  private syncBlocked = false;
  private readonly listeners = new Set<() => void>();
  private userDisconnecting = false;

  /** Per-channel session — resets on every DataChannel open. */
  private sessionId = '';
  private outSeq = 0;
  private peerSessionId: string | null = null;
  private lastPeerSeq = 0;
  private resyncInFlight = false;

  getPhase(): PairingPhase {
    return this.phase;
  }

  getError(): string | null {
    return this.error;
  }

  /** Non-fatal protocol mismatch warning, or fatal message before disconnect. */
  getProtocolMismatch(): string | null {
    return this.protocolMismatch;
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
    this.resetSessionState();
    this.peerAppVersion = null;
    this.protocolMismatch = null;
    this.syncBlocked = false;
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
    this.resetSessionState();
    this.peerAppVersion = null;
    this.syncBlocked = false;
    this.channel?.close();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
    this.userDisconnecting = false;
    this.error = message;
    this.setPhase('error');
  }

  /** Send a sync payload to the peer (wrapped in a sequenced envelope). */
  send(msg: SyncMessage): void {
    this.sendPayload(msg);
  }

  // --- Private helpers ---

  private resetSessionState(): void {
    this.sessionId = '';
    this.outSeq = 0;
    this.peerSessionId = null;
    this.lastPeerSeq = 0;
    this.peerProtocolVersion = undefined;
    this.resyncInFlight = false;
  }

  private beginSession(): void {
    this.sessionId = crypto.randomUUID();
    this.outSeq = 0;
    this.peerSessionId = null;
    this.lastPeerSeq = 0;
    this.resyncInFlight = false;
  }

  private sendPayload(payload: SyncMessage): boolean {
    const channel = this.channel;
    if (!channel || channel.readyState !== 'open') {
      console.warn('[sync] send skipped — DataChannel not open');
      return false;
    }

    if (channel.bufferedAmount > MAX_BUFFERED_BYTES) {
      console.warn('[sync] send buffer full — scheduling resync');
      void this.scheduleResync('send buffer full');
      return false;
    }

    this.outSeq++;
    const envelope = wrapSyncEnvelope(this.sessionId, this.outSeq, payload);

    try {
      channel.send(JSON.stringify(envelope));
      return true;
    } catch (err: unknown) {
      console.warn('[sync] send failed — scheduling resync', err);
      void this.scheduleResync('send failed');
      return false;
    }
  }

  /** Debounced full_state push after detected loss or send failure. */
  private async scheduleResync(reason: string): Promise<void> {
    if (this.resyncInFlight || this.syncBlocked) return;
    this.resyncInFlight = true;
    console.warn('[sync] resync:', reason);
    try {
      await this.sendFullState();
    } finally {
      this.resyncInFlight = false;
    }
  }

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
      this.beginSession();
      this.setPhase('connected');
      void this.sendFullState();
      setSyncListener((msg) => this.send(msg));
    };

    channel.onclose = () => {
      setSyncListener(null);
      resetPeerSkewMs();
      this.resetSessionState();
      this.peerAppVersion = null;
      this.protocolMismatch = null;
      this.syncBlocked = false;
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
        void this.onWireMessage(String(evt.data));
      } catch {
        // ignore malformed messages
      }
    };
  }

  private reconcilePeerProtocol(protocolVersion?: number): void {
    const compat = assessProtocolCompatibility(protocolVersion);
    if (compat === 'ok') {
      this.protocolMismatch = null;
      return;
    }

    const message = protocolMismatchMessage(protocolVersion);
    this.protocolMismatch = message;
    this.notify();

    if (compat === 'incompatible') {
      this.syncBlocked = true;
      this.setPairingError(message);
      this.protocolMismatch = message;
    }
  }

  private notePeerMetadata(sentAt: string, appVersion?: string, protocolVersion?: number): void {
    notePeerSentAt(sentAt);
    if (appVersion) this.peerAppVersion = appVersion;
    if (protocolVersion !== undefined) this.peerProtocolVersion = protocolVersion;
    this.reconcilePeerProtocol(protocolVersion);
  }

  private async sendFullState(): Promise<void> {
    const [packLists, packings] = await Promise.all([
      getAllPackListsForSync(),
      getAllPackingsForSync(),
    ]);
    const sentAt = new Date().toISOString();
    this.sendPayload({
      type: 'sync_meta',
      sentAt,
      appVersion: __APP_VERSION__,
      protocolVersion: SYNC_PROTOCOL_VERSION,
    });
    this.sendPayload({
      type: 'full_state',
      sentAt,
      appVersion: __APP_VERSION__,
      protocolVersion: SYNC_PROTOCOL_VERSION,
      packLists,
      packings,
    });
  }

  private async onWireMessage(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (!isSyncEnvelope(parsed)) {
      console.warn('[sync] ignoring message without seq envelope');
      return;
    }

    const { sessionId, seq, payload } = parsed;
    const check = checkIncomingSeq(this.peerSessionId, this.lastPeerSeq, sessionId, seq);

    if (check.result.action === 'duplicate') return;

    if (check.result.action === 'gap') {
      if (payload.type === 'full_state') {
        this.peerSessionId = sessionId;
        this.lastPeerSeq = seq;
        await this.onMessage(payload);
        return;
      }
      console.warn(
        '[sync] seq gap — expected',
        check.result.expected,
        'got',
        check.result.received,
      );
      void this.scheduleResync('seq gap');
      return;
    }

    this.peerSessionId = check.peerSessionId;
    this.lastPeerSeq = check.result.newLastSeq;
    await this.onMessage(payload);
  }

  private async onMessage(msg: SyncMessage): Promise<void> {
    if (this.syncBlocked) return;

    if (msg.type === 'sync_meta') {
      this.notePeerMetadata(msg.sentAt, msg.appVersion, msg.protocolVersion);
      return;
    }

    if (msg.type === 'full_state') {
      if (msg.sentAt) notePeerSentAt(msg.sentAt);
      if (msg.appVersion) this.peerAppVersion = msg.appVersion;
      if (msg.protocolVersion !== undefined) this.peerProtocolVersion = msg.protocolVersion;
      this.reconcilePeerProtocol(msg.protocolVersion);
      if (this.syncBlocked) return;
      await applyFullState(msg);
      tickDbVersion([{ kind: 'bulk' }]);
      return;
    }

    await applyIncrementalSyncMessage(msg);
    const changes = dbChangesForMessage(msg);
    if (changes.length > 0) tickDbVersion(changes);
  }
}
