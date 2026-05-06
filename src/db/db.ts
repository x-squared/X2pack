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
  return dbInstance;
}
