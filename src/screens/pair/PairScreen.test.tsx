// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PairScreen from './PairScreen.js';
import { WebRTCManager } from '../../sync/WebRTCManager.js';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,abc') },
}));

vi.mock('qr-scanner', () => ({
  default: class MockQrScanner {
    static WORKER_PATH = '/worker.js';
    constructor(_el: Element, _fn: (r: { data: string }) => void) {}
    start(): Promise<void> { return Promise.resolve(); }
    stop(): void {}
    destroy(): void {}
  },
}));

const manager = new WebRTCManager();

vi.mock('../../sync/SyncContext.js', () => ({
  useSyncManager: () => manager,
}));

describe('PairScreen', () => {
  afterEach(() => {
    cleanup();
    manager.disconnect();
  });

  it('shows role picker when idle', () => {
    render(<PairScreen onClose={vi.fn()} />);
    expect(screen.getByText(/Sync with another phone/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Share my data (show QR)' })).toBeDefined();
  });

  it('shows hotspot troubleshooting hint', () => {
    render(<PairScreen onClose={vi.fn()} />);
    expect(screen.getByText(/some hotspots block phone-to-phone/)).toBeDefined();
  });

  it('shows error message when pairing fails', async () => {
    vi.spyOn(manager, 'startAsOfferer').mockRejectedValueOnce(new Error('WebRTC unavailable'));
    const user = userEvent.setup();
    render(<PairScreen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Share my data (show QR)' }));
    expect(await screen.findByText('WebRTC unavailable')).toBeDefined();
  });

  it('shows connected info when already connected at open', () => {
    vi.spyOn(manager, 'getPhase').mockReturnValue('connected');
    render(<PairScreen onClose={vi.fn()} />);
    expect(screen.getByText('Connected to another device')).toBeDefined();
  });

  it('shows protocol mismatch warning when connected with version skew', () => {
    vi.spyOn(manager, 'getPhase').mockReturnValue('connected');
    vi.spyOn(manager, 'getProtocolMismatch').mockReturnValue(
      'The other device is running an older version of X2pack.',
    );
    render(<PairScreen onClose={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toMatch(/older version/);
  });
});
