/**
 * React Query hook for caching AI Summary pivot and budget data
 * This ensures data persists across tab switches and reconnections
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { getUser } from "@/lib/auth";
import type { CachedPivotData, DateTab } from "@/components/AISummaryPivotTable";
import {
  getDateRange,
  aggregateMetrics,
} from "@/components/AISummaryPivotTable";

interface DataSource {
  id: string;
  report_id: string;
  name: string;
  source_type: "google_sheets" | "csv_url";
  spreadsheet_id: string | null;
  google_sheets_url: string | null;
  csv_url: string | null;
  tab_name: string | null;
  header_row: number;
  column_mappings: any[] | null;
}

interface Report {
  id: string;
  name: string;
}

export interface RawSourceData {
  [reportId: string]: {
    reportName: string;
    rows: any[];
  };
}

// Query keys for AI Summary data
export const aiSummaryKeys = {
  all: ["ai-summary"] as const,
  rawData: (cardId: string) => [...aiSummaryKeys.all, "raw-data", cardId] as const,
  pivotData: (cardId: string) => [...aiSummaryKeys.all, "pivot-data", cardId] as const,
  budgetData: (cardId: string, reportId: string) => [...aiSummaryKeys.all, "budget-data", cardId, reportId] as const,
  budgetMetrics: (cardId: string) => [...aiSummaryKeys.all, "budget-metrics", cardId] as const,
  budgets: (cardId: string) => [...aiSummaryKeys.all, "budgets", cardId] as const,
  forecasts: (cardId: string) => [...aiSummaryKeys.all, "forecasts", cardId] as const,
};

/**
 * Fetch raw source data for all reports in an AI Summary card
 */
async function fetchRawSourceData(
  reportIds: string[],
  accountId?: string
): Promise<RawSourceData> {
  if (reportIds.length === 0) {
    return {};
  }

  const { user } = await getUser();
  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data: reportsData } = await supabase
    .from("reports")
    .select("id, name")
    .in("id", reportIds);

  const reportsList = reportsData || [];
  const rawData: RawSourceData = {};

  for (const reportId of reportIds) {
    const report = reportsList.find((r: Report) => r.id === reportId);
    if (!report) {
      console.warn(`[AI-SUMMARY] Report ${reportId} not found, skipping`);
      continue;
    }

    const { data: dsData } = await supabase
      .from("data_sources")
      .select("*")
      .eq("report_id", reportId)
      .limit(1)
      .maybeSingle();

    if (!dsData) {
      console.warn(`[AI-SUMMARY] No data source found for report ${reportId}, skipping`);
      continue;
    }

    // Validate data source before fetching
    if (dsData.source_type === 'google_sheets') {
      if (!dsData.tab_name || typeof dsData.tab_name !== 'string' || dsData.tab_name.trim() === '') {
        console.warn(`[AI-SUMMARY] Skipping report ${reportId} (${report.name}): missing or invalid tab_name`);
        continue;
      }
      if (!dsData.spreadsheet_id && !dsData.google_sheets_url) {
        console.warn(`[AI-SUMMARY] Skipping report ${reportId} (${report.name}): missing spreadsheet_id and google_sheets_url`);
        continue;
      }
    } else if (dsData.source_type === 'csv_url') {
      if (!dsData.csv_url || typeof dsData.csv_url !== 'string' || dsData.csv_url.trim() === '') {
        console.warn(`[AI-SUMMARY] Skipping report ${reportId} (${report.name}): missing or invalid csv_url`);
        continue;
      }
    }

    try {
      const sourceData = await fetchSourceData(
        dsData as DataSource,
        user.id,
        accountId
      );

      if (sourceData?.transformedRows) {
        rawData[reportId] = {
          reportName: report.name,
          rows: sourceData.transformedRows,
        };
      }
    } catch (error) {
      console.error(`[AI-SUMMARY] Failed to load data for report ${reportId} (${report.name}):`, error);
      // Continue with other reports instead of failing completely
      // This allows partial data to be displayed
    }
  }

  return rawData;
}

/**
 * Hook to fetch and cache raw source data for AI Summary cards
 * This data persists across tab switches and reconnections
 */
export function useAISummaryRawData(
  cardId: string,
  reportIds: string[],
  accountId?: string,
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: aiSummaryKeys.rawData(cardId),
    queryFn: () => fetchRawSourceData(reportIds, accountId),
    enabled: enabled && !!cardId && reportIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 min
    gcTime: 60 * 60 * 1000, // 1 hour - keep in cache
    retry: 1, // Reduce retries from 2 to 1
    refetchOnWindowFocus: false, // Don't refetch on focus
    refetchOnMount: false, // Use cached data if available
    refetchOnReconnect: false, // Don't refetch on reconnect
    refetchInterval: false, // No automatic polling
  });
}

