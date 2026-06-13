import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebRTCManager } from './WebRTCManager.js';
import { encodeForQR } from './protocol.js';
import { setSyncListener } from './emitter.js';
import { tickDbVersion } from './dbVersion.js';
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
import { gcTombstones } from '../db/tombstoneGc.js';
import { getPeerSkewMs, resetPeerSkewMs } from './clockSkew.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./emitter.js', () => ({
  setSyncListener: vi.fn(),
  emitSync: vi.fn(),
}));

vi.mock('./dbVersion.js', () => ({
  tickDbVersion: vi.fn(),
  getDbVersion: vi.fn().mockReturnValue(0),
  subscribeDbVersion: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('../db/packLists.js', () => ({
  getAllPackListsForSync: vi.fn().mockResolvedValue([]),
  putPackListDirect: vi.fn().mockResolvedValue(undefined),
  putPackListSortOrderDirect: vi.fn().mockResolvedValue(undefined),
  putPackListMajorDirect: vi.fn().mockResolvedValue(undefined),
  deletePackListDirect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/packings.js', () => ({
  getAllPackingsForSync: vi.fn().mockResolvedValue([]),
  mergeAndPutPacking: vi.fn().mockResolvedValue(undefined),
  deletePackingDirect: vi.fn().mockResolvedValue(undefined),
  updatePackingItemDirect: vi.fn().mockResolvedValue(undefined),
  updatePackingMetaDirect: vi.fn().mockResolvedValue(undefined),
  addPackingItemDirect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/tombstoneGc.js', () => ({
  gcTombstones: vi.fn().mockResolvedValue({ packLists: 0, packings: 0 }),
}));

const mockDbInstance = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/db.js', () => ({
  getDb: vi.fn().mockResolvedValue(mockDbInstance),
}));

// ─── RTCPeerConnection mock ───────────────────────────────────────────────────

// A realistic SDP with one IPv4 host candidate so filterHostCandidates keeps it.
const MOCK_SDP = [
  'v=0',
  'o=- 1 2 IN IP4 0.0.0.0',
  's=-',
  'a=candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
].join('\n');

type MockChannel = {
  readyState: RTCDataChannelState;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: ((ev: Event) => void) | null;
  onclose: ((ev: Event) => void) | null;
  onerror: ((ev: RTCErrorEvent) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
};

let mockChannel: MockChannel;

beforeEach(() => {
  vi.clearAllMocks();
  resetPeerSkewMs();
  mockDbInstance.get.mockResolvedValue(undefined);
  mockDbInstance.put.mockResolvedValue(undefined);

  mockChannel = {
    readyState: 'open',
    send: vi.fn(),
    close: vi.fn(),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };

  vi.stubGlobal('RTCPeerConnection', vi.fn(() => ({
    createDataChannel: vi.fn(() => mockChannel),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: MOCK_SDP }),
    createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: MOCK_SDP }),
    localDescription: { sdp: MOCK_SDP, type: 'offer' },
    iceGatheringState: 'complete' as RTCIceGatheringState,
    onicegatheringstatechange: null as unknown,
    ondatachannel: null as unknown,
    close: vi.fn(),
  })));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flush all pending microtasks / promise continuations. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Create a manager, start as offerer, simulate channel open, flush sendFullState. */
async function makeConnectedManager(): Promise<WebRTCManager> {
  const manager = new WebRTCManager();
  await manager.startAsOfferer();
  mockChannel.onopen?.({} as Event);
  await flush();
  return manager;
}

/** Send a message through the mock DataChannel to the manager. */
function triggerMessage(msg: object): void {
  mockChannel.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebRTCManager — initial state', () => {
  it('starts in idle phase', () => {
    expect(new WebRTCManager().getPhase()).toBe('idle');
  });

  it('returns null error before any connection attempt', () => {
    expect(new WebRTCManager().getError()).toBeNull();
  });
});

