/**
 * Single hook for SlideViewPage: report identity, raw rows, filtered data,
 * views, account report IDs, view budgets, and mutations.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useSlideReports, useSlideReport, useCreateSlideReport, useUpdateSlideReport } from "@/hooks/useSlideReports";
import { useDataStudioRawRows } from "@/hooks/useDataStudioRawRows";
import { useSlideReportViews, useCreateSlideReportView, useUpdateSlideReportView, useDeleteSlideReportView } from "@/hooks/useSlideReportViews";
import { useFilteredSlideData } from "@/hooks/useFilteredSlideData";
import { getAccountReportIds, clearAccountReportIdsCache, type AccountReportIds } from "@/lib/accountReportIds";
import type { SlideReport, SlideReportPivotData, SlideReportView } from "@/types/slideReports";
import type { ChannelMetrics } from "@/types/slideReports";
import type { BreakdownRow } from "@/types/slideReports";
import type { ChannelBudgets } from "@/lib/budgetCalculations";

export interface UseSlideReportPageParams {
  accountId: string | null;
  user: User | null;
  /** Always 'default' (Data Studio mode) after Phase B; master-report and brady removed. */
  slideType: 'default';
  filterValues: Record<string, Record<string, string[]>>;
  filterDimensionValues: Record<string, Record<string, string[]>>;
  selectedYear: string;
  selectedMonth: string;
  /** Exact date range override — when set, filtering uses precise from/to dates instead of month boundaries. */
  customDateRange?: import("react-day-picker").DateRange | undefined;
  selectedTab: string;
  comparisonType: string;
  chartTimeRange: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months' | null;
  groupByDimensionId: string;
  breakdownByDimensionId: string;
  selectedViewId: string | null;
  dynamicChannelTotals?: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  displayCurrency?: 'AUD' | 'USD';
  audPerUsd?: number;
}

export interface ViewBudgetItem {
  id: string;
  dimension_name: string;
  dimension_item: string;
  budget_data: Record<string, number | ChannelBudgets>;
}

export interface MonthlyDataRecord {
  id: string;
  slide_report_id: string;
  year: number;
  month: number;
  channel: string;
  metrics: ChannelMetrics;
  breakdowns: Record<string, BreakdownRow[]>;
  row_count: number;
  computed_at: string;
}

export interface UseSlideReportPageReturn {
  slideReportId: string | null;
  setSlideReportId: (id: string | null) => void;
  slideReport: SlideReport | null | undefined;
  effectivePivotData: SlideReportPivotData | null;
  filteredData: ReturnType<typeof useFilteredSlideData>;
  views: SlideReportView[];
  monthlyDataRecords: MonthlyDataRecord[];
  viewBudgets: ViewBudgetItem[];
  accountReportIds: AccountReportIds;
  getReportIdForChannel: (channel: 'metasearch' | 'sem' | 'social') => string | null;
  availableChannels: ('metasearch' | 'sem' | 'social')[];
  isSlideReportsLoading: boolean;
  isLoadingViews: boolean;
  isLoadingViewBudgets: boolean;
  isLoadingMonthlyData: boolean;
  needEditSourceForMasterReport: boolean;
  createSlideReport: ReturnType<typeof useCreateSlideReport>;
  updateSlideReport: ReturnType<typeof useUpdateSlideReport>;
  createView: ReturnType<typeof useCreateSlideReportView>;
  updateView: ReturnType<typeof useUpdateSlideReportView>;
  deleteView: ReturnType<typeof useDeleteSlideReportView>;
}

