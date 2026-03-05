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
import type {
  DisplayDataBreakdownRow,
  GetSlideReportDisplayDataRequest,
  GetSlideReportDisplayDataResponse,
} from '@/types/slideReportDisplayApi';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type CurrencyCode = 'AUD' | 'USD';

type ChannelKey = 'metasearch' | 'sem' | 'social';

function getChannelBaseCurrency(channel: string): CurrencyCode {
  // Per requirement: all reports are AUD except Metasearch which is USD.
  if (channel === 'metasearch') return 'USD';
  return 'AUD';
}

function convertAmount(value: number, from: CurrencyCode, to: CurrencyCode, audPerUsd: number): number {
  if (!isFinite(value)) return 0;
  if (from === to) return value;
  if (!isFinite(audPerUsd) || audPerUsd <= 0) return value;

  if (from === 'USD' && to === 'AUD') return value * audPerUsd;
  if (from === 'AUD' && to === 'USD') return value / audPerUsd;
  return value;
}

function convertMetricData(
  channel: ChannelKey,
  m: MetricData & { cpc?: number; roas?: number; costOfSale?: number },
  to: CurrencyCode,
  audPerUsd: number,
  fromCurrency?: CurrencyCode
): MetricData & { cpc?: number; roas?: number; costOfSale?: number } {
  const from: CurrencyCode = fromCurrency ?? getChannelBaseCurrency(channel);
  const factorConvertedCost = convertAmount(1, from, to, audPerUsd);
  const factor = from === to ? 1 : factorConvertedCost;

  return {
    ...m,
    cost: convertAmount(m.cost ?? 0, from, to, audPerUsd),
    revenue: convertAmount(m.revenue ?? 0, from, to, audPerUsd),
    cpc: m.cpc == null ? undefined : m.cpc * factor,
    // roas and costOfSale are ratios/percentages; they don't change with currency conversion.
    roas: m.roas,
    costOfSale: m.costOfSale,
  };
}

function convertBreakdownRow(
  channel: ChannelKey,
  row: DisplayDataBreakdownRow,
  to: CurrencyCode,
  audPerUsd: number,
  fromCurrency?: CurrencyCode
): DisplayDataBreakdownRow {
  const from: CurrencyCode = fromCurrency ?? getChannelBaseCurrency(channel);
  const factorConvertedCost = convertAmount(1, from, to, audPerUsd);
  const factor = from === to ? 1 : factorConvertedCost;

  return {
    ...row,
    cost: convertAmount(row.cost ?? 0, from, to, audPerUsd),
    revenue: convertAmount(row.revenue ?? 0, from, to, audPerUsd),
    cpc: row.cpc == null ? undefined : row.cpc * factor,
    roas: row.roas,
    costOfSale: row.costOfSale,
  };
}

function convertRevenuePointByChannel(
  channel: ChannelKey,
  value: number,
  to: CurrencyCode,
  audPerUsd: number,
  fromCurrency?: CurrencyCode
): number {
  const from: CurrencyCode = fromCurrency ?? getChannelBaseCurrency(channel);
  return convertAmount(value ?? 0, from, to, audPerUsd);
}

/** Resolve source currency for a channel: API-provided or fallback by channel name. */
function getSourceCurrency(ch: ChannelKey, channelSourceCurrency?: Record<string, string> | null): CurrencyCode {
  const raw = channelSourceCurrency?.[ch];
  return raw === 'USD' || raw === 'AUD' ? raw : getChannelBaseCurrency(ch);
}

