import { useRef, useState } from 'react';
import { addPackingItem, getPacking, updatePackingItem, updatePackingMeta } from '../../db/packings.js';
import { getPackList } from '../../db/packLists.js';
import type { Packing, PackingItem, PackingItemStatus, Screen } from '../../types/index.js';
import SyncButton from '../../components/SyncButton.js';
import DbLoadError from '../../components/DbLoadError.js';
import { useDbReload } from '../../hooks/useDbReload.js';
import {
  isItemOnlyPackingChange,
  isPackingChange,
  type DbChange,
} from '../../sync/dbVersion.js';
import '../../components/SyncButton.css';
import '../../components/DbLoadError.css';
import './PackingScreen.css';

type Props = {
  readonly packingId: string;
  readonly onNavigate: (screen: Screen) => void;
};

type GroupedItems = {
  listName: string;
  items: Array<{ item: PackingItem; globalIndex: number }>;
};

const listNameCache = new Map<string, string>();
listNameCache.set('__additional__', 'Additional items');

function formatDateRange(from: string, to: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(from)} – ${fmt(to)}`;
}

export function dayCount(from: string, to: string): number {
  return (
    Math.round(
      (new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000,
    )
  );
}

function renderName(
  name: string,
  isDone: boolean,
  editingName: boolean,
  editName: string,
  setEditName: (v: string) => void,
  setEditingName: (v: boolean) => void,
  handleSaveName: () => void,
): React.ReactElement {
  if (editingName) {
    return (
      <input
        autoFocus
        className="packing-screen__name-input"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        onBlur={handleSaveName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSaveName();
          if (e.key === 'Escape') { setEditName(name); setEditingName(false); }
        }}
      />
    );
  }
  if (isDone) {
    return <span className="packing-screen__name">{name}</span>;
  }
  return (
    <button
      className="packing-screen__name packing-screen__name--editable"
      onClick={() => { setEditName(name); setEditingName(true); }}
    >
      {name}
    </button>
  );
}

export default function PackingScreen({ packingId, onNavigate }: Props): React.ReactElement {
  const [packing, setPacking] = useState<Packing | null>(null);
  const [groups, setGroups] = useState<GroupedItems[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFromDate, setEditFromDate] = useState('');
  const [editToDate, setEditToDate] = useState('');
  const [newItemText, setNewItemText] = useState('');
  const [showOnlyOpen, setShowOnlyOpen] = useState(false);
  const newItemInputRef = useRef<HTMLInputElement>(null);

  const { loadError, retry, loading } = useDbReload(
    (changes) => loadPacking(changes),
    [packingId],
    { isRelevant: (changes) => isPackingChange(changes, packingId) },
  );

  async function loadPacking(changes?: readonly DbChange[]): Promise<void> {
    const p = await getPacking(packingId);
    if (!p) return;
    setPacking(p);
    setEditName(p.name);
    setEditFromDate(p.fromDate);
    setEditToDate(p.toDate);
    const skipNameFetch =
      changes !== undefined && isItemOnlyPackingChange(changes, packingId);
    await buildGroups(p, skipNameFetch);
  }

  async function buildGroups(p: Packing, skipNameFetch = false): Promise<void> {
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
        if (skipNameFetch && listNameCache.has(id)) {
          nameMap.set(id, listNameCache.get(id)!);
          return;
        }
        if (id === '__additional__') {
          nameMap.set(id, 'Additional items');
          return;
        }
        const list = await getPackList(id);
        const name = list?.name ?? 'Unknown list';
        listNameCache.set(id, name);
        nameMap.set(id, name);
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
    else if (current === 'discarded') next = 'not_used';
    else next = 'pending';

    const item = packing?.items[globalIndex];
    if (!packing || !item) return;

    const updated = await updatePackingItem(packingId, item.listId, item.text, next);
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

  async function handleSaveName(): Promise<void> {
    setEditingName(false);
    const trimmed = editName.trim();
    if (!trimmed || trimmed === packing!.name) return;
    const updated = await updatePackingMeta(packingId, trimmed, packing!.fromDate, packing!.toDate);
    setPacking(updated);
    setEditName(trimmed);
  }

  async function handleSaveDates(from: string, to: string): Promise<void> {
    if (!from || !to || to < from) return;
    if (from === packing!.fromDate && to === packing!.toDate) return;
    const updated = await updatePackingMeta(packingId, packing!.name, from, to);
    setPacking(updated);
  }

  if (loadError) {
    return (
      <div className="packing-screen">
        <DbLoadError onRetry={retry} />
      </div>
    );
  }

  if (!packing) {
    return (
      <div className="packing-screen">
        <p style={{ padding: 24 }}>{loading ? 'Loading…' : 'Packing not found.'}</p>
      </div>
    );
  }

  const total = packing.items.length;
  const done = packing.items.filter((i) => i.status !== 'pending').length;
  const isDone = packing.status === 'done';

  const filteredGroups = showOnlyOpen
    ? groups
        .map((group) => ({
          ...group,
          items: group.items.filter(({ item }) => item.status === 'pending'),
        }))
        .filter((group) => group.items.length > 0)
    : groups;

  const displayFrom = isDone ? packing.fromDate : editFromDate;
  const displayTo = isDone ? packing.toDate : editToDate;
  const datesValid = !!displayFrom && !!displayTo && displayTo >= displayFrom;

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
          {renderName(packing.name, isDone, editingName, editName, setEditName, setEditingName, handleSaveName)}
          {datesValid && (
            <span className="packing-screen__date">{formatDateRange(displayFrom, displayTo)}</span>
          )}
        </div>
        {isDone && <span className="packing-screen__done-badge">✓ Done</span>}
        <SyncButton onNavigate={onNavigate} className="packing-screen__sync-btn" />
      </header>

      <div className="packing-screen__progress-bar">
        <div
          className="packing-screen__progress-fill"
          style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
        />
      </div>

      <button
        className="packing-screen__counter packing-screen__counter--toggle"
        onClick={() => setShowOnlyOpen((v) => !v)}
      >
        {done} of {total} items completed ({showOnlyOpen ? 'showing open items' : 'showing all items'})
      </button>

      {!isDone && (
        <div className="packing-screen__date-strip">
          <div className="packing-screen__date-inputs">
            <input
              className="packing-screen__date-input"
              type="date"
              value={editFromDate}
              onChange={(e) => {
                setEditFromDate(e.target.value);
                if (editToDate && e.target.value > editToDate) setEditToDate(e.target.value);
              }}
              onBlur={() => void handleSaveDates(editFromDate, editToDate)}
            />
            <span className="packing-screen__date-sep">→</span>
            <input
              className="packing-screen__date-input"
              type="date"
              value={editToDate}
              min={editFromDate}
              onChange={(e) => setEditToDate(e.target.value)}
              onBlur={() => void handleSaveDates(editFromDate, editToDate)}
            />
          </div>
          {datesValid && (
            <p className="packing-screen__date-hint">
              You are packing for a total of {dayCount(editFromDate, editToDate)}{' '}
              {dayCount(editFromDate, editToDate) === 1 ? 'day' : 'days'}.
            </p>
          )}
        </div>
      )}

      {isDone && datesValid && (
        <p className="packing-screen__date-hint packing-screen__date-hint--done">
          Packed for {dayCount(packing.fromDate, packing.toDate)}{' '}
          {dayCount(packing.fromDate, packing.toDate) === 1 ? 'day' : 'days'}.
        </p>
      )}

      <main className="packing-screen__content">
        {isDone && showOnlyOpen ? (
          <div className="packing-screen__complete-full">
            <img src={`${import.meta.env.BASE_URL}complete.png`} className="packing-screen__complete-icon-full" alt="All packed!" />
          </div>
        ) : (
          <>
            {isDone && (
              <div className="packing-screen__done-banner">
                <img src={`${import.meta.env.BASE_URL}complete.png`} className="packing-screen__done-icon" alt="" />
                <span>All packed!</span>
              </div>
            )}
          </>
        )}

        {filteredGroups.map((group) => (
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

function statusLabel(status: PackingItemStatus): string {
  if (status === 'packed') return 'packed';
  if (status === 'discarded') return 'skipped';
  return 'not used';
}

type PackingItemRowProps = {
  readonly item: PackingItem;
  readonly onToggle: () => void;
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
          {item.status === 'not_used' && '—'}
        </span>
        <span className="packing-screen__item-text">{item.text}</span>
        {item.status !== 'pending' && (
          <span className="packing-screen__item-status-label">
            {statusLabel(item.status)}
          </span>
        )}
      </button>
    </li>
  );
}
