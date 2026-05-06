import { useEffect, useState } from 'react';
import { getAllPackings, deletePacking } from '../db/packings.js';
import type { Packing, Screen } from '../types/index.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import '../components/ConfirmDialog.css';
import './HomeScreen.css';

type Props = {
  onNavigate: (screen: Screen) => void;
};

export default function HomeScreen({ onNavigate }: Props): React.ReactElement {
  const [packings, setPackings] = useState<Packing[]>([]);
  const [discardId, setDiscardId] = useState<string | null>(null);

  useEffect(() => {
    void loadPackings();
  }, []);

  async function loadPackings(): Promise<void> {
    const all = await getAllPackings()
    const sortedByCreatedAt = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setPackings(sortedByCreatedAt);
  }

  async function handleDiscardConfirm(): Promise<void> {
    if (!discardId) return;
    await deletePacking(discardId);
    setDiscardId(null);
    await loadPackings();
  }

  const activePackings = packings.filter((p) => p.status === 'active');
  const donePackings = packings.filter((p) => p.status === 'done');

  return (
    <div className="home-screen">
      <header className="home-screen__header">
        <h1 className="home-screen__header-title">X2pack</h1>
      </header>

      <main className="home-screen__content">
        <div className="home-screen__actions">
          <button
            className="btn btn--primary home-screen__action-btn"
            onClick={() => onNavigate({ id: 'new-packing' })}
          >
            <img src="/pack.png" alt="" className="home-screen__action-icon" />
            <span>Pack</span>
          </button>
          <button
            className="btn btn--ghost home-screen__action-btn"
            onClick={() => onNavigate({ id: 'lists' })}
          >
            <img src="/lists.png" alt="" className="home-screen__action-icon" />
            <span>Lists</span>
          </button>
        </div>

        {activePackings.length > 0 && (
          <section className="home-screen__section">
            <h2 className="home-screen__section-title">Active</h2>
            {activePackings.map((p) => (
              <PackingCard
                key={p.id}
                packing={p}
                onOpen={() => onNavigate({ id: 'packing', packingId: p.id })}
                onDiscard={() => setDiscardId(p.id)}
              />
            ))}
          </section>
        )}

        {donePackings.length > 0 && (
          <section className="home-screen__section">
            <h2 className="home-screen__section-title">Done</h2>
            {donePackings.map((p) => (
              <PackingCard
                key={p.id}
                packing={p}
                onOpen={() => onNavigate({ id: 'packing', packingId: p.id })}
                onDiscard={() => setDiscardId(p.id)}
              />
            ))}
          </section>
        )}

        {packings.length === 0 && (
          <p className="home-screen__empty">
            No packings yet. Tap <strong>Pack</strong> to start one, or <strong>Lists</strong> to
            set up your pack lists.
          </p>
        )}
      </main>

      {discardId != null && (
        <ConfirmDialog
          message="Discard this packing?"
          detail="This cannot be undone."
          confirmLabel="Discard"
          danger={true}
          onConfirm={() => void handleDiscardConfirm()}
          onCancel={() => setDiscardId(null)}
        />
      )}
    </div>
  );
}

type PackingCardProps = {
  packing: Packing;
  onOpen: () => void;
  onDiscard: () => void;
};

function PackingCard({ packing, onOpen, onDiscard }: PackingCardProps): React.ReactElement {
  const total = packing.items.length;
  const done = packing.items.filter((i) => i.status !== 'pending').length;
  const isDone = packing.status === 'done';

  return (
    <div className={`card packing-card ${isDone ? 'packing-card--done' : ''}`}>
      <div className="packing-card__header">
        <div className="packing-card__info">
          <span className="packing-card__name">{packing.name}</span>
          <span className="packing-card__date">{packing.date}</span>
        </div>
        {isDone ? (
          <span className="packing-card__badge packing-card__badge--done">✓ Done</span>
        ) : (
          <span className="packing-card__badge">
            {done}/{total}
          </span>
        )}
      </div>
      {!isDone && (
        <div className="packing-card__progress-bar">
          <div
            className="packing-card__progress-fill"
            style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
          />
        </div>
      )}
      <div className="packing-card__actions">
        <button className="btn btn--primary packing-card__btn" onClick={onOpen}>
          {isDone ? 'View' : 'Continue'}
        </button>
        <button className="btn btn--ghost packing-card__btn" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
