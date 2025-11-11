/**
 * Data transformation and batch insertion functions
 * 
 * @module transform
 */

import type { ColumnMapping } from './types.ts';
import { parseValue } from './utils.ts';

/**
 * Transforms raw Google Sheets data rows into dimension_data format
 * 
 * Maps columns to dimensions, parses values based on dimension types,
 * and prepares rows for database insertion.
 * 
 * @param {any} supabase - Supabase client instance
 * @param {any[][]} dataRows - Array of raw data rows from Google Sheets
 * @param {ColumnMapping[]} mappings - Column mapping configurations
 * @param {Record<string, string>} dimensionIdMap - Map of column names to dimension IDs
 * @param {Record<string, number>} columnIndexMap - Map of column names to column indices
 * @param {string} reportId - Report ID for the data
 * @param {string} dataSourceId - Data source ID
 * 
 * @returns {Promise<any[]>} Array of rows ready for insertion into dimension_data table
 * 
 * @example
 * const rows = await transformDataRows(
 *   supabase,
 *   [['Value1', 'Value2'], ['Value3', 'Value4']],
 *   mappings,
 *   dimensionIdMap,
 *   columnIndexMap,
 *   'report-uuid',
 *   'data-source-uuid'
 * );
 */
export const transformDataRows = async (
  supabase: any,
  dataRows: any[][],
  mappings: ColumnMapping[],
  dimensionIdMap: Record<string, string>,
  columnIndexMap: Record<string, number>,
  reportId: string,
  dataSourceId: string
): Promise<any[]> => {
  console.log(`[RESYNC] Transforming ${dataRows.length} data rows...`);
  
  const visibleMappings = mappings.filter(m => m.visible);
  
  // Load dimension types from database for all mapped dimensions
  const dimensionTypeMap: Record<string, string> = {};
  const dimensionIds = Object.values(dimensionIdMap).filter(id => id !== 'none' && id !== 'create_new');
  
  if (dimensionIds.length > 0) {
    const { data: dimensionsData, error: dimError } = await supabase
      .from('dimensions')
      .select('id, type')
      .in('id', dimensionIds);
    
    if (!dimError && dimensionsData) {
      dimensionsData.forEach((dim: any) => {
        dimensionTypeMap[dim.id] = dim.type;
      });
      console.log('[RESYNC] Loaded dimension types from database:', dimensionTypeMap);
    }
  }
  
  const rowsToInsert = dataRows.map((row, index) => {
    const dimensionValues: Record<string, any> = {};
    
    if (!Array.isArray(row)) return null;
    
    visibleMappings.forEach((mapping: ColumnMapping) => {
      const colIndex = columnIndexMap[mapping.column];
      
      if (colIndex !== undefined && colIndex >= 0 && dimensionIdMap[mapping.column] && colIndex < row.length) {
        const rawValue = row[colIndex];
        const dimensionId = dimensionIdMap[mapping.column];
        // Priority: mapping types > dimension type from DB > default to text
        const dimensionType = mapping.newDimensionType || mapping.dimensionType || dimensionTypeMap[dimensionId] || 'text';
        const dateFormat = mapping.dateFormat;
        const value = parseValue(rawValue, dimensionType, dateFormat);
        
        if (value !== null) {
          dimensionValues[dimensionIdMap[mapping.column]] = value;
          
          // Debug logging for date and currency values
          if (index < 3) { // Log first 3 rows
            if (dimensionType === 'date' || dimensionType === 'currency') {
              console.log(`[RESYNC] Row ${index + 1} - ${mapping.column} (${dimensionType}): "${rawValue}" -> "${value}"`);
            }
          }
        }
      }
    });
    
    return {
      report_id: reportId,
      data_source_id: dataSourceId,
      row_number: index + 1,
      dimension_values: dimensionValues,
    };
  }).filter(row => row !== null);
  
  console.log(`[RESYNC] Prepared ${rowsToInsert.length} rows for insertion`);
  return rowsToInsert;
};

/**
 * Inserts data in adaptive batches with retry logic
 * 
 * Uses adaptive batch sizing based on dataset size:
 * - >100K rows: 250 per batch
 * - >50K rows: 500 per batch
 * - >10K rows: 750 per batch
 * - <=10K rows: 1000 per batch
 * 
 * Includes retry logic with exponential backoff for failed batches.
 * 
 * @param {any} supabase - Supabase client instance
 * @param {any[]} rowsToInsert - Array of rows to insert
 * @param {(message: string) => void} [onProgress] - Optional progress callback
 * 
 * @returns {Promise<void>}
 * 
 * @throws {Error} If batch insertion fails after retries
 * 
 * @example
 * await insertDataInBatches(supabase, rows, (msg) => console.log(msg));
 */
