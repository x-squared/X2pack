import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getDbVersion,
  tickDbVersion,
  subscribeDbVersion,
  getDbChangesSince,
  getDbChangesAt,
  isPackingChange,
  isAnyPackListChange,
} from './dbVersion.js';

// The module is a singleton — version accumulates across tests in this file.
// All tests use relative assertions (before/after) so order doesn't matter.

afterEach(() => {
  vi.clearAllMocks();
});

describe('getDbVersion / tickDbVersion', () => {
  it('returns a number', () => {
    expect(typeof getDbVersion()).toBe('number');
  });

  it('increments by exactly 1 on each tick', () => {
    const before = getDbVersion();
    tickDbVersion();
    expect(getDbVersion()).toBe(before + 1);
  });

  it('increments cumulatively across multiple ticks', () => {
    const before = getDbVersion();
    tickDbVersion();
    tickDbVersion();
    tickDbVersion();
    expect(getDbVersion()).toBe(before + 3);
  });

  it('records typed changes per version tick', () => {
    const before = getDbVersion();
    tickDbVersion([{ kind: 'packing', packingId: 'p1', aspect: 'item' }]);
    expect(getDbChangesAt(before + 1)).toEqual([
      { kind: 'packing', packingId: 'p1', aspect: 'item' },
    ]);
  });

  it('getDbChangesSince unions changes across ticks', () => {
    const before = getDbVersion();
    tickDbVersion([{ kind: 'packing', packingId: 'p1', aspect: 'item' }]);
    tickDbVersion([{ kind: 'pack_list', listId: 'l1', aspect: 'sort' }]);
    expect(getDbChangesSince(before, before + 2)).toEqual([
      { kind: 'packing', packingId: 'p1', aspect: 'item' },
      { kind: 'pack_list', listId: 'l1', aspect: 'sort' },
    ]);
  });

  it('relevance helpers distinguish entity types', () => {
    const itemChange = [{ kind: 'packing', packingId: 'p1', aspect: 'item' }] as const;
    expect(isPackingChange(itemChange, 'p1')).toBe(true);
    expect(isPackingChange(itemChange, 'p2')).toBe(false);
    expect(isAnyPackListChange(itemChange)).toBe(false);
  });
});

describe('subscribeDbVersion', () => {
  it('notifies the subscriber on tick', () => {
    const fn = vi.fn();
    const unsub = subscribeDbVersion(fn);
    tickDbVersion();
    expect(fn).toHaveBeenCalled();
    unsub();
  });

  it('does not notify after unsubscribing', () => {
    const fn = vi.fn();
    const unsub = subscribeDbVersion(fn);
    unsub();
    tickDbVersion();
    expect(fn).not.toHaveBeenCalled();
  });

  it('notifies the subscriber on every tick, not just the first', () => {
    const fn = vi.fn();
    const unsub = subscribeDbVersion(fn);
    tickDbVersion();
    tickDbVersion();
    tickDbVersion();
    expect(fn).toHaveBeenCalledTimes(3);
    unsub();
  });

  it('notifies all registered subscribers', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const unsub1 = subscribeDbVersion(fn1);
    const unsub2 = subscribeDbVersion(fn2);
    tickDbVersion();
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
    unsub1();
    unsub2();
  });

  it('unsubscribing one does not affect others', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const unsub1 = subscribeDbVersion(fn1);
    const unsub2 = subscribeDbVersion(fn2);
    unsub1();
    tickDbVersion();
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
    unsub2();
  });

  it('returns a cleanup function', () => {
    const unsub = subscribeDbVersion(vi.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });
});
