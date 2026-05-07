import { openDB, type IDBPDatabase } from 'idb';
import type { PackList, Packing } from '../types/index.js';

type X2PackDB = {
  packLists: {
    key: string;
    value: PackList;
  };
  packings: {
    key: string;
    value: Packing;
  };
};

let dbInstance: IDBPDatabase<X2PackDB> | null = null;

// iOS Safari closes IDB connections when a PWA is backgrounded. The 'close'
// event is unreliable (racy), so we also null out the instance proactively
// on visibilitychange — this fires before the user can trigger any DB call.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    dbInstance = null;
  }
});

export async function getDb(): Promise<IDBPDatabase<X2PackDB>> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<X2PackDB>('x2pack', 1, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('packLists', { keyPath: 'id' });
        database.createObjectStore('packings', { keyPath: 'id' });
      }
    },
  });
  dbInstance.addEventListener('close', () => {
    dbInstance = null;
  });
  return dbInstance;
}
