import './DbLoadError.css';

type Props = {
  readonly onRetry: () => void;
  readonly className?: string;
};

/** Shown when a screen fails to load data from IndexedDB. */
export default function DbLoadError({ onRetry, className = '' }: Props): React.ReactElement {
  return (
    <div className={`db-load-error${className ? ` ${className}` : ''}`} role="alert">
      <p className="db-load-error__message">Couldn&apos;t load data. Your lists are still saved on this device.</p>
      <button type="button" className="btn btn--primary db-load-error__retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
