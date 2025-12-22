/**
 * React Query hook for fetching and caching source data
 */

import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dataSourceKeys } from "./queryKeys";
import { fetchGoogleSheetsAllData, extractSpreadsheetId } from "@/lib/data-sources/fetchGoogleSheets";
import { fetchCSVAllData } from "@/lib/data-sources/fetchCSV";
import { buildDimensionMappingWithAutoDetection, transformDataRows } from "@/lib/data-sources/transformRows";
import type { DataSource, ColumnMapping, Dimension } from "@/lib/data-sources/types";
import { getUser } from "@/lib/auth";

export interface UseSourceDataOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

export interface SourceDataResult {
  headers: string[];
  rows: any[][];
  dimensionIdMap: Record<string, string>;
  columnIndexMap: Record<string, number>;
  transformedRows: any[];
}

/**
 * Fetch source data from Google Sheets or CSV
 * Exported for use in non-hook contexts (e.g., data-loading-fix.ts)
 */
export async function fetchSourceData(
  dataSource: DataSource,
  userId: string,
  accountId?: string | null
): Promise<SourceDataResult> {
  const sourceType = dataSource.source_type || 'google_sheets';
  let headers: string[] = [];
  let rows: any[][] = [];

  if (sourceType === 'csv_url') {
    if (!dataSource.csv_url) {
      throw new Error('CSV URL is required for CSV data source');
    }
    const result = await fetchCSVAllData(dataSource.csv_url, dataSource.header_row || 1);
    headers = result.headers;
    rows = result.dataRows;
  } else {
    if (!dataSource.spreadsheet_id && !dataSource.google_sheets_url) {
      throw new Error('Spreadsheet ID or URL is required for Google Sheets data source');
    }
    if (!dataSource.tab_name) {
      throw new Error('Tab name is required for Google Sheets data source');
    }
    
    const spreadsheetId = dataSource.spreadsheet_id || extractSpreadsheetId(dataSource.google_sheets_url || '');
    if (!spreadsheetId) {
      throw new Error('Invalid Google Sheets URL');
    }
    
    const result = await fetchGoogleSheetsAllData(
      spreadsheetId,
      dataSource.tab_name,
      dataSource.header_row || 1
    );
    headers = result.headers;
    rows = result.dataRows;
  }

  // Build dimension mapping
  const mappings = (dataSource.column_mappings || []) as ColumnMapping[];
  const sampleDataRows = rows.slice(0, 10);
  
  const { dimensionIdMap, columnIndexMap } = await buildDimensionMappingWithAutoDetection(
    mappings,
    headers,
    sampleDataRows,
    userId,
    dataSource.report_id || '',
    dataSource.id,
    accountId
  );

  // Fetch dimensions for type mapping
  const dimensionIds = Object.values(dimensionIdMap);
  let dimensions: Dimension[] = [];
  
  if (dimensionIds.length > 0) {
    const { data: dimensionsData } = await supabase
      .from('dimensions')
      .select('id, name, type, formula')
      .in('id', dimensionIds);
    
    if (dimensionsData) {
      dimensions = dimensionsData as Dimension[];
    }
  }

  // Transform rows
  const transformedRows = await transformDataRows(
    rows,
    mappings,
    dimensionIdMap,
    columnIndexMap,
    dimensions
  );

  return {
    headers,
    rows,
    dimensionIdMap,
    columnIndexMap,
    transformedRows,
  };
}

/**
 * Hook to fetch and cache source data
 */
export function useSourceData(
  dataSource: DataSource | null,
  accountId?: string | null,
  options: UseSourceDataOptions = {}
): UseQueryResult<SourceDataResult, Error> {
  const queryClient = useQueryClient();
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000, // 5 minutes
    gcTime = 15 * 60 * 1000, // 15 minutes
  } = options;

  return useQuery({
    queryKey: dataSourceKeys.sourceData(
      dataSource?.id || '',
      dataSource?.report_id || '',
      dataSource?.updated_at || undefined
    ),
    queryFn: async () => {
      if (!dataSource) {
        throw new Error('Data source is required');
      }
      
      const { user } = await getUser();
      if (!user) {
        throw new Error('User must be authenticated');
      }
      
      return fetchSourceData(dataSource, user.id, accountId);
    },
    enabled: enabled && !!dataSource && !!dataSource.id,
    staleTime,
    gcTime,
    retry: 2,
  });
}

/**
 * Invalidate source data cache
 */
export function useInvalidateSourceData() {
  const queryClient = useQueryClient();
  
  return {
    invalidate: (dataSourceId: string, reportId: string) => {
      queryClient.invalidateQueries({
        queryKey: dataSourceKeys.sourceData(dataSourceId, reportId),
      });
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({
        queryKey: dataSourceKeys.all,
      });
    },
  };
}
