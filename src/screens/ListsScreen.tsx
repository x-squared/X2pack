import { useEffect, useRef, useState } from 'react';
import { getAllPackLists, deletePackList, isDependedUpon, updatePackListSortOrders, savePackList } from '../db/packLists.js';
import type { PackList, Screen } from '../types/index.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import { downloadPackLists, resolveImport } from '../utils/packListsIO.js';
import '../components/ConfirmDialog.css';
import './ListsScreen.css';

type Props = {
  readonly onNavigate: (screen: Screen) => void;
};

type DialogState =
  | { kind: 'none' }
  | { kind: 'blocked'; listName: string }
  | { kind: 'confirm'; list: PackList }
  | { kind: 'info'; message: string; detail: string };

function sortedByOrder(lists: PackList[]): PackList[] {
  return lists.toSorted((a, b) => {
    const diff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return diff === 0 ? a.name.localeCompare(b.name) : diff;
  });
}

export default function ListsScreen({ onNavigate }: Props): React.ReactElement {
  const [lists, setLists] = useState<PackList[]>([]);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadLists();
  }, []);

  async function loadLists(): Promise<void> {
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

  async function handleMove(index: number, direction: 'up' | 'down'): Promise<void> {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= lists.length) return;
    const reordered = [...lists];
    const tmp = reordered[index]!;
    reordered[index] = reordered[target]!;
    reordered[target] = tmp;
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

    for (const { data, id } of entries) {
      await savePackList(data, id);
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
          onClick={() => onNavigate({ id: 'home' })}
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
        {lists.length === 0 ? (
          <p className="lists-screen__empty">
            No lists yet. Tap <strong>+</strong> to create your first pack list.
          </p>
        ) : (
          <ul className="lists-screen__list">
            {lists.map((list, index) => (
              <li key={list.id} className="lists-screen__item">
                <div className="lists-screen__move-btns">
                  <button
                    className="btn btn--icon lists-screen__move-btn"
                    onClick={() => void handleMove(index, 'up')}
                    disabled={index === 0}
                    aria-label="Move up"
                  >▲</button>
                  <button
                    className="btn btn--icon lists-screen__move-btn"
                    onClick={() => void handleMove(index, 'down')}
                    disabled={index === lists.length - 1}
                    aria-label="Move down"
                  >▼</button>
                </div>
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
                  className="lists-screen__btn-delete"
                  onClick={() => handleDelete(list)}
                  aria-label={`Delete ${list.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
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
