/**
 * Computes channel revenue chart data directly from in-memory rawDataRows.
 *
 * Replaces useChannelChartDataFromTable which queried the now-dropped
 * slide_report_channel_month_data table. All data comes from dimension_data
 * via useDataStudioRawRows — no additional DB queries.
 */

import { useMemo } from 'react';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { buildMetricNameToIdsMap, getMetricKeys } from '@/lib/slideViewHelpers';
import { buildChannelChartDataFromMonthlyData } from '@/lib/chartDataCalculations';
import type { ChartTimeRange } from '@/lib/chartDataCalculations';
import type { RawDataRow, MonthlyDataPoint } from '@/types/slideView';

export type ChannelChartDataFromRawRows = Record<
  'metasearch' | 'sem' | 'social',
  Array<{ month: string; revenue: number }>
>;

/**
 * Bucket raw rows into monthly revenue data points per channel.
 * Uses the dimensionMap to resolve metric column UUIDs to names.
 */
function buildMonthlyDataFromRawRows(
  rawRows: Record<string, RawDataRow[]>,
  dimensionMaps: Record<string, Record<string, string>>
): MonthlyDataPoint[] {
  const map = new Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>();

  for (const [channel, rows] of Object.entries(rawRows)) {
    if (channel !== 'metasearch' && channel !== 'sem' && channel !== 'social') continue;
    if (!rows || rows.length === 0) continue;

    const dimensionMap = dimensionMaps[channel] || {};
    const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);

    const getVal = (rowData: any, keys: string[]): number => {
      for (const key of keys) {
        const v = rowData[key];
        if (v !== undefined && v !== null) {
          if (typeof v === 'number') return isNaN(v) ? 0 : v;
          const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
          if (!isNaN(n)) return n;
        }
      }
      return 0;
    };

    for (const row of rows) {
      const rowData = (row as any).dimension_values || row;

      // Find date value
      let dateValue: any = rowData.Date || rowData.date || rowData.Day || rowData.day;
      if (!dateValue) {
        for (const [, val] of Object.entries(rowData as Record<string, unknown>)) {
          if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
            dateValue = val;
            break;
          }
        }
      }
      if (!dateValue) continue;

      const rowDate = new Date(dateValue);
      if (isNaN(rowDate.getTime())) continue;

      const year = rowDate.getFullYear();
      const month = MONTH_NAMES[rowDate.getMonth()];
      const key = `${year}-${month}`;

      if (!map.has(key)) {
        map.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
      }

      const revenue = getVal(rowData, getMetricKeys('revenue', nameToIdsMap));
      map.get(key)![channel as 'metasearch' | 'sem' | 'social'] += revenue;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
  });
}

/**
 * Pure hook: computes channel chart data from rawDataRows already in memory.
 * No DB queries. Returns the same shape as the old useChannelChartDataFromTable.
 */
export function useChannelChartDataFromRawRows(
  rawRows: Record<string, RawDataRow[]> | undefined,
  dimensionMaps: Record<string, Record<string, string>> | undefined,
  chartTimeRange: ChartTimeRange | null,
  filterValues: Record<string, Record<string, string[]>> | null = null,
  anchorDate?: Date
): { data: ChannelChartDataFromRawRows | null; isLoading: boolean; isSuccess: boolean } {
  const data = useMemo(() => {
    if (!rawRows || !chartTimeRange) return null;

    const effectiveDimMaps = dimensionMaps || {};
    const monthlyData = buildMonthlyDataFromRawRows(rawRows, effectiveDimMaps);

    if (monthlyData.length === 0) return null;

    return buildChannelChartDataFromMonthlyData(
      monthlyData,
      chartTimeRange,
      anchorDate
    ) as ChannelChartDataFromRawRows;
  }, [rawRows, dimensionMaps, chartTimeRange, anchorDate]);

  return {
    data,
    isLoading: false,
    isSuccess: data !== null,
  };
}
