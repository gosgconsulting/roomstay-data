/**
 * Hook for processing chart data
 */

import { useMemo } from 'react';
import {
  processOverviewChartData,
  processChannelChartData,
  type ChartTimeRange,
} from '@/lib/chartDataCalculations';
import type { SlideReportPivotData } from '@/types/slideReports';

/**
 * Hook for overview chart data (combined revenue from all channels)
 */
export function useOverviewChartData(
  pivotData: SlideReportPivotData | null,
  filterValues: Record<string, Record<string, string[]>>,
  channelsWithFilters: Set<string>,
  chartTimeRange: ChartTimeRange,
  anchorDate?: Date
) {
  return useMemo(() => {
    return processOverviewChartData(
      pivotData,
      filterValues,
      channelsWithFilters,
      chartTimeRange,
      anchorDate
    );
  }, [pivotData, filterValues, channelsWithFilters, chartTimeRange, anchorDate]);
}

/**
 * Hook for channel-specific chart data
 */
export function useChannelChartData(
  channel: 'metasearch' | 'sem' | 'social',
  pivotData: SlideReportPivotData | null,
  filterValues: Record<string, Record<string, string[]>>,
  channelsWithFilters: Set<string>,
  chartTimeRange: ChartTimeRange,
  anchorDate?: Date
) {
  return useMemo(() => {
    return processChannelChartData(
      channel,
      pivotData,
      filterValues,
      channelsWithFilters,
      chartTimeRange,
      anchorDate
    );
  }, [channel, pivotData, filterValues, channelsWithFilters, chartTimeRange, anchorDate]);
}

/**
 * Hook for all channel chart data
 */
export function useAllChannelChartData(
  pivotData: SlideReportPivotData | null,
  filterValues: Record<string, Record<string, string[]>>,
  channelsWithFilters: Set<string>,
  chartTimeRange: ChartTimeRange,
  anchorDate?: Date
) {
  const metasearch = useChannelChartData(
    'metasearch',
    pivotData,
    filterValues,
    channelsWithFilters,
    chartTimeRange,
    anchorDate
  );
  const sem = useChannelChartData(
    'sem',
    pivotData,
    filterValues,
    channelsWithFilters,
    chartTimeRange,
    anchorDate
  );
  const social = useChannelChartData(
    'social',
    pivotData,
    filterValues,
    channelsWithFilters,
    chartTimeRange,
    anchorDate
  );

  return useMemo(
    () => ({
      metasearch,
      sem,
      social,
    }),
    [metasearch, sem, social]
  );
}