export const insertDataInBatches = async (
  supabase: any,
  rowsToInsert: any[],
  onProgress?: (message: string) => void
): Promise<void> => {
  console.log(`[RESYNC] Inserting ${rowsToInsert.length} rows in batches...`);
  
  // Adaptive batch sizing based on dataset size to prevent statement timeouts
  let batchSize: number;
  if (rowsToInsert.length > 100000) {
    batchSize = 250; // Very large datasets: smaller batches
  } else if (rowsToInsert.length > 50000) {
    batchSize = 500; // Large datasets: medium batches
  } else if (rowsToInsert.length > 10000) {
    batchSize = 750; // Medium datasets: larger batches
  } else {
    batchSize = 1000; // Small datasets: standard batches
  }
  
  console.log(`[RESYNC] Using adaptive batch size: ${batchSize} (total rows: ${rowsToInsert.length})`);
  
  const totalBatches = Math.ceil(rowsToInsert.length / batchSize);
  let successfulBatches = 0;
  
  for (let i = 0; i < rowsToInsert.length; i += batchSize) {
    const batch = rowsToInsert.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    
    const progressMessage = `Inserting batch ${currentBatch}/${totalBatches} (${batch.length} rows)`;
    console.log(`[RESYNC] ${progressMessage}`);
    
    if (onProgress) {
      onProgress(progressMessage);
    }
    
    try {
      // Add retry logic for individual batches
      const maxRetries = 3;
      let retryCount = 0;
      let batchSuccess = false;
      
      while (!batchSuccess && retryCount < maxRetries) {
        try {
          const { error: insertError } = await supabase
            .from('dimension_data')
            .insert(batch);

          if (insertError) {
            throw insertError;
          }
          
          batchSuccess = true;
          successfulBatches++;
          
          // Add small delay between batches for large datasets to prevent overwhelming the database
          if (rowsToInsert.length > 50000 && currentBatch % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms pause every 10 batches
          }
          
        } catch (batchError: any) {
          retryCount++;
          console.warn(`[RESYNC] Batch ${currentBatch} attempt ${retryCount} failed:`, batchError.message);
          
          if (retryCount < maxRetries) {
            // Exponential backoff for retries
            const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
            console.log(`[RESYNC] Retrying batch ${currentBatch} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.error(`[RESYNC] Batch ${currentBatch} failed after ${maxRetries} attempts:`, batchError);
            throw new Error(`Failed at batch ${currentBatch}/${totalBatches}: ${batchError.message}`);
          }
        }
      }
      
      // Progress feedback for large datasets
      if (rowsToInsert.length > 10000 && currentBatch % 20 === 0) {
        const progress = Math.round((successfulBatches / totalBatches) * 100);
        console.log(`[RESYNC] Progress: ${progress}% complete (${successfulBatches}/${totalBatches} batches)`);
      }
      
    } catch (error) {
      console.error(`[RESYNC] Critical error in batch ${currentBatch}:`, error);
      throw error;
    }
  }
  
  console.log(`[RESYNC] Successfully inserted all ${rowsToInsert.length} rows in ${successfulBatches} batches`);
};

/**
 * Updates column mappings with new dimension IDs after dimension creation
 * 
 * Updates the data source's column_mappings to include dimension names
 * for newly created dimensions, replacing temporary fields.
 * 
 * @param {any} supabase - Supabase client instance
 * @param {string} dataSourceId - UUID of the data source
 * @param {ColumnMapping[]} mappings - Current column mappings
 * @param {Record<string, string>} dimensionIdMap - Map of column names to dimension IDs
 * 
 * @returns {Promise<void>}
 * 
 * @example
 * await updateColumnMappings(supabase, 'data-source-uuid', mappings, dimensionIdMap);
 */
export const updateColumnMappings = async (
  supabase: any,
  dataSourceId: string,
  mappings: ColumnMapping[],
  dimensionIdMap: Record<string, string>
): Promise<void> => {
  // Get dimension names for the IDs in dimensionIdMap
  const dimensionIds = Object.values(dimensionIdMap).filter(id => id && id !== 'none');
  const dimensionNameMap: Record<string, string> = {};
  
  if (dimensionIds.length > 0) {
    const { data: dimensions, error } = await supabase
      .from('dimensions')
      .select('id, name')
      .in('id', dimensionIds);
    
    if (!error && dimensions) {
      dimensions.forEach((dim: any) => {
        dimensionNameMap[dim.id] = dim.name;
      });
    }
  }

  const updatedMappings = mappings.map((mapping: ColumnMapping) => {
    if (mapping.column in dimensionIdMap && (mapping.dimensionId === 'create_new' || mapping.newDimensionName)) {
      const dimensionId = dimensionIdMap[mapping.column];
      const dimensionName = dimensionNameMap[dimensionId] || null;
      
      return {
        ...mapping,
        dimensionId: dimensionId, // Keep for backward compatibility
        dimensionName: dimensionName, // Store name for stable mapping
        newDimensionName: undefined, // Clear temporary fields
        newDimensionType: undefined,
      };
    }
    return mapping;
  });

  const { error: updateError } = await supabase
    .from('data_sources')
    .update({ column_mappings: updatedMappings as any })
    .eq('id', dataSourceId);

  if (updateError) {
    console.warn(`[RESYNC] Warning: Could not update column mappings:`, updateError);
    // Don't throw error, sync was successful
  }
};

