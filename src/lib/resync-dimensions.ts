/**
 * Utility to resync column mappings with account-scoped dimensions
 * This ensures that old dimension IDs are updated to use the new account-scoped dimensions
 */

import { supabase } from "@/integrations/supabase/client";

interface ColumnMapping {
  column: string;
  dimensionId?: string | null;
  dimensionName?: string | null;
  visible: boolean;
  dateFormat?: string;
}

/**
 * Resyncs column mappings for a data source to use account-scoped dimensions
 * @param dataSourceId - The ID of the data source to resync
 * @param accountId - The account ID to match dimensions against
 * @returns Updated column mappings with correct dimension IDs
 */
export async function resyncColumnMappings(
  dataSourceId: string,
  accountId: string
): Promise<ColumnMapping[]> {
  try {
    console.log(`[RESYNC] Starting resync for data source: ${dataSourceId}, account: ${accountId}`);

    // Get the data source
    const { data: dataSource, error: dsError } = await supabase
      .from("data_sources")
      .select("id, column_mappings, report_id")
      .eq("id", dataSourceId)
      .single();

    if (dsError) throw dsError;
    if (!dataSource) throw new Error("Data source not found");

    // Get all account-scoped dimensions
    const { data: accountDimensions, error: dimError } = await supabase
      .from("dimensions")
      .select("id, name, type, scope, account_id")
      .or(`account_id.eq.${accountId},scope.eq.account`);

    if (dimError) throw dimError;

    const dimensionsMap = new Map<string, { id: string; name: string; type: string }>();
    accountDimensions?.forEach((dim) => {
      // Only include dimensions that match the account
      if ((dim.scope === 'account' && dim.account_id === accountId) || dim.account_id === accountId) {
        dimensionsMap.set(dim.name.toLowerCase(), { id: dim.id, name: dim.name, type: dim.type });
      }
    });

    // Also get report-specific dimensions if reportId exists
    if (dataSource.report_id) {
      const { data: reportDimensions } = await supabase
        .from("dimensions")
        .select("id, name, type, scope, account_id")
        .eq("report_id", dataSource.report_id);

      reportDimensions?.forEach((dim) => {
        // Add report-specific dimensions (they may be custom or account-scoped)
        dimensionsMap.set(dim.name.toLowerCase(), { id: dim.id, name: dim.name, type: dim.type });
      });
    }

    console.log(`[RESYNC] Found ${dimensionsMap.size} account-scoped dimensions`);

    // Update column mappings
    const currentMappings = (dataSource.column_mappings as any || []) as ColumnMapping[];
    const updatedMappings: ColumnMapping[] = currentMappings.map((mapping) => {
      // If dimensionName exists, use it to find the correct dimension ID
      if (mapping.dimensionName) {
        const normalizedName = mapping.dimensionName.toLowerCase();
        const dimension = dimensionsMap.get(normalizedName);
        
        if (dimension) {
          // Verify the dimension ID matches
          if (mapping.dimensionId !== dimension.id) {
            console.log(
              `[RESYNC] Updating dimension ID for "${mapping.column}": ${mapping.dimensionId} -> ${dimension.id}`
            );
            return {
              ...mapping,
              dimensionId: dimension.id,
              dimensionName: dimension.name,
              dateFormat: dimension.type === 'date' ? (mapping.dateFormat || 'yyyy-mm-dd') : mapping.dateFormat,
            };
          }
          // Dimension ID is already correct
          return {
            ...mapping,
            dimensionId: dimension.id,
            dimensionName: dimension.name,
          };
        } else {
          // Dimension name not found in account-scoped dimensions
          console.warn(
            `[RESYNC] Dimension "${mapping.dimensionName}" not found in account-scoped dimensions for column "${mapping.column}"`
          );
          return {
            ...mapping,
            dimensionId: "none",
            dimensionName: null,
          };
        }
      }

      // If only dimensionId exists, try to validate it
      if (mapping.dimensionId && mapping.dimensionId !== "none") {
        // Find dimension by ID
        const dimension = Array.from(dimensionsMap.values()).find((d) => d.id === mapping.dimensionId);
        
        if (dimension) {
          // Dimension ID is valid
          return {
            ...mapping,
            dimensionId: dimension.id,
            dimensionName: dimension.name,
          };
        } else {
          // Dimension ID is invalid (old global dimension or wrong account)
          console.warn(
            `[RESYNC] Dimension ID "${mapping.dimensionId}" not found in account-scoped dimensions for column "${mapping.column}"`
          );
          // Try to find by column name
          const columnNameLower = mapping.column.toLowerCase();
          const matchedDimension = findDimensionByColumnName(columnNameLower, dimensionsMap);
          
          if (matchedDimension) {
            console.log(
              `[RESYNC] Matched column "${mapping.column}" to dimension "${matchedDimension.name}"`
            );
            return {
              ...mapping,
              dimensionId: matchedDimension.id,
              dimensionName: matchedDimension.name,
              dateFormat: matchedDimension.type === 'date' ? (mapping.dateFormat || 'yyyy-mm-dd') : mapping.dateFormat,
            };
          }
          
          // No match found
          return {
            ...mapping,
            dimensionId: "none",
            dimensionName: null,
          };
        }
      }

      // No dimension ID or name, try to match by column name
      const columnNameLower = mapping.column.toLowerCase();
      const matchedDimension = findDimensionByColumnName(columnNameLower, dimensionsMap);
      
      if (matchedDimension) {
        console.log(
          `[RESYNC] Auto-matched column "${mapping.column}" to dimension "${matchedDimension.name}"`
        );
        return {
          ...mapping,
          dimensionId: matchedDimension.id,
          dimensionName: matchedDimension.name,
          dateFormat: matchedDimension.type === 'date' ? 'yyyy-mm-dd' : undefined,
        };
      }

      // No match found, keep as is
      return mapping;
    });

    // Update the data source with new mappings
    const { error: updateError } = await supabase
      .from("data_sources")
      .update({ column_mappings: updatedMappings as any })
      .eq("id", dataSourceId);

    if (updateError) throw updateError;

    console.log(`[RESYNC] Successfully updated column mappings for data source: ${dataSourceId}`);
    
    return updatedMappings;
  } catch (error) {
    console.error("[RESYNC] Error resyncing column mappings:", error);
    throw error;
  }
}

