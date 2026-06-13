import { describe, it, expect, vi, afterEach } from 'vitest';
import { shouldShowWhatsNew } from './WhatsNewDialog.js';

const mockStorage = (value: string | null): Storage =>
  ({ getItem: () => value }) as unknown as Storage;

describe('shouldShowWhatsNew', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when no version has been seen (null)', () => {
    vi.stubGlobal('localStorage', mockStorage(null));
    expect(shouldShowWhatsNew()).toBe(true);
  });

  it('returns true when an older version was seen', () => {
    vi.stubGlobal('localStorage', mockStorage('0.0.1'));
    expect(shouldShowWhatsNew()).toBe(true);
  });

  it('returns false when the current app version was already seen', () => {
    vi.stubGlobal('localStorage', mockStorage(__APP_VERSION__));
    expect(shouldShowWhatsNew()).toBe(false);
  });
});
