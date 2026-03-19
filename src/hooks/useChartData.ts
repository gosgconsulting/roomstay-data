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
  anchorDate?: Date,
  configuredDimensionNames?: Record<string, string>
) {
  return useMemo(() => {
    return processOverviewChartData(
      pivotData,
      filterValues,
      channelsWithFilters,
      chartTimeRange,
      anchorDate,
      configuredDimensionNames
    );
  }, [pivotData, filterValues, channelsWithFilters, chartTimeRange, anchorDate, configuredDimensionNames]);
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
  anchorDate?: Date,
  configuredDimensionNames?: Record<string, string>
) {
  return useMemo(() => {
    return processChannelChartData(
      channel,
      pivotData,
      filterValues,
      channelsWithFilters,
      chartTimeRange,
      anchorDate,
      configuredDimensionNames
    );
  }, [channel, pivotData, filterValues, channelsWithFilters, chartTimeRange, anchorDate, configuredDimensionNames]);
}

/**
 * Hook for all channel chart data
 */
export function useAllChannelChartData(
  pivotData: SlideReportPivotData | null,
  filterValues: Record<string, Record<string, string[]>>,
  channelsWithFilters: Set<string>,
  chartTimeRange: ChartTimeRange,
  anchorDate?: Date,
  configuredDimensionNames?: Record<string, string>
) {
  const metasearch = useChannelChartData(
    'metasearch',
    pivotData,
    filterValues,
    channelsWithFilters,
    chartTimeRange,
    anchorDate,
    configuredDimensionNames
  );
  const sem = useChannelChartData(
    'sem',
    pivotData,
    filterValues,
    channelsWithFilters,
    chartTimeRange,
    anchorDate,
    configuredDimensionNames
  );
  const social = useChannelChartData(
    'social',
    pivotData,
    filterValues,
    channelsWithFilters,
    chartTimeRange,
    anchorDate,
    configuredDimensionNames
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
