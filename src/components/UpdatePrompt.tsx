import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

export default function UpdatePrompt(): React.ReactElement | null {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      if (r) {
        // Check for updates every 60 minutes
        setInterval(() => { r.update().catch(() => {}); }, 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  async function handleUpdate(): Promise<void> {
    await updateServiceWorker(true);
  }

  function handleDismiss(): void {
    setNeedRefresh(false);
  }

  return (
    <div className="update-prompt" role="alert">
      <span className="update-prompt__message">A new version is available.</span>
      <button className="btn btn--primary update-prompt__btn" onClick={handleUpdate}>
        Update
      </button>
      <button className="btn update-prompt__dismiss" onClick={handleDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
