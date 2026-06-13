export type PackList = {
  id: string;
  name: string;
  items: readonly string[];
  referencedListIds: readonly string[];
  sortOrder?: number;
  isMajor?: boolean;
  createdAt: string;
  /** Bumped on every syncable write; used for LWW conflict resolution (see `src/sync/syncArchitecture.ts`). */
  updatedAt: string;
  /** When set, the list is soft-deleted (hidden from UI, included in sync snapshots as a tombstone). */
  deletedAt?: string;
};

export type PackingItemStatus = 'pending' | 'packed' | 'discarded' | 'not_used';

export type PackingItem = {
  listId: string;
  text: string;
  status: PackingItemStatus;
};

export type PackingStatus = 'active' | 'done';

export type Packing = {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
  packListIds: readonly string[];
  items: readonly PackingItem[];
  status: PackingStatus;
  createdAt: string;
  /** Bumped on every syncable write; used for LWW conflict resolution (see `src/sync/syncArchitecture.ts`). */
  updatedAt: string;
  /** When set, the packing is soft-deleted (hidden from UI, included in sync snapshots as a tombstone). */
  deletedAt?: string;
};

export type Screen =
  | { id: 'home' }
  | { id: 'lists' }
  | { id: 'edit-pack-list'; listId: string | null }
  | { id: 'new-packing' }
  | { id: 'packing'; packingId: string }
  | { id: 'pair' };