function convertApiResponse(
  res: GetSlideReportDisplayDataResponse,
  to: CurrencyCode,
  audPerUsd: number,
  breakdownChannel?: ChannelKey | null
): GetSlideReportDisplayDataResponse {
  const sourceCurrencies = res.channel_source_currency;

  const channelTotals = { ...res.channel_totals };
  (['metasearch', 'sem', 'social'] as const).forEach((ch) => {
    const current = channelTotals[ch];
    if (current) {
      channelTotals[ch] = convertMetricData(ch, current, to, audPerUsd, getSourceCurrency(ch, sourceCurrencies));
    }
  });

  const comparisonTotals = res.comparison_totals
    ? (() => {
        const out: typeof res.comparison_totals = { ...res.comparison_totals };
        (['metasearch', 'sem', 'social'] as const).forEach((ch) => {
          const current = out?.[ch];
          if (current) {
            out[ch] = convertMetricData(ch, current, to, audPerUsd, getSourceCurrency(ch, sourceCurrencies));
          }
        });
        return out;
      })()
    : res.comparison_totals;

  const monthlyData: MonthlyDataPoint[] = (res.monthly_data || []).map((m) => ({
    ...m,
    metasearch: convertRevenuePointByChannel('metasearch', m.metasearch ?? 0, to, audPerUsd, getSourceCurrency('metasearch', sourceCurrencies)),
    sem: convertRevenuePointByChannel('sem', m.sem ?? 0, to, audPerUsd, getSourceCurrency('sem', sourceCurrencies)),
    social: convertRevenuePointByChannel('social', m.social ?? 0, to, audPerUsd, getSourceCurrency('social', sourceCurrencies)),
  }));

  const monthly_channel_metrics = res.monthly_channel_metrics
    ? res.monthly_channel_metrics.map((p) => ({
        ...p,
        metasearch: {
          cost: convertRevenuePointByChannel('metasearch', p.metasearch?.cost ?? 0, to, audPerUsd, getSourceCurrency('metasearch', sourceCurrencies)),
          revenue: convertRevenuePointByChannel('metasearch', p.metasearch?.revenue ?? 0, to, audPerUsd, getSourceCurrency('metasearch', sourceCurrencies)),
        },
        sem: {
          cost: convertRevenuePointByChannel('sem', p.sem?.cost ?? 0, to, audPerUsd, getSourceCurrency('sem', sourceCurrencies)),
          revenue: convertRevenuePointByChannel('sem', p.sem?.revenue ?? 0, to, audPerUsd, getSourceCurrency('sem', sourceCurrencies)),
        },
        social: {
          cost: convertRevenuePointByChannel('social', p.social?.cost ?? 0, to, audPerUsd, getSourceCurrency('social', sourceCurrencies)),
          revenue: convertRevenuePointByChannel('social', p.social?.revenue ?? 0, to, audPerUsd, getSourceCurrency('social', sourceCurrencies)),
        },
      }))
    : res.monthly_channel_metrics;

  // breakdowns are returned for a *single* breakdown_channel, so convert using the channel selected in the UI.
  const breakdowns = res.breakdowns
    ? (() => {
        const inferredChannel: ChannelKey = breakdownChannel ?? 'sem';
        const fromCur = getSourceCurrency(inferredChannel, sourceCurrencies);
        const rows = (res.breakdowns?.rows || []).map((r) => convertBreakdownRow(inferredChannel, r, to, audPerUsd, fromCur));
        const expanded = res.breakdowns?.expanded
          ? Object.fromEntries(
              Object.entries(res.breakdowns.expanded).map(([k, v]) => [
                k,
                (v || []).map((r) => convertBreakdownRow(inferredChannel, r, to, audPerUsd, fromCur)),
              ])
            )
          : res.breakdowns?.expanded;
        return { ...res.breakdowns, rows, expanded };
      })()
    : res.breakdowns;

  return {
    ...res,
    channel_totals: channelTotals,
    comparison_totals: comparisonTotals,
    monthly_data: monthlyData,
    monthly_channel_metrics,
    breakdowns,
  };
}

/** Convert UI month name (e.g. "January") to API month number 1-12; null for 'all' or unknown. */
function monthNameToNumber(monthName: string): number | null {
  if (!monthName || monthName === 'all') return null;
  const i = MONTH_NAMES.findIndex((m) => m.toLowerCase() === String(monthName).trim().toLowerCase());
  return i >= 0 ? i + 1 : null;
}

