/**
 * Fetches display-ready data from get-slide-report-display-data edge function
 * for master-report slides so the frontend does no heavy filter/aggregate logic.
 * Falls back to useFilteredSlideData for non–master-report or when API is unavailable.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFilteredSlideData } from '@/hooks/useFilteredSlideData';
import type { FilteredSlideData, UseFilteredSlideDataParams } from '@/hooks/useFilteredSlideData';
import type { MetricData, MonthlyDataPoint, RawDataRow } from '@/types/slideView';
import type { GetSlideReportDisplayDataRequest, GetSlideReportDisplayDataResponse } from '@/types/slideReportDisplayApi';

export interface UseSlideReportDisplayDataParams extends UseFilteredSlideDataParams {
  slideReportId: string | null;
  comparisonType?: string;
  /** Chart time range (e.g. last_6_months). When set, API returns monthly_data for this range. */
  chartTimeRange?: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months' | null;
  /** Breakdown-by dimension id for expanded rows (so API returns expanded[groupValue] per account). */
  breakdownByDimensionId?: string | null;
}

const queryKeyPrefix = ['slide-report-display-data'] as const;
const queryKeyPrefixTotals = ['slide-report-display-data-totals'] as const;

function buildQueryKey(
  slideReportId: string | null,
  filterValues: Record<string, Record<string, string[]>>,
  selectedYear: string,
  selectedMonth: string,
  chartTimeRange: string | null,
  groupByDimensionId: string | null,
  breakdownByDimensionId: string | null,
  comparisonType: string
): readonly unknown[] {
  return [
    ...queryKeyPrefix,
    slideReportId,
    JSON.stringify(filterValues),
    selectedYear,
    selectedMonth,
    chartTimeRange,
    groupByDimensionId,
    breakdownByDimensionId,
    comparisonType,
  ];
}

/** Query key for "totals only" request (no chart_time_range) - used to get channel_totals/breakdowns for selected period when chart range is set */
function buildTotalsQueryKey(
  slideReportId: string | null,
  filterValues: Record<string, Record<string, string[]>>,
  selectedYear: string,
  selectedMonth: string,
  groupByDimensionId: string | null,
  breakdownByDimensionId: string | null,
  comparisonType: string
): readonly unknown[] {
  return [
    ...queryKeyPrefixTotals,
    slideReportId,
    JSON.stringify(filterValues),
    selectedYear,
    selectedMonth,
    groupByDimensionId,
    breakdownByDimensionId,
    comparisonType,
  ];
}

async function fetchDisplayData(
  params: GetSlideReportDisplayDataRequest
): Promise<GetSlideReportDisplayDataResponse> {
  const { data, error } = await supabase.functions.invoke('get-slide-report-display-data', {
    body: params,
  });
  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  return data as GetSlideReportDisplayDataResponse;
}

