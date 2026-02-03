/**
 * Merge channel data slices from slide_report_channel_month_data (and year data)
 * into the shape expected by pivot_data.channels. Matches backend mergeChannelYearSlices logic.
 */

import { calculateDerivedMetrics } from '@/lib/slideViewHelpers';
import type {
  ChannelMetrics,
  BreakdownRow,
  SlideReportPivotData,
  SlideReportDateRange,
} from '@/types/slideReports';

/** Single channel slice as stored in slide_report_channel_month_data.data or year_data */
export interface ChannelDataSlice {
  monthly?: Record<string, ChannelMetrics>;
  yearly?: Record<string, ChannelMetrics>;
  breakdowns?: Record<string, BreakdownRow[]>;
  monthlyBreakdowns?: Record<string, Record<string, BreakdownRow[]>>;
  filterUniqueValues?: Record<string, { name: string; values: string[] }>;
  dimensionMap?: Record<string, string>;
}

function mergeBreakdownRows(rows: BreakdownRow[]): BreakdownRow[] {
  const byName: Record<string, BreakdownRow> = {};
  for (const row of rows) {
    const name = row.name != null ? String(row.name).trim() : '';
    if (!name) continue;
    if (!byName[name]) {
      byName[name] = { ...row, impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
    }
    byName[name].impressions += row.impressions ?? 0;
    byName[name].clicks += row.clicks ?? 0;
    byName[name].cost += row.cost ?? 0;
    byName[name].revenue += row.revenue ?? 0;
    byName[name].bookings += row.bookings ?? 0;
  }
  return Object.values(byName).sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
}

/**
 * Merge per-month or per-year channel slices into full channel data.
 * Computes current / previous_period / previous_year from merged monthly and date range.
 */
export function mergeChannelSlices(
  slices: ChannelDataSlice[],
  dateRange: { from: string; to: string }
): SlideReportPivotData['channels'][string] {
  if (slices.length === 0) {
    return {
      current: calculateDerivedMetrics({ impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }) as ChannelMetrics,
      monthly: {},
      yearly: {},
      breakdowns: {},
      monthlyBreakdowns: {},
      rawDataRows: [],
      dimensionMap: {},
    };
  }
  const first = slices[0];
  const monthly: Record<string, ChannelMetrics> = {};
  const yearly: Record<string, ChannelMetrics> = {};
  for (const s of slices) {
    if (s.monthly) Object.assign(monthly, s.monthly);
    if (s.yearly) Object.assign(yearly, s.yearly);
  }
  const breakdowns: Record<string, BreakdownRow[]> = {};
  for (const dimName of Object.keys(first.breakdowns || {})) {
    const allRows = slices.flatMap((s) => (s.breakdowns && s.breakdowns[dimName]) || []);
    breakdowns[dimName] = mergeBreakdownRows(allRows);
  }
  const monthlyBreakdowns: Record<string, Record<string, BreakdownRow[]>> = {};
  const allMonthKeys = new Set(slices.flatMap((s) => Object.keys(s.monthlyBreakdowns || {})));
  for (const monthKey of allMonthKeys) {
    monthlyBreakdowns[monthKey] = {};
    const dimNames = new Set(
      slices.flatMap((s) => Object.keys((s.monthlyBreakdowns && s.monthlyBreakdowns[monthKey]) || {}))
    );
    for (const dimName of dimNames) {
      const allRows = slices.flatMap(
        (s) =>
          (s.monthlyBreakdowns?.[monthKey]?.[dimName] || [])
      );
      monthlyBreakdowns[monthKey][dimName] = mergeBreakdownRows(allRows);
    }
  }
  const fromDate = new Date(dateRange.from);
  const toDate = new Date(dateRange.to);
  const currentBase = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  const prevPeriodBase = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  const prevYearBase = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  const prevMonthStart = new Date(fromDate);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const prevMonthEnd = new Date(prevMonthStart);
  prevMonthEnd.setMonth(prevMonthEnd.getMonth() + 1);
  prevMonthEnd.setDate(0);
  const prevYearStart = new Date(fromDate);
  prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
  const prevYearEnd = new Date(toDate);
  prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);
  for (const [monthKey, m] of Object.entries(monthly)) {
    const [y, mo] = monthKey.split('-').map(Number);
    const monthStart = new Date(y, mo - 1, 1);
    const monthEnd = new Date(y, mo, 0, 23, 59, 59);
    const base = {
      impressions: m.impressions,
      clicks: m.clicks,
      cost: m.cost,
      revenue: m.revenue,
      bookings: m.bookings,
    };
    if (monthStart >= fromDate && monthEnd <= toDate) {
      currentBase.impressions += base.impressions;
      currentBase.clicks += base.clicks;
      currentBase.cost += base.cost;
      currentBase.revenue += base.revenue;
      currentBase.bookings += base.bookings;
    }
    if (monthStart >= prevMonthStart && monthEnd <= prevMonthEnd) {
      prevPeriodBase.impressions += base.impressions;
      prevPeriodBase.clicks += base.clicks;
      prevPeriodBase.cost += base.cost;
      prevPeriodBase.revenue += base.revenue;
      prevPeriodBase.bookings += base.bookings;
    }
    if (monthStart >= prevYearStart && monthEnd <= prevYearEnd) {
      prevYearBase.impressions += base.impressions;
      prevYearBase.clicks += base.clicks;
      prevYearBase.cost += base.cost;
      prevYearBase.revenue += base.revenue;
      prevYearBase.bookings += base.bookings;
    }
  }
  return {
    current: calculateDerivedMetrics(currentBase) as ChannelMetrics,
    previous_period: calculateDerivedMetrics(prevPeriodBase) as ChannelMetrics,
    previous_year: calculateDerivedMetrics(prevYearBase) as ChannelMetrics,
    monthly,
    yearly,
    breakdowns,
    monthlyBreakdowns,
    filterUniqueValues: first.filterUniqueValues,
    dimensionMap: first.dimensionMap || {},
    rawDataRows: [],
  };
}