export function useSlideReportPage(params: UseSlideReportPageParams): UseSlideReportPageReturn {
  const {
    accountId,
    user,
    slideType,
    filterValues,
    filterDimensionValues,
    selectedYear,
    selectedMonth,
    customDateRange,
    selectedTab,
    comparisonType,
    chartTimeRange,
    groupByDimensionId,
    breakdownByDimensionId,
    selectedViewId,
    dynamicChannelTotals,
    displayCurrency,
    audPerUsd,
  } = params;

  const [slideReportId, setSlideReportId] = useState<string | null>(null);

  const { data: slideReports, isLoading: isSlideReportsLoading } = useSlideReports(accountId || null);

  const { data: accountReportIdsData } = useQuery({
    queryKey: ['accountReportIds', accountId ?? ''],
    queryFn: async (): Promise<AccountReportIds> => {
      if (!accountId) return { metasearch: null, sem: null, social: null };
      clearAccountReportIdsCache(accountId);
      return getAccountReportIds(accountId, false);
    },
    enabled: !!accountId,
  });

  const accountReportIds: AccountReportIds = accountReportIdsData ?? {
    metasearch: null,
    sem: null,
    social: null,
  };

  const availableChannels = useMemo(() => {
    const channels: ('metasearch' | 'sem' | 'social')[] = [];
    if (accountReportIds.metasearch) channels.push('metasearch');
    if (accountReportIds.sem) channels.push('sem');
    if (accountReportIds.social) channels.push('social');
    return channels;
  }, [accountReportIds]);

  useEffect(() => {
    const loadOrCreateSlideReport = async () => {
      if (!accountId || !user) return;
      if (!accountReportIds.sem && !accountReportIds.social && !accountReportIds.metasearch) return;
      if (isSlideReportsLoading) return;

      try {
        const allReports = slideReports || [];

        // Data Studio: prefer report named "Data Studio", else any active report
        const dataStudioReport = allReports
          .filter(r => r.name === 'Data Studio' && r.is_active)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
        if (dataStudioReport) {
          setSlideReportId(dataStudioReport.id);
          return;
        }
        const existingReport = allReports.find(r => r.is_active);
        if (existingReport) {
          setSlideReportId(existingReport.id);
        }
      } catch (error) {
        console.error('Error loading slide report:', error);
      }
    };

    loadOrCreateSlideReport();
  }, [accountId, user?.id, slideReports, isSlideReportsLoading, accountReportIds.metasearch, accountReportIds.sem, accountReportIds.social, availableChannels]);

  const { data: slideReport } = useSlideReport(slideReportId);

  // Data Studio: fetch raw rows from dimension_data (canonical DB cache)
  const { data: dataStudioResult } = useDataStudioRawRows(
    slideReport,
    !!slideReportId,
  );
  const dataStudioRawRows = dataStudioResult?.rawRows;
  const dataStudioDimensionMaps = dataStudioResult?.dimensionMaps;

  const effectivePivotData = useMemo((): SlideReportPivotData | null => {
    const base = slideReport?.pivot_data as SlideReportPivotData | null;
    if (!base) return null;
    if (!dataStudioRawRows || Object.keys(dataStudioRawRows).length === 0) {
      return base;
    }
    const channels: SlideReportPivotData['channels'] = { ...base.channels };
    for (const [ch, rows] of Object.entries(dataStudioRawRows)) {
      const baseChannel = base.channels?.[ch];
      const freshDimMap = dataStudioDimensionMaps?.[ch] || {};
      channels[ch] = {
        ...(baseChannel || {}),
        rawDataRows: rows,
        dimensionMap: Object.keys(freshDimMap).length > 0
          ? freshDimMap
          : (baseChannel?.dimensionMap || {}),
        filterUniqueValues: baseChannel?.filterUniqueValues || {},
      };
    }
    return { ...base, channels };
  }, [slideReport?.pivot_data, dataStudioRawRows, dataStudioDimensionMaps]);

  const filteredData = useFilteredSlideData({
    pivotData: effectivePivotData,
    filterValues,
    filterDimensionValues,
    selectedYear,
    selectedMonth,
    customDateRange,
    selectedTab,
    slideType,
    dynamicChannelTotals,
    groupByDimensionId,
  });

  const { data: views = [], isLoading: isLoadingViews } = useSlideReportViews(slideReportId);

  const createSlideReport = useCreateSlideReport();
  const updateSlideReport = useUpdateSlideReport();
  const createView = useCreateSlideReportView();
  const updateView = useUpdateSlideReportView();
  const deleteView = useDeleteSlideReportView();

  const { data: viewBudgetsData, isLoading: isLoadingViewBudgets } = useQuery({
    queryKey: ['viewBudgets', selectedViewId, accountId, user?.id],
    queryFn: async (): Promise<ViewBudgetItem[]> => {
      if (!selectedViewId || !accountId || !user?.id) return [];
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('view_id', selectedViewId)
        .eq('account_id', accountId)
        .eq('user_id', user.id);
      if (error) return [];
      return (data || []).map(b => ({
        id: b.id,
        dimension_name: b.dimension_name,
        dimension_item: b.dimension_item,
        budget_data: (b.budget_data as Record<string, number | ChannelBudgets>) || {},
      }));
    },
    enabled: !!selectedViewId && !!accountId && !!user?.id,
  });

  const viewBudgets = viewBudgetsData ?? [];

  // slide_report_monthly_data table dropped in Phase 1 migration — always empty now
  const monthlyDataRecords: MonthlyDataRecord[] = [];
  const isLoadingMonthlyData = false;

  const getReportIdForChannel = useCallback((channel: 'metasearch' | 'sem' | 'social'): string | null => {
    if (slideReport?.report_ids) {
      const storedReportIds = slideReport.report_ids as Record<string, string>;
      const storedId = storedReportIds[channel];
      if (storedId) {
        const accountSpecificId = accountReportIds[channel];
        if (accountSpecificId && storedId !== accountSpecificId) {
          return accountSpecificId;
        }
        return storedId;
      }
    }
    return accountReportIds[channel] ?? null;
  }, [slideReport?.report_ids, accountReportIds]);

  const needEditSourceForMasterReport = Boolean(
    !isSlideReportsLoading &&
    (slideReports || []).filter(r => r.name === 'Data Studio' && r.is_active).length === 0 &&
    !slideReportId
  );

  return {
    slideReportId,
    setSlideReportId,
    slideReport,
    effectivePivotData,
    filteredData,
    views,
    monthlyDataRecords,
    viewBudgets,
    accountReportIds,
    getReportIdForChannel,
    availableChannels,
    isSlideReportsLoading,
    isLoadingViews,
    isLoadingViewBudgets,
    isLoadingMonthlyData,
    needEditSourceForMasterReport,
    createSlideReport,
    updateSlideReport,
    createView,
    updateView,
    deleteView,
  };
}