import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setSyncListener, suppressNextEmit, emitSync, withSuppressEmit, resetSuppressDepth } from './emitter.js';
import type { SyncMessage } from './protocol.js';

const msg: SyncMessage = {
  type: 'delete_pack_list',
  id: 'x',
  deletedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('emitter', () => {
  beforeEach(() => {
    setSyncListener(null);
    resetSuppressDepth();
  });

  it('calls the registered listener', () => {
    const fn = vi.fn();
    setSyncListener(fn);
    emitSync(msg);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(msg);
  });

  it('does not throw when no listener is set', () => {
    expect(() => emitSync(msg)).not.toThrow();
  });

  it('stops calling after setSyncListener(null)', () => {
    const fn = vi.fn();
    setSyncListener(fn);
    setSyncListener(null);
    emitSync(msg);
    expect(fn).not.toHaveBeenCalled();
  });

  it('replacing the listener calls only the new one', () => {
    const first = vi.fn();
    const second = vi.fn();
    setSyncListener(first);
    setSyncListener(second);
    emitSync(msg);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('suppressNextEmit blocks all emits until depth returns to 0', () => {
    const fn = vi.fn();
    setSyncListener(fn);
    suppressNextEmit();
    emitSync(msg);
    emitSync(msg);
    expect(fn).not.toHaveBeenCalled();
    suppressNextEmit();
    emitSync(msg);
    expect(fn).not.toHaveBeenCalled();
  });

  it('withSuppressEmit restores emit after the block completes', async () => {
    const fn = vi.fn();
    setSyncListener(fn);
    await withSuppressEmit(async () => {
      emitSync(msg);
    });
    expect(fn).not.toHaveBeenCalled();
    emitSync(msg);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('withSuppressEmit restores depth even when fn throws', async () => {
    const fn = vi.fn();
    setSyncListener(fn);
    await expect(withSuppressEmit(async () => {
      throw new Error('fail');
    })).rejects.toThrow('fail');
    emitSync(msg);
    expect(fn).toHaveBeenCalledOnce();
  });
});
