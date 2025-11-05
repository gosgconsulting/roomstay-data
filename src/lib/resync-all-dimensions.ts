/**
 * Comprehensive utility to resync all dimension-related data for a report
 * This ensures that column mappings, report views, and dimension data use account-scoped dimension IDs
 */

import { supabase } from "@/integrations/supabase/client";
import { resyncColumnMappings, resyncReportDataSources } from "./resync-dimensions";
import { resyncReportViews } from "./resync-report-views";

/**
 * Resyncs all dimension-related data for a report to use account-scoped dimensions
 * @param reportId - The ID of the report to resync
 * @param accountId - The account ID to match dimensions against
 */
export async function resyncAllDimensions(
  reportId: string,
  accountId: string
): Promise<void> {
  try {
    console.log(`[RESYNC-ALL] Starting comprehensive resync for report: ${reportId}, account: ${accountId}`);

    // Step 1: Resync column mappings in all data sources
    console.log(`[RESYNC-ALL] Step 1: Resyncing data source column mappings...`);
    await resyncReportDataSources(reportId, accountId);

    // Step 2: Resync report views (visible_dimensions, visible_columns, visible_kpis)
    console.log(`[RESYNC-ALL] Step 2: Resyncing report views...`);
    await resyncReportViews(reportId, accountId);

    // Step 3: Resync dimension_data rows to use new dimension IDs
    console.log(`[RESYNC-ALL] Step 3: Resyncing dimension_data rows...`);
    await resyncDimensionData(reportId, accountId);

    console.log(`[RESYNC-ALL] Successfully completed all resync operations for report: ${reportId}`);
  } catch (error) {
    console.error("[RESYNC-ALL] Error during comprehensive resync:", error);
    throw error;
  }
}

/**
 * Resyncs dimension_data rows to use account-scoped dimension IDs
 * This updates the dimension_values JSONB to replace old dimension IDs with new ones
 */
async function resyncDimensionData(
  reportId: string,
  accountId: string
): Promise<void> {
  try {
    console.log(`[RESYNC-DATA] Starting dimension_data resync for report: ${reportId}`);

    // Get all account-scoped dimensions
    const { data: accountDimensions, error: dimError } = await supabase
      .from("dimensions")
      .select("id, name, scope, account_id")
      .eq("account_id", accountId);

    if (dimError) throw dimError;

    // Create a map of dimension name to account-scoped dimension ID
    const dimensionNameToIdMap = new Map<string, string>();
    accountDimensions?.forEach((dim) => {
      dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
    });

    // Also get report-specific dimensions
    const { data: reportDimensions } = await supabase
      .from("dimensions")
      .select("id, name, scope")
      .eq("report_id", reportId);

    reportDimensions?.forEach((dim) => {
      dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
    });

    console.log(`[RESYNC-DATA] Found ${dimensionNameToIdMap.size} dimensions to map`);

    // Get all dimension_data rows for this report (in batches to avoid memory issues)
    const BATCH_SIZE = 1000;
    let offset = 0;
    let hasMore = true;
    let totalUpdated = 0;

    while (hasMore) {
      const { data: dimensionDataRows, error: dataError } = await supabase
        .from("dimension_data")
        .select("id, dimension_values, data_source_id")
        .eq("report_id", reportId)
        .range(offset, offset + BATCH_SIZE - 1);

      if (dataError) throw dataError;

      if (!dimensionDataRows || dimensionDataRows.length === 0) {
        hasMore = false;
        break;
      }

      // Process each row
      const updates: Array<{ id: string; dimension_values: Record<string, any> }> = [];

      for (const row of dimensionDataRows) {
        const oldDimensionValues = row.dimension_values as Record<string, any>;
        const newDimensionValues: Record<string, any> = {};
        let hasChanges = false;

        // Get all old dimension IDs and their names
        const oldDimensionIds = Object.keys(oldDimensionValues);
        
        // Fetch names for old dimension IDs
        const { data: oldDimensions } = await supabase
          .from("dimensions")
          .select("id, name")
          .in("id", oldDimensionIds);

        // Create a map of old ID to dimension name
        const oldIdToNameMap = new Map<string, string>();
        oldDimensions?.forEach((dim) => {
          oldIdToNameMap.set(dim.id, dim.name);
        });

        // Map old dimension values to new dimension IDs
        for (const [oldId, value] of Object.entries(oldDimensionValues)) {
          const dimensionName = oldIdToNameMap.get(oldId);
          
          if (dimensionName) {
            const normalizedName = dimensionName.toLowerCase();
            const newDimensionId = dimensionNameToIdMap.get(normalizedName);
            
            if (newDimensionId && newDimensionId !== oldId) {
              // Use new dimension ID
              newDimensionValues[newDimensionId] = value;
              hasChanges = true;
            } else if (dimensionNameToIdMap.has(normalizedName)) {
              // ID is already correct
              newDimensionValues[oldId] = value;
            } else {
              // Dimension not found in account-scoped dimensions, keep old ID
              console.warn(
                `[RESYNC-DATA] Dimension "${dimensionName}" not found in account-scoped dimensions, keeping old ID: ${oldId}`
              );
              newDimensionValues[oldId] = value;
            }
          } else {
            // Old dimension ID not found, keep as is
            newDimensionValues[oldId] = value;
          }
        }

        if (hasChanges) {
          updates.push({
            id: row.id,
            dimension_values: newDimensionValues,
          });
        }
      }

      // Batch update rows with changes
      if (updates.length > 0) {
        console.log(`[RESYNC-DATA] Updating ${updates.length} rows in batch starting at offset ${offset}`);
        
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from("dimension_data")
            .update({ dimension_values: update.dimension_values })
            .eq("id", update.id);

          if (updateError) {
            console.error(`[RESYNC-DATA] Error updating row ${update.id}:`, updateError);
          } else {
            totalUpdated++;
          }
        }
      }

      offset += BATCH_SIZE;
      
      // If we got fewer rows than batch size, we're done
      if (dimensionDataRows.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    console.log(`[RESYNC-DATA] Successfully updated ${totalUpdated} dimension_data rows`);
  } catch (error) {
    console.error("[RESYNC-DATA] Error resyncing dimension_data:", error);
    throw error;
  }
}
