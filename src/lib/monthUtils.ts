/**
 * Utilities for multi-month selection (consecutive months, comma-separated string format).
 */

import { MONTH_NAMES } from '@/constants/slideViewConstants';
import type { DateRange } from "react-day-picker";

/**
 * Parse a selectedMonth string into an array of 1-based month numbers.
 * Supports single month ("March"), comma-separated ("January,February,March"), or "all".
 */
export function parseSelectedMonths(selectedMonth: string): number[] | null {
  if (!selectedMonth || selectedMonth === 'all') return null;
  return selectedMonth.split(',').map(m => MONTH_NAMES.indexOf(m.trim()) + 1).filter(n => n > 0);
}

/**
 * Build a date range covering all selected months in the given year.
 * Returns undefined if selectedMonth is 'all' or year is 'all'.
 */
export function buildMultiMonthDateRange(
  selectedYear: string,
  selectedMonth: string
): { start: Date; end: Date } | undefined {
  if (selectedYear === 'all') return undefined;
  const yearNum = parseInt(selectedYear);
  const months = parseSelectedMonths(selectedMonth);
  if (!months || months.length === 0) {
    // Year only — full year range
    return { start: new Date(yearNum, 0, 1), end: new Date(yearNum, 11, 31, 23, 59, 59) };
  }
  const minMonth = Math.min(...months) - 1; // 0-based
  const maxMonth = Math.max(...months) - 1;
  return {
    start: new Date(yearNum, minMonth, 1),
    end: new Date(yearNum, maxMonth + 1, 0, 23, 59, 59),
  };
}

/**
 * Build comparison date range for multi-month selection.
 */
export function buildComparisonDateRange(
  selectedYear: string,
  selectedMonth: string,
  comparisonType: 'none' | 'previous_period' | 'previous_year'
): { start: Date; end: Date } | undefined {
  if (comparisonType === 'none' || selectedYear === 'all') return undefined;
  const yearNum = parseInt(selectedYear);
  const months = parseSelectedMonths(selectedMonth);

  if (!months || months.length === 0) {
    // Full year comparison
    if (comparisonType === 'previous_period' || comparisonType === 'previous_year') {
      return { start: new Date(yearNum - 1, 0, 1), end: new Date(yearNum - 1, 11, 31, 23, 59, 59) };
    }
    return undefined;
  }

  const minMonth = Math.min(...months) - 1;
  const maxMonth = Math.max(...months) - 1;
  const spanLength = maxMonth - minMonth + 1;

  if (comparisonType === 'previous_period') {
    // Same span of months, shifted back
    const prevEnd = new Date(yearNum, minMonth, 0, 23, 59, 59); // Last day before current range
    const prevStartMonth = minMonth - spanLength;
    const prevStart = new Date(yearNum, prevStartMonth, 1);
    return { start: prevStart, end: prevEnd };
  } else if (comparisonType === 'previous_year') {
    return {
      start: new Date(yearNum - 1, minMonth, 1),
      end: new Date(yearNum - 1, maxMonth + 1, 0, 23, 59, 59),
    };
  }
  return undefined;
}

/**
 * Build comparison date range from an exact DateRange (custom from/to dates).
 * Uses day-precise shifting so custom ranges compare correctly across KPIs/charts/tables.
 */
export function buildComparisonDateRangeFromExact(
  range: { from: Date; to: Date } | { start: Date; end: Date },
  comparisonType: 'previous_period' | 'previous_year'
): { start: Date; end: Date } {
  const start = 'from' in range ? range.from : range.start;
  const end = 'to' in range ? range.to : range.end;

  if (comparisonType === 'previous_year') {
    return {
      start: new Date(start.getFullYear() - 1, start.getMonth(), start.getDate(), start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()),
      end: new Date(end.getFullYear() - 1, end.getMonth(), end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()),
    };
  }

  // "Month-anchored" range: starts on the 1st of a month and ends within that same month
  // (e.g. March 1–18). Shift back exactly one calendar month so March 1–18 → Feb 1–18,
  // rather than subtracting 18 days which would give Feb 11–28.
  if (
    start.getDate() === 1 &&
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear()
  ) {
    return {
      start: new Date(start.getFullYear(), start.getMonth() - 1, 1),
      end: new Date(end.getFullYear(), end.getMonth() - 1, end.getDate(), 23, 59, 59, 999),
    };
  }

  // Rolling windows (e.g. "Last 7 days", "Last 30 days"): shift back by exact span length.
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const spanDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  return {
    start: new Date(start.getTime() - spanDays * MS_PER_DAY),
    end: new Date(end.getTime() - spanDays * MS_PER_DAY),
  };
}


