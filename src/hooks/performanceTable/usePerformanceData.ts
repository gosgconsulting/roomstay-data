/**
 * @deprecated This hook is deprecated. Use usePerformanceTableData instead, which uses useSourceData.
 * 
 * This hook previously called the get-performance-data edge function which queried dimension_data.
 * The new approach fetches data directly from Google Sheets/CSV using useSourceData hook.
 */

import { useQuery, type UseQueryResult, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSourceData } from "@/hooks/dataSources";
import type { DataSource } from "@/lib/data-sources/types";
import { useState, useEffect } from "react";

/**
 * Query keys for performance data
 */
export const performanceDataKeys = {
  all: ["performance-data"] as const,
  report: (reportId: string | null | undefined, accountId: string, params?: {
    reportIds?: string[];
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    dimensionFilters?: Record<string, string | string[]>;
    visibleDimensionIds?: string[];
    groupByDims?: string[];
    breakdownDims?: string[];
    thenByDims?: string[];
    dateGranularity?: 'day' | 'week' | 'month' | 'year';
    dateOrder?: 'asc' | 'desc';
  }) => [
    ...performanceDataKeys.all,
    "report",
    reportId || "null",
    accountId,
    params ? JSON.stringify(params) : "default",
  ] as const,
};

/**
 * Edge function response type (kept for backward compatibility)
 */
export interface EdgeFunctionResponse {
  data: any[];
  totalCount: number;
  totalRows: number;
  hasMore: boolean;
}

/**
 * Parameters for the edge function call
 */
export interface PerformanceDataParams {
  reportId?: string | null;
  reportIds?: string[];
  accountId: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  dimensionFilters?: Record<string, string | string[]>;
  visibleDimensionIds?: string[];
  groupByDims?: string[];
  breakdownDims?: string[];
  thenByDims?: string[];
  dateGranularity?: 'day' | 'week' | 'month' | 'year';
  dateOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Transform source data to match EdgeFunctionResponse format
 */
function transformSourceDataToEdgeResponse(
  sourceData: { transformedRows: any[] } | undefined,
  filters: {
    dateFrom?: string;
    dateTo?: string;
    dimensionFilters?: Record<string, string | string[]>;
  }
): EdgeFunctionResponse {
  if (!sourceData || !sourceData.transformedRows) {
    return {
      data: [],
      totalCount: 0,
      totalRows: 0,
      hasMore: false,
    };
  }

  let filteredRows = sourceData.transformedRows;

  // Apply date filter
  if (filters.dateFrom || filters.dateTo) {
    const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const toDate = filters.dateTo ? new Date(filters.dateTo) : null;
    const adjustedToDate = toDate
      ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
      : null;

    filteredRows = filteredRows.filter((row: any) => {
      // Find date dimension value in dimension_values
      const dimValues = row.dimension_values || {};
      const dateValue = Object.values(dimValues).find((v: any) => {
        if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) {
          return true;
        }
        return false;
      });

      if (!dateValue) return true; // Keep rows without date

      const rowDate = new Date(String(dateValue));
      if (fromDate && rowDate < fromDate) return false;
      if (adjustedToDate && rowDate >= adjustedToDate) return false;
      return true;
    });
  }

  // Apply dimension filters
  const normalizedFilters: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(filters.dimensionFilters || {})) {
    if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
    else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
  }

  if (Object.keys(normalizedFilters).length > 0) {
    filteredRows = filteredRows.filter((row: any) => {
      const dv = row.dimension_values || {};
      for (const [dimId, values] of Object.entries(normalizedFilters)) {
        if (!values || values.length === 0) continue;
        const rowVal = dv[dimId];
        if (rowVal === undefined || rowVal === null) return false;

        const rowStr = String(rowVal).trim().toLowerCase();
        const filterValuesLower = (values as string[]).map(v => String(v).trim().toLowerCase());

        if (!filterValuesLower.some((v) => v === rowStr)) return false;
      }
      return true;
    });
  }

  // Transform to EdgeFunctionResponse format
  const data = filteredRows.map((row: any, i: number) => ({
    id: `row-${row.row_number ?? i + 1}`,
    dimension_values: row.dimension_values || {},
    row_number: row.row_number ?? i + 1,
    data_source_id: null, // Not available from source data
  }));

  return {
    data,
    totalCount: data.length,
    totalRows: data.length,
    hasMore: false,
  };
}

/**
 * React Query hook to fetch performance data using source data
 * 
 * @deprecated Use usePerformanceTableData instead
 * 
 * @param params - Parameters for fetching data
 * @param enabled - Whether the query should be enabled (default: true)
 * @returns React Query result with edge function data format
 */
export function usePerformanceData(
  params: PerformanceDataParams | null,
  enabled: boolean = true
): UseQueryResult<EdgeFunctionResponse, Error> {
  const [dataSource, setDataSource] = useState<DataSource | null>(null);

  // Fetch data source for the report
  useEffect(() => {
    const fetchDataSource = async () => {
      if (!params?.reportId) {
        setDataSource(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('data_sources')
          .select('*')
          .eq('report_id', params.reportId)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[usePerformanceData] Error fetching data source:', error);
          return;
        }

        if (data) {
          setDataSource({
            ...data,
            column_mappings: (data.column_mappings as any) || null,
          } as DataSource);
        }
      } catch (error) {
        console.error('[usePerformanceData] Error fetching data source:', error);
      }
    };

    fetchDataSource();
  }, [params?.reportId]);

  // Use source data hook to get actual source data
  const { data: sourceData, isLoading, error } = useSourceData(
    dataSource,
    params?.accountId,
    { enabled: enabled && !!dataSource && !!params?.reportId }
  );

  // Transform source data to EdgeFunctionResponse format
  return useQuery({
    queryKey: params
      ? performanceDataKeys.report(params.reportId, params.accountId, {
          reportIds: params.reportIds,
          userId: params.userId,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          dimensionFilters: params.dimensionFilters,
          visibleDimensionIds: params.visibleDimensionIds,
          groupByDims: params.groupByDims,
          breakdownDims: params.breakdownDims,
          thenByDims: params.thenByDims,
          dateGranularity: params.dateGranularity,
          dateOrder: params.dateOrder,
        })
      : ["performance-data", "disabled"],
    queryFn: () => {
      if (!params) {
        throw new Error("Performance data params are required");
      }
      
      return transformSourceDataToEdgeResponse(
        sourceData,
        {
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          dimensionFilters: params.dimensionFilters,
        }
      );
    },
    enabled: enabled && !!params && !!params.accountId && !!params.reportId && !!sourceData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  });
}

/**
 * @deprecated Use useSourceData directly instead
 */
export async function fetchPerformanceData(
  params: PerformanceDataParams,
  queryClient?: QueryClient
): Promise<EdgeFunctionResponse> {
  console.warn('[fetchPerformanceData] This function is deprecated. Use useSourceData hook instead.');
  
  // For backward compatibility, we can't use hooks here, so return empty response
  // Callers should migrate to use useSourceData hook
  return {
    data: [],
    totalCount: 0,
    totalRows: 0,
    hasMore: false,
  };
}
