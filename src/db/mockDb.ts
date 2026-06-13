// Test utility — in-memory IDB stand-in. Use via vi.mock('./db.js').

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stores = new Map<string, Map<string, any>>();

function storeFor(name: string): Map<string, unknown> {
  let s = stores.get(name);
  if (!s) {
    s = new Map();
    stores.set(name, s);
  }
  return s;
}

export const mockDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(storeName: string, key: string): Promise<any> {
    return Promise.resolve(storeFor(storeName).get(key));
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAll(storeName: string): Promise<any[]> {
    return Promise.resolve([...storeFor(storeName).values()]);
  },
  put(storeName: string, value: { id: string }): Promise<void> {
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
};
