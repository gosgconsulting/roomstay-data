-- Fix dimension_data references to use account-scoped dimension IDs
-- This migration maps old dimension IDs to new account-scoped dimension IDs

DO $$
DECLARE
    report_record RECORD;
    data_record RECORD;
    old_dim_id TEXT;
    old_dim_name TEXT;
    new_dim_id TEXT;
    dimension_values_json JSONB;
    new_dimension_values JSONB;
    updated_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting dimension_data reference fix...';
    
    -- Process each report
    FOR report_record IN 
        SELECT DISTINCT r.id as report_id, r.account_id, a.name as account_name
        FROM reports r
        LEFT JOIN accounts a ON r.account_id = a.id
        WHERE r.account_id IS NOT NULL
    LOOP
        RAISE NOTICE 'Processing report: % (account: %)', report_record.report_id, report_record.account_name;
        
        -- Process each dimension_data row for this report
        FOR data_record IN
            SELECT id, dimension_values
            FROM dimension_data 
            WHERE report_id = report_record.report_id
            LIMIT 1000 -- Process in batches to avoid memory issues
        LOOP
            dimension_values_json := data_record.dimension_values;
            new_dimension_values := '{}';
            
            -- Process each dimension ID in the dimension_values
            FOR old_dim_id IN SELECT jsonb_object_keys(dimension_values_json)
            LOOP
                -- Try to find the dimension name for this old ID
                SELECT name INTO old_dim_name
                FROM dimensions 
                WHERE id = old_dim_id::uuid;
                
                IF old_dim_name IS NOT NULL THEN
                    -- Find the new account-scoped dimension ID with the same name
                    SELECT id INTO new_dim_id
                    FROM dimensions
                    WHERE name = old_dim_name
                      AND scope = 'account'
                      AND account_id = report_record.account_id
                    LIMIT 1;
                    
                    IF new_dim_id IS NOT NULL THEN
                        -- Use the new dimension ID
                        new_dimension_values := new_dimension_values || 
                            jsonb_build_object(new_dim_id, dimension_values_json->old_dim_id);
                        RAISE NOTICE 'Mapped dimension: % (%) -> % (%)', old_dim_name, old_dim_id, old_dim_name, new_dim_id;
                    ELSE
                        -- Try to find global dimension as fallback
                        SELECT id INTO new_dim_id
                        FROM dimensions
                        WHERE name = old_dim_name
                          AND scope = 'global'
                        LIMIT 1;
                        
                        IF new_dim_id IS NOT NULL THEN
                            new_dimension_values := new_dimension_values || 
                                jsonb_build_object(new_dim_id, dimension_values_json->old_dim_id);
                            RAISE NOTICE 'Mapped to global dimension: % (%) -> % (%)', old_dim_name, old_dim_id, old_dim_name, new_dim_id;
                        ELSE
                            -- Keep the old ID if we can't find a replacement
                            new_dimension_values := new_dimension_values || 
                                jsonb_build_object(old_dim_id, dimension_values_json->old_dim_id);
                            RAISE NOTICE 'Kept original dimension ID: % (%)', old_dim_name, old_dim_id;
                        END IF;
                    END IF;
                ELSE
                    -- Dimension name not found, keep the original
                    new_dimension_values := new_dimension_values || 
                        jsonb_build_object(old_dim_id, dimension_values_json->old_dim_id);
                    RAISE NOTICE 'Unknown dimension ID kept: %', old_dim_id;
                END IF;
            END LOOP;
            
            -- Update the dimension_data row with new dimension IDs
            UPDATE dimension_data 
            SET dimension_values = new_dimension_values
            WHERE id = data_record.id;
            
            updated_count := updated_count + 1;
            
            -- Progress indicator
            IF updated_count % 100 = 0 THEN
                RAISE NOTICE 'Updated % rows so far...', updated_count;
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Dimension_data reference fix completed. Updated % rows total.', updated_count;
END $$;
</dyad-execute-sql>

Now let me also create a simpler, more targeted fix that focuses on the most common dimensions:

<dyad-write path="supabase/migrations/20250130000002_quick_dimension_mapping_fix.sql" description="Quick fix for common dimension mappings">
-- Quick fix for common dimension ID mappings
-- Maps the most common dimensions to their account-scoped equivalents