/**
 * Helper function to find dimension by column name using common synonyms
 */
function findDimensionByColumnName(
  columnName: string,
  dimensionsMap: Map<string, { id: string; name: string; type: string }>
): { id: string; name: string; type: string } | null {
  const normalizedColumn = columnName.toLowerCase().trim();
  
  // Define synonyms
  const synonyms: Record<string, string[]> = {
    impressions: ['impression', 'impr', 'imp', 'impressions'],
    clicks: ['click', 'clk', 'clicks'],
    bookings: ['conversion', 'conversions', 'booking', 'bookings', 'conv', 'cvr', 'all conv'],
    cost: ['spend', 'cost', 'costs'],
    revenue: ['rev', 'revenue', 'income', 'sales', 'all conv. value', 'conv value'],
    ctr: ['click_through_rate', 'clickrate', 'ctr'],
    cpc: ['cost_per_click', 'costperclick', 'avg. cpc', 'avg cpc', 'cpc'],
    cpm: ['cost_per_mille', 'cost_per_thousand', 'cpm'],
    roas: ['return_on_ad_spend', 'returnon_ad_spend', 'roas'],
    date: ['day', 'date', 'time', 'timestamp'],
    account: ['account', 'customer', 'account (customer)'],
    campaign: ['campaign'],
  };

  // Try exact match first
  for (const [dimName, synonymsList] of Object.entries(synonyms)) {
    if (normalizedColumn === dimName || synonymsList.includes(normalizedColumn)) {
      const dimension = dimensionsMap.get(dimName);
      if (dimension) return dimension;
    }
  }

  // Try partial match
  for (const [dimName, synonymsList] of Object.entries(synonyms)) {
    for (const synonym of synonymsList) {
      if (normalizedColumn.includes(synonym) || synonym.includes(normalizedColumn)) {
        const dimension = dimensionsMap.get(dimName);
        if (dimension) return dimension;
      }
    }
  }

  return null;
}

/**
 * Resyncs all data sources for a report
 */
export async function resyncReportDataSources(reportId: string, accountId?: string): Promise<void> {
  try {
    // Get account ID from report if not provided
    let actualAccountId = accountId;
    if (!actualAccountId) {
      const { data: report } = await supabase
        .from("reports")
        .select("account_id")
        .eq("id", reportId)
        .single();
      actualAccountId = report?.account_id || undefined;
    }

    if (!actualAccountId) {
      throw new Error("Account ID is required for resyncing");
    }

    // Get all data sources for the report
    const { data: dataSources } = await supabase
      .from("data_sources")
      .select("id")
      .eq("report_id", reportId);

    if (!dataSources || dataSources.length === 0) {
      console.log(`[RESYNC] No data sources found for report: ${reportId}`);
      return;
    }

    console.log(`[RESYNC] Resyncing ${dataSources.length} data sources for report: ${reportId}`);

    // Resync each data source
    for (const dataSource of dataSources) {
      await resyncColumnMappings(dataSource.id, actualAccountId);
    }

    console.log(`[RESYNC] Successfully resynced all data sources for report: ${reportId}`);
  } catch (error) {
    console.error("[RESYNC] Error resyncing report data sources:", error);
    throw error;
  }
}

