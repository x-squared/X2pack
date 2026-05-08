import { useEffect, useState } from 'react';
import { getAllPackLists } from '../db/packLists.js';
import { createPacking } from '../db/packings.js';
import type { PackList, Screen } from '../types/index.js';
import './NewPackingScreen.css';

type Props = {
  readonly onNavigate: (screen: Screen) => void;
};

export default function NewPackingScreen({ onNavigate }: Props): React.ReactElement {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [allLists, setAllLists] = useState<PackList[]>([]);
  const [error, setError] = useState<string | null>(null);

  const nameInvalid = nameTouched && !name.trim();
  const datesValid = !!fromDate && !!toDate && toDate >= fromDate;
  const tripDays = datesValid
    ? Math.round((new Date(toDate + 'T00:00:00').getTime() - new Date(fromDate + 'T00:00:00').getTime()) / 86400000)
    : null;
  const canStart = !!name.trim() && selectedListIds.length > 0 && datesValid;

  useEffect(() => {
    void getAllPackLists().then((lists) =>
      setAllLists(
        lists.toSorted((a, b) => {
          const diff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          return diff === 0 ? a.name.localeCompare(b.name) : diff;
        }),
      ),
    );
  }, []);

  function handleToggle(id: string): void {
    setSelectedListIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function handleMoveUp(index: number): void {
    if (index === 0) return;
    setSelectedListIds((prev) => {
      const next = [...prev];
      const tmp = next[index - 1] as string;
      next[index - 1] = next[index] as string;
      next[index] = tmp;
      return next;
    });
  }

  function handleMoveDown(index: number): void {
    setSelectedListIds((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const tmp = next[index] as string;
      next[index] = next[index + 1] as string;
      next[index + 1] = tmp;
      return next;
    });
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
                <ul className="new-packing-screen__list">
                  {selectedLists.map((l, index) => (
                    <li key={l.id} className="new-packing-screen__list-item new-packing-screen__list-item--selected">
                      <div className="new-packing-screen__move-btns">
                        <button
                          className="btn btn--icon new-packing-screen__move-btn"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          aria-label="Move up"
                        >▲</button>
                        <button
                          className="btn btn--icon new-packing-screen__move-btn"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === selectedLists.length - 1}
                          aria-label="Move down"
                        >▼</button>
                      </div>
                      <label className="new-packing-screen__checkbox-label">
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => handleToggle(l.id)}
                        />
                        <span>{l.name}</span>
                      </label>
                    </li>
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
      </main>
    </div>
  );
}
