/**
 * Comprehensive utility to resync all dimension-related data for a report
 * This ensures that column mappings, report views, and dimension data use account-scoped dimension IDs
 */

import { QueryClient } from "@tanstack/react-query";
import { resyncReportDataSources } from "./resync-all-dimensions/resyncReportDataSources";
import { resyncReportViews } from "./resync-report-views";
import { resyncDimensionData } from "./resync-all-dimensions/resyncDimensionData";

/**
 * Resyncs all dimension-related data for a report to use account-scoped dimensions
 * @param queryClient - React Query client for caching
 * @param reportId - The ID of the report to resync
 * @param accountId - The account ID to match dimensions against
 */
export async function resyncAllDimensions(
  queryClient: QueryClient,
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

    // Step 3: Resync dimension_data rows to use new dimension IDs (with react-query cache)
    console.log(`[RESYNC-ALL] Step 3: Resyncing dimension_data rows...`);
    await resyncDimensionData(queryClient, reportId, accountId);

    console.log(`[RESYNC-ALL] Successfully completed all resync operations for report: ${reportId}`);
  } catch (error) {
    console.error("[RESYNC-ALL] Error during comprehensive resync:", error);
    throw error;
  }
}
