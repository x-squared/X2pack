// Test utility — in-memory IDB stand-in. Use via vi.mock('./db.js').

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Map<string, any>();

export const mockDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(_storeName: string, key: string): Promise<any> {
    return Promise.resolve(store.get(key));
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAll(_storeName: string): Promise<any[]> {
    return Promise.resolve([...store.values()]);
  },
  put(_storeName: string, value: { id: string }): Promise<void> {
    store.set(value.id, structuredClone(value));
    return Promise.resolve();
  },
  delete(_storeName: string, key: string): Promise<void> {
    store.delete(key);
    return Promise.resolve();
  },
  clear(): void {
    store.clear();
  },
};
