import { describe, it, expect } from 'vitest';
import {
  dateRangeToSlideSelection,
  slideSelectionToDateRange,
  dateRangeFromPreset,
  derivePresetFromDateRange,
  formatDateToLocalIso,
  getCurrentYearToDateRange,
} from '../monthUtils';

describe('dateRangeToSlideSelection', () => {
  it('returns all/all when range is undefined', () => {
    expect(dateRangeToSlideSelection(undefined)).toEqual({ year: 'all', month: 'all' });
  });

  it('returns all/all when from is missing', () => {
    expect(dateRangeToSlideSelection({ from: undefined })).toEqual({ year: 'all', month: 'all' });
  });

  it('maps a range with only from (no to) to that single month', () => {
    const result = dateRangeToSlideSelection({ from: new Date(2025, 5, 15) });
    expect(result).toEqual({ year: '2025', month: 'June' });
  });

  it('maps a single-month range correctly', () => {
    const result = dateRangeToSlideSelection({
      from: new Date(2025, 2, 1),
      to: new Date(2025, 2, 31),
    });
    expect(result).toEqual({ year: '2025', month: 'March' });
  });

  it('maps June–December 2025 to comma-separated months', () => {
    const result = dateRangeToSlideSelection({
      from: new Date(2025, 5, 1),
      to: new Date(2025, 11, 31),
    });
    expect(result.year).toBe('2025');
    expect(result.month).toBe('June,July,August,September,October,November,December');
  });

  it('maps full year Jan 1 – Dec 31 to year + all', () => {
    const result = dateRangeToSlideSelection({
      from: new Date(2025, 0, 1),
      to: new Date(2025, 11, 31),
    });
    expect(result).toEqual({ year: '2025', month: 'all' });
  });

  it('maps a cross-year range to fromYear + all', () => {
    const result = dateRangeToSlideSelection({
      from: new Date(2025, 10, 1),
      to: new Date(2026, 1, 28),
    });
    expect(result).toEqual({ year: '2025', month: 'all' });
  });
});

describe('slideSelectionToDateRange', () => {
  it('returns undefined for all/all', () => {
    expect(slideSelectionToDateRange('all', 'all')).toBeUndefined();
  });

  it('returns full year range for year + all', () => {
    const range = slideSelectionToDateRange('2025', 'all');
    expect(range?.from?.getFullYear()).toBe(2025);
    expect(range?.from?.getMonth()).toBe(0);
    expect(range?.to?.getMonth()).toBe(11);
  });

  it('returns single-month range for year + single month', () => {
    const range = slideSelectionToDateRange('2025', 'March');
    expect(range?.from).toEqual(new Date(2025, 2, 1));
    expect(range?.to?.getMonth()).toBe(2);
  });

  it('returns multi-month range for comma-separated months', () => {
    const range = slideSelectionToDateRange('2025', 'June,July,August');
    expect(range?.from).toEqual(new Date(2025, 5, 1));
    expect(range?.to?.getMonth()).toBe(7); // August
  });
});

describe('dateRangeFromPreset', () => {
  it('returns undefined for all_time', () => {
    expect(dateRangeFromPreset('all_time')).toBeUndefined();
  });

  it('returns undefined for custom', () => {
    expect(dateRangeFromPreset('custom')).toBeUndefined();
  });

  it('returns a defined range for this_month', () => {
    const range = dateRangeFromPreset('this_month');
    expect(range).toBeDefined();
    expect(range?.from).toBeDefined();
    expect(range?.to).toBeDefined();
  });

  it('returns a defined range for last_year', () => {
    const range = dateRangeFromPreset('last_year');
    expect(range).toBeDefined();
    const now = new Date();
    expect(range?.from?.getFullYear()).toBe(now.getFullYear() - 1);
    expect(range?.to?.getFullYear()).toBe(now.getFullYear() - 1);
  });
});

describe('roundtrip: preset → range → selection → range', () => {
  it('this_month roundtrips correctly', () => {
    const range = dateRangeFromPreset('this_month');
    expect(range).toBeDefined();
    const sel = dateRangeToSlideSelection(range);
    const now = new Date();
    expect(sel.year).toBe(String(now.getFullYear()));
    const reconstructed = slideSelectionToDateRange(sel.year, sel.month);
    expect(reconstructed?.from?.getMonth()).toBe(now.getMonth());
  });

  it('last_year roundtrips to the previous year', () => {
    const range = dateRangeFromPreset('last_year');
    const sel = dateRangeToSlideSelection(range);
    const now = new Date();
    expect(sel.year).toBe(String(now.getFullYear() - 1));
    expect(sel.month).toBe('all');
  });
});

describe('current default range helpers', () => {
  it('getCurrentYearToDateRange returns Jan 1 through today', () => {
    const range = getCurrentYearToDateRange();
    const now = new Date();

    expect(range.from).toEqual(new Date(now.getFullYear(), 0, 1));
    expect(range.to).toEqual(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  });

  it('formatDateToLocalIso uses local calendar parts', () => {
    expect(formatDateToLocalIso(new Date(2026, 0, 5, 23, 59, 59))).toBe('2026-01-05');
  });
});
