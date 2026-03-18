/**
 * Legacy compatibility hook.
 *
 * Historically `master-report` slides fetched "display-ready" aggregates from the
 * `get-slide-report-display-data` edge function.
 *
 * Phase 7 cleanup: we no longer call that API (it is deprecated/disabled), and we
 * always use the in-app filtered path (`useFilteredSlideData`).
 */

import { useMemo } from 'react';
import { useFilteredSlideData } from '@/hooks/useFilteredSlideData';
import type { FilteredSlideData, UseFilteredSlideDataParams } from '@/hooks/useFilteredSlideData';

type CurrencyCode = 'AUD' | 'USD';

function convertAmount(value: number, from: CurrencyCode, to: CurrencyCode, audPerUsd: number): number {
  if (!isFinite(value)) return 0;
  if (from === to) return value;
  if (!isFinite(audPerUsd) || audPerUsd <= 0) return value;

  if (from === 'USD' && to === 'AUD') return value * audPerUsd;
  if (from === 'AUD' && to === 'USD') return value / audPerUsd;
  return value;
}

export interface UseSlideReportDisplayDataParams extends UseFilteredSlideDataParams {
  slideReportId: string | null;
  comparisonType?: string;
  chartTimeRange?: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months' | null;
  breakdownByDimensionId?: string | null;
  displayCurrency?: CurrencyCode;
  audPerUsd?: number;
}

export function useSlideReportDisplayData(
  params: UseSlideReportDisplayDataParams
): FilteredSlideData & {
  displayDataFromApi: boolean;
  apiBreakdowns?: undefined;
  apiMonthlyChannelMetrics?: undefined;
  isLoadingDisplayData: boolean;
} {
  const {
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

  return useMemo(() => {
    const shouldConvertFallback =
      slideType === 'master-report' && (params.displayCurrency != null || params.audPerUsd != null);

    if (!shouldConvertFallback) {
      return {
        ...fallback,
        displayDataFromApi: false,
        apiBreakdowns: undefined,
        apiMonthlyChannelMetrics: undefined,
        isLoadingDisplayData: false,
      };
    }

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
      isLoadingDisplayData: false,
    };
  }, [audPerUsd, displayCurrency, fallback, params.audPerUsd, params.displayCurrency, slideType]);
}

