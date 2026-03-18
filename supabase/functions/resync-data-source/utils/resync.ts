import type { DataSource, ResponseBody } from './types.ts';
import { extractSpreadsheetId, parseDate } from './utils.ts';
import { fetchGoogleSheetsData } from './google-sheets.ts';
import { fetchCSVUrlData } from './csv-url.ts';
import { deleteExistingData, deleteRecentData, deleteCustomDimensions, fixColumnMappings } from './database.ts';
import { buildDimensionMappingWithAutoDetection } from './dimensions.ts';
import { transformDataRows, insertDataInBatches, updateColumnMappings } from './transform.ts';

/**
 * Main resync function that orchestrates the complete data source resync process
 * 
 * This function performs a full resync of a data source by:
 * 1. Fixing problematic column mappings
 * 2. Deleting all existing dimension_data
 * 3. Deleting custom dimensions (to recreate from scratch)
 * 4. Fetching headers and data from Google Sheets
 * 5. Building dimension mappings with auto-detection
 * 6. Transforming data rows
 * 7. Inserting data in batches
 * 8. Updating column mappings if new dimensions were created
 * 
 * @param {any} supabase - Supabase client instance (with service role key)
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseAnonKey - Anonymous key for calling other edge functions
 * @param {DataSource} dataSource - Data source configuration object
 * @param {string} userId - User ID from the report (required for dimension creation)
 * 
 * @returns {Promise<ResponseBody>} Result object with success status, rows processed, and dimensions created
 * 
 * @throws {Error} If data source is missing report_id
 * @throws {Error} If Google Sheets data cannot be fetched
 * @throws {Error} If data transformation or insertion fails
 * 
 * @example
 * const result = await resyncDataSource(
 *   supabase,
 *   'https://project.supabase.co',
 *   'anon-key',
 *   dataSource,
 *   'user-uuid'
 * );
 * 
 * if (result.success) {
 *   console.log(`Processed ${result.rowsProcessed} rows`);
 * } else {
 *   console.error(result.error);
 * }
 */
/**
 * refreshMode:
 *  'full'   — delete ALL existing rows for the data source, then re-insert everything (default).
 *  'recent' — delete only rows from the last 2 months, then re-insert only those rows.
 *             Older historical data is preserved. Useful for fast daily/weekly refreshes.
 */
export type RefreshMode = 'full' | 'recent';

