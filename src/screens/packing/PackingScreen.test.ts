import { describe, expect, it } from 'vitest';
import { dayCount } from './PackingScreen.js';

describe('dayCount', () => {
  it('returns 0 for same-day trip', () => {
    expect(dayCount('2026-05-08', '2026-05-08')).toBe(0);
  });

  it('returns 1 for consecutive days', () => {
    expect(dayCount('2026-05-08', '2026-05-09')).toBe(1);
  });

  it('returns 7 for a week-long trip', () => {
    expect(dayCount('2026-05-01', '2026-05-08')).toBe(7);
  });

  it('spans a month boundary correctly', () => {
    expect(dayCount('2026-01-29', '2026-02-02')).toBe(4);
  });

  it('spans a year boundary correctly', () => {
    expect(dayCount('2025-12-28', '2026-01-03')).toBe(6);
  });
});