export interface UseSlideReportDisplayDataParams extends UseFilteredSlideDataParams {
  slideReportId: string | null;
  comparisonType?: string;
  /** Chart time range (e.g. last_6_months). When set, API returns monthly_data for this range. */
  chartTimeRange?: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months' | null;
  /** Breakdown-by dimension id for expanded rows (so API returns expanded[groupValue] per account). */
  breakdownByDimensionId?: string | null;
  /** Display currency for Master Report (default handled by caller). */
  displayCurrency?: CurrencyCode;
  /** AUD per 1 USD. Used to convert USD<->AUD. */
  audPerUsd?: number;
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
  breakdownChannel: string | null,
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
    breakdownChannel,
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
  breakdownChannel: string | null,
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
    breakdownChannel,
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

  const displayCurrency: CurrencyCode = params.displayCurrency ?? 'USD';
  const audPerUsd = params.audPerUsd ?? 1;

  const useApi = slideType === 'master-report' && !!slideReportId;
  const comparisonType = params.comparisonType ?? 'none';
  const chartTimeRange = params.chartTimeRange ?? null;
  const breakdownByDimensionId = params.breakdownByDimensionId ?? null;
  const breakdownChannel =
    selectedTab === 'metasearch' || selectedTab === 'sem' || selectedTab === 'social' ? selectedTab : null;

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
        breakdownChannel,
        comparisonType
      ),
    [slideReportId, filterValues, selectedYear, selectedMonth, chartTimeRange, groupByDimensionId, breakdownByDimensionId, breakdownChannel, comparisonType]
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
        breakdownChannel,
        comparisonType
      ),
    [slideReportId, filterValues, selectedYear, selectedMonth, groupByDimensionId, breakdownByDimensionId, breakdownChannel, comparisonType]
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
        breakdown_channel: breakdownChannel ?? undefined,
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
        breakdown_channel: breakdownChannel ?? undefined,
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
      const convertedApiData = convertApiResponse(apiData, displayCurrency, audPerUsd, breakdownChannel as ChannelKey | null);
      const convertedTotalsData = apiTotalsData
        ? convertApiResponse(apiTotalsData, displayCurrency, audPerUsd, breakdownChannel as ChannelKey | null)
        : apiTotalsData;

      const mapped = mapResponseToFilteredShape(convertedApiData);
      const totalsPeriodMatches = (res: GetSlideReportDisplayDataResponse) => {
        const yearMatch = res.selected_year == null || res.selected_year === selectedYear;
        const monthNum = monthNameToNumber(selectedMonth);
        const monthMatch =
          res.selected_month == null || (monthNum != null && res.selected_month === monthNum);
        return yearMatch && monthMatch;
      };
      const channelTotals =
        needsTotalsForSelectedPeriod && convertedTotalsData?.channel_totals && totalsPeriodMatches(convertedTotalsData)
          ? {
              metasearch: {
                impressions: convertedTotalsData.channel_totals.metasearch?.impressions ?? 0,
                clicks: convertedTotalsData.channel_totals.metasearch?.clicks ?? 0,
                cost: convertedTotalsData.channel_totals.metasearch?.cost ?? 0,
                revenue: convertedTotalsData.channel_totals.metasearch?.revenue ?? 0,
                bookings: convertedTotalsData.channel_totals.metasearch?.bookings ?? 0,
              },
              sem: {
                impressions: convertedTotalsData.channel_totals.sem?.impressions ?? 0,
                clicks: convertedTotalsData.channel_totals.sem?.clicks ?? 0,
                cost: convertedTotalsData.channel_totals.sem?.cost ?? 0,
                revenue: convertedTotalsData.channel_totals.sem?.revenue ?? 0,
                bookings: convertedTotalsData.channel_totals.sem?.bookings ?? 0,
              },
              social: {
                impressions: convertedTotalsData.channel_totals.social?.impressions ?? 0,
                clicks: convertedTotalsData.channel_totals.social?.clicks ?? 0,
                cost: convertedTotalsData.channel_totals.social?.cost ?? 0,
                revenue: convertedTotalsData.channel_totals.social?.revenue ?? 0,
                bookings: convertedTotalsData.channel_totals.social?.bookings ?? 0,
              },
            }
          : mapped.channelTotals;
      const getChannelTotals = (channel: string): MetricData => {
        const c = channelTotals[channel as keyof typeof channelTotals];
        return c ?? { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      };
      // Only use breakdowns when response period matches current selection (avoids showing another month's data, e.g. Jan showing Feb's 98085)
      const totalsBreakdowns =
        needsTotalsForSelectedPeriod && convertedTotalsData?.breakdowns != null && totalsPeriodMatches(convertedTotalsData)
          ? convertedTotalsData.breakdowns
          : undefined;
      const mainBreakdowns =
        convertedApiData.breakdowns != null && totalsPeriodMatches(convertedApiData) ? convertedApiData.breakdowns : undefined;
      const apiBreakdowns = totalsBreakdowns ?? mainBreakdowns;
      return {
        ...mapped,
        channelTotals,
        getChannelTotals,
        monthlyData: mapped.monthlyData,
        dateRange: fallback.dateRange,
        displayDataFromApi: true,
        apiBreakdowns,
        apiMonthlyChannelMetrics: convertedApiData.monthly_channel_metrics,
        isLoadingDisplayData: false,
      } as FilteredSlideData & {
        displayDataFromApi: boolean;
        apiBreakdowns?: GetSlideReportDisplayDataResponse['breakdowns'];
        apiMonthlyChannelMetrics?: GetSlideReportDisplayDataResponse['monthly_channel_metrics'];
        isLoadingDisplayData: boolean;
      };
    }

    // Fallback: if master-report and caller provided currency settings, convert channel totals + monthly data.
    const shouldConvertFallback = slideType === 'master-report' && (params.displayCurrency != null || params.audPerUsd != null);
    if (shouldConvertFallback) {
      const convertedChannelTotals = {
        metasearch: {
          ...fallback.channelTotals.metasearch,
          cost: convertAmount(fallback.channelTotals.metasearch.cost, 'USD', displayCurrency, audPerUsd),
          revenue: convertAmount(fallback.channelTotals.metasearch.revenue, 'USD', displayCurrency, audPerUsd),
        },
        sem: {
          ...fallback.channelTotals.sem,
          cost: convertAmount(fallback.channelTotals.sem.cost, 'AUD', displayCurrency, audPerUsd),
          revenue: convertAmount(fallback.channelTotals.sem.revenue, 'AUD', displayCurrency, audPerUsd),
        },
        social: {
          ...fallback.channelTotals.social,
          cost: convertAmount(fallback.channelTotals.social.cost, 'AUD', displayCurrency, audPerUsd),
          revenue: convertAmount(fallback.channelTotals.social.revenue, 'AUD', displayCurrency, audPerUsd),
        },
      };

      const convertedMonthlyData = (fallback.monthlyData || []).map((m) => ({
        ...m,
        metasearch: convertAmount(m.metasearch ?? 0, 'USD', displayCurrency, audPerUsd),
        sem: convertAmount(m.sem ?? 0, 'AUD', displayCurrency, audPerUsd),
        social: convertAmount(m.social ?? 0, 'AUD', displayCurrency, audPerUsd),
      }));

      return {
        ...fallback,
        channelTotals: convertedChannelTotals,
        monthlyData: convertedMonthlyData,
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
  }, [useApi, apiData, apiTotalsData, apiError, isFetching, fallback, isLoadingDisplayData, needsTotalsForSelectedPeriod, selectedYear, selectedMonth, displayCurrency, audPerUsd, slideType, params.displayCurrency, params.audPerUsd]);
}