export const resyncDataSource = async (
  supabase: any,
  supabaseUrl: string,
  supabaseAnonKey: string,
  dataSource: DataSource,
  userId: string,
  refreshMode: RefreshMode = 'full'
): Promise<ResponseBody> => {
  try {
    // Get report_id and account_id
    let reportId: string = dataSource.report_id || '';
    let accountId: string | null = null;
    
    if (!reportId) {
      const { data: dsData, error: dsError } = await supabase
        .from('data_sources')
        .select('report_id')
        .eq('id', dataSource.id)
        .maybeSingle();
      
      if (dsError) throw dsError;
      reportId = dsData?.report_id || '';
    }
    
    // Validate reportId is present
    if (!reportId) {
      throw new Error('Data source must have a report_id');
    }

    // Get account_id from report
    if (reportId) {
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('account_id')
        .eq('id', reportId)
        .maybeSingle();
      
      if (!reportError && reportData) {
        accountId = reportData.account_id;
      }
    }

    console.log(`[RESYNC] Starting resync for data source: ${dataSource.name} (account: ${accountId || 'none'}, mode: ${refreshMode})`);
    
    // Step 1: Fix problematic column mappings
    await fixColumnMappings(supabase, dataSource.id);

    // For 'full' mode: delete all data and dimensions upfront.
    // For 'recent' mode: we defer deletion until after we've fetched + filtered rows
    // (we need the date column info from the data itself).
    if (refreshMode === 'full') {
      // Step 2: Delete existing data
      await deleteExistingData(supabase, dataSource.id);
      // Step 3: Delete custom dimensions (recreate from scratch)
      await deleteCustomDimensions(supabase, dataSource.id);
    }

    // Step 4: Determine source type and fetch headers/data
    const sourceType = dataSource.source_type || 'google_sheets'; // Default to google_sheets for backward compatibility
    let headers: string[] = [];
    let allData: any[] = [];
    
    if (sourceType === 'csv_url') {
      // CSV URL source
      if (!dataSource.csv_url) {
        throw new Error('CSV URL is required for CSV data source');
      }
      
      console.log(`[RESYNC] Fetching data from CSV URL...`);
      const csvData = await fetchCSVUrlData(
        supabaseUrl,
        supabaseAnonKey,
        dataSource.csv_url
      );
      
      if (csvData.length === 0) {
        throw new Error('No data found in CSV file');
      }
      
      // Extract headers from the specified header row
      const headerRowNum = dataSource.header_row || 1;
      if (headerRowNum < 1 || headerRowNum > csvData.length) {
        throw new Error(`Header row ${headerRowNum} is out of range. CSV has ${csvData.length} rows.`);
      }
      
      headers = csvData[headerRowNum - 1].map((h: any) => 
        h === null || h === undefined ? '' : String(h).trim()
      );
      
      // Get all data rows (skip header row)
      allData = csvData.slice(headerRowNum);
      
      console.log(`[RESYNC] Successfully fetched ${allData.length} rows from CSV URL`);
    } else {
      // Google Sheets source: allow spreadsheet_id from URL if missing
      let spreadsheetId = dataSource.spreadsheet_id || null;
      if (!spreadsheetId && dataSource.google_sheets_url) {
        spreadsheetId = extractSpreadsheetId(dataSource.google_sheets_url);
      }
      const tabName = (dataSource.tab_name && String(dataSource.tab_name).trim()) || 'Sheet1';
      if (!spreadsheetId) {
        throw new Error('Spreadsheet ID (or Google Sheets URL) and tab name are required for Google Sheets data source');
      }

      // Fetch headers
      const headerRow = dataSource.header_row ?? 1;
      const headerRange = `A${headerRow}:Z${headerRow}`;
      const headerData = await fetchGoogleSheetsData(
        supabaseUrl,
        supabaseAnonKey,
        spreadsheetId,
        tabName,
        headerRange
      );
      
      headers = headerData[0].map((h: any) => 
        h === null || h === undefined ? '' : String(h).trim()
      );

      // Step 5: Fetch all data in chunks for large datasets
      console.log(`[RESYNC] Fetching data from Google Sheets...`);
      
      const SHEET_CHUNK_SIZE = 25000; // Fetch 25K rows at a time to prevent timeouts
      
      // Try to fetch all data first, with fallback to chunked approach
      try {
        console.log(`[RESYNC] Attempting to fetch all data at once...`);
        const dataRange = `A${headerRow + 1}:Z`;
        const initialData = await fetchGoogleSheetsData(
          supabaseUrl,
          supabaseAnonKey,
          spreadsheetId,
          tabName,
          dataRange
        );
        
        if (initialData && initialData.length > 0) {
          allData = initialData;
          console.log(`[RESYNC] Successfully fetched ${allData.length} rows in single request`);
        }
      } catch (fetchError) {
        console.warn(`[RESYNC] Single fetch failed, switching to chunked approach:`, fetchError);
        
        // Fallback to chunked fetching for very large datasets
        let startRow = headerRow + 1;
        let hasMoreData = true;
        let chunkCount = 0;
        
        while (hasMoreData) {
          const endRow = startRow + SHEET_CHUNK_SIZE - 1;
          const chunkRange = `A${startRow}:Z${endRow}`;
          
          console.log(`[RESYNC] Fetching chunk ${++chunkCount}: rows ${startRow}-${endRow}`);
          
          try {
            const chunkData = await fetchGoogleSheetsData(
              supabaseUrl,
              supabaseAnonKey,
              spreadsheetId,
              tabName,
              chunkRange
            );
            
            if (chunkData && chunkData.length > 0) {
              allData = [...allData, ...chunkData];
              console.log(`[RESYNC] Chunk ${chunkCount}: ${chunkData.length} rows, total: ${allData.length}`);
              
              // If we got less than the chunk size, we've reached the end
              if (chunkData.length < SHEET_CHUNK_SIZE) {
                hasMoreData = false;
                console.log(`[RESYNC] Reached end of data at chunk ${chunkCount}`);
              } else {
                startRow = endRow + 1;
              }
            } else {
              hasMoreData = false;
              console.log(`[RESYNC] No more data found at chunk ${chunkCount}`);
            }
          } catch (chunkError) {
            console.error(`[RESYNC] Error fetching chunk ${chunkCount}:`, chunkError);
            // Continue with data we have so far
            hasMoreData = false;
          }
          
          // Add progress feedback for large datasets
          if (allData.length > 0 && allData.length % 50000 === 0) {
            console.log(`[RESYNC] Progress: ${allData.length} rows fetched from Google Sheets...`);
          }
        }
        
        console.log(`[RESYNC] Chunked fetch complete: ${allData.length} total rows in ${chunkCount} chunks`);
      }
    }

    // Step 6: Build dimension mapping with auto-detection
    // Use first 10 rows as sample data for auto-detection
    const sampleDataForAutoDetection = allData.slice(0, 10);

    // For 'recent' mode, do NOT recreate dimensions — they already exist from the full sync.
    const recreateDimensions = refreshMode === 'full';
    
    const { dimensionIdMap, columnIndexMap, createdCount } = await buildDimensionMappingWithAutoDetection(
      supabase,
      dataSource.column_mappings || [],
      headers,
      sampleDataForAutoDetection,
      userId,
      reportId,
      dataSource.id,
      recreateDimensions,
      accountId
    );

    // Step 7: For 'recent' mode, filter allData to only the last 2 months before transforming.
    let dataToProcess = allData;
    if (refreshMode === 'recent') {
      // Find the date column index from column mappings or auto-detection
      const dateColIndex = findDateColumnIndex(headers, dataSource.column_mappings || []);
      if (dateColIndex >= 0) {
        const cutoffDate = getTwoMonthsCutoff();
        const cutoffStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const before = allData.length;
        dataToProcess = allData.filter((row) => {
          const rawVal = row[dateColIndex];
          if (rawVal == null || rawVal === '') return false;
          const parsed = parseDate(String(rawVal));
          if (!parsed) return false;
          return parsed >= cutoffDate;
        });
        console.log(`[RESYNC] Recent mode: filtered ${before} rows to ${dataToProcess.length} rows (>= ${cutoffStr})`);

        // Now delete only the rows in the last 2 months from the DB (find date dim ID)
        const dateDimId = findDateDimensionId(dimensionIdMap, dataSource.column_mappings || [], headers, dateColIndex);
        if (dateDimId) {
          await deleteRecentData(supabase, dataSource.id, dateDimId, cutoffStr);
        } else {
          console.warn('[RESYNC] Recent mode: could not find date dimension ID, falling back to full delete');
          await deleteExistingData(supabase, dataSource.id);
        }
      } else {
        console.warn('[RESYNC] Recent mode: no date column found, falling back to full delete');
        await deleteExistingData(supabase, dataSource.id);
        dataToProcess = allData;
      }
    }

    // Step 8: Transform data
    const rowsToInsert = await transformDataRows(
      supabase,
      dataToProcess,
      dataSource.column_mappings || [],
      dimensionIdMap,
      columnIndexMap,
      reportId,
      dataSource.id
    );

    // Step 9: Insert data
    await insertDataInBatches(supabase, rowsToInsert, (message) => {
      console.log(`[RESYNC] ${message}`);
    });

    // Step 10: Update column mappings if dimensions were created
    if (createdCount > 0) {
      await updateColumnMappings(supabase, dataSource.id, dataSource.column_mappings || [], dimensionIdMap);
    }

    console.log(`[RESYNC] Complete! Processed ${dataToProcess.length} rows with ${Object.keys(dimensionIdMap).length} dimensions (mode: ${refreshMode})`);

    return {
      success: true,
      rowsProcessed: dataToProcess.length,
      dimensionsCreated: createdCount,
    };

  } catch (error) {
    console.error(`[RESYNC] Error resyncing data source:`, error);
    
    // Enhanced error message extraction
    let errorMessage = "Failed to resync data";
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      const err = error as any;
      errorMessage = err.message || err.msg || err.error || err.details || JSON.stringify(error);
    }
    
    console.error(`[RESYNC] Error details:`, {
      message: errorMessage,
      type: typeof error,
      error: error,
    });
    
    return {
      success: false,
      rowsProcessed: 0,
      dimensionsCreated: 0,
      error: errorMessage,
    };
  }
};