DO $$
DECLARE
    mapping_record RECORD;
    updated_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting quick dimension mapping fix...';
    
    -- Create a temporary mapping table for common dimensions
    CREATE TEMP TABLE dimension_id_mapping AS
    WITH old_dims AS (
        SELECT DISTINCT jsonb_object_keys(dimension_values) as old_id
        FROM dimension_data
        LIMIT 100
    ),
    old_dim_details AS (
        SELECT od.old_id, d.name, d.scope
        FROM old_dims od
        LEFT JOIN dimensions d ON od.old_id::uuid = d.id
        WHERE d.name IS NOT NULL
    ),
    new_dim_mapping AS (
        SELECT 
            odd.old_id,
            odd.name,
            odd.scope as old_scope,
            nd.id as new_id,
            nd.scope as new_scope,
            nd.account_id
        FROM old_dim_details odd
        LEFT JOIN dimensions nd ON odd.name = nd.name 
            AND nd.scope = 'account'
        WHERE nd.id IS NOT NULL
    )
    SELECT * FROM new_dim_mapping;
    
    RAISE NOTICE 'Created mapping table with % entries', (SELECT COUNT(*) FROM dimension_id_mapping);
    
    -- Show the mappings
    FOR mapping_record IN 
        SELECT old_id, name, new_id, account_id
        FROM dimension_id_mapping
        ORDER BY name
    LOOP
        RAISE NOTICE 'Mapping: % (%) -> % (account: %)', 
            mapping_record.name, 
            mapping_record.old_id, 
            mapping_record.new_id,
            mapping_record.account_id;
    END LOOP;
    
    -- Apply the mappings to dimension_data
    UPDATE dimension_data 
    SET dimension_values = (
        SELECT jsonb_object_agg(
            COALESCE(dim.new_id::text, key), 
            value
        )
        FROM jsonb_each(dimension_values) je(key, value)
        LEFT JOIN dimension_id_mapping dim ON je.key = dim.old_id
    )
    WHERE EXISTS (
        SELECT 1 
        FROM jsonb_object_keys(dimension_values) keys
        JOIN dimension_id_mapping dim ON keys = dim.old_id
    );
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Quick dimension mapping fix completed. Updated % rows.', updated_count;
    
    -- Clean up
    DROP TABLE dimension_id_mapping;
END $$;
</dyad-execute-sql>

Let me also check and fix the edge function that loads performance data to ensure it's using the correct dimension loading logic:

<dyad-read path="supabase/functions/get-performance-data/index.ts"></dyad-read>

I can see the issue! The `get-performance-data` edge function is loading dimensions correctly, but there might be a mismatch between the dimension IDs in the data and the dimensions being loaded. Let me also check the performance table data loading hook:

<dyad-read path="src/hooks/performanceTable/usePerformanceTableData.ts"></dyad-read>

Now I can see the full picture. The issue is that the performance table is loading data correctly, but the dimension IDs in the `dimension_data` table don't match the current account-scoped dimensions. Let me create a comprehensive fix:

<dyad-write path="src/lib/fix-dimension-data-sync.ts" description="Utility to fix dimension data synchronization issues">
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Fix dimension data synchronization issues
 * This utility maps old dimension IDs to current account-scoped dimension IDs
 */
