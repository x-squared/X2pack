import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import { useSyncManager } from '../sync/SyncContext.js';
import './PairScreen.css';

QrScanner.WORKER_PATH = `${import.meta.env.BASE_URL}qr-scanner-worker.min.js`;

type Props = {
  readonly onClose: () => void;
};

type Role = 'offerer' | 'answerer' | null;

export default function PairScreen({ onClose }: Props): React.ReactElement {
  const manager = useSyncManager();
  const phase = useSyncExternalStore(
    (fn) => manager.subscribe(fn),
    () => manager.getPhase(),
  );
  const error = manager.getError();
  const protocolMismatch = useSyncExternalStore(
    (fn) => manager.subscribe(fn),
    () => manager.getProtocolMismatch(),
  );

  // Track what phase was when this sheet opened — drives the "already connected" vs "just connected" distinction
  const phaseAtMount = useRef(phase);

  const [role, setRole] = useState<Role>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrWarning, setQrWarning] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  // Auto-close only when connection was established during this session (not if it was already connected when opened)
  useEffect(() => {
    if (phase !== 'connected' || phaseAtMount.current === 'connected') return;
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  // Start / stop QR scanner
  useEffect(() => {
    if (!isScanning || !videoRef.current) return;

    const el = videoRef.current;
    const scanner = new QrScanner(
      el,
      (result) => { void handleScanResult(result.data); },
      { preferredCamera: 'environment', highlightScanRegion: true },
    );
    scannerRef.current = scanner;
    void scanner.start().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not open camera.';
      manager.setPairingError(message);
      setIsScanning(false);
    });

    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  const generateQr = useCallback(async (encoded: string): Promise<void> => {
    if (encoded.length > 1400) setQrWarning(true);
    const url = await QRCode.toDataURL(encoded, { errorCorrectionLevel: 'M', width: 280 });
    setQrDataUrl(url);
  }, []);

  async function handleScanResult(data: string): Promise<void> {
    scannerRef.current?.stop();
    setIsScanning(false);

    try {
      if (role === 'offerer') {
        await manager.completeHandshake(data);
      } else {
        const encoded = await manager.startAsAnswerer(data);
        await generateQr(encoded);
      }
    } catch (err) {
      manager.setPairingError(err instanceof Error ? err.message : 'Pairing failed.');
    }
  }

  async function handleShareMyData(): Promise<void> {
    setRole('offerer');
    try {
      const encoded = await manager.startAsOfferer();
      await generateQr(encoded);
    } catch (err) {
      manager.setPairingError(err instanceof Error ? err.message : 'Could not start pairing.');
    }
  }

  function handleClose(): void {
    // Cancel only if mid-pairing; never drop an established connection on sheet close
    const midPairing = phase !== 'idle' && phase !== 'connected' && phase !== 'disconnected' && phase !== 'error';
    if (midPairing) manager.disconnect();
    setRole(null);
    setQrDataUrl(null);
    setQrWarning(false);
    setIsScanning(false);
    onClose();
  }

  function handleDisconnect(): void {
    manager.disconnect();
    onClose();
  }

  function handleReset(): void {
    manager.disconnect();
    setRole(null);
    setQrDataUrl(null);
    setQrWarning(false);
    setIsScanning(false);
  }

  function renderContent(): React.ReactElement {
    // Already connected when opened → show info + disconnect
    if (phase === 'connected' && phaseAtMount.current === 'connected') {
      return (
        <div className="pair-screen__info">
          <div className="pair-screen__status-dot pair-screen__status-dot--connected" />
          <p className="pair-screen__info-text">Connected to another device</p>
          <p className="pair-screen__hint">Changes sync in real time while connected.</p>
          <button className="btn btn--ghost pair-screen__role-btn" onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      );
    }

    // Peer dropped → show broken state + reconnect
    if (phase === 'disconnected') {
      return (
        <div className="pair-screen__info">
          <div className="pair-screen__status-dot pair-screen__status-dot--broken" />
          <p className="pair-screen__info-text">Connection was lost</p>
          <p className="pair-screen__hint">The other device disconnected or went out of range.</p>
          <button className="btn btn--primary pair-screen__role-btn" onClick={handleReset}>
            Reconnect
          </button>
        </div>
      );
    }

    // Error during pairing
    if (phase === 'error') {
      return (
        <div className="pair-screen__info">
          <div className="pair-screen__status-dot pair-screen__status-dot--broken" />
          <p className="pair-screen__info-text">{error ?? 'Connection failed.'}</p>
          <button className="btn btn--primary pair-screen__role-btn" onClick={handleReset}>Try again</button>
        </div>
      );
    }

    // Just connected during this session → "Synced!" (auto-closes)
    if (phase === 'connected') {
      return (
        <div className="pair-screen__success">
          <span className="pair-screen__checkmark" aria-hidden="true">✓</span>
          <p className="pair-screen__success-text">Synced!</p>
        </div>
      );
    }

    if (phase === 'connecting') return <Spinner label="Connecting…" />;
    if (phase === 'creating-offer') return <Spinner label="Preparing connection…" />;
    if (phase === 'creating-answer') return <Spinner label="Preparing response…" />;

    // Offerer: show offer QR, then button to scan the answer
    if (phase === 'showing-offer-qr' && !isScanning) {
      return (
        <div className="pair-screen__qr-view">
          {qrWarning && <p className="pair-screen__warning">QR is large — make sure lighting is good.</p>}
          {qrDataUrl && <img src={qrDataUrl} alt="Pairing QR code" className="pair-screen__qr-img" />}
          <p className="pair-screen__hint">Let the other phone scan this QR.</p>
          <button className="btn btn--primary" onClick={() => setIsScanning(true)}>
            Scan their QR
          </button>
        </div>
      );
    }

    // Answerer: show answer QR for offerer to scan
    if (phase === 'showing-answer-qr') {
      return (
        <div className="pair-screen__qr-view">
          {qrWarning && <p className="pair-screen__warning">QR is large — make sure lighting is good.</p>}
          {qrDataUrl && <img src={qrDataUrl} alt="Answer QR code" className="pair-screen__qr-img" />}
          <p className="pair-screen__hint">Show this to the other phone, then wait.</p>
        </div>
      );
    }

    // Scanner
    if (isScanning) {
      return (
        <div className="pair-screen__scanner-view">
          <p className="pair-screen__hint">Scan the QR shown on the other phone.</p>
          <video ref={videoRef} className="pair-screen__video" />
        </div>
      );
    }

    // Answerer: role selected, scanner not yet open
    if (role === 'answerer') return <Spinner label="Opening camera…" />;

    // Initial role picker
    return (
      <div className="pair-screen__picker">
        <p className="pair-screen__intro">
          Sync with another phone on the same WiFi or hotspot.
        </p>
        <p className="pair-screen__hint pair-screen__hint--note">
          If pairing fails on a personal hotspot, try regular WiFi — some hotspots block phone-to-phone connections.
        </p>
        <button
          className="btn btn--primary pair-screen__role-btn"
          onClick={() => void handleShareMyData()}
        >
          Share my data (show QR)
        </button>
        <button
          className="btn btn--ghost pair-screen__role-btn"
          onClick={() => { setRole('answerer'); setIsScanning(true); }}
        >
          Scan a QR
        </button>
      </div>
    );
  }

  return (
    <div className="pair-screen">
      <div className="pair-screen__overlay" onClick={handleClose} />
      <div className="pair-screen__panel">
        <div className="pair-screen__header">
          <h2 className="pair-screen__title">Sync</h2>
          <button className="pair-screen__close-btn" onClick={handleClose} aria-label="Close">✕</button>
        </div>
        <div className="pair-screen__body">
          {protocolMismatch && phase === 'connected' && (
            <p className="pair-screen__warning pair-screen__protocol-warning" role="alert">
              {protocolMismatch}
            </p>
          )}
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

function Spinner({ label }: { readonly label: string }): React.ReactElement {
  return (
    <div className="pair-screen__spinner-view">
      <span className="pair-screen__spinner" aria-hidden="true" />
      <p className="pair-screen__hint">{label}</p>
    </div>
  );
}
