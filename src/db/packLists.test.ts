import { describe, it, expect } from 'vitest';
import { hasCircularReference, isDependedUpon, resolveLeafLists } from './packLists.js';
import type { PackList } from '../types/index.js';

function makeList(id: string, refs: string[] = [], items: string[] = []): PackList {
  return { id, name: id, items, referencedListIds: refs, createdAt: '', updatedAt: '' };
}

describe('hasCircularReference', () => {
  it('returns false when there are no references', () => {
    const lists = [makeList('a')];
    expect(hasCircularReference('a', [], lists)).toBe(false);
  });

  it('returns false for a valid chain a → b → c', () => {
    const lists = [makeList('a', ['b']), makeList('b', ['c']), makeList('c')];
    expect(hasCircularReference('a', ['b'], lists)).toBe(false);
  });

  it('detects direct self-reference', () => {
    const lists = [makeList('a')];
    expect(hasCircularReference('a', ['a'], lists)).toBe(true);
  });

  it('detects indirect cycle a → b → a', () => {
    const lists = [makeList('a', ['b']), makeList('b', ['a'])];
    expect(hasCircularReference('a', ['b'], lists)).toBe(true);
  });

  it('detects three-node cycle a → b → c → a', () => {
    const lists = [makeList('a', ['b']), makeList('b', ['c']), makeList('c', ['a'])];
    expect(hasCircularReference('a', ['b'], lists)).toBe(true);
  });

  it('does not flag sibling references (diamond shape)', () => {
    // a → [b, c], b → d, c → d  (diamond, no cycle)
    const lists = [
      makeList('a', ['b', 'c']),
      makeList('b', ['d']),
      makeList('c', ['d']),
      makeList('d'),
    ];
    expect(hasCircularReference('a', ['b', 'c'], lists)).toBe(false);
  });
});

describe('isDependedUpon', () => {
  it('returns false when no list references the target', () => {
    const lists = [makeList('a'), makeList('b')];
    expect(isDependedUpon('a', lists)).toBe(false);
  });

  it('returns true when another list references the target', () => {
    const lists = [makeList('a', ['b']), makeList('b')];
    expect(isDependedUpon('b', lists)).toBe(true);
  });
});

describe('resolveLeafLists', () => {
  it('returns a list itself when it has no references', () => {
    const lists = [makeList('a', [], ['item1', 'item2'])];
    const leaves = resolveLeafLists(['a'], lists);
    expect(leaves.map((l) => l.id)).toEqual(['a']);
  });

  it('expands one level of references', () => {
    const lists = [makeList('a', ['b', 'c']), makeList('b'), makeList('c')];
    const leaves = resolveLeafLists(['a'], lists);
    expect(leaves.map((l) => l.id).sort()).toEqual(['b', 'c']);
  });

  it('expands transitively', () => {
    // a → b → c (c is the only leaf)
    const lists = [makeList('a', ['b']), makeList('b', ['c']), makeList('c')];
    const leaves = resolveLeafLists(['a'], lists);
    expect(leaves.map((l) => l.id)).toEqual(['c']);
  });

  it('deduplicates shared leaves (diamond shape)', () => {
    const lists = [
      makeList('a', ['b', 'c']),
      makeList('b', ['d']),
      makeList('c', ['d']),
      makeList('d'),
    ];
    const leaves = resolveLeafLists(['a'], lists);
    expect(leaves.map((l) => l.id)).toEqual(['d']);
  });

  it('handles multiple root ids', () => {
    const lists = [makeList('a'), makeList('b')];
    const leaves = resolveLeafLists(['a', 'b'], lists);
    expect(leaves.map((l) => l.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty array for unknown root id', () => {
    const lists = [makeList('a')];
    const leaves = resolveLeafLists(['unknown'], lists);
    expect(leaves).toHaveLength(0);
  });

  it('includes a list that has both direct items and references', () => {
    // 'parent' has its own items AND references 'child' — both should appear
    const lists = [
      makeList('parent', ['child'], ['item-from-parent']),
      makeList('child', [], ['item-from-child']),
    ];
    const leaves = resolveLeafLists(['parent'], lists);
    expect(leaves.map((l) => l.id).sort((a, b) => a.localeCompare(b))).toEqual(['child', 'parent']);
  });
});
