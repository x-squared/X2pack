import { useEffect, useRef, useState } from 'react';
import { getAllPackLists, deletePackList, isDependedUpon, updatePackListSortOrders, savePackList, updatePackListMajor } from '../db/packLists.js';
import type { PackList, Screen } from '../types/index.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import DbLoadError from '../components/DbLoadError.js';
import { downloadPackLists, resolveImport } from '../utils/packListsIO.js';
import { useDbReload } from '../hooks/useDbReload.js';
import { isAnyPackListChange } from '../sync/dbVersion.js';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import '../components/ConfirmDialog.css';
import '../components/DbLoadError.css';
import './ListsScreen.css';

type Props = {
  readonly onNavigate: (screen: Screen) => void;
  readonly onBack: () => void;
};

type DialogState =
  | { kind: 'none' }
  | { kind: 'blocked'; listName: string }
  | { kind: 'confirm'; list: PackList }
  | { kind: 'info'; message: string; detail: string };

const PENDING_PACK_LIST_SAVE_KEY = 'x2pack-pending-pack-list-save';

type PendingPackListSave = {
  name: string;
  items: string[];
  referencedListIds: string[];
  existingId?: string;
};

function readPendingPackListSave(): string | null {
  const storage = globalThis.localStorage;
  if (!storage || typeof storage.getItem !== 'function') return null;
  return storage.getItem(PENDING_PACK_LIST_SAVE_KEY);
}

function clearPendingPackListSave(): void {
  const storage = globalThis.localStorage;
  if (!storage || typeof storage.removeItem !== 'function') return;
  storage.removeItem(PENDING_PACK_LIST_SAVE_KEY);
}

async function flushPendingPackListSave(): Promise<void> {
  const raw = readPendingPackListSave();
  if (!raw) return;
  try {
    const pending = JSON.parse(raw) as PendingPackListSave;
    if (!pending.name.trim()) {
      clearPendingPackListSave();
      return;
    }
    await Promise.race([
      savePackList(
        {
          name: pending.name,
          items: pending.items,
          referencedListIds: pending.referencedListIds,
        },
        pending.existingId,
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 1200)),
    ]);
    clearPendingPackListSave();
  } catch {
    // Keep pending payload for next retry.
  }
}

function sortedByOrder(lists: PackList[]): PackList[] {
  return lists.toSorted((a, b) => {
    const diff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return diff === 0 ? a.name.localeCompare(b.name) : diff;
  });
}

type SortableListRowProps = {
  readonly list: PackList;
  readonly onNavigate: (screen: Screen) => void;
  readonly onToggleMajor: (list: PackList) => void;
  readonly onDelete: (list: PackList) => void;
};

function SortableListRow({ list, onNavigate, onToggleMajor, onDelete }: SortableListRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? CSS.Transform.toString(transform) : undefined, transition, opacity: isDragging ? 0.4 : undefined }}
      className={`lists-screen__item${list.isMajor ? ' lists-screen__item--major' : ''}`}
    >
      <span className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">⠿</span>
      <button
        className="lists-screen__item-row"
        onClick={() => onNavigate({ id: 'edit-pack-list', listId: list.id })}
      >
        <div className="lists-screen__item-info">
          <span className="lists-screen__item-name">{list.name}</span>
          {(list.items.length > 0 || list.referencedListIds.length > 0) && (
            <span className="lists-screen__item-meta">
              {list.items.length > 0 &&
                `${list.items.length} item${list.items.length === 1 ? '' : 's'}`}
              {list.items.length > 0 && list.referencedListIds.length > 0 && ' · '}
              {list.referencedListIds.length > 0 &&
                `${list.referencedListIds.length} ref${list.referencedListIds.length === 1 ? '' : 's'}`}
            </span>
          )}
        </div>
        <span className="lists-screen__chevron" aria-hidden>›</span>
      </button>
      <button
        className={`lists-screen__btn-major${list.isMajor ? ' lists-screen__btn-major--active' : ''}`}
        onClick={() => onToggleMajor(list)}
        aria-label={list.isMajor ? `Unmark ${list.name} as major` : `Mark ${list.name} as major`}
        aria-pressed={list.isMajor ?? false}
      >
        {list.isMajor ? '★' : '☆'}
      </button>
      <button
        className="lists-screen__btn-delete"
        onClick={() => onDelete(list)}
        aria-label={`Delete ${list.name}`}
      >
        ✕
      </button>
    </li>
  );
}

