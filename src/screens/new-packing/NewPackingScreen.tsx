import { useState } from 'react';
import { getAllPackLists } from '../../db/packLists.js';
import { createPacking } from '../../db/packings.js';
import type { PackList, Screen } from '../../types/index.js';
import DbLoadError from '../../components/DbLoadError.js';
import { useDbReload } from '../../hooks/useDbReload.js';
import { isAnyPackListChange } from '../../sync/dbVersion.js';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './NewPackingScreen.css';
import '../../components/DbLoadError.css';

type Props = {
  readonly onNavigate: (screen: Screen) => void;
};

type SortableSelectedItemProps = {
  readonly list: PackList;
  readonly onToggle: (id: string) => void;
};

function SortableSelectedItem({ list, onToggle }: SortableSelectedItemProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? CSS.Transform.toString(transform) : undefined, transition, opacity: isDragging ? 0.4 : undefined }}
      className="new-packing-screen__list-item new-packing-screen__list-item--selected"
    >
      <span className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">⠿</span>
      <label className="new-packing-screen__checkbox-label">
        <input
          type="checkbox"
          checked={true}
          onChange={() => onToggle(list.id)}
        />
        <span>{list.name}</span>
      </label>
    </li>
  );
}

export default function NewPackingScreen({ onNavigate }: Props): React.ReactElement {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [allLists, setAllLists] = useState<PackList[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const nameInvalid = nameTouched && !name.trim();
  const datesValid = !!fromDate && !!toDate && toDate >= fromDate;
  const tripDays = datesValid
    ? Math.round((new Date(toDate + 'T00:00:00').getTime() - new Date(fromDate + 'T00:00:00').getTime()) / 86400000)
    : null;
  const canStart = !!name.trim() && selectedListIds.length > 0 && datesValid;

  const { loadError, retry } = useDbReload(async () => {
    const lists = await getAllPackLists();
    setAllLists(
      lists.toSorted((a, b) => {
        const diff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        return diff === 0 ? a.name.localeCompare(b.name) : diff;
      }),
    );
  }, [], { isRelevant: isAnyPackListChange });

  function handleToggle(id: string): void {
    setSelectedListIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = selectedListIds.indexOf(String(active.id));
    const newIndex = selectedListIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setSelectedListIds((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  async function handleStart(): Promise<void> {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please give this packing a name.');
      return;
    }
    if (selectedListIds.length === 0) {
      setError('Please select at least one pack list.');
      return;
    }
    const packing = await createPacking(trimmedName, fromDate, toDate, selectedListIds);
    onNavigate({ id: 'packing', packingId: packing.id });
  }

  return (
    <div className="new-packing-screen">
      <header className="new-packing-screen__header">
        <button
          className="btn btn--back"
          onClick={() => onNavigate({ id: 'home' })}
          aria-label="Back"
        >
          ‹
        </button>
        <h1 className="new-packing-screen__header-title">New Packing</h1>
      </header>

      <main className="new-packing-screen__content">
        {loadError ? (
          <DbLoadError onRetry={retry} />
        ) : (
        <>
        {error && <p className="new-packing-screen__error">{error}</p>}

        <section className="new-packing-screen__section">
          <label className="new-packing-screen__label" htmlFor="packing-name">
            Name
          </label>
          <input
            id="packing-name"
            className={`new-packing-screen__input${nameInvalid ? ' new-packing-screen__input--error' : ''}`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            placeholder="e.g. Barcelona trip"
          />
        </section>

        <section className="new-packing-screen__section">
          <span className="new-packing-screen__label">Dates</span>
          <div className="new-packing-screen__date-row">
            <input
              className="new-packing-screen__input new-packing-screen__date-input"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                if (toDate && e.target.value > toDate) setToDate(e.target.value);
              }}
            />
            <span className="new-packing-screen__date-sep">→</span>
            <input
              className={`new-packing-screen__input new-packing-screen__date-input${toDate && toDate < fromDate ? ' new-packing-screen__input--error' : ''}`}
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          {tripDays !== null && (
            <p className="new-packing-screen__date-hint">
              You are packing for a total of {tripDays} {tripDays === 1 ? 'day' : 'days'}.
            </p>
          )}
          <p className="new-packing-screen__hint new-packing-screen__lists-intro">
            Choose one or several of the lists below to pack. Once you start a packing, changing lists will not change the packing. But you can add items to a packing at any time.
          </p>
          <button
            className="btn btn--primary new-packing-screen__start-btn"
            onClick={() => void handleStart()}
            disabled={!canStart}
          >
            Start Packing
          </button>
        </section>

        <section className="new-packing-screen__section">
          <h2 className="new-packing-screen__label">Pack lists</h2>
          {allLists.length === 0 ? (
            <p className="new-packing-screen__hint">
              No lists yet.{' '}
              <button
                className="new-packing-screen__link"
                onClick={() => onNavigate({ id: 'lists' })}
              >
                Create one first.
              </button>
            </p>
          ) : (() => {
              const selectedLists = selectedListIds
                .map((id) => allLists.find((l) => l.id === id))
                .filter((l): l is PackList => l !== undefined);
              const unselectedLists = allLists
                .filter((l) => !selectedListIds.includes(l.id))
                .toSorted((a, b) => {
                  if (a.isMajor === b.isMajor) return 0;
                  return a.isMajor ? -1 : 1;
                });
              return (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={selectedListIds} strategy={verticalListSortingStrategy}>
                    <ul className="new-packing-screen__list">
                      {selectedLists.map((l) => (
                        <SortableSelectedItem key={l.id} list={l} onToggle={handleToggle} />
                      ))}
                      {unselectedLists.map((l) => (
                        <li key={l.id} className={`new-packing-screen__list-item${l.isMajor ? ' new-packing-screen__list-item--major' : ''}`}>
                          <label className="new-packing-screen__checkbox-label">
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => handleToggle(l.id)}
                            />
                            <span>{l.isMajor ? <><span className="new-packing-screen__major-star" aria-hidden>★</span>{l.name}</> : l.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              );
            })()}
        </section>

        <button
          className="btn btn--primary new-packing-screen__start-btn"
          onClick={() => void handleStart()}
          disabled={!canStart}
        >
          Start Packing
        </button>
        </>
        )}
      </main>
    </div>
  );
}
