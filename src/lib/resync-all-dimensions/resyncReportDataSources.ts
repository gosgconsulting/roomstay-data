/**
 * Resync column mappings and report data sources with account-scoped dimensions.
 * Moved from resync-dimensions.ts into resync-all-dimensions/ module.
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
 * Resyncs column mappings for a data source to use account-scoped dimensions.
 */
export async function resyncColumnMappings(
  dataSourceId: string,
  accountId: string
): Promise<ColumnMapping[]> {
  try {
    console.log(`[RESYNC] Starting resync for data source: ${dataSourceId}, account: ${accountId}`);

    const { data: dataSource, error: dsError } = await supabase
      .from("data_sources")
      .select("id, column_mappings, report_id")
      .eq("id", dataSourceId)
      .single();

    if (dsError) throw dsError;
    if (!dataSource) throw new Error("Data source not found");

    const { data: accountDimensions, error: dimError } = await supabase
      .from("dimensions")
      .select("id, name, type, scope, account_id")
      .or(`account_id.eq.${accountId},scope.eq.account`);

    if (dimError) throw dimError;

    const dimensionsMap = new Map<string, { id: string; name: string; type: string }>();
    accountDimensions?.forEach((dim) => {
      if ((dim.scope === "account" && dim.account_id === accountId) || dim.account_id === accountId) {
        dimensionsMap.set(dim.name.toLowerCase(), { id: dim.id, name: dim.name, type: dim.type });
      }
    });

    if (dataSource.report_id) {
      const { data: reportDimensions } = await supabase
        .from("dimensions")
        .select("id, name, type, scope, account_id")
        .eq("report_id", dataSource.report_id);

      reportDimensions?.forEach((dim) => {
        dimensionsMap.set(dim.name.toLowerCase(), { id: dim.id, name: dim.name, type: dim.type });
      });
    }

    console.log(`[RESYNC] Found ${dimensionsMap.size} account-scoped dimensions`);

    const currentMappings = ((dataSource.column_mappings as ColumnMapping[]) || []) as ColumnMapping[];
    const updatedMappings: ColumnMapping[] = currentMappings.map((mapping) => {
      const isUserModified = (mapping as { user_modified?: boolean }).user_modified === true;

      if (isUserModified && mapping.dimensionId && mapping.dimensionId !== "none") {
        const dimensionExists = Array.from(dimensionsMap.values()).some((dim) => dim.id === mapping.dimensionId);
        if (dimensionExists) {
          return mapping;
        }
      }

      if (mapping.dimensionName) {
        const normalizedName = mapping.dimensionName.toLowerCase();
        const dimension = dimensionsMap.get(normalizedName);
        if (dimension) {
          return {
            ...mapping,
            dimensionId: dimension.id,
            dimensionName: dimension.name,
            dateFormat: dimension.type === "date" ? (mapping.dateFormat || "yyyy-mm-dd") : mapping.dateFormat,
          };
        }
        return { ...mapping, dimensionId: "none", dimensionName: null };
      }

      if (mapping.dimensionId && mapping.dimensionId !== "none") {
        const dimension = Array.from(dimensionsMap.values()).find((d) => d.id === mapping.dimensionId);
        if (dimension) {
          return { ...mapping, dimensionId: dimension.id, dimensionName: dimension.name };
        }
        const columnNameLower = mapping.column.toLowerCase();
        const matchedDimension = findDimensionByColumnName(columnNameLower, dimensionsMap);
        if (matchedDimension) {
          return {
            ...mapping,
            dimensionId: matchedDimension.id,
            dimensionName: matchedDimension.name,
            dateFormat: matchedDimension.type === "date" ? (mapping.dateFormat || "yyyy-mm-dd") : mapping.dateFormat,
          };
        }
        return { ...mapping, dimensionId: "none", dimensionName: null };
      }

      const columnNameLower = mapping.column.toLowerCase();
      const matchedDimension = findDimensionByColumnName(columnNameLower, dimensionsMap);
      if (matchedDimension) {
        return {
          ...mapping,
          dimensionId: matchedDimension.id,
          dimensionName: matchedDimension.name,
          dateFormat: matchedDimension.type === "date" ? "yyyy-mm-dd" : undefined,
        };
      }
      return mapping;
    });

    const { error: updateError } = await supabase
      .from("data_sources")
      .update({ column_mappings: updatedMappings })
      .eq("id", dataSourceId);

    if (updateError) throw updateError;
    console.log(`[RESYNC] Successfully updated column mappings for data source: ${dataSourceId}`);
    return updatedMappings;
  } catch (error) {
    console.error("[RESYNC] Error resyncing column mappings:", error);
    throw error;
  }
}

function findDimensionByColumnName(
  columnName: string,
  dimensionsMap: Map<string, { id: string; name: string; type: string }>
): { id: string; name: string; type: string } | null {
  const normalizedColumn = columnName.toLowerCase().trim();
  const synonyms: Record<string, string[]> = {
    impressions: ["impression", "impr", "imp", "impressions"],
    clicks: ["click", "clk", "clicks"],
    bookings: ["conversion", "conversions", "booking", "bookings", "conv", "cvr", "all conv"],
    cost: ["spend", "cost", "costs"],
    revenue: ["rev", "revenue", "income", "sales", "all conv. value", "conv value"],
    ctr: ["click_through_rate", "clickrate", "ctr"],
    cpc: ["cost_per_click", "costperclick", "avg. cpc", "avg cpc", "cpc"],
    cpm: ["cost_per_mille", "cost_per_thousand", "cpm"],
    roas: ["return_on_ad_spend", "returnon_ad_spend", "roas"],
    date: ["day", "date", "time", "timestamp"],
    account: ["account", "customer", "account (customer)"],
    campaign: ["campaign"],
  };

  for (const [dimName, synonymsList] of Object.entries(synonyms)) {
    if (normalizedColumn === dimName || synonymsList.includes(normalizedColumn)) {
      const dimension = dimensionsMap.get(dimName);
      if (dimension) return dimension;
    }
  }
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
 * Resyncs all data sources for a report.
 */
export async function resyncReportDataSources(reportId: string, accountId?: string): Promise<void> {
  try {
    let actualAccountId = accountId;
    if (!actualAccountId) {
      const { data: report } = await supabase
        .from("reports")
        .select("account_id")
        .eq("id", reportId)
        .single();
      actualAccountId = report?.account_id || undefined;
    }
    if (!actualAccountId) throw new Error("Account ID is required for resyncing");

    const { data: dataSources } = await supabase
      .from("data_sources")
      .select("id")
      .eq("report_id", reportId);

    if (!dataSources || dataSources.length === 0) {
      console.log(`[RESYNC] No data sources found for report: ${reportId}`);
      return;
    }
    console.log(`[RESYNC] Resyncing ${dataSources.length} data sources for report: ${reportId}`);
    for (const dataSource of dataSources) {
      await resyncColumnMappings(dataSource.id, actualAccountId);
    }
    console.log(`[RESYNC] Successfully resynced all data sources for report: ${reportId}`);
  } catch (error) {
    console.error("[RESYNC] Error resyncing report data sources:", error);
    throw error;
  }
}
