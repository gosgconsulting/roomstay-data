/**
 * Database operations for resync process
 * 
 * @module database
 */

import type { ColumnMapping } from './types.ts';

/**
 * Deletes all existing dimension_data for a data source
 * 
 * Performs batched deletion (5000 rows at a time) to handle large datasets efficiently.
 * Continues until all data is deleted.
 * 
 * @param {any} supabase - Supabase client instance
 * @param {string} dataSourceId - UUID of the data source
 * @returns {Promise<number>} Total number of rows deleted
 * 
 * @throws {Error} If deletion fails
 * 
 * @example
 * const deleted = await deleteExistingData(supabase, 'data-source-uuid');
 * console.log(`Deleted ${deleted} rows`);
 */
export const deleteExistingData = async (supabase: any, dataSourceId: string): Promise<number> => {
  console.log(`[RESYNC] Deleting existing dimension_data for data source: ${dataSourceId}`);
  
  let totalDeleted = 0;
  let continueDeleting = true;
  
  while (continueDeleting) {
    const { error: deleteError, count } = await supabase
      .from('dimension_data')
      .delete({ count: 'exact' })
      .eq('data_source_id', dataSourceId)
      .limit(5000);

    if (deleteError) throw deleteError;
    
    if (count !== null && count !== undefined) {
      totalDeleted += count;
      if (count < 5000) {
        continueDeleting = false;
      }
    } else {
      const { data: checkData, error: checkError } = await supabase
        .from('dimension_data')
        .select('id', { count: 'exact', head: true })
        .eq('data_source_id', dataSourceId)
        .limit(1);
      
      if (checkError) throw checkError;
      continueDeleting = checkData && checkData.length > 0;
    }
  }
  
  console.log(`[RESYNC] Deleted ${totalDeleted} existing rows`);
  return totalDeleted;
};

/**
 * Deletes custom dimensions created by a data source
 * 
 * Removes all custom dimensions (scope='custom') associated with the data source.
 * This is done during resync to recreate dimensions from scratch.
 * 
 * @param {any} supabase - Supabase client instance
 * @param {string} dataSourceId - UUID of the data source
 * @returns {Promise<void>}
 * 
 * @example
 * await deleteCustomDimensions(supabase, 'data-source-uuid');
 */
export const deleteCustomDimensions = async (supabase: any, dataSourceId: string): Promise<void> => {
  console.log(`[RESYNC] Deleting custom dimensions for data source: ${dataSourceId}`);
  
  const { error: deleteDimensionsError } = await supabase
    .from('dimensions')
    .delete()
    .eq('data_source_id', dataSourceId)
    .eq('scope', 'custom');
  
  if (deleteDimensionsError) {
    console.warn(`[RESYNC] Warning: Could not delete custom dimensions:`, deleteDimensionsError);
    // Don't throw error, continue with sync
  }
};

/**
 * Fixes problematic column mappings
 * 
 * Cleans up column mappings by:
 * - Converting 'create_new' dimensionId to 'none' (will be auto-detected)
 * - Converting null dimensionId to 'none'
 * - Removing temporary fields (newDimensionName, newDimensionType)
 * 
 * @param {any} supabase - Supabase client instance
 * @param {string} dataSourceId - UUID of the data source
 * @returns {Promise<void>}
 * 
 * @example
 * await fixColumnMappings(supabase, 'data-source-uuid');
 */
export const fixColumnMappings = async (supabase: any, dataSourceId: string): Promise<void> => {
  console.log(`[RESYNC] Fixing problematic column mappings for data source: ${dataSourceId}`);
  
  const { data: dataSource, error: fetchError } = await supabase
    .from('data_sources')
    .select('column_mappings')
    .eq('id', dataSourceId)
    .single();
    
  if (fetchError || !dataSource) {
    console.warn(`[RESYNC] Could not fetch data source for mapping fix:`, fetchError);
    return;
  }
  
  const mappings = (dataSource.column_mappings as any[]) || [];
  let hasChanges = false;
  
  const fixedMappings = mappings.map((mapping: any) => {
    let fixed = { ...mapping };
    
    // Fix create_new mappings that weren't properly resolved
    if (mapping.dimensionId === 'create_new') {
      console.log(`[RESYNC] Fixing create_new mapping for column: ${mapping.column}`);
      fixed.dimensionId = 'none'; // Will be auto-detected during sync
      fixed.newDimensionName = undefined;
      fixed.newDimensionType = undefined;
      hasChanges = true;
    }
    
    // Fix null dimensionId
    if (mapping.dimensionId === null) {
      fixed.dimensionId = 'none';
      hasChanges = true;
    }
    
    return fixed;
  });
  
  if (hasChanges) {
    const { error: updateError } = await supabase
      .from('data_sources')
      .update({ column_mappings: fixedMappings })
      .eq('id', dataSourceId);
      
    if (updateError) {
      console.warn(`[RESYNC] Could not update fixed mappings:`, updateError);
    } else {
      console.log(`[RESYNC] Fixed column mappings for data source: ${dataSourceId}`);
    }
  }
};

