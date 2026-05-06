import { useEffect, useRef, useState } from 'react';
import { addPackingItem, getPacking, updatePackingItem } from '../db/packings.js';
import { getPackList } from '../db/packLists.js';
import type { Packing, PackingItem, PackingItemStatus, Screen } from '../types/index.js';
import './PackingScreen.css';

type Props = {
  packingId: string;
  onNavigate: (screen: Screen) => void;
};

type GroupedItems = {
  listName: string;
  items: Array<{ item: PackingItem; globalIndex: number }>;
};

export default function PackingScreen({ packingId, onNavigate }: Props): React.ReactElement {
  const [packing, setPacking] = useState<Packing | null>(null);
  const [groups, setGroups] = useState<GroupedItems[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const newItemInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadPacking();
  }, [packingId]);

  async function loadPacking(): Promise<void> {
    const p = await getPacking(packingId);
    if (!p) return;
    setPacking(p);
    await buildGroups(p);
  }

  async function buildGroups(p: Packing): Promise<void> {
    const listIdsSeen = new Set<string>();
    const orderedListIds: string[] = [];
    for (const item of p.items) {
      if (!listIdsSeen.has(item.listId)) {
        listIdsSeen.add(item.listId);
        orderedListIds.push(item.listId);
      }
    }

    const nameMap = new Map<string, string>();
    await Promise.all(
      orderedListIds.map(async (id) => {
        if (id === '__additional__') {
          nameMap.set(id, 'Additional items');
          return;
        }
        const list = await getPackList(id);
        nameMap.set(id, list?.name ?? 'Unknown list');
      }),
    );

    const grouped: GroupedItems[] = orderedListIds.map((listId) => ({
      listName: nameMap.get(listId) ?? listId,
      items: p.items
        .map((item, globalIndex) => ({ item, globalIndex }))
        .filter(({ item }) => item.listId === listId),
    }));

    setGroups(grouped);
  }

  async function handleToggleItem(globalIndex: number, current: PackingItemStatus): Promise<void> {
    let next: PackingItemStatus;
    if (current === 'pending') next = 'packed';
    else if (current === 'packed') next = 'discarded';
    else next = 'pending';

    const updated = await updatePackingItem(packingId, globalIndex, next);
    setPacking(updated);
    await buildGroups(updated);
  }

  async function handleAddItem(): Promise<void> {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    const updated = await addPackingItem(packingId, trimmed);
    setNewItemText('');
    setPacking(updated);
    await buildGroups(updated);
    newItemInputRef.current?.focus();
  }

  if (!packing) return <div className="packing-screen"><p style={{ padding: 24 }}>Loading…</p></div>;

  const total = packing.items.length;
  const done = packing.items.filter((i) => i.status !== 'pending').length;
  const isDone = packing.status === 'done';

  return (
    <div className="packing-screen">
      <header className="packing-screen__header">
        <button
          className="btn btn--back"
          onClick={() => onNavigate({ id: 'home' })}
          aria-label="Back"
        >
          ‹
        </button>
        <div className="packing-screen__header-info">
          <span className="packing-screen__name">{packing.name}</span>
          <span className="packing-screen__date">{packing.date}</span>
        </div>
        {isDone && <span className="packing-screen__done-badge">✓ Done</span>}
      </header>

      <div className="packing-screen__progress-bar">
        <div
          className="packing-screen__progress-fill"
          style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
        />
      </div>

      <p className="packing-screen__counter">
        {done} of {total} items completed
      </p>

      <main className="packing-screen__content">
        {isDone && (
          <div className="packing-screen__done-banner">
            <img src={`${import.meta.env.BASE_URL}complete.png`} className="packing-screen__done-icon" alt="" />
            <span>All packed!</span>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.listName} className="packing-screen__group">
            <h2 className="packing-screen__group-title">{group.listName}</h2>
            <ul className="packing-screen__items">
              {group.items.map(({ item, globalIndex }) => (
                <PackingItemRow
                  key={globalIndex}
                  item={item}
                  onToggle={() => void handleToggleItem(globalIndex, item.status)}
                />
              ))}
            </ul>
          </section>
        ))}

        <section className="packing-screen__add-section">
          <h2 className="packing-screen__group-title">Add item</h2>
          <div className="packing-screen__add-row">
            <input
              ref={newItemInputRef}
              className="packing-screen__add-input"
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="e.g. Charger"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddItem(); }}
            />
            <button
              className="btn btn--primary packing-screen__add-btn"
              onClick={() => void handleAddItem()}
              disabled={!newItemText.trim()}
            >
              Add
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

type PackingItemRowProps = {
  item: PackingItem;
  onToggle: () => void;
};

function PackingItemRow({ item, onToggle }: PackingItemRowProps): React.ReactElement {
  return (
    <li
      className={`packing-screen__item packing-screen__item--${item.status}`}
    >
      <button
        className="packing-screen__item-btn"
        onClick={onToggle}
        aria-label={`${item.text} — tap to cycle status`}
      >
        <span className="packing-screen__item-icon">
          {item.status === 'pending' && '○'}
          {item.status === 'packed' && '✓'}
          {item.status === 'discarded' && '✕'}
        </span>
        <span className="packing-screen__item-text">{item.text}</span>
        {item.status !== 'pending' && (
          <span className="packing-screen__item-status-label">
            {item.status === 'packed' ? 'packed' : 'skipped'}
          </span>
        )}
      </button>
    </li>
  );
}