/**
 * Compute pivot data from raw source data for a specific tab
 */
export function computeTabData(
  rawSourceData: RawSourceData,
  reportIds: string[],
  selectedMetrics: string[],
  tab: DateTab
): Array<{ reportId: string; reportName: string; metrics: Record<string, number> }> {
  if (Object.keys(rawSourceData).length === 0) {
    return [];
  }

  const dateRange = getDateRange(tab);
  const results: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }> = [];

  for (const reportId of reportIds) {
    const reportData = rawSourceData[reportId];
    if (!reportData) continue;

    const metrics = aggregateMetrics(
      reportData.rows,
      selectedMetrics,
      dateRange
    );

    results.push({
      reportId: reportId,
      reportName: reportData.reportName,
      metrics,
    });
  }

  return results;
}

interface CachedBudgetMetrics {
  [reportKey: string]: {
    [monthKey: string]: {
      cost: number;
      revenue: number;
      clicks?: number;
    };
  };
}

interface ForecastRow {
  id: string;
  name: string;
  rooms: number;
  occupancy_rate: number;
  daily_rate: number;
}

/**
 * Fetch budgets for an AI Summary card
 */
async function fetchBudgets(
  cardId: string,
  reportIds: string[]
): Promise<Record<string, number>> {
  const { user } = await getUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from("ai_summary_budgets")
    .select("*")
    .eq("ai_summary_card_id", cardId)
    .in("report_id", reportIds);

  if (error) {
    console.error("Error fetching budgets:", error);
    return {};
  }

  // Aggregate budgets by month
  const budgetMap: Record<string, number> = {};
  (data || []).forEach((b: any) => {
    const amount = Number(b.budget_amount);
    budgetMap[b.month_key] = (budgetMap[b.month_key] || 0) + amount;
  });
  return budgetMap;
}

/**
 * Fetch cached budget metrics for an AI Summary card
 */
async function fetchCachedBudgetMetrics(
  cardId: string
): Promise<CachedBudgetMetrics | null> {
  const { data, error } = await supabase
    .from("ai_summary_cards")
    .select("cached_budget_data")
    .eq("id", cardId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching cached budget data:", error);
    return null;
  }

  return (data?.cached_budget_data as CachedBudgetMetrics) || null;
}

/**
 * Fetch forecasts for an AI Summary card
 */
async function fetchForecasts(cardId: string): Promise<ForecastRow[]> {
  const { data, error } = await supabase
    .from("ai_summary_forecasts")
    .select("*")
    .eq("ai_summary_card_id", cardId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching forecasts:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    rooms: row.rooms,
    occupancy_rate: row.occupancy_rate,
    daily_rate: row.daily_rate,
  }));
}

/**
 * Hook to fetch and cache budgets for an AI Summary card
 */
export function useAISummaryBudgets(
  cardId: string,
  reportIds: string[],
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: aiSummaryKeys.budgets(cardId),
    queryFn: () => fetchBudgets(cardId, reportIds),
    enabled: enabled && !!cardId && reportIds.length > 0,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Hook to fetch and cache budget metrics for an AI Summary card
 */
export function useAISummaryBudgetMetrics(
  cardId: string,
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: aiSummaryKeys.budgetMetrics(cardId),
    queryFn: () => fetchCachedBudgetMetrics(cardId),
    enabled: enabled && !!cardId,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Hook to fetch and cache forecasts for an AI Summary card
 */
export function useAISummaryForecasts(
  cardId: string,
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: aiSummaryKeys.forecasts(cardId),
    queryFn: () => fetchForecasts(cardId),
    enabled: enabled && !!cardId,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Hook to invalidate AI Summary data cache
 */
export function useInvalidateAISummaryData() {
  const queryClient = useQueryClient();

  return {
    invalidateCard: (cardId: string) => {
      queryClient.invalidateQueries({
        queryKey: aiSummaryKeys.rawData(cardId),
      });
    },
    invalidateBudgetData: (cardId: string) => {
      queryClient.invalidateQueries({
        queryKey: aiSummaryKeys.budgets(cardId),
      });
      queryClient.invalidateQueries({
        queryKey: aiSummaryKeys.budgetMetrics(cardId),
      });
      queryClient.invalidateQueries({
        queryKey: aiSummaryKeys.forecasts(cardId),
      });
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({
        queryKey: aiSummaryKeys.all,
      });
    },
    // Force refetch data for a card
    refetchCard: (cardId: string) => {
      queryClient.refetchQueries({
        queryKey: aiSummaryKeys.rawData(cardId),
      });
    },
  };
}
