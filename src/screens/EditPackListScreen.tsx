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
  listId: string | null;
  onNavigate: (screen: Screen) => void;
};

export default function EditPackListScreen({
  listId,
  onNavigate,
}: Props): React.ReactElement {
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [referencedListIds, setReferencedListIds] = useState<string[]>([]);
  const [allLists, setAllLists] = useState<PackList[]>([]);
  const [error, setError] = useState<string | null>(null);
  const newItemRef = useRef<HTMLInputElement>(null);

  const nameInvalid = nameTouched && !name.trim();
  const canSave = !!name.trim();

  const isNew = listId === null;

  useEffect(() => {
    void load();
  }, [listId]);

  async function load(): Promise<void> {
    const all = await getAllPackLists();
    setAllLists(all);
    if (listId) {
      const existing = await getPackList(listId);
      if (existing) {
        setName(existing.name);
        setItems([...existing.items]);
        setReferencedListIds([...existing.referencedListIds]);
      }
    }
  }

  function handleAddItem(): void {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    setItems((prev) => [...prev, trimmed]);
    setNewItemText('');
    newItemRef.current?.focus();
  }

  function handleItemChange(index: number, value: string): void {
    setItems((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  function handleRemoveItem(index: number): void {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setEditingIndex(null);
  }

  function handleEditCommit(index: number, value: string): void {
    const trimmed = value.trim();
    if (trimmed) handleItemChange(index, trimmed);
    setEditingIndex(null);
  }

  function handleAddRef(id: string): void {
    setReferencedListIds((prev) => [...prev, id]);
  }

  function handleRemoveRef(id: string): void {
    setReferencedListIds((prev) => prev.filter((r) => r !== id));
  }

  function handleMoveRefUp(index: number): void {
    if (index === 0) return;
    setReferencedListIds((prev) => {
      const next = [...prev];
      const tmp = next[index - 1] as string;
      next[index - 1] = next[index] as string;
      next[index] = tmp;
      return next;
    });
  }

  function handleMoveRefDown(index: number): void {
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
    setEditingIndex(null);
    setItems((prev) => {
      const next = [...prev];
      const tmp = next[index - 1] as string;
      next[index - 1] = next[index] as string;
      next[index] = tmp;
      return next;
    });
  }

  function handleMoveDown(index: number): void {
    setEditingIndex(null);
    setItems((prev) => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      const tmp = next[index] as string;
      next[index] = next[index + 1] as string;
      next[index + 1] = tmp;
      return next;
    });
  }

  async function handleSave(): Promise<void> {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a name.');
      return;
    }

    // Use a deterministic placeholder for new lists to avoid runtime dependency
    // on crypto.randomUUID() during validation.
    const effectiveId = listId ?? '__new-list__';
    if (
      hasCircularReference(effectiveId, referencedListIds, allLists)
    ) {
      setError('These references create a circular dependency. Please remove one.');
      return;
    }

    try {
      await savePackList(
        { name: trimmedName, items, referencedListIds },
        listId ?? undefined,
      );
      onNavigate({ id: 'lists' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not save list. ${message}`);
    }
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
          className="btn btn--back"
          onClick={() => onNavigate({ id: 'lists' })}
          aria-label="Back"
        >
          ‹
        </button>
        <h1 className="edit-list-screen__header-title">{isNew ? 'New List' : 'Edit List'}</h1>
        <button
          className="btn btn--primary edit-list-screen__save-btn"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          Save
        </button>
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
            onChange={(e) => setName(e.target.value)}
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
                key={index}
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
