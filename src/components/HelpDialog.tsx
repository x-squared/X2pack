import { useState } from 'react';
import './HelpDialog.css';

type Props = {
  readonly onDismiss: () => void;
  readonly onLoadExamples: () => Promise<void>;
};

export default function HelpDialog({ onDismiss, onLoadExamples }: Props): React.ReactElement {
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  function handleOverlayClick(e: React.MouseEvent): void {
    if (e.target === e.currentTarget) onDismiss();
  }

  function handleOverlayKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') onDismiss();
  }

  async function handleLoadExamples(): Promise<void> {
    setLoadState('loading');
    try {
      await onLoadExamples();
      setLoadState('done');
    } catch {
      setLoadState('error');
    }
  }

  return (
    <div className="help-overlay" onClick={handleOverlayClick}>
      <dialog className="help" open aria-label="Help" onKeyDown={handleOverlayKeyDown}>
        <div className="help__header">
          <span className="help__title">How X2pack works</span>
          <button className="btn btn--icon help__close" onClick={onDismiss} aria-label="Close">✕</button>
        </div>

        <div className="help__body">

          <section className="help__section">
            <h2 className="help__heading">Lists and packing</h2>
            <p>
              <strong>Lists</strong> are your reusable checklists — clothes, toiletries, gear.
              Build them once, reuse them every trip.
            </p>
            <p>
              <strong>Pack</strong> starts a new trip. You choose which lists to include and
              X2pack assembles everything into one checklist. Check off items as you pack.
            </p>
          </section>

          <section className="help__section">
            <h2 className="help__heading">Adding to a list</h2>
            <p>
              Go to <strong>Lists</strong> and tap <strong>+</strong> to create a new list, or tap
              an existing one to edit it. Add one item per line. Include the quantity in the
              name — <em>Socks ×3</em>, <em>T-shirt ×2</em>.
            </p>
            <p>
              Tap <strong>★</strong> next to a list to mark it as major — major lists appear
              first when you start a new packing. Drag the handle to reorder items or lists.
            </p>
          </section>

          <section className="help__section">
            <h2 className="help__heading">Structuring your lists</h2>
            <p>
              Keep each list focused on one area. For a larger trip, create a main list and
              add smaller sub-lists inside it — one per category.
            </p>
            <div className="help__example">
              <div className="help__example-row help__example-row--main">Weekend trip</div>
              <div className="help__example-row help__example-row--sub">↳ Clothes — T-shirt ×3, Jeans, Socks ×4</div>
              <div className="help__example-row help__example-row--sub">↳ Toiletries — Toothbrush, Shampoo</div>
              <div className="help__example-row help__example-row--sub">↳ Electronics — Charger, Earbuds</div>
            </div>
          </section>

          <section className="help__section">
            <h2 className="help__heading">During a packing</h2>
            <p>Tap an item to cycle its state:</p>
            <ul className="help__list">
              <li><em>○ pending</em> → <em>✓ packed</em> → <em>✕ skipped</em> → <em>— not used</em></li>
            </ul>
            <p>
              Tap the <strong>counter</strong> at the top to switch between showing all items
              and showing only open (pending) items — useful once most things are packed.
            </p>
            <p>
              Tap the <strong>trip name</strong> to rename it. Add last-minute items in
              the <strong>Add item</strong> field at the bottom.
            </p>
          </section>

          <section className="help__section">
            <h2 className="help__heading">Import and export</h2>
            <p>
              In the <strong>Lists</strong> screen, tap the <strong>↓ download</strong> icon to
              export all your lists as a <em>.md</em> file. Tap
              the <strong>↑ upload</strong> icon to import from a file — lists with matching
              names are updated, new ones are added.
            </p>
            <p>
              Export occasionally as a backup. Your data lives in your browser and is not
              synced to the cloud.
            </p>
          </section>

          <section className="help__section">
            <h2 className="help__heading">Beyond travel</h2>
            <p>X2pack works for any kind of checklist:</p>
            <ul className="help__list">
              <li>Shopping lists — one list per store</li>
              <li>Moving house — contents per box or room</li>
              <li>Event prep — gear, food, logistics</li>
              <li>Camping or day-hike kit</li>
            </ul>
          </section>

          <section className="help__section">
            <h2 className="help__heading">Example lists</h2>
            <p>
              Load four ready-made lists to get started: <em>Clothes</em>, <em>Utilities</em>,{' '}
              <em>Travel documents</em>, and a <em>Full packlist</em> that combines all three.
              Existing lists with the same name will be updated.
            </p>
            <button
              className="btn btn--ghost help__load-btn"
              onClick={() => void handleLoadExamples()}
              disabled={loadState === 'loading' || loadState === 'done'}
            >
              {loadState === 'idle' && 'Load example lists'}
              {loadState === 'loading' && 'Loading…'}
              {loadState === 'done' && '✓ Loaded'}
              {loadState === 'error' && 'Failed — try again'}
            </button>
          </section>

        </div>

        <div className="help__footer">
          <button className="btn btn--primary help__got-it" onClick={onDismiss}>Got it</button>
        </div>
      </dialog>
    </div>
  );
}