/**
 * Convert SlideView selection model (year + selectedMonth string) to a DayPicker DateRange.
 * - If selectedYear is 'all', returns undefined (treated as All Time).
 */
export function slideSelectionToDateRange(selectedYear: string, selectedMonth: string): DateRange | undefined {
  const r = buildMultiMonthDateRange(selectedYear, selectedMonth);
  if (!r) return undefined;
  return { from: r.start, to: r.end };
}

/**
 * Convert a DayPicker DateRange into SlideView selection model.
 * - If the range exactly covers a full year, month becomes 'all'.
 * - If the range is within a single year and spans whole months, month becomes comma-separated month names.
 * - Otherwise, best-effort: map to the range's start year and 'all' months.
 */
export function dateRangeToSlideSelection(range: DateRange | undefined): { year: string; month: string } {
  if (!range?.from) return { year: 'all', month: 'all' };

  const from = range.from;
  const to = range.to ?? from;

  const fromYear = from.getFullYear();
  const toYear = to.getFullYear();
  const fromMonth = from.getMonth();
  const toMonth = to.getMonth();

  // Full year range (Jan 1 - Dec 31) in same year
  if (
    fromYear === toYear &&
    fromMonth === 0 &&
    toMonth === 11 &&
    from.getDate() === 1 &&
    to.getDate() >= 28
  ) {
    return { year: String(fromYear), month: 'all' };
  }

  // Same month
  if (fromYear === toYear && fromMonth === toMonth) {
    return { year: String(fromYear), month: MONTH_NAMES[fromMonth] };
  }

  // Multi-month within same year: represent as comma-separated month names (consecutive).
  if (fromYear === toYear) {
    const months: string[] = [];
    for (let m = fromMonth; m <= toMonth; m++) months.push(MONTH_NAMES[m]);
    return { year: String(fromYear), month: months.join(",") };
  }

  // Cross-year: SlideView can't represent an arbitrary cross-year range cleanly.
  return { year: String(fromYear), month: 'all' };
}

/**
 * Best-effort preset derivation for SlideView from selectedYear/selectedMonth.
 * Used to keep the preset list visually in sync with the current selection.
 */
export function deriveSlideDatePreset(selectedYear: string, selectedMonth: string): string {
  if (!selectedYear || selectedYear === 'all') return 'all_time';
  const now = new Date();
  const curYear = String(now.getFullYear());
  const curMonthName = MONTH_NAMES[now.getMonth()];

  // this_year: current year + all months
  if (selectedYear === curYear && selectedMonth === 'all') return 'this_year';

  // this_month: current year + current month
  if (selectedYear === curYear && selectedMonth === curMonthName) return 'this_month';

  // last_month: previous month selection
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthYear = String(lastMonthDate.getFullYear());
  const lastMonthName = MONTH_NAMES[lastMonthDate.getMonth()];
  if (selectedYear === lastMonthYear && selectedMonth === lastMonthName) return 'last_month';

  // last_year: previous year + all months
  if (selectedYear === String(now.getFullYear() - 1) && selectedMonth === 'all') return 'last_year';

  return 'custom';
}

/**
 * Convert a DayPicker DateRange to an exact { start, end } date range.
 * Unlike buildMultiMonthDateRange, this preserves the exact from/to dates without
 * snapping to month boundaries.
 */
export function exactDateRangeFromDayPicker(range: DateRange | undefined): { start: Date; end: Date } | undefined {
  if (!range?.from) return undefined;
  const start = range.from;
  const end = range.to ?? range.from;
  // Set end to end of day
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  return { start, end: endOfDay };
}

/**
 * Derive a preset id from an exact DateRange (for display in the preset list).
 * Returns 'custom' when no preset matches.
 */
