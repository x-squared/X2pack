import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import helpMarkdown from '../help.md?raw';
import './HelpDialog.css';

const LOAD_EXAMPLES_MARKER = '<!-- LOAD_EXAMPLES_BUTTON -->';

export function renderHelpContent(markdown: string): string {
  const end = markdown.indexOf(LOAD_EXAMPLES_MARKER);
  const staticMd = (end === -1 ? markdown : markdown.slice(0, end)).trimEnd();
  return marked.parse(staticMd, { async: false });
}

type Props = {
  readonly onDismiss: () => void;
  readonly onLoadExamples: () => Promise<void>;
};

export default function HelpDialog({ onDismiss, onLoadExamples }: Props): React.ReactElement {
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const helpHtml = useMemo(() => renderHelpContent(helpMarkdown), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onDismiss();
    }
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

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
    <div className="help-overlay">
      <button type="button" className="help-overlay__backdrop" aria-label="Close help" onClick={onDismiss} />
      <dialog className="help" open aria-label="Help">
        <div className="help__header">
          <span className="help__title">How X2pack works</span>
          <button className="btn btn--icon help__close" onClick={onDismiss} aria-label="Close">✕</button>
        </div>

        <div className="help__body">
          <div className="help__content" dangerouslySetInnerHTML={{ __html: helpHtml }} />
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
        </div>

        <div className="help__footer">
          <button className="btn btn--primary help__got-it" onClick={onDismiss}>Got it</button>
        </div>
      </dialog>
    </div>
  );
}