describe('WebRTCManager — subscribe / notify', () => {
  it('calls subscriber when phase changes', async () => {
    const fn = vi.fn();
    const manager = new WebRTCManager();
    const unsub = manager.subscribe(fn);
    await manager.startAsOfferer();
    expect(fn).toHaveBeenCalled();
    unsub();
  });

  it('returns a cleanup function that stops notifications', async () => {
    const fn = vi.fn();
    const manager = new WebRTCManager();
    const unsub = manager.subscribe(fn);
    unsub();
    fn.mockClear();
    await manager.startAsOfferer();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('WebRTCManager — startAsOfferer', () => {
  it('transitions idle → creating-offer → showing-offer-qr', async () => {
    const phases: string[] = [];
    const manager = new WebRTCManager();
    manager.subscribe(() => phases.push(manager.getPhase()));
    await manager.startAsOfferer();
    expect(phases).toEqual(['creating-offer', 'showing-offer-qr']);
  });

  it('returns a non-empty encoded QR string', async () => {
    const encoded = await new WebRTCManager().startAsOfferer();
    expect(encoded.length).toBeGreaterThan(0);
  });
});

describe('WebRTCManager — channel open → connected', () => {
  it('transitions to connected when channel opens', async () => {
    const manager = new WebRTCManager();
    await manager.startAsOfferer();
    mockChannel.onopen?.({} as Event);
    expect(manager.getPhase()).toBe('connected');
  });

  it('registers a sync listener on connect', async () => {
    const manager = new WebRTCManager();
    await manager.startAsOfferer();
    mockChannel.onopen?.({} as Event);
    expect(setSyncListener).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe('WebRTCManager — send', () => {
  it('sends serialised JSON when channel is open', async () => {
    const manager = await makeConnectedManager();
    const msg = { type: 'delete_pack_list', id: 'x', deletedAt: 't', updatedAt: 't' } as const;
    manager.send(msg);
    expect(mockChannel.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('is a no-op when channel is closed', async () => {
    const manager = await makeConnectedManager();
    mockChannel.readyState = 'closed';
    mockChannel.send.mockClear(); // discard sendFullState call from onopen
    manager.send({ type: 'delete_pack_list', id: 'x' });
    expect(mockChannel.send).not.toHaveBeenCalled();
  });
});

describe('WebRTCManager — disconnect()', () => {
  it('transitions to idle regardless of prior phase', async () => {
    const manager = await makeConnectedManager();
    manager.disconnect();
    expect(manager.getPhase()).toBe('idle');
  });

  it('clears the sync listener', async () => {
    const manager = await makeConnectedManager();
    vi.mocked(setSyncListener).mockClear();
    manager.disconnect();
    expect(setSyncListener).toHaveBeenCalledWith(null);
  });

  it('clears any stored error', async () => {
    const manager = new WebRTCManager();
    await manager.startAsOfferer();
    mockChannel.onerror?.({ error: { message: 'boom' } } as RTCErrorEvent);
    manager.disconnect();
    expect(manager.getError()).toBeNull();
  });
});

describe('WebRTCManager — channel close: peer-drop vs user-disconnect', () => {
  it('transitions to disconnected when peer closes the channel', async () => {
    const manager = await makeConnectedManager();
    mockChannel.onclose?.({} as Event);
    expect(manager.getPhase()).toBe('disconnected');
  });

  it('stays idle when channel closes after user-initiated disconnect', async () => {
    const manager = await makeConnectedManager();
    manager.disconnect(); // sets phase to idle
    mockChannel.onclose?.({} as Event); // simulate delayed onclose from the browser
    expect(manager.getPhase()).toBe('idle');
  });
});

describe('WebRTCManager — channel onerror', () => {
  it('transitions to error phase', async () => {
    const manager = await makeConnectedManager();
    mockChannel.onerror?.({ error: { message: 'ICE failed' } } as RTCErrorEvent);
    expect(manager.getPhase()).toBe('error');
  });

  it('stores the error message', async () => {
    const manager = await makeConnectedManager();
    mockChannel.onerror?.({ error: { message: 'ICE failed' } } as RTCErrorEvent);
    expect(manager.getError()).toBe('ICE failed');
  });

  it('clears the sync listener on error', async () => {
    const manager = await makeConnectedManager();
    vi.mocked(setSyncListener).mockClear();
    mockChannel.onerror?.({ error: { message: 'x' } } as RTCErrorEvent);
    expect(setSyncListener).toHaveBeenCalledWith(null);
  });
});

describe('WebRTCManager — onMessage: full_state', () => {
  it('calls putPackListDirect for every received list', async () => {
    const manager = await makeConnectedManager();
    const list = { id: 'l1', name: 'Clothes', items: [], referencedListIds: [], createdAt: '', updatedAt: '' };
    triggerMessage({ type: 'full_state', packLists: [list], packings: [] });
    await flush();
    expect(putPackListDirect).toHaveBeenCalledWith(list);
  });

  it('calls mergeAndPutPacking for every received packing', async () => {
    const manager = await makeConnectedManager();
    const packing = { id: 'p1', name: 'Trip', fromDate: '', toDate: '', packListIds: [], items: [], status: 'active', createdAt: '', updatedAt: '' };
    triggerMessage({ type: 'full_state', packLists: [], packings: [packing] });
    await flush();
    expect(mergeAndPutPacking).toHaveBeenCalledWith(packing);
  });

  it('ticks the db version after merging', async () => {
    const manager = await makeConnectedManager();
    vi.mocked(tickDbVersion).mockClear();
    triggerMessage({ type: 'full_state', sentAt: '2026-06-01T12:00:00.000Z', packLists: [], packings: [] });
    await flush();
    expect(tickDbVersion).toHaveBeenCalledOnce();
  });

  it('runs tombstone GC after merge', async () => {
    const manager = await makeConnectedManager();
    triggerMessage({ type: 'full_state', packLists: [], packings: [] });
    await flush();
    expect(gcTombstones).toHaveBeenCalledOnce();
  });

  it('notes clock skew from full_state sentAt', async () => {
    await makeConnectedManager();
    const receivedAt = Date.parse('2026-06-01T12:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(receivedAt);
    triggerMessage({ type: 'full_state', sentAt: '2026-06-01T12:00:05.000Z', packLists: [], packings: [] });
    await flush();
    expect(getPeerSkewMs()).toBe(5000);
    vi.mocked(Date.now).mockRestore();
  });

  it('ignores malformed JSON on the channel', async () => {
    const manager = await makeConnectedManager();
    vi.mocked(tickDbVersion).mockClear();
    mockChannel.onmessage?.({ data: 'not-json' } as MessageEvent);
    await flush();
    expect(tickDbVersion).not.toHaveBeenCalled();
  });
});

describe('WebRTCManager — onMessage: individual message types', () => {
  it('save_pack_list → putPackListDirect', async () => {
    const manager = await makeConnectedManager();
    const list = { id: 'l1', name: 'Test', items: [], referencedListIds: [], createdAt: '', updatedAt: '' };
    triggerMessage({ type: 'save_pack_list', data: list });
    await flush();
    expect(putPackListDirect).toHaveBeenCalledWith(list);
  });

  it('update_pack_list_sort_orders → putPackListSortOrderDirect for each entry', async () => {
    const manager = await makeConnectedManager();
    triggerMessage({
      type: 'update_pack_list_sort_orders',
      updates: [
        { id: 'l1', sortOrder: 10, updatedAt: '2026-01-02' },
        { id: 'l2', sortOrder: 20, updatedAt: '2026-01-03' },
      ],
    });
    await flush();
    expect(putPackListSortOrderDirect).toHaveBeenCalledWith('l1', 10, '2026-01-02');
    expect(putPackListSortOrderDirect).toHaveBeenCalledWith('l2', 20, '2026-01-03');
  });

  it('update_pack_list_major → putPackListMajorDirect', async () => {
    const manager = await makeConnectedManager();
    triggerMessage({ type: 'update_pack_list_major', id: 'l1', isMajor: true, updatedAt: '2026-01-02' });
    await flush();
    expect(putPackListMajorDirect).toHaveBeenCalledWith('l1', true, '2026-01-02');
  });

  it('delete_pack_list → deletePackListDirect', async () => {
    const manager = await makeConnectedManager();
    triggerMessage({
      type: 'delete_pack_list',
      id: 'l1',
      deletedAt: '2026-01-02',
      updatedAt: '2026-01-02',
    });
    await flush();
    expect(deletePackListDirect).toHaveBeenCalledWith('l1', '2026-01-02', '2026-01-02');
  });

  it('create_packing → mergeAndPutPacking', async () => {
    const manager = await makeConnectedManager();
    const packing = { id: 'p1', name: 'Trip', fromDate: '', toDate: '', packListIds: [], items: [], status: 'active', createdAt: '', updatedAt: '' };
    triggerMessage({ type: 'create_packing', data: packing });
    await flush();
    expect(mergeAndPutPacking).toHaveBeenCalledWith(packing);
  });

  it('update_packing_meta → updatePackingMetaDirect', async () => {
    const manager = await makeConnectedManager();
    triggerMessage({
      type: 'update_packing_meta',
      id: 'p1',
      name: 'New',
      fromDate: '2026-02-01',
      toDate: '2026-02-07',
      updatedAt: '2026-02-01T00:00:00Z',
    });
    await flush();
    expect(updatePackingMetaDirect).toHaveBeenCalledWith(
      'p1',
      'New',
      '2026-02-01',
      '2026-02-07',
      '2026-02-01T00:00:00Z',
    );
  });

  it('update_packing_meta → no-op when packing does not exist', async () => {
    const manager = await makeConnectedManager();
    triggerMessage({
      type: 'update_packing_meta',
      id: 'ghost',
      name: 'X',
      fromDate: '',
      toDate: '',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    await flush();
    expect(updatePackingMetaDirect).toHaveBeenCalledWith('ghost', 'X', '', '', '2026-01-01T00:00:00Z');
  });

  it('update_packing_item → updatePackingItemDirect', async () => {
    const manager = await makeConnectedManager();
    triggerMessage({
      type: 'update_packing_item',
      packingId: 'p1',
      listId: 'l',
      text: 'Shirt',
      status: 'packed',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    await flush();
    expect(updatePackingItemDirect).toHaveBeenCalledWith('p1', 'l', 'Shirt', 'packed', '2026-01-02T00:00:00Z');
  });

  it('add_packing_item → addPackingItemDirect', async () => {
    const manager = await makeConnectedManager();
    triggerMessage({ type: 'add_packing_item', packingId: 'p1', text: 'Sunscreen' });
    await flush();
    expect(addPackingItemDirect).toHaveBeenCalledWith('p1', 'Sunscreen');
  });

  it('delete_packing → deletePackingDirect', async () => {
    const manager = await makeConnectedManager();
    triggerMessage({
      type: 'delete_packing',
      id: 'p1',
      deletedAt: '2026-01-02',
      updatedAt: '2026-01-02',
    });
    await flush();
    expect(deletePackingDirect).toHaveBeenCalledWith('p1', '2026-01-02', '2026-01-02');
  });

  it('every message type ticks the db version exactly once', async () => {
    const messages = [
      { type: 'save_pack_list', data: { id: 'l1', name: '', items: [], referencedListIds: [], createdAt: '', updatedAt: '' } },
      { type: 'update_pack_list_sort_orders', updates: [] },
      { type: 'update_pack_list_major', id: 'l1', isMajor: false, updatedAt: '2026-01-01T00:00:00Z' },
      { type: 'delete_pack_list', id: 'l1', deletedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      { type: 'create_packing', data: { id: 'p1', name: '', fromDate: '', toDate: '', packListIds: [], items: [], status: 'active', createdAt: '', updatedAt: '' } },
      { type: 'update_packing_meta', id: 'p1', name: '', fromDate: '', toDate: '', updatedAt: '2026-01-01T00:00:00Z' },
      { type: 'update_packing_item', packingId: 'p1', listId: 'l', text: 'x', status: 'packed', updatedAt: '2026-01-01T00:00:00Z' },
      { type: 'add_packing_item', packingId: 'p1', text: 'x' },
      { type: 'delete_packing', id: 'p1', deletedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ];

    for (const msg of messages) {
      const manager = await makeConnectedManager();
      vi.mocked(tickDbVersion).mockClear();
      triggerMessage(msg);
      await flush();
      expect(tickDbVersion, `${msg.type} should tick once`).toHaveBeenCalledOnce();
      manager.disconnect();
    }
  });
});

describe('WebRTCManager — startAsAnswerer', () => {
  it('transitions creating-answer → showing-answer-qr', async () => {
    const manager = new WebRTCManager();
    const encoded = encodeForQR(MOCK_SDP);
    const result = await manager.startAsAnswerer(encoded);
    expect(manager.getPhase()).toBe('showing-answer-qr');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('WebRTCManager — completeHandshake', () => {
  it('transitions to connecting after offerer scans answer QR', async () => {
    const manager = new WebRTCManager();
    await manager.startAsOfferer();
    await manager.completeHandshake(encodeForQR(MOCK_SDP));
    expect(manager.getPhase()).toBe('connecting');
  });

  it('throws when no peer connection exists', async () => {
    await expect(new WebRTCManager().completeHandshake('bad')).rejects.toThrow(/No peer connection/);
  });
});

describe('WebRTCManager — setPairingError', () => {
  it('sets error phase and stores the message', async () => {
    const manager = new WebRTCManager();
    await manager.startAsOfferer();
    manager.setPairingError('Invalid QR code');
    expect(manager.getPhase()).toBe('error');
    expect(manager.getError()).toBe('Invalid QR code');
  });

  it('clears sync listener', async () => {
    const manager = await makeConnectedManager();
    vi.mocked(setSyncListener).mockClear();
    manager.setPairingError('Failed');
    expect(setSyncListener).toHaveBeenCalledWith(null);
  });
});

describe('WebRTCManager — sendFullState on connect', () => {
  it('sends sync_meta and full_state with local pack lists and packings', async () => {
    const lists = [{ id: 'l1', name: 'Clothes', items: [], referencedListIds: [], createdAt: '', updatedAt: '' }];
    const packings = [{ id: 'p1', name: 'Trip', fromDate: '', toDate: '', packListIds: [], items: [], status: 'active', createdAt: '', updatedAt: '' }];
    vi.mocked(getAllPackListsForSync).mockResolvedValueOnce(lists);
    vi.mocked(getAllPackingsForSync).mockResolvedValueOnce(packings);

    const manager = new WebRTCManager();
    await manager.startAsOfferer();
    mockChannel.onopen?.({} as Event);
    await flush();

    expect(mockChannel.send).toHaveBeenCalledTimes(2);
    const meta = JSON.parse(String(mockChannel.send.mock.calls[0]![0]));
    const state = JSON.parse(String(mockChannel.send.mock.calls[1]![0]));
    expect(meta.type).toBe('sync_meta');
    expect(meta.sentAt).toBeDefined();
    expect(meta.appVersion).toBeDefined();
    expect(state.type).toBe('full_state');
    expect(state.packLists).toEqual(lists);
    expect(state.packings).toEqual(packings);
    expect(state.sentAt).toBe(meta.sentAt);
  });
});
