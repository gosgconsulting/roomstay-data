import type { DataSource, ResponseBody } from './types.ts';
import { fetchGoogleSheetsData } from './google-sheets.ts';
import { deleteExistingData, deleteCustomDimensions, fixColumnMappings } from './database.ts';
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
export const resyncDataSource = async (
  supabase: any,
  supabaseUrl: string,
  supabaseAnonKey: string,
  dataSource: DataSource,
  userId: string
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

    console.log(`[RESYNC] Starting resync for data source: ${dataSource.name} (account: ${accountId || 'none'})`);
    
    // Step 1: Fix problematic column mappings
    await fixColumnMappings(supabase, dataSource.id);
    
    // Step 2: Delete existing data (always true for resync)
    await deleteExistingData(supabase, dataSource.id);
    
    // Step 3: Delete custom dimensions (always true for resync)
    await deleteCustomDimensions(supabase, dataSource.id);

    // Step 4: Fetch headers
    const headerRange = `A${dataSource.header_row}:Z${dataSource.header_row}`;
    const headerData = await fetchGoogleSheetsData(
      supabaseUrl,
      supabaseAnonKey,
      dataSource.spreadsheet_id,
      dataSource.tab_name,
      headerRange
    );
    
    const headers = headerData[0].map((h: any) => 
      h === null || h === undefined ? '' : String(h).trim()
    );

    // Step 5: Fetch all data in chunks for large datasets
    console.log(`[RESYNC] Fetching data from Google Sheets...`);
    
    const SHEET_CHUNK_SIZE = 25000; // Fetch 25K rows at a time to prevent timeouts
    let allData: any[] = [];
    
    // Try to fetch all data first, with fallback to chunked approach
    try {
      console.log(`[RESYNC] Attempting to fetch all data at once...`);
      const dataRange = `A${dataSource.header_row + 1}:Z`;
      const initialData = await fetchGoogleSheetsData(
        supabaseUrl,
        supabaseAnonKey,
        dataSource.spreadsheet_id,
        dataSource.tab_name,
        dataRange
      );
      
      if (initialData && initialData.length > 0) {
        allData = initialData;
        console.log(`[RESYNC] Successfully fetched ${allData.length} rows in single request`);
      }
    } catch (fetchError) {
      console.warn(`[RESYNC] Single fetch failed, switching to chunked approach:`, fetchError);
      
      // Fallback to chunked fetching for very large datasets
      let startRow = dataSource.header_row + 1;
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
            dataSource.spreadsheet_id,
            dataSource.tab_name,
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

    // Step 6: Build dimension mapping with auto-detection
    // Use first 10 rows as sample data for auto-detection
    const sampleDataForAutoDetection = allData.slice(0, 10);
    
    const { dimensionIdMap, columnIndexMap, createdCount } = await buildDimensionMappingWithAutoDetection(
      supabase,
      dataSource.column_mappings || [],
      headers,
      sampleDataForAutoDetection,
      userId,
      reportId,
      dataSource.id,
      true, // recreateDimensions = true for resync
      accountId
    );

    // Step 7: Transform data
    const rowsToInsert = await transformDataRows(
      supabase,
      allData,
      dataSource.column_mappings || [],
      dimensionIdMap,
      columnIndexMap,
      reportId,
      dataSource.id
    );

    // Step 8: Insert data
    await insertDataInBatches(supabase, rowsToInsert, (message) => {
      console.log(`[RESYNC] ${message}`);
    });

    // Step 9: Update column mappings if dimensions were created
    if (createdCount > 0) {
      await updateColumnMappings(supabase, dataSource.id, dataSource.column_mappings || [], dimensionIdMap);
    }

    console.log(`[RESYNC] Complete! Processed ${allData.length} rows with ${Object.keys(dimensionIdMap).length} dimensions`);

    return {
      success: true,
      rowsProcessed: allData.length,
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

