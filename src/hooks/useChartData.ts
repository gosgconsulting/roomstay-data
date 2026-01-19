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
  chartTimeRange: ChartTimeRange
) {
  return useMemo(() => {
    return processOverviewChartData(
      pivotData,
      filterValues,
      channelsWithFilters,
      chartTimeRange
    );
  }, [pivotData, filterValues, channelsWithFilters, chartTimeRange]);
}

/**
 * Hook for channel-specific chart data
 */
export function useChannelChartData(
  channel: 'metasearch' | 'sem' | 'social',
  pivotData: SlideReportPivotData | null,
  filterValues: Record<string, Record<string, string[]>>,
  channelsWithFilters: Set<string>,
  chartTimeRange: ChartTimeRange
) {
  return useMemo(() => {
    return processChannelChartData(
      channel,
      pivotData,
      filterValues,
      channelsWithFilters,
      chartTimeRange
    );
  }, [channel, pivotData, filterValues, channelsWithFilters, chartTimeRange]);
}

/**
 * Hook for all channel chart data
 */
export function useAllChannelChartData(
  pivotData: SlideReportPivotData | null,
  filterValues: Record<string, Record<string, string[]>>,
  channelsWithFilters: Set<string>,
  chartTimeRange: ChartTimeRange
) {
  const metasearch = useChannelChartData(
    'metasearch',
    pivotData,
    filterValues,
    channelsWithFilters,
    chartTimeRange
  );
  const sem = useChannelChartData(
    'sem',
    pivotData,
    filterValues,
    channelsWithFilters,
    chartTimeRange
  );
  const social = useChannelChartData(
    'social',
    pivotData,
    filterValues,
    channelsWithFilters,
    chartTimeRange
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