// ─── Private helpers for 'recent' mode ───────────────────────────────────────

/** Returns a Date representing the start of the 2-months-ago month (first day). */
function getTwoMonthsCutoff(): Date {
  const now = new Date();
  // Go back 2 full months from the 1st of the current month
  return new Date(now.getFullYear(), now.getMonth() - 2, 1);
}

/**
 * Find the 0-based column index of the date column.
 * Checks column_mappings for a dimension of type 'date', then falls back to
 * header name heuristics ('date', 'day').
 */
function findDateColumnIndex(headers: string[], columnMappings: any[]): number {
  // Check column_mappings for a date-type mapping
  for (const mapping of columnMappings) {
    if (mapping.type === 'date' || mapping.dimensionType === 'date') {
      const idx = headers.findIndex(
        (h) => h.toLowerCase().trim() === String(mapping.column || '').toLowerCase().trim()
      );
      if (idx >= 0) return idx;
    }
  }
  // Fallback: header name heuristics
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (h === 'date' || h === 'day' || h === 'report date') return i;
  }
  return -1;
}

/**
 * Find the dimension ID (UUID) for the date column so we can delete by JSONB key.
 * Looks up the column name in dimensionIdMap (which maps column header → dimension UUID).
 */
function findDateDimensionId(
  dimensionIdMap: Record<string, string>,
  columnMappings: any[],
  headers: string[],
  dateColIndex: number
): string | null {
  if (dateColIndex < 0 || dateColIndex >= headers.length) return null;
  const colName = headers[dateColIndex];
  // dimensionIdMap is keyed by column header name
  return dimensionIdMap[colName] || null;
}

