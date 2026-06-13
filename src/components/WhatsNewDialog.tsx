import { useEffect, useState } from 'react';
import { marked } from 'marked';
import changelog from '../changelog.md?raw';
import './WhatsNewDialog.css';

const STORAGE_KEY = 'lastSeenVersion';

export function shouldShowWhatsNew(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== __APP_VERSION__;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

type VersionSection = { version: string; markdown: string };

function parseChangelog(raw: string): VersionSection[] {
  const sections: VersionSection[] = [];
  let current: VersionSection | null = null;
  for (const line of raw.split('\n')) {
    const match = /^## Version (.+)$/.exec(line.trim());
    if (match) {
      if (current) sections.push(current);
      current = { version: match[1] ?? '', markdown: line + '\n' };
    } else if (current) {
      current.markdown += line + '\n';
    }
  }
  if (current) sections.push(current);
  // Strip trailing separators so sections compose cleanly when joined.
  return sections.map((s) => ({ ...s, markdown: s.markdown.replace(/\n+---\s*\n*$/, '\n') }));
}

type Props = { readonly onDismiss: () => void; readonly defaultShowAll?: boolean };

export default function WhatsNewDialog({ onDismiss, defaultShowAll = false }: Props): React.ReactElement {
  const [showAll, setShowAll] = useState(defaultShowAll);

  function handleDismiss(): void {
    localStorage.setItem(STORAGE_KEY, __APP_VERSION__);
    onDismiss();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') handleDismiss();
    }
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, []);


  const lastSeen = localStorage.getItem(STORAGE_KEY);
  const allSections = parseChangelog(changelog);
  // First-time users (no lastSeen) only see the current release, not the whole history.
  const newSections = lastSeen
    ? allSections.filter((s) => compareVersions(s.version, lastSeen) > 0)
    : allSections.slice(0, 1);

  const visibleSections = showAll ? allSections : newSections;
  const hasMore = !showAll && allSections.length > newSections.length;

  const html = marked.parse(
    visibleSections.map((s) => s.markdown).join('\n---\n\n'),
    { async: false },
  );

  return (
    <div className="whats-new-overlay">
      <div className="whats-new" role="dialog" aria-modal="true" aria-label="What's New">
        <div className="whats-new__header">
          <div className="whats-new__title-group">
            <span className="whats-new__label">What&rsquo;s New</span>
            <span className="whats-new__version">v{__APP_VERSION__}</span>
          </div>
          <button
            className="btn btn--icon whats-new__close"
            onClick={handleDismiss}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div
          className="whats-new__body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div className="whats-new__footer">
          {hasMore && (
            <button className="btn btn--ghost whats-new__history" onClick={() => setShowAll(true)}>
              Show full changelog
            </button>
          )}
          <button className="btn btn--primary whats-new__got-it" onClick={handleDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
