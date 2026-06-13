import { useSyncExternalStore } from 'react';
import { useSyncManager } from '../sync/SyncContext.js';
import type { Screen } from '../types/index.js';
import './SyncButton.css';

type Props = {
  readonly onNavigate: (screen: Screen) => void;
  readonly className?: string;
};

export default function SyncButton({ onNavigate, className = '' }: Props): React.ReactElement {
  const syncManager = useSyncManager();
  const syncPhase = useSyncExternalStore(
    (fn) => syncManager.subscribe(fn),
    () => syncManager.getPhase(),
  );

  const modifier = (() => {
    if (syncPhase === 'connected') return ' sync-btn--connected';
    if (syncPhase === 'disconnected' || syncPhase === 'error') return ' sync-btn--broken';
    if (syncPhase === 'idle') return '';
    return ' sync-btn--pairing';
  })();
  const spinning = syncPhase !== 'idle' && syncPhase !== 'connected' && syncPhase !== 'disconnected' && syncPhase !== 'error';

  return (
    <button
      type="button"
      className={`sync-btn${modifier}${className ? ` ${className}` : ''}`}
      onClick={() => onNavigate({ id: 'pair' })}
      aria-label="Sync"
    >
      <ChainIcon spinning={spinning} />
    </button>
  );
}

function ChainIcon({ spinning }: { readonly spinning: boolean }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="18"
      height="18"
      className={spinning ? 'sync-btn__spin' : undefined}
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
