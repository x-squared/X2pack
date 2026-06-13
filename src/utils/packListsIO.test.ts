import { describe, it, expect } from 'vitest';
import { serializePackLists, resolveImport } from './packListsIO.js';
import type { PackList } from '../types/index.js';

function makeList(overrides: Partial<PackList> & { id: string; name: string }): PackList {
  return { items: [], referencedListIds: [], createdAt: '', updatedAt: '', ...overrides };
}

describe('serializePackLists', () => {
  it('serializes items with - prefix', () => {
    const lists = [makeList({ id: '1', name: 'Clothes', items: ['Shirt', 'Pants'] })];
    expect(serializePackLists(lists)).toBe('# Clothes\n\n- Shirt\n- Pants');
  });

  it('marks major lists with main: prefix', () => {
    const lists = [makeList({ id: '1', name: 'Essentials', isMajor: true })];
    expect(serializePackLists(lists)).toContain('# main: Essentials');
  });

  it('serializes references with -> syntax', () => {
    const lists = [
      makeList({ id: '1', name: 'Full Pack', referencedListIds: ['2', '3'] }),
      makeList({ id: '2', name: 'Clothes' }),
      makeList({ id: '3', name: 'Toiletries' }),
    ];
    const out = serializePackLists(lists);
    expect(out).toContain('-> Clothes');
    expect(out).toContain('-> Toiletries');
  });

  it('falls back to the id when a referenced list is absent', () => {
    const lists = [makeList({ id: '1', name: 'Pack', referencedListIds: ['missing-id'] })];
    expect(serializePackLists(lists)).toContain('-> missing-id');
  });

  it('returns empty string for an empty list array', () => {
    expect(serializePackLists([])).toBe('');
  });

  it('skips soft-deleted lists', () => {
    const lists = [
      makeList({ id: '1', name: 'Active', items: ['Shirt'] }),
      makeList({ id: '2', name: 'Removed', deletedAt: '2026-01-01T00:00:00Z' }),
    ];
    const out = serializePackLists(lists);
    expect(out).toContain('# Active');
    expect(out).toContain('Shirt');
    expect(out).not.toContain('Removed');
  });

  it('separates multiple lists with a blank line', () => {
    const lists = [
      makeList({ id: '1', name: 'A', items: ['x'] }),
      makeList({ id: '2', name: 'B', items: ['y'] }),
    ];
    expect(serializePackLists(lists)).toContain('\n\n');
  });
});

describe('resolveImport', () => {
  it('parses a list with items', () => {
    const md = '# Camping\n\n- Tent\n- Sleeping bag';
    const [entry] = resolveImport(md, []);
    expect(entry!.data.name).toBe('Camping');
    expect(entry!.data.items).toEqual(['Tent', 'Sleeping bag']);
  });

  it('detects isMajor from main: prefix', () => {
    const md = '# main: Backpack Trip';
    const [entry] = resolveImport(md, []);
    expect(entry!.data.isMajor).toBe(true);
    expect(entry!.data.name).toBe('Backpack Trip');
  });

  it('parses a non-major list as isMajor false', () => {
    const md = '# Clothes';
    const [entry] = resolveImport(md, []);
    expect(entry!.data.isMajor).toBe(false);
  });

  it('resolves -> references to sibling list IDs', () => {
    const md = '# Full Pack\n\n-> Clothes\n-> Toiletries\n\n# Clothes\n\n# Toiletries';
    const entries = resolveImport(md, []);
    const fullPack = entries.find((e) => e.data.name === 'Full Pack')!;
    const clothesId = entries.find((e) => e.data.name === 'Clothes')!.id;
    const toiletriesId = entries.find((e) => e.data.name === 'Toiletries')!.id;
    expect(fullPack.data.referencedListIds).toEqual([clothesId, toiletriesId]);
  });

  it('handles legacy include: reference syntax', () => {
    const md = '# Full Pack\n\n- include: Clothes\n\n# Clothes';
    const entries = resolveImport(md, []);
    const fullPack = entries.find((e) => e.data.name === 'Full Pack')!;
    const clothesId = entries.find((e) => e.data.name === 'Clothes')!.id;
    expect(fullPack.data.referencedListIds).toEqual([clothesId]);
  });

  it('reuses existing IDs for lists already in the db', () => {
    const existing = [makeList({ id: 'existing-id-123', name: 'Clothes' })];
    const md = '# Clothes\n\n- Shirt';
    const [entry] = resolveImport(md, existing);
    expect(entry!.id).toBe('existing-id-123');
  });

  it('assigns a new UUID for a list not yet in the db', () => {
    const md = '# New List';
    const [entry] = resolveImport(md, []);
    expect(entry!.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('drops references to lists not present in markdown or existing lists', () => {
    const md = '# Pack\n\n-> Ghost List';
    const [entry] = resolveImport(md, []);
    expect(entry!.data.referencedListIds).toHaveLength(0);
  });

  it('returns empty array for blank input', () => {
    expect(resolveImport('', [])).toEqual([]);
  });

  it('round-trips through serializePackLists', () => {
    const original = [
      makeList({ id: '1', name: 'Clothes', items: ['Shirt', 'Pants'] }),
      makeList({ id: '2', name: 'Full Pack', referencedListIds: ['1'] }),
    ];
    const md = serializePackLists(original);
    const imported = resolveImport(md, original);
    const byName = Object.fromEntries(imported.map((e) => [e.data.name, e.data]));
    expect(byName['Clothes']!.items).toEqual(['Shirt', 'Pants']);
    expect(byName['Full Pack']!.referencedListIds).toHaveLength(1);
  });
});
