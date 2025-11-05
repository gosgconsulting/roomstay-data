/**
 * Utility to resync report_views with account-scoped dimensions
 * This ensures that old dimension IDs in visible_dimensions are updated to use account-scoped dimensions
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Resyncs report_views for a report to use account-scoped dimensions
 * @param reportId - The ID of the report to resync
 * @param accountId - The account ID to match dimensions against
 */
export async function resyncReportViews(
  reportId: string,
  accountId: string
): Promise<void> {
  try {
    console.log(`[RESYNC-VIEWS] Starting resync for report: ${reportId}, account: ${accountId}`);

    // Get all account-scoped dimensions
    const { data: accountDimensions, error: dimError } = await supabase
      .from("dimensions")
      .select("id, name, scope, account_id")
      .eq("account_id", accountId)
      .eq("scope", "account");

    if (dimError) throw dimError;

    // Create a map of dimension name to account-scoped dimension ID
    const dimensionNameToIdMap = new Map<string, string>();
    accountDimensions?.forEach((dim) => {
      dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
    });

    // Also get report-specific dimensions
    const { data: reportDimensions } = await supabase
      .from("dimensions")
      .select("id, name, scope, account_id")
      .eq("report_id", reportId);

    reportDimensions?.forEach((dim) => {
      dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
    });

    console.log(`[RESYNC-VIEWS] Found ${dimensionNameToIdMap.size} account-scoped dimensions`);

    // Get all report_views for this report
    const { data: reportViews, error: viewsError } = await supabase
      .from("report_views")
      .select("id, visible_dimensions, visible_columns, visible_kpis, name")
      .eq("report_id", reportId);

    if (viewsError) throw viewsError;

    if (!reportViews || reportViews.length === 0) {
      console.log(`[RESYNC-VIEWS] No report views found for report: ${reportId}`);
      return;
    }

    // Create a map of dimension names to validate visible_kpis
    const dimensionNameMap = new Map<string, string>();
    accountDimensions?.forEach((dim) => {
      dimensionNameMap.set(dim.name.toLowerCase(), dim.name);
    });
    reportDimensions?.forEach((dim) => {
      dimensionNameMap.set(dim.name.toLowerCase(), dim.name);
    });

    // Update each report view
    for (const view of reportViews) {
      const oldDimensionIds = (view.visible_dimensions || []) as string[];
      const oldVisibleColumns = (view.visible_columns || []) as string[];
      const oldVisibleKPIs = (view.visible_kpis || []) as string[];
      const needsUpdate: { 
        visible_dimensions?: string[]; 
        visible_columns?: string[];
        visible_kpis?: string[];
      } = {};
      
      // Update visible_dimensions
      if (oldDimensionIds.length > 0) {
        // Get old dimension names to map to new IDs
        const { data: oldDimensions } = await supabase
          .from("dimensions")
          .select("id, name")
          .in("id", oldDimensionIds);

        // Map old dimension IDs to new account-scoped dimension IDs
        const newDimensionIds: string[] = [];
        const unmappedIds: string[] = [];

        oldDimensions?.forEach((oldDim) => {
          const normalizedName = oldDim.name.toLowerCase();
          const newDimensionId = dimensionNameToIdMap.get(normalizedName);
          
          if (newDimensionId) {
            newDimensionIds.push(newDimensionId);
            console.log(
              `[RESYNC-VIEWS] Mapped dimension "${oldDim.name}": ${oldDim.id} -> ${newDimensionId}`
            );
          } else {
            // Check if the old dimension ID is already an account-scoped dimension
            const isAlreadyAccountScoped = accountDimensions?.some(
              d => d.id === oldDim.id
            ) || reportDimensions?.some(d => d.id === oldDim.id);
            
            if (isAlreadyAccountScoped) {
              newDimensionIds.push(oldDim.id);
              console.log(
                `[RESYNC-VIEWS] Dimension "${oldDim.name}" (${oldDim.id}) is already account-scoped, keeping it`
              );
            } else {
              unmappedIds.push(oldDim.id);
              console.warn(
                `[RESYNC-VIEWS] Could not find account-scoped dimension for "${oldDim.name}" (${oldDim.id})`
              );
            }
          }
        });

        // Remove duplicates
        const uniqueNewDimensionIds = Array.from(new Set(newDimensionIds));

        if (uniqueNewDimensionIds.length !== oldDimensionIds.length || unmappedIds.length > 0) {
          console.log(
            `[RESYNC-VIEWS] Updating visible_dimensions for view "${view.name}": ${oldDimensionIds.length} -> ${uniqueNewDimensionIds.length} dimensions`
          );
          needsUpdate.visible_dimensions = uniqueNewDimensionIds;
        }
      }

      // Update visible_columns (these are also dimension IDs)
      if (oldVisibleColumns.length > 0) {
        // Get old dimension names to map to new IDs
        const { data: oldColumnDimensions } = await supabase
          .from("dimensions")
          .select("id, name")
          .in("id", oldVisibleColumns);

        // Map old column dimension IDs to new account-scoped dimension IDs
        const newColumnIds: string[] = [];
        const unmappedColumnIds: string[] = [];

        oldColumnDimensions?.forEach((oldDim) => {
          const normalizedName = oldDim.name.toLowerCase();
          const newDimensionId = dimensionNameToIdMap.get(normalizedName);
          
          if (newDimensionId) {
            newColumnIds.push(newDimensionId);
            console.log(
              `[RESYNC-VIEWS] Mapped column dimension "${oldDim.name}": ${oldDim.id} -> ${newDimensionId}`
            );
          } else {
            // Check if the old dimension ID is already an account-scoped dimension
            const isAlreadyAccountScoped = accountDimensions?.some(
              d => d.id === oldDim.id
            ) || reportDimensions?.some(d => d.id === oldDim.id);
            
            if (isAlreadyAccountScoped) {
              newColumnIds.push(oldDim.id);
              console.log(
                `[RESYNC-VIEWS] Column dimension "${oldDim.name}" (${oldDim.id}) is already account-scoped, keeping it`
              );
            } else {
              unmappedColumnIds.push(oldDim.id);
              console.warn(
                `[RESYNC-VIEWS] Could not find account-scoped dimension for column "${oldDim.name}" (${oldDim.id})`
              );
            }
          }
        });

        // Remove duplicates
        const uniqueNewColumnIds = Array.from(new Set(newColumnIds));

        if (uniqueNewColumnIds.length !== oldVisibleColumns.length || unmappedColumnIds.length > 0) {
          console.log(
            `[RESYNC-VIEWS] Updating visible_columns for view "${view.name}": ${oldVisibleColumns.length} -> ${uniqueNewColumnIds.length} columns`
          );
          needsUpdate.visible_columns = uniqueNewColumnIds;
        }
      }

      // Validate and update visible_kpis (these are dimension names, not IDs)
      if (oldVisibleKPIs.length > 0) {
        const validKPIs: string[] = [];
        const invalidKPIs: string[] = [];

        oldVisibleKPIs.forEach((kpiName) => {
          const normalizedName = kpiName.toLowerCase();
          const validName = dimensionNameMap.get(normalizedName);
          
          if (validName) {
            validKPIs.push(validName); // Use the exact name from account-scoped dimensions
            console.log(
              `[RESYNC-VIEWS] KPI "${kpiName}" is valid (account-scoped dimension exists)`
            );
          } else {
            invalidKPIs.push(kpiName);
            console.warn(
              `[RESYNC-VIEWS] KPI "${kpiName}" not found in account-scoped dimensions`
            );
          }
        });

        // Only update if there are invalid KPIs or if we need to normalize names
        if (invalidKPIs.length > 0 || validKPIs.length !== oldVisibleKPIs.length) {
          console.log(
            `[RESYNC-VIEWS] Updating visible_kpis for view "${view.name}": removing ${invalidKPIs.length} invalid KPIs`
          );
          needsUpdate.visible_kpis = validKPIs;
        }
      }

      // Update the view if needed
      if (Object.keys(needsUpdate).length > 0) {
        const { error: updateError } = await supabase
          .from("report_views")
          .update(needsUpdate)
          .eq("id", view.id);

        if (updateError) {
          console.error(`[RESYNC-VIEWS] Error updating view "${view.name}":`, updateError);
          throw updateError;
        }

        console.log(`[RESYNC-VIEWS] Successfully updated view "${view.name}"`);
      } else {
        console.log(`[RESYNC-VIEWS] View "${view.name}" already has correct dimensions, skipping`);
      }
    }

    console.log(`[RESYNC-VIEWS] Successfully resynced ${reportViews.length} report views`);
  } catch (error) {
    console.error("[RESYNC-VIEWS] Error resyncing report views:", error);
    throw error;
  }
}

