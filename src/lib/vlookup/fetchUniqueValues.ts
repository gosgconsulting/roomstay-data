/**
 * Fetch unique dimension values from source data
 * 
 * This function extracts unique values from source data (Google Sheets/CSV)
 * instead of querying dimension_data table.
 */

import { supabase } from "@/integrations/supabase/client";
import { fetchGoogleSheetsAllData, extractSpreadsheetId } from "@/lib/data-sources/fetchGoogleSheets";
import { fetchCSVAllData } from "@/lib/data-sources/fetchCSV";
import { buildDimensionMappingWithAutoDetection, transformDataRows } from "@/lib/data-sources/transformRows";
import { getUser } from "@/lib/auth";

type Params = {
  reportId?: string;
  reportIds?: string[];
  dimensionId: string;
  dimensionName?: string;
  limit?: number;
};

/**
 * Fetch unique dimension values from source data
 */
export async function fetchUniqueDimensionValues(params: Params): Promise<string[]> {
  const { reportId, reportIds, dimensionId, dimensionName, limit = 5000 } = params;

  console.log('[fetchUniqueDimensionValues] Fetching unique values from source:', params);

  try {
    // Get user for authentication
    const { user } = await getUser();
    if (!user) {
      console.error('[fetchUniqueDimensionValues] User not authenticated');
      return [];
    }

    // Determine which report(s) to use
    const reportsToFetch = reportId ? [reportId] : (reportIds || []);
    if (reportsToFetch.length === 0) {
      console.error('[fetchUniqueDimensionValues] No reportId or reportIds provided');
      return [];
    }

    const allValues = new Set<string>();

    // Fetch data for each report
    for (const currentReportId of reportsToFetch) {
      // Fetch data source for the report
      const { data: dataSource, error: dsError } = await supabase
        .from('data_sources')
        .select('*')
        .eq('report_id', currentReportId)
        .limit(1)
        .maybeSingle();

      if (dsError || !dataSource) {
        console.warn(`[fetchUniqueDimensionValues] No data source found for report ${currentReportId}`);
        continue;
      }

      // Fetch source data
      const sourceType = (dataSource as any).source_type || 'google_sheets';
      let headers: string[] = [];
      let rows: any[][] = [];

      if (sourceType === 'csv_url') {
        if ((dataSource as any).csv_url) {
          const result = await fetchCSVAllData((dataSource as any).csv_url, (dataSource as any).header_row || 1);
          headers = result.headers;
          rows = result.dataRows;
        }
      } else {
        const spreadsheetId = (dataSource as any).spreadsheet_id || extractSpreadsheetId((dataSource as any).google_sheets_url || '');
        if (spreadsheetId && (dataSource as any).tab_name) {
          const result = await fetchGoogleSheetsAllData(
            spreadsheetId,
            (dataSource as any).tab_name,
            (dataSource as any).header_row || 1
          );
          headers = result.headers;
          rows = result.dataRows;
        }
      }

      if (rows.length === 0) {
        continue;
      }

      // Build dimension mapping
      const mappings = ((dataSource as any).column_mappings || []) as any[];
      const sampleDataRows = rows.slice(0, 10);
      
      const { dimensionIdMap, columnIndexMap } = await buildDimensionMappingWithAutoDetection(
        mappings,
        headers,
        sampleDataRows,
        user.id,
        currentReportId,
        (dataSource as any).id,
        undefined
      );

      // Fetch dimensions for type mapping
      const mappedDimensionIds = Object.values(dimensionIdMap);
      let dimensions: any[] = [];
      
      if (mappedDimensionIds.length > 0) {
        const { data: dimensionsData } = await supabase
          .from('dimensions')
          .select('id, name, type, formula')
          .in('id', mappedDimensionIds);
        
        if (dimensionsData) {
          dimensions = dimensionsData;
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

      // Extract unique values for the dimension
      // Support both dimensionId and dimensionName lookup
      const candidateIds = new Set<string>();
      candidateIds.add(dimensionId);

      // If dimensionName is provided, find all dimensions with that name
      if (dimensionName) {
        const { data: sameNameDims } = await supabase
          .from('dimensions')
          .select('id, name')
          .ilike('name', dimensionName);

        (sameNameDims || []).forEach((d: any) => {
          if (d?.id) candidateIds.add(String(d.id));
        });
      }

      // Extract unique values from transformed rows
      transformedRows.forEach((row: any) => {
        const dv = row.dimension_values || {};
        for (const id of Array.from(candidateIds)) {
          const val = dv[id];
          if (val !== undefined && val !== null && val !== '') {
            allValues.add(String(val).trim());
          }
        }
      });
    }

    // Convert to array, sort, and apply limit
    let values = Array.from(allValues);
    values.sort((a, b) => String(a).localeCompare(String(b)));
    if (typeof limit === 'number' && limit > 0) {
      values = values.slice(0, limit);
    }

    console.log(`[fetchUniqueDimensionValues] Found ${values.length} unique values`);
    return values;
  } catch (error) {
    console.error('[fetchUniqueDimensionValues] Error:', error);
    return [];
  }
}
