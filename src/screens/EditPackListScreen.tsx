import { useEffect, useRef, useState } from 'react';
import {
  getAllPackLists,
  getPackList,
  savePackList,
  hasCircularReference,
} from '../db/packLists.js';
import type { PackList, Screen } from '../types/index.js';
import './EditPackListScreen.css';

type Props = {
  readonly listId: string | null;
  readonly onNavigate: (screen: Screen) => void;
  readonly onBack: () => void;
};

const PENDING_PACK_LIST_SAVE_KEY = 'x2pack-pending-pack-list-save';

function setPendingPackListSave(value: string): void {
  const storage = globalThis.localStorage;
  if (!storage || typeof storage.setItem !== 'function') return;
  storage.setItem(PENDING_PACK_LIST_SAVE_KEY, value);
}

function clearPendingPackListSave(): void {
  const storage = globalThis.localStorage;
  if (!storage || typeof storage.removeItem !== 'function') return;
  storage.removeItem(PENDING_PACK_LIST_SAVE_KEY);
}

export default function EditPackListScreen({
  listId,
  onNavigate,
  onBack,
}: Props): React.ReactElement {
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [referencedListIds, setReferencedListIds] = useState<string[]>([]);
  const [allLists, setAllLists] = useState<PackList[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const newItemRef = useRef<HTMLInputElement>(null);
  const effectiveIdRef = useRef<string | null>(listId);
  const dirtyRef = useRef(false);
  const backTriggeredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSaveRef = useRef<Promise<void> | null>(null);
  const itemKeysRef = useRef<string[]>([]);
  const keyCounterRef = useRef(0);

  function nextKey(): string {
    keyCounterRef.current += 1;
    return String(keyCounterRef.current);
  }

  const isNew = listId === null;
  const nameInvalid = nameTouched && !name.trim();

  useEffect(() => {
    void load();
  }, [listId]);

  async function load(): Promise<void> {
    const all = await getAllPackLists();
    setAllLists(all);
    if (listId) {
      const existing = await getPackList(listId);
      if (existing) {
        dirtyRef.current = false;
        itemKeysRef.current = existing.items.map(() => nextKey());
        setName(existing.name);
        setItems([...existing.items]);
        setReferencedListIds([...existing.referencedListIds]);
      }
    }
  }

  useEffect(() => {
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void doSave(); }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [name, items, referencedListIds]);

  async function doSave(): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const effectiveId = effectiveIdRef.current ?? '__new-list__';
    if (hasCircularReference(effectiveId, referencedListIds, allLists)) {
      setError('These references create a circular dependency. Please remove one.');
      return;
    }

    setError(null);
    setSaveStatus('saving');
    const work = async (): Promise<void> => {
      try {
        const saved = await savePackList(
          { name: trimmedName, items, referencedListIds },
          effectiveIdRef.current ?? undefined,
        );
        effectiveIdRef.current = saved.id;
        dirtyRef.current = false;
        setSaveStatus('saved');
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(`Could not save. ${message}`);
        setSaveStatus('idle');
      } finally {
        currentSaveRef.current = null;
      }
    };
    const p = work();
    currentSaveRef.current = p;
    await p;
  }

  async function handleBack(): Promise<void> {
    if (backTriggeredRef.current) return;
    backTriggeredRef.current = true;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (currentSaveRef.current) {
      setSaveStatus('saving');
      await currentSaveRef.current;
    } else if (dirtyRef.current && name.trim()) {
      const payload = {
        name: name.trim(),
        items: [...items],
        referencedListIds: [...referencedListIds],
        existingId: effectiveIdRef.current ?? undefined,
      };
      setPendingPackListSave(JSON.stringify(payload));
      setSaveStatus('saving');
      try {
        const saved = await savePackList(
          { name: payload.name, items: payload.items, referencedListIds: payload.referencedListIds },
          payload.existingId,
        );
        effectiveIdRef.current = saved.id;
        dirtyRef.current = false;
        clearPendingPackListSave();
      } catch (err) {
        console.warn('[edit-list] save on back failed — localStorage fallback in place', err);
        // localStorage payload remains as fallback for ListsScreen.flushPendingPackListSave
      }
    }
    onBack();
  }

  function markDirty(): void {
    dirtyRef.current = true;
  }

  function handleAddItem(): void {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    markDirty();
    itemKeysRef.current = [...itemKeysRef.current, nextKey()];
    setItems((prev) => [...prev, trimmed]);
    setNewItemText('');
    newItemRef.current?.focus();
  }

  function handleItemChange(index: number, value: string): void {
    markDirty();
    setItems((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  function handleRemoveItem(index: number): void {
    markDirty();
    itemKeysRef.current = itemKeysRef.current.filter((_, i) => i !== index);
    setItems((prev) => prev.filter((_, i) => i !== index));
    setEditingIndex(null);
  }

  function handleEditCommit(index: number, value: string): void {
    const trimmed = value.trim();
    if (trimmed) handleItemChange(index, trimmed);
    setEditingIndex(null);
  }

  function handleAddRef(id: string): void {
    markDirty();
    setReferencedListIds((prev) => [...prev, id]);
  }

  function handleRemoveRef(id: string): void {
    markDirty();
    setReferencedListIds((prev) => prev.filter((r) => r !== id));
  }

  function handleMoveRefUp(index: number): void {
    if (index === 0) return;
    markDirty();
    setReferencedListIds((prev) => {
      const next = [...prev];
      const tmp = next[index - 1] as string;
      next[index - 1] = next[index] as string;
      next[index] = tmp;
      return next;
    });
  }

  function handleMoveRefDown(index: number): void {
    markDirty();
    setReferencedListIds((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const tmp = next[index] as string;
      next[index] = next[index + 1] as string;
      next[index + 1] = tmp;
      return next;
    });
  }

  function handleMoveUp(index: number): void {
    if (index === 0) return;
    markDirty();
    setEditingIndex(null);
    const keys = [...itemKeysRef.current];
    [keys[index - 1], keys[index]] = [keys[index] as string, keys[index - 1] as string];
    itemKeysRef.current = keys;
    setItems((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index] as string, next[index - 1] as string];
      return next;
    });
  }

  function handleMoveDown(index: number): void {
    markDirty();
    setEditingIndex(null);
    if (index < itemKeysRef.current.length - 1) {
      const keys = [...itemKeysRef.current];
      [keys[index], keys[index + 1]] = [keys[index + 1] as string, keys[index] as string];
      itemKeysRef.current = keys;
    }
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1] as string, next[index] as string];
      return next;
    });
  }

  const candidatesForReference = allLists.filter((l) => l.id !== listId);
  const includedRefs = referencedListIds
    .map((id) => candidatesForReference.find((l) => l.id === id))
    .filter((l): l is PackList => l !== undefined);
  const excludedRefs = candidatesForReference
    .filter((l) => !referencedListIds.includes(l.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="edit-list-screen">
      <header className="edit-list-screen__header">
        <button
          type="button"
          className="btn btn--back edit-list-screen__back-btn"
          onClick={() => void handleBack()}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') void handleBack();
          }}
          aria-label="Back"
        >
          ‹
        </button>
        <h1 className="edit-list-screen__header-title">{isNew ? 'New List' : 'Edit List'}</h1>
        {saveStatus === 'saving' && <span className="edit-list-screen__saving-indicator">Saving…</span>}
        {saveStatus === 'saved' && <span className="edit-list-screen__saved-indicator">Saved</span>}
      </header>

      <main className="edit-list-screen__content">
        {error && <p className="edit-list-screen__error">{error}</p>}

        <section className="edit-list-screen__section">
          <label className="edit-list-screen__label" htmlFor="list-name">
            Name
          </label>
          <input
            id="list-name"
            className={`edit-list-screen__input${nameInvalid ? ' edit-list-screen__input--error' : ''}`}
            type="text"
            value={name}
            onChange={(e) => { markDirty(); setName(e.target.value); }}
            onBlur={() => setNameTouched(true)}
            placeholder="e.g. Winter Trip"
          />
        </section>

        {candidatesForReference.length > 0 && (
          <section className="edit-list-screen__section">
            <h2 className="edit-list-screen__label">Include other lists</h2>
            <ul className="edit-list-screen__ref-list">
              {includedRefs.map((l, index) => (
                <li key={l.id} className="edit-list-screen__ref-item edit-list-screen__ref-item--included">
                  <div className="edit-list-screen__move-btns">
                    <button
                      className="btn btn--icon edit-list-screen__move-btn"
                      onClick={() => handleMoveRefUp(index)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >▲</button>
                    <button
                      className="btn btn--icon edit-list-screen__move-btn"
                      onClick={() => handleMoveRefDown(index)}
                      disabled={index === includedRefs.length - 1}
                      aria-label="Move down"
                    >▼</button>
                  </div>
                  <label className="edit-list-screen__checkbox-label">
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => handleRemoveRef(l.id)}
                    />
                    {l.name}
                  </label>
                </li>
              ))}
              {excludedRefs.map((l) => (
                <li key={l.id} className="edit-list-screen__ref-item">
                  <label className="edit-list-screen__checkbox-label">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => handleAddRef(l.id)}
                    />
                    {l.name}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="edit-list-screen__section">
          <h2 className="edit-list-screen__label">Items</h2>
          <ul className="edit-list-screen__items">
            {items.map((item, index) => (
              <li
                key={itemKeysRef.current[index] ?? index}
                className="edit-list-screen__item"
              >
                <div className="edit-list-screen__move-btns">
                  <button
                    className="btn btn--icon edit-list-screen__move-btn"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    className="btn btn--icon edit-list-screen__move-btn"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === items.length - 1}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
                {editingIndex === index ? (
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="edit-list-screen__item-input edit-list-screen__item-input--editing"
                    type="text"
                    defaultValue={item}
                    onBlur={(e) => handleEditCommit(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setEditingIndex(null);
                    }}
                  />
                ) : (
                  <button
                    className="edit-list-screen__item-text"
                    onClick={() => setEditingIndex(index)}
                    aria-label={`Edit ${item}`}
                  >
                    {item}
                  </button>
                )}
                <button
                  className="btn btn--icon edit-list-screen__remove-btn"
                  onClick={() => handleRemoveItem(index)}
                  aria-label={`Remove ${item}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="edit-list-screen__add-row">
            <input
              ref={newItemRef}
              className="edit-list-screen__input"
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Add item…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddItem();
              }}
            />
            <button
              className="btn btn--primary edit-list-screen__add-btn"
              onClick={handleAddItem}
            >
              Add
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
