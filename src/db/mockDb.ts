// Test utility — in-memory IDB stand-in. Use via vi.mock('./db.js').

import type { PackList, Packing } from '../types/index.js';

type StoreValue = PackList | Packing;

const stores = new Map<string, Map<string, StoreValue>>();

function storeFor(name: string): Map<string, StoreValue> {
  let s = stores.get(name);
  if (!s) {
    s = new Map();
    stores.set(name, s);
  }
  return s;
}

interface MockDb {
  get(storeName: 'packLists', key: string): Promise<PackList | undefined>;
  get(storeName: 'packings', key: string): Promise<Packing | undefined>;
  get(storeName: string, key: string): Promise<StoreValue | undefined>;
  getAll(storeName: 'packLists'): Promise<PackList[]>;
  getAll(storeName: 'packings'): Promise<Packing[]>;
  getAll(storeName: string): Promise<StoreValue[]>;
  put(storeName: 'packLists', value: PackList): Promise<void>;
  put(storeName: 'packings', value: Packing): Promise<void>;
  put(storeName: string, value: StoreValue): Promise<void>;
  delete(storeName: string, key: string): Promise<void>;
  clear(): void;
}

export const mockDb = {
  get(storeName: string, key: string): Promise<StoreValue | undefined> {
    return Promise.resolve(storeFor(storeName).get(key));
  },
  getAll(storeName: string): Promise<StoreValue[]> {
    return Promise.resolve([...storeFor(storeName).values()]);
  },
  put(storeName: string, value: StoreValue): Promise<void> {
    storeFor(storeName).set(value.id, structuredClone(value));
    return Promise.resolve();
  },
  delete(storeName: string, key: string): Promise<void> {
    storeFor(storeName).delete(key);
    return Promise.resolve();
  },
  clear(): void {
    stores.clear();
  },
} as MockDb;

/** Assert a value exists after mockDb.get — for tests that just wrote the row. */
export function requireStored<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label} in mockDb`);
  return value;
}