export default function ListsScreen({ onNavigate, onBack }: Props): React.ReactElement {
  const [lists, setLists] = useState<PackList[]>([]);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { loadError, retry } = useDbReload(() => loadLists(), [], {
    isRelevant: isAnyPackListChange,
  });

  async function loadLists(): Promise<void> {
    await flushPendingPackListSave();
    const all = await getAllPackLists();
    setLists(sortedByOrder(all));
  }

  function handleDelete(list: PackList): void {
    if (isDependedUpon(list.id, lists)) {
      setDialog({ kind: 'blocked', listName: list.name });
      return;
    }
    setDialog({ kind: 'confirm', list });
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (dialog.kind !== 'confirm') return;
    await deletePackList(dialog.list.id);
    setDialog({ kind: 'none' });
    await loadLists();
  }

  async function handleToggleMajor(list: PackList): Promise<void> {
    const isMajor = !list.isMajor;
    await updatePackListMajor(list.id, isMajor);
    setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, isMajor } : l)));
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = lists.findIndex((l) => l.id === active.id);
    const newIndex = lists.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(lists, oldIndex, newIndex);
    setLists(reordered);
    await updatePackListSortOrders(reordered.map((l, i) => ({ id: l.id, sortOrder: i * 10 })));
  }

  async function handleDownload(): Promise<void> {
    await downloadPackLists(lists);
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    let text: string;
    try {
      text = await file.text();
    } catch {
      setDialog({ kind: 'info', message: 'Could not read file', detail: 'The selected file could not be read.' });
      return;
    }

    const existing = await getAllPackLists();
    const entries = resolveImport(text, existing);

    if (entries.length === 0) {
      setDialog({ kind: 'info', message: 'No lists found', detail: 'The file did not contain any valid pack lists.' });
      return;
    }

    try {
      for (const { data, id } of entries) {
        await savePackList(data, id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setDialog({ kind: 'info', message: 'Import failed', detail: `Could not save: ${message}` });
      return;
    }

    await loadLists();
    setDialog({
      kind: 'info',
      message: `Imported ${entries.length} list${entries.length === 1 ? '' : 's'}`,
      detail: 'Existing lists with matching names were updated. New lists were added.',
    });
  }

  return (
    <div className="lists-screen">
      <header className="lists-screen__header">
        <button
          className="btn btn--back lists-screen__back-btn"
          onClick={onBack}
          aria-label="Back"
        >
          ‹
        </button>
        <h1 className="lists-screen__header-title">Pack Lists</h1>
        <button
          className="btn lists-screen__add-btn"
          onClick={() => onNavigate({ id: 'edit-pack-list', listId: null })}
          aria-label="New list"
        >
          <img src={`${import.meta.env.BASE_URL}plus.png`} alt="" className="lists-screen__add-icon" />
        </button>
        <button
          className="btn lists-screen__add-btn"
          onClick={() => void handleDownload()}
          aria-label="Download lists"
        >
          <img src={`${import.meta.env.BASE_URL}download.png`} alt="" className="lists-screen__add-icon" />
        </button>
        <button
          className="btn lists-screen__add-btn"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload lists"
        >
          <img src={`${import.meta.env.BASE_URL}upload.png`} alt="" className="lists-screen__add-icon" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown"
          className="lists-screen__file-input"
          onChange={(e) => void handleUpload(e)}
        />
      </header>

      <main className="lists-screen__content">
        {loadError ? (
          <DbLoadError onRetry={retry} />
        ) : lists.length === 0 ? (
          <p className="lists-screen__empty">
            No lists yet. Tap <strong>+</strong> to create your first pack list.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
            <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <ul className="lists-screen__list">
                {lists.map((list) => (
                  <SortableListRow
                    key={list.id}
                    list={list}
                    onNavigate={onNavigate}
                    onToggleMajor={handleToggleMajor}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </main>

      {dialog.kind === 'blocked' && (
        <ConfirmDialog
          message={`"${dialog.listName}" cannot be deleted`}
          detail="It is referenced by other lists. Remove those references first."
          confirmLabel="OK"
          cancelLabel={null}
          onConfirm={() => setDialog({ kind: 'none' })}
        />
      )}

      {dialog.kind === 'confirm' && (
        <ConfirmDialog
          message={`Delete "${dialog.list.name}"?`}
          detail="This cannot be undone."
          confirmLabel="Delete"
          danger={true}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDialog({ kind: 'none' })}
        />
      )}

      {dialog.kind === 'info' && (
        <ConfirmDialog
          message={dialog.message}
          detail={dialog.detail}
          confirmLabel="OK"
          cancelLabel={null}
          onConfirm={() => setDialog({ kind: 'none' })}
        />
      )}
    </div>
  );
}
