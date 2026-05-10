import { useEffect, useRef, useState } from 'react';
import {
  getAllPackLists,
  getPackList,
  savePackList,
  hasCircularReference,
} from '../db/packLists.js';
import type { PackList, Screen } from '../types/index.js';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

type SortableItemRowProps = {
  readonly itemKey: string;
  readonly item: string;
  readonly index: number;
  readonly isEditing: boolean;
  readonly onEditCommit: (index: number, value: string) => void;
  readonly onSetEditingIndex: (index: number | null) => void;
  readonly onRemove: (index: number) => void;
};

function SortableItemRow({ itemKey, item, index, isEditing, onEditCommit, onSetEditingIndex, onRemove }: SortableItemRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: itemKey });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? CSS.Transform.toString(transform) : undefined, transition, opacity: isDragging ? 0.4 : undefined }}
      className="edit-list-screen__item"
    >
      <span className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">⠿</span>
      {isEditing ? (
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="edit-list-screen__item-input edit-list-screen__item-input--editing"
          type="text"
          defaultValue={item}
          onBlur={(e) => onEditCommit(index, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') onSetEditingIndex(null);
          }}
        />
      ) : (
        <button
          className="edit-list-screen__item-text"
          onClick={() => onSetEditingIndex(index)}
          aria-label={`Edit ${item}`}
        >
          {item}
        </button>
      )}
      <button
        className="btn btn--icon edit-list-screen__remove-btn"
        onClick={() => onRemove(index)}
        aria-label={`Remove ${item}`}
      >
        ✕
      </button>
    </li>
  );
}

type SortableRefRowProps = {
  readonly list: PackList;
  readonly onRemove: (id: string) => void;
};

function SortableRefRow({ list, onRemove }: SortableRefRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? CSS.Transform.toString(transform) : undefined, transition, opacity: isDragging ? 0.4 : undefined }}
      className="edit-list-screen__ref-item edit-list-screen__ref-item--included"
    >
      <span className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">⠿</span>
      <label className="edit-list-screen__checkbox-label">
        <input
          type="checkbox"
          checked={true}
          onChange={() => onRemove(list.id)}
        />
        {list.name}
      </label>
    </li>
  );
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

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

  function handleItemsDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = itemKeysRef.current.indexOf(String(active.id));
    const newIndex = itemKeysRef.current.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    markDirty();
    setEditingIndex(null);
    itemKeysRef.current = arrayMove(itemKeysRef.current, oldIndex, newIndex);
    setItems((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  function handleRefsDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = referencedListIds.indexOf(String(active.id));
    const newIndex = referencedListIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    markDirty();
    setReferencedListIds((prev) => arrayMove(prev, oldIndex, newIndex));
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

        <section className="edit-list-screen__section">
          <h2 className="edit-list-screen__label">Items</h2>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemsDragEnd}>
            <SortableContext items={itemKeysRef.current} strategy={verticalListSortingStrategy}>
              <ul className="edit-list-screen__items">
                {items.map((item, index) => (
                  <SortableItemRow
                    key={itemKeysRef.current[index] ?? index}
                    itemKey={itemKeysRef.current[index] ?? String(index)}
                    item={item}
                    index={index}
                    isEditing={editingIndex === index}
                    onEditCommit={handleEditCommit}
                    onSetEditingIndex={setEditingIndex}
                    onRemove={handleRemoveItem}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

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

        {candidatesForReference.length > 0 && (
          <section className="edit-list-screen__section">
            <h2 className="edit-list-screen__label">Include other lists</h2>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRefsDragEnd}>
              <SortableContext items={referencedListIds} strategy={verticalListSortingStrategy}>
                <ul className="edit-list-screen__ref-list">
                  {includedRefs.map((l) => (
                    <SortableRefRow key={l.id} list={l} onRemove={handleRemoveRef} />
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
              </SortableContext>
            </DndContext>
          </section>
        )}
      </main>
    </div>
  );
}
