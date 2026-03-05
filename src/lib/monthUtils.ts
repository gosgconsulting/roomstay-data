/**
 * Utilities for multi-month selection (consecutive months, comma-separated string format).
 */

import { MONTH_NAMES } from '@/constants/slideViewConstants';

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
 * Given a set of selected month indices (0-based), enforce consecutive selection
 * by filling gaps between min and max.
 */
export function enforceConsecutive(indices: number[]): number[] {
  if (indices.length <= 1) return indices;
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  const result: number[] = [];
  for (let i = min; i <= max; i++) result.push(i);
  return result;
}

/**
 * Format selected months for display.
 */
export function formatSelectedMonths(selectedMonth: string): string {
  const months = parseSelectedMonths(selectedMonth);
  if (!months || months.length === 0) return 'All Months';
  if (months.length === 1) return MONTH_NAMES[months[0] - 1];
  if (months.length === 12) return 'All Months';
  const first = MONTH_NAMES[Math.min(...months) - 1];
  const last = MONTH_NAMES[Math.max(...months) - 1];
  return `${first.slice(0, 3)} – ${last.slice(0, 3)}`;
}

/**
 * Check if a month number matches the selected months filter.
 */
export function isMonthInSelection(monthNum: number, selectedMonth: string): boolean {
  const months = parseSelectedMonths(selectedMonth);
  if (!months) return true; // 'all' - include everything
  return months.includes(monthNum);
}