export function derivePresetFromDateRange(range: DateRange | undefined): string {
  if (!range?.from) return 'all_time';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const to = range.to ? new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate()) : from;

  const diffDays = Math.round((today.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  const spanDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // today
  if (from.getTime() === today.getTime() && to.getTime() === today.getTime()) return 'today';

  // yesterday
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (from.getTime() === yesterday.getTime() && to.getTime() === yesterday.getTime()) return 'yesterday';

  // last 7 days
  const last7Start = new Date(today); last7Start.setDate(today.getDate() - 6);
  if (from.getTime() === last7Start.getTime() && to.getTime() === today.getTime()) return 'last_7_days';

  // last 14 days
  const last14Start = new Date(today); last14Start.setDate(today.getDate() - 13);
  if (from.getTime() === last14Start.getTime() && to.getTime() === today.getTime()) return 'last_14_days';

  // last 30 days
  const last30Start = new Date(today); last30Start.setDate(today.getDate() - 29);
  if (from.getTime() === last30Start.getTime() && to.getTime() === today.getTime()) return 'last_30_days';

  // last 90 days
  const last90Start = new Date(today); last90Start.setDate(today.getDate() - 89);
  if (from.getTime() === last90Start.getTime() && to.getTime() === today.getTime()) return 'last_90_days';

  // month to date
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (from.getTime() === mtdStart.getTime() && to.getTime() === today.getTime()) return 'month_to_date';

  // this month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  if (from.getTime() === thisMonthStart.getTime() && to.getTime() === thisMonthEnd.getTime()) return 'this_month';

  // last month
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  if (from.getTime() === lastMonthStart.getTime() && to.getTime() === lastMonthEnd.getTime()) return 'last_month';

  // quarter to date
  const currentQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  if (from.getTime() === currentQuarterStart.getTime() && to.getTime() === today.getTime()) return 'quarter_to_date';

  // last quarter
  const lastQuarterEndMonth = Math.floor(now.getMonth() / 3) * 3 - 1;
  const lastQuarterStart = new Date(now.getFullYear(), lastQuarterEndMonth - 2, 1);
  const lastQuarterEnd = new Date(now.getFullYear(), lastQuarterEndMonth + 1, 0);
  if (from.getTime() === lastQuarterStart.getTime() && to.getTime() === lastQuarterEnd.getTime()) return 'last_quarter';

  // year to date
  const ytdStart = new Date(now.getFullYear(), 0, 1);
  if (from.getTime() === ytdStart.getTime() && to.getTime() === today.getTime()) return 'year_to_date';

  // this year
  const thisYearStart = new Date(now.getFullYear(), 0, 1);
  const thisYearEnd = new Date(now.getFullYear(), 11, 31);
  if (from.getTime() === thisYearStart.getTime() && to.getTime() === thisYearEnd.getTime()) return 'this_year';

  // last year
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
  if (from.getTime() === lastYearStart.getTime() && to.getTime() === lastYearEnd.getTime()) return 'last_year';

  return 'custom';
}

/**
 * Build a DateRange from a preset id.
 * Returns undefined for 'all_time' and 'custom'.
 */
export function dateRangeFromPreset(preset: string): DateRange | undefined {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const d = new Date(today); d.setDate(today.getDate() - 1);
      return { from: d, to: d };
    }
    case 'last_7_days': {
      const from = new Date(today); from.setDate(today.getDate() - 6);
      return { from, to: today };
    }
    case 'last_14_days': {
      const from = new Date(today); from.setDate(today.getDate() - 13);
      return { from, to: today };
    }
    case 'last_30_days': {
      const from = new Date(today); from.setDate(today.getDate() - 29);
      return { from, to: today };
    }
    case 'last_90_days': {
      const from = new Date(today); from.setDate(today.getDate() - 89);
      return { from, to: today };
    }
    case 'month_to_date':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: today,
      };
    case 'quarter_to_date': {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { from: qStart, to: today };
    }
    case 'last_quarter': {
      const lqEndMonth = Math.floor(now.getMonth() / 3) * 3 - 1;
      const lqStart = new Date(now.getFullYear(), lqEndMonth - 2, 1);
      const lqEnd = new Date(now.getFullYear(), lqEndMonth + 1, 0);
      return { from: lqStart, to: lqEnd };
    }
    case 'year_to_date':
      return {
        from: new Date(now.getFullYear(), 0, 1),
        to: today,
      };
    case 'this_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      };
    case 'last_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0),
      };
    case 'this_year':
      return {
        from: new Date(now.getFullYear(), 0, 1),
        to: new Date(now.getFullYear(), 11, 31),
      };
    case 'last_year':
      return {
        from: new Date(now.getFullYear() - 1, 0, 1),
        to: new Date(now.getFullYear() - 1, 11, 31),
      };
    case 'all_time':
    case 'custom':
    default:
      return undefined;
  }
}

/**
 * Returns the date range for the current calendar month (from first to last day).
 * Migrated from data-loading-fix.ts.
 */
export function getCurrentMonthDateRange(): { from: Date; to: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return {
    from: new Date(year, month, 1),
    to: new Date(year, month + 1, 0),
  };
}

/**
 * Returns the exact year-to-date range for the current year (Jan 1 -> today).
 */
export function getCurrentYearToDateRange(): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    from: new Date(now.getFullYear(), 0, 1),
    to: today,
  };
}

/**
 * Returns month-to-date (1st of current calendar month -> today).
 * Canonical default for Data Studio so the scope matches the "Month to Date" preset.
 */
export function getCurrentMonthToDateRange(): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: today,
  };
}

/**
 * Format a Date as YYYY-MM-DD using local calendar parts.
 * Avoids UTC shifts from toISOString() when persisting date-only values.
 */
export function formatDateToLocalIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
