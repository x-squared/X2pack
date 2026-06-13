import { useEffect, useState } from 'react';
import { getAllPackings, deletePacking } from '../db/packings.js';
import type { Packing, Screen } from '../types/index.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import HelpDialog from '../components/HelpDialog.js';
import PwaInstallBanner from '../components/PwaInstallBanner.js';
import WhatsNewDialog from '../components/WhatsNewDialog.js';
import SyncButton from '../components/SyncButton.js';
import DbLoadError from '../components/DbLoadError.js';
import { getAllPackLists, savePackList } from '../db/packLists.js';
import { resolveImport } from '../utils/packListsIO.js';
import { useDbReload } from '../hooks/useDbReload.js';
import { isAnyPackingChange } from '../sync/dbVersion.js';
import exampleListsMd from '../example-lists.md?raw';
import '../components/ConfirmDialog.css';
import '../components/SyncButton.css';
import '../components/DbLoadError.css';
import './HomeScreen.css';

type Props = {
  readonly onNavigate: (screen: Screen) => void;
};

const APP_VERSION = __APP_VERSION__;
const BUILD_TIME = __BUILD_TIME__;

export default function HomeScreen({ onNavigate }: Props): React.ReactElement {
  const [packings, setPackings] = useState<Packing[]>([]);
  const [discardId, setDiscardId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  const { loadError, retry } = useDbReload(() => loadPackings(), [], {
    isRelevant: isAnyPackingChange,
  });

  useEffect(() => {
    if (!showInfo) return;
    function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') setShowInfo(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showInfo]);

  async function loadPackings(): Promise<void> {
    setPackings(await getAllPackings());
  }

  async function handleLoadExamples(): Promise<void> {
    const existing = await getAllPackLists();
    const entries = resolveImport(exampleListsMd, existing);
    for (const { data, id } of entries) {
      await savePackList(data, id);
    }
  }

  async function handleDiscardConfirm(): Promise<void> {
    if (!discardId) return;
    await deletePacking(discardId);
    setDiscardId(null);
    await loadPackings();
  }

  const activePackings = packings
    .filter((p) => p.status === 'active')
    .toSorted((a, b) => a.fromDate.localeCompare(b.fromDate));
  const donePackings = packings
    .filter((p) => p.status === 'done')
    .toSorted((a, b) => b.fromDate.localeCompare(a.fromDate));

  return (
    <div className="home-screen">
      <header className="home-screen__header">
        <h1 className="home-screen__header-title">X2pack</h1>
        <button className="home-screen__info-btn" onClick={() => setShowHelp(true)} aria-label="Help">
          <span className="home-screen__help-icon" aria-hidden="true">?</span>
        </button>
        <SyncButton onNavigate={onNavigate} className="home-screen__info-btn" />
        <button className="home-screen__info-btn" onClick={() => setShowInfo(true)} aria-label="App info">
          <span className="home-screen__help-icon" aria-hidden="true">i</span>
        </button>
      </header>

      <main className="home-screen__content">
        {loadError ? (
          <DbLoadError onRetry={retry} />
        ) : (
        <>
        <div className="home-screen__actions">
          <button
            className="btn btn--primary home-screen__action-btn"
            onClick={() => onNavigate({ id: 'new-packing' })}
          >
            <img src={`${import.meta.env.BASE_URL}pack.png`} alt="" className="home-screen__action-icon" />
            <span>Pack</span>
          </button>
          <button
            className="btn btn--ghost home-screen__action-btn"
            onClick={() => onNavigate({ id: 'lists' })}
          >
            <img src={`${import.meta.env.BASE_URL}lists.png`} alt="" className="home-screen__action-icon" />
            <span>Lists</span>
          </button>
        </div>

        <PwaInstallBanner />

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
        </>
        )}
      </main>

      {showHelp && <HelpDialog onDismiss={() => setShowHelp(false)} onLoadExamples={handleLoadExamples} />}

      {showInfo && (
        <div className="dialog-overlay">
          <dialog className="dialog info-dialog" open>
            <p className="dialog__message">X2pack</p>
            <p className="dialog__detail">Travel pack-list manager</p>
            <dl className="info-dialog__dl">
              <dt>Version</dt><dd>{APP_VERSION}</dd>
              <dt>Built</dt><dd>{new Date(BUILD_TIME).toLocaleString()}</dd>
            </dl>
            <p className="info-dialog__note">Tested on iPhone. Other platforms may work but are not officially supported.</p>
            <div className="dialog__actions">
              <button className="btn btn--ghost dialog__btn" onClick={() => { setShowInfo(false); setShowChangelog(true); }}>Changelog</button>
              <button className="btn btn--primary dialog__btn" onClick={() => setShowInfo(false)}>Close</button>
            </div>
          </dialog>
        </div>
      )}

      {showChangelog && <WhatsNewDialog defaultShowAll onDismiss={() => setShowChangelog(false)} />}

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
  readonly packing: Packing;
  readonly onOpen: () => void;
  readonly onDiscard: () => void;
};

function formatDateRange(from: string, to: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

function PackingCard({ packing, onOpen, onDiscard }: PackingCardProps): React.ReactElement {
  const total = packing.items.length;
  const done = packing.items.filter((i) => i.status !== 'pending').length;
  const isDone = packing.status === 'done';

  return (
    <div className={`card packing-card ${isDone ? 'packing-card--done' : ''}`}>
      <div className="packing-card__header">
        <div className="packing-card__info">
          <span className="packing-card__name">{packing.name}</span>
          <span className="packing-card__date">{formatDateRange(packing.fromDate, packing.toDate)}</span>
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
