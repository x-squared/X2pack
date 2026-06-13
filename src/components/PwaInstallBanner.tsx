import { useState } from 'react';
import './PwaInstallBanner.css';

const DISMISSED_KEY = 'x2pack-pwa-install-dismissed';

type Platform = 'ios' | 'android' | 'mac' | 'windows' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  return 'desktop';
}

function isPwa(): boolean {
  return (
    globalThis.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

type Step = { id: string; text: React.ReactNode };

type StepGroup = { heading?: string; steps: Step[] };

type Content = {
  title: string;
  intro: string;
  groups: StepGroup[];
  note: string;
};

function getContent(platform: Platform): Content {
  const sharedNote = 'After installing, always open X2pack from its home screen icon — data is not shared with the browser version.';

  switch (platform) {
    case 'ios':
      return {
        title: 'Add X2pack to your iPhone',
        intro: 'X2pack works in Safari, but installing it gives you a faster, full-screen experience that works offline.',
        groups: [{ steps: [
          { id: 'browser', text: <>Make sure you are using <strong>Safari</strong> — only Safari supports installation on iPhone</> },
          { id: 'share', text: <>Tap the <strong>Share</strong> button (square with upward arrow) at the bottom of the screen</> },
          { id: 'add-home', text: <>Scroll down and tap <strong>Add to Home Screen</strong></> },
          { id: 'confirm', text: <>Tap <strong>Add</strong> to finish</> },
        ]}],
        note: sharedNote,
      };
    case 'android':
      return {
        title: 'Add X2pack to your Android',
        intro: 'X2pack works in your browser, but installing it gives you a faster, full-screen experience that works offline.',
        groups: [{ steps: [
          { id: 'browser', text: <>Make sure you are using <strong>Chrome</strong> — it has the best support for installing web apps</> },
          { id: 'menu', text: <>Tap the <strong>⋮ menu</strong> in Chrome's top-right corner</> },
          { id: 'add-home', text: <>Tap <strong>Add to Home Screen</strong> or <strong>Install app</strong></> },
          { id: 'confirm', text: <>Tap <strong>Install</strong> to finish</> },
        ]}],
        note: sharedNote,
      };
    case 'mac':
      return {
        title: 'Install X2pack',
        intro: 'X2pack works in your browser, but installing it gives you a standalone, offline-ready experience — and it is best used on your phone.',
        groups: [
          { heading: 'On your Mac:', steps: [
            { id: 'browser', text: <>Use <strong>Safari</strong>, <strong>Chrome</strong>, or <strong>Edge</strong></> },
            { id: 'icon', text: <>Click the <strong>install icon</strong> in the address bar, or open the browser menu and choose <strong>Install X2pack</strong></> },
            { id: 'confirm', text: <>Click <strong>Install</strong> to finish</> },
          ]},
          { heading: 'On your iPhone:', steps: [
            { id: 'iphone-safari', text: <>Open this page in <strong>Safari</strong> — only Safari supports installation on iPhone</> },
            { id: 'iphone-share', text: <>Tap the <strong>Share</strong> button (the square with an upward arrow at the bottom of the screen)</> },
            { id: 'iphone-add', text: <>Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong></> },
          ]},
        ],
        note: sharedNote,
      };
    case 'windows':
      return {
        title: 'Install X2pack',
        intro: 'X2pack works in your browser, but installing it gives you a standalone, offline-ready experience — and it is best used on your phone.',
        groups: [
          { heading: 'On your PC:', steps: [
            { id: 'browser', text: <>Use <strong>Chrome</strong> or <strong>Edge</strong></> },
            { id: 'icon', text: <>Click the <strong>install icon</strong> in the address bar, or open the browser menu and choose <strong>Install X2pack</strong></> },
            { id: 'confirm', text: <>Click <strong>Install</strong> to finish</> },
          ]},
          { heading: 'On your iPhone:', steps: [
            { id: 'iphone-safari', text: <>Open this page in <strong>Safari</strong> — only Safari supports installation on iPhone</> },
            { id: 'iphone-share', text: <>Tap the <strong>Share</strong> button (the square with an upward arrow at the bottom of the screen)</> },
            { id: 'iphone-add', text: <>Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong></> },
          ]},
        ],
        note: sharedNote,
      };
    case 'desktop':
      return {
        title: 'Install X2pack',
        intro: 'X2pack works in your browser, but installing it gives you a standalone, offline-ready experience — and it is best used on your phone.',
        groups: [
          { heading: 'On your computer:', steps: [
            { id: 'browser', text: <>Use <strong>Chrome</strong> or <strong>Edge</strong></> },
            { id: 'icon', text: <>Click the <strong>install icon</strong> in the address bar, or open the browser menu and choose <strong>Install X2pack</strong></> },
            { id: 'confirm', text: <>Click <strong>Install</strong> to finish</> },
          ]},
          { heading: 'On your iPhone:', steps: [
            { id: 'iphone-safari', text: <>Open this page in <strong>Safari</strong> — only Safari supports installation on iPhone</> },
            { id: 'iphone-share', text: <>Tap the <strong>Share</strong> button (the square with an upward arrow at the bottom of the screen)</> },
            { id: 'iphone-add', text: <>Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong></> },
          ]},
        ],
        note: sharedNote,
      };
  }
}

export default function PwaInstallBanner(): React.ReactElement | null {
  const [visible] = useState(() => {
    if (isPwa()) return false;
    return localStorage.getItem(DISMISSED_KEY) !== 'true';
  });
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  const platform = detectPlatform();
  const { title, intro, groups, note } = getContent(platform);

  function handleDismiss(): void {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div className="pwa-install-banner" role="note" aria-label="Install instructions">
      <div className="pwa-install-banner__header">
        <span className="pwa-install-banner__title">{title}</span>
        <button
          className="pwa-install-banner__dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss install instructions"
        >
          ✕
        </button>
      </div>
      <p className="pwa-install-banner__intro">{intro}</p>
      {groups.map((group, i) => (
        <div key={i} className="pwa-install-banner__group">
          {group.heading && (
            <p className="pwa-install-banner__group-heading">{group.heading}</p>
          )}
          <ol className="pwa-install-banner__steps">
            {group.steps.map((step) => (
              <li key={step.id} className="pwa-install-banner__step">
                {step.text}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <p className="pwa-install-banner__note">{note}</p>
    </div>
  );
}