export async function fixDimensionDataSync(reportId: string, accountId: string): Promise<boolean> {
  try {
    console.log('[DIMENSION-SYNC-FIX] Starting dimension data sync fix for report:', reportId, 'account:', accountId);

    // Step 1: Get current account-scoped dimensions
    const { data: accountDimensions, error: dimError } = await supabase
      .from('dimensions')
      .select('id, name, type, scope')
      .eq('scope', 'account')
      .eq('account_id', accountId);

    if (dimError) throw dimError;

    if (!accountDimensions || accountDimensions.length === 0) {
      console.warn('[DIMENSION-SYNC-FIX] No account dimensions found for account:', accountId);
      return false;
    }

    console.log('[DIMENSION-SYNC-FIX] Found', accountDimensions.length, 'account dimensions');

    // Step 2: Get a sample of dimension_data to see what IDs are being used
    const { data: sampleData, error: sampleError } = await supabase
      .from('dimension_data')
      .select('id, dimension_values')
      .eq('report_id', reportId)
      .limit(10);

    if (sampleError) throw sampleError;

    if (!sampleData || sampleData.length === 0) {
      console.warn('[DIMENSION-SYNC-FIX] No dimension data found for report:', reportId);
      return false;
    }

    // Step 3: Analyze dimension IDs in the data
    const usedDimensionIds = new Set<string>();
    sampleData.forEach(row => {
      if (row.dimension_values) {
        Object.keys(row.dimension_values).forEach(dimId => {
          usedDimensionIds.add(dimId);
        });
      }
    });

    console.log('[DIMENSION-SYNC-FIX] Found dimension IDs in data:', Array.from(usedDimensionIds));

    // Step 4: Check which dimension IDs exist in current dimensions
    const currentDimensionIds = new Set(accountDimensions.map(d => d.id));
    const missingDimensionIds = Array.from(usedDimensionIds).filter(id => !currentDimensionIds.has(id));

    console.log('[DIMENSION-SYNC-FIX] Missing dimension IDs:', missingDimensionIds);

    if (missingDimensionIds.length === 0) {
      console.log('[DIMENSION-SYNC-FIX] All dimension IDs are valid, no sync needed');
      return true;
    }

    // Step 5: Try to map missing IDs to current dimensions by name
    const dimensionMapping = new Map<string, string>();
    
    for (const missingId of missingDimensionIds) {
      // Try to find the old dimension by ID
      const { data: oldDimension } = await supabase
        .from('dimensions')
        .select('name')
        .eq('id', missingId)
        .maybeSingle();

      if (oldDimension?.name) {
        // Find the current account dimension with the same name
        const currentDimension = accountDimensions.find(d => d.name === oldDimension.name);
        if (currentDimension) {
          dimensionMapping.set(missingId, currentDimension.id);
          console.log('[DIMENSION-SYNC-FIX] Mapped:', oldDimension.name, missingId, '->', currentDimension.id);
        }
      }
    }

    if (dimensionMapping.size === 0) {
      console.warn('[DIMENSION-SYNC-FIX] No dimension mappings found');
      return false;
    }

    // Step 6: Update dimension_data with new IDs
    console.log('[DIMENSION-SYNC-FIX] Updating dimension_data with', dimensionMapping.size, 'mappings');

    // Get all dimension_data for this report
    const { data: allData, error: allDataError } = await supabase
      .from('dimension_data')
      .select('id, dimension_values')
      .eq('report_id', reportId);

    if (allDataError) throw allDataError;

    let updatedCount = 0;
    const batchSize = 100;

    for (let i = 0; i < allData.length; i += batchSize) {
      const batch = allData.slice(i, i + batchSize);
      const updates = [];

      for (const row of batch) {
        if (!row.dimension_values) continue;

        let hasChanges = false;
        const newDimensionValues = { ...row.dimension_values };

        // Apply mappings
        for (const [oldId, newId] of dimensionMapping.entries()) {
          if (oldId in newDimensionValues) {
            newDimensionValues[newId] = newDimensionValues[oldId];
            delete newDimensionValues[oldId];
            hasChanges = true;
          }
        }

        if (hasChanges) {
          updates.push({
            id: row.id,
            dimension_values: newDimensionValues
          });
        }
      }

      if (updates.length > 0) {
        const { error: updateError } = await supabase
          .from('dimension_data')
          .upsert(updates, { onConflict: 'id' });

        if (updateError) throw updateError;
        updatedCount += updates.length;
      }
    }

    console.log('[DIMENSION-SYNC-FIX] Successfully updated', updatedCount, 'dimension_data rows');

    toast({
      title: "Dimension sync fixed",
      description: `Updated ${updatedCount} data rows with correct dimension references`,
    });

    return true;

  } catch (error) {
    console.error('[DIMENSION-SYNC-FIX] Error:', error);
    toast({
      title: "Dimension sync failed",
      description: error instanceof Error ? error.message : "Unknown error occurred",
      variant: "destructive",
    });
    return false;
  }
}

/**
 * Fix dimension sync for all reports in an account
 */
export async function fixAllReportsDimensionSync(accountId: string): Promise<void> {
  try {
    console.log('[DIMENSION-SYNC-FIX] Fixing all reports for account:', accountId);

    // Get all reports for this account
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, name')
      .eq('account_id', accountId);

    if (reportsError) throw reportsError;

    if (!reports || reports.length === 0) {
      console.log('[DIMENSION-SYNC-FIX] No reports found for account:', accountId);
      return;
    }

    console.log('[DIMENSION-SYNC-FIX] Found', reports.length, 'reports to fix');

    let successCount = 0;
    for (const report of reports) {
      console.log('[DIMENSION-SYNC-FIX] Fixing report:', report.name);
      const success = await fixDimensionDataSync(report.id, accountId);
      if (success) successCount++;
    }

    toast({
      title: "Bulk dimension sync completed",
      description: `Successfully fixed ${successCount} out of ${reports.length} reports`,
    });

  } catch (error) {
    console.error('[DIMENSION-SYNC-FIX] Error in bulk fix:', error);
    toast({
      title: "Bulk dimension sync failed",
      description: error instanceof Error ? error.message : "Unknown error occurred",
      variant: "destructive",
    });
  }
}