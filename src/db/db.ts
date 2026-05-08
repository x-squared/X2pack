import { openDB, unwrap, type IDBPDatabase } from 'idb';
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

navigator.serviceWorker?.addEventListener('controllerchange', () => {
  console.info('[db] SW controllerchange — new SW claimed this page; IDB may be affected');
});

let dbInstance: IDBPDatabase<X2PackDB> | null = null;
// Pending open promise prevents concurrent openDB() calls when dbInstance is null.
let dbOpenPromise: Promise<IDBPDatabase<X2PackDB>> | null = null;

function clearDb(): void {
  dbInstance = null;
  dbOpenPromise = null;
}

export async function getDb(): Promise<IDBPDatabase<X2PackDB>> {
  if (dbInstance) return dbInstance;
  if (dbOpenPromise) return dbOpenPromise;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => {
      console.warn('[db] IDB open timed out — close other tabs with this app open, or clear site data and reload');
      reject(new Error('IDB open timed out — close other tabs with this app open, or clear site data and reload'));
    }, 5000),
  );

  dbOpenPromise = Promise.race([
    openDB<X2PackDB>('x2pack', 2, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      console.info('[db] upgrade start', { oldVersion });
      if (oldVersion < 1) {
        database.createObjectStore('packLists', { keyPath: 'id' });
        database.createObjectStore('packings', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        // Raw IDB cursor keeps the versionchange transaction alive across every step,
        // avoiding Firefox's strict auto-commit on async/await gaps.
        const store = unwrap(transaction).objectStore('packings');
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const rec = cursor.value as Record<string, unknown>;
          if (!rec['fromDate'] && rec['date']) {
            const { date, ...rest } = rec;
            const updateReq = cursor.update({ ...rest, fromDate: date, toDate: date });
            updateReq.onsuccess = () => cursor.continue();
          } else {
            cursor.continue();
          }
        };
      }
      console.info('[db] upgrade done');
    },
    blocked() {
      console.warn('[db] upgrade blocked by an older connection in another tab');
    },
    blocking() {
      console.warn('[db] closing connection so another tab can upgrade');
      dbInstance?.close();
      clearDb();
    },
    terminated() {
      console.warn('[db] connection terminated by browser');
      clearDb();
    },
  }),
    timeoutPromise,
  ]).then((db) => {
    dbInstance = db;
    dbOpenPromise = null;
    // iOS Safari closes IDB connections when the PWA is backgrounded.
    // The 'close' event is the primary signal; clearDb() lets the next call reopen cleanly.
    db.addEventListener('close', () => {
      console.info('[db] connection closed — will reopen on next access');
      clearDb();
    });
    return db;
  }).catch((err: unknown) => {
    console.warn('[db] failed to open', err);
    dbOpenPromise = null;
    throw err;
  });

  return dbOpenPromise;
}
