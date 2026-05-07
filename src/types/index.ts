export type PackList = {
  id: string;
  name: string;
  items: readonly string[];
  referencedListIds: readonly string[];
  sortOrder?: number;
  isMajor?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PackingItemStatus = 'pending' | 'packed' | 'discarded';

export type PackingItem = {
  listId: string;
  text: string;
  status: PackingItemStatus;
};

export type PackingStatus = 'active' | 'done';

export type Packing = {
  id: string;
  name: string;
  date: string;
  packListIds: readonly string[];
  items: readonly PackingItem[];
  status: PackingStatus;
  createdAt: string;
  updatedAt: string;
};

export type Screen =
  | { id: 'home' }
  | { id: 'lists' }
  | { id: 'edit-pack-list'; listId: string | null }
  | { id: 'new-packing' }
  | { id: 'packing'; packingId: string };