function mapResponseToFilteredShape(
  res: GetSlideReportDisplayDataResponse
): Omit<FilteredSlideData, 'dateRange'> & { dateRange?: { start: Date; end: Date } } {
  const channelTotals = {
    metasearch: {
      impressions: res.channel_totals.metasearch?.impressions ?? 0,
      clicks: res.channel_totals.metasearch?.clicks ?? 0,
      cost: res.channel_totals.metasearch?.cost ?? 0,
      revenue: res.channel_totals.metasearch?.revenue ?? 0,
      bookings: res.channel_totals.metasearch?.bookings ?? 0,
    },
    sem: {
      impressions: res.channel_totals.sem?.impressions ?? 0,
      clicks: res.channel_totals.sem?.clicks ?? 0,
      cost: res.channel_totals.sem?.cost ?? 0,
      revenue: res.channel_totals.sem?.revenue ?? 0,
      bookings: res.channel_totals.sem?.bookings ?? 0,
    },
    social: {
      impressions: res.channel_totals.social?.impressions ?? 0,
      clicks: res.channel_totals.social?.clicks ?? 0,
      cost: res.channel_totals.social?.cost ?? 0,
      revenue: res.channel_totals.social?.revenue ?? 0,
      bookings: res.channel_totals.social?.bookings ?? 0,
    },
  };
  const monthlyData: MonthlyDataPoint[] = (res.monthly_data || []).map((m) => ({
    year: m.year,
    month: m.month,
    metasearch: m.metasearch ?? 0,
    sem: m.sem ?? 0,
    social: m.social ?? 0,
  }));
  const channelsWithFilters = new Set<string>(res.channels_with_filters || []);
  const emptyRows: RawDataRow[] = [];
  const getFilteredRowsForChannel = (channel: string): RawDataRow[] => emptyRows;
  const getChannelTotals = (channel: string): MetricData => {
    const c = channelTotals[channel as keyof typeof channelTotals];
    return c ?? { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  };
  return {
    hasFilters: res.has_filters ?? false,
    channelsWithFilters,
    channelTotals,
    monthlyData,
    filteredRawRows: {},
    getFilteredRowsForChannel,
    getChannelTotals,
  };
}

/**
 * Returns display data from the backend API for master-report when slideReportId is set,
 * otherwise delegates to useFilteredSlideData (Brady/default reports).
 * Implements the same FilteredSlideData interface for drop-in use in SlideViewPage.
 */
export function useSlideReportDisplayData(params: UseSlideReportDisplayDataParams): FilteredSlideData & {
  displayDataFromApi: boolean;
  apiBreakdowns?: GetSlideReportDisplayDataResponse['breakdowns'];
  apiMonthlyChannelMetrics?: GetSlideReportDisplayDataResponse['monthly_channel_metrics'];
  /** True while the display-data API request is in flight (master-report). Use for skeleton loading. */
  isLoadingDisplayData: boolean;
} {
  const {
    slideReportId,
    pivotData,
    filterValues,
    filterDimensionValues,
    selectedYear,
    selectedMonth,
    selectedTab,
    slideType,
    dynamicChannelTotals,
    groupByDimensionId,
  } = params;

  const useApi = slideType === 'master-report' && !!slideReportId;
  const comparisonType = params.comparisonType ?? 'none';
  const chartTimeRange = params.chartTimeRange ?? null;
  const breakdownByDimensionId = params.breakdownByDimensionId ?? null;

  const queryKey = useMemo(
    () =>
      buildQueryKey(
        slideReportId,
        filterValues,
        selectedYear,
        selectedMonth,
        chartTimeRange,
        groupByDimensionId ?? null,
        breakdownByDimensionId,
        comparisonType
      ),
    [slideReportId, filterValues, selectedYear, selectedMonth, chartTimeRange, groupByDimensionId, breakdownByDimensionId, comparisonType]
  );

  const totalsQueryKey = useMemo(
    () =>
      buildTotalsQueryKey(
        slideReportId,
        filterValues,
        selectedYear,
        selectedMonth,
        groupByDimensionId ?? null,
        breakdownByDimensionId,
        comparisonType
      ),
    [slideReportId, filterValues, selectedYear, selectedMonth, groupByDimensionId, breakdownByDimensionId, comparisonType]
  );

  const needsTotalsForSelectedPeriod = Boolean(useApi && slideReportId && chartTimeRange);

  const { data: apiData, error: apiError, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      fetchDisplayData({
        slide_report_id: slideReportId!,
        filter_values: filterValues,
        selected_year: selectedYear,
        selected_month: selectedMonth,
        chart_time_range: chartTimeRange ?? undefined,
        group_by_dimension_id: groupByDimensionId ?? null,
        breakdown_by_dimension_id: breakdownByDimensionId ?? undefined,
        channels: ['metasearch', 'sem', 'social'],
        comparison_type: comparisonType as 'none' | 'previous_period' | 'previous_year',
      }),
    enabled: useApi && !!slideReportId,
    staleTime: 60 * 1000,
  });

  const { data: apiTotalsData } = useQuery({
    queryKey: totalsQueryKey,
    queryFn: () =>
      fetchDisplayData({
        slide_report_id: slideReportId!,
        filter_values: filterValues,
        selected_year: selectedYear,
        selected_month: selectedMonth,
        chart_time_range: undefined,
        group_by_dimension_id: groupByDimensionId ?? null,
        breakdown_by_dimension_id: breakdownByDimensionId ?? undefined,
        channels: ['metasearch', 'sem', 'social'],
        comparison_type: comparisonType as 'none' | 'previous_period' | 'previous_year',
      }),
    enabled: needsTotalsForSelectedPeriod && !!slideReportId,
    staleTime: 60 * 1000,
  });

  const fallback = useFilteredSlideData({
    pivotData,
    filterValues,
    filterDimensionValues,
    selectedYear,
    selectedMonth,
    selectedTab,
    slideType,
    dynamicChannelTotals,
    groupByDimensionId,
  });

  const isLoadingDisplayData = Boolean(useApi && isFetching);

  return useMemo(() => {
    if (useApi && apiData && !apiError && !isFetching) {
      const mapped = mapResponseToFilteredShape(apiData);
      const channelTotals =
        needsTotalsForSelectedPeriod && apiTotalsData?.channel_totals
          ? {
              metasearch: {
                impressions: apiTotalsData.channel_totals.metasearch?.impressions ?? 0,
                clicks: apiTotalsData.channel_totals.metasearch?.clicks ?? 0,
                cost: apiTotalsData.channel_totals.metasearch?.cost ?? 0,
                revenue: apiTotalsData.channel_totals.metasearch?.revenue ?? 0,
                bookings: apiTotalsData.channel_totals.metasearch?.bookings ?? 0,
              },
              sem: {
                impressions: apiTotalsData.channel_totals.sem?.impressions ?? 0,
                clicks: apiTotalsData.channel_totals.sem?.clicks ?? 0,
                cost: apiTotalsData.channel_totals.sem?.cost ?? 0,
                revenue: apiTotalsData.channel_totals.sem?.revenue ?? 0,
                bookings: apiTotalsData.channel_totals.sem?.bookings ?? 0,
              },
              social: {
                impressions: apiTotalsData.channel_totals.social?.impressions ?? 0,
                clicks: apiTotalsData.channel_totals.social?.clicks ?? 0,
                cost: apiTotalsData.channel_totals.social?.cost ?? 0,
                revenue: apiTotalsData.channel_totals.social?.revenue ?? 0,
                bookings: apiTotalsData.channel_totals.social?.bookings ?? 0,
              },
            }
          : mapped.channelTotals;
      const getChannelTotals = (channel: string): MetricData => {
        const c = channelTotals[channel as keyof typeof channelTotals];
        return c ?? { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      };
      const apiBreakdowns = needsTotalsForSelectedPeriod && apiTotalsData?.breakdowns != null ? apiTotalsData.breakdowns : apiData.breakdowns;
      return {
        ...mapped,
        channelTotals,
        getChannelTotals,
        monthlyData: mapped.monthlyData,
        dateRange: fallback.dateRange,
        displayDataFromApi: true,
        apiBreakdowns,
        apiMonthlyChannelMetrics: apiData.monthly_channel_metrics,
        isLoadingDisplayData: false,
      } as FilteredSlideData & {
        displayDataFromApi: boolean;
        apiBreakdowns?: GetSlideReportDisplayDataResponse['breakdowns'];
        apiMonthlyChannelMetrics?: GetSlideReportDisplayDataResponse['monthly_channel_metrics'];
        isLoadingDisplayData: boolean;
      };
    }
    return {
      ...fallback,
      displayDataFromApi: false,
      apiBreakdowns: undefined,
      apiMonthlyChannelMetrics: undefined,
      isLoadingDisplayData,
    } as FilteredSlideData & {
      displayDataFromApi: boolean;
      apiBreakdowns?: GetSlideReportDisplayDataResponse['breakdowns'];
      apiMonthlyChannelMetrics?: GetSlideReportDisplayDataResponse['monthly_channel_metrics'];
      isLoadingDisplayData: boolean;
    };
  }, [useApi, apiData, apiTotalsData, apiError, isFetching, fallback, isLoadingDisplayData, needsTotalsForSelectedPeriod]);
}
