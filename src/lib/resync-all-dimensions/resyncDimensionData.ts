/**
 * Resyncs dimension_data rows to use account-scoped dimension IDs
 * This updates the dimension_values JSONB to replace old dimension IDs with new ones
 */

import { QueryClient } from "@tanstack/react-query";
import { createAccountDimensionMap, createOldDimensionIdToNameMap } from "./dimensionMappers";
import {
  transformDimensionValues,
  collectAllDimensionIds,
} from "./dimensionValueTransformers";
import { processDimensionDataBatches } from "./batchProcessor";

/**
 * Resyncs dimension_data rows to use account-scoped dimension IDs
 * @param queryClient - React Query client for caching
 * @param reportId - The ID of the report to resync
 * @param accountId - The account ID to match dimensions against
 */
export async function resyncDimensionData(
  queryClient: QueryClient,
  reportId: string,
  accountId: string
): Promise<void> {
  try {
    console.log(`[RESYNC-DATA] Starting dimension_data resync for report: ${reportId}`);

    // Step 1: Create dimension mapping (name -> new ID) using react-query cache
    const dimensionNameToIdMap = await createAccountDimensionMap(queryClient, accountId, reportId);
    console.log(`[RESYNC-DATA] Found ${dimensionNameToIdMap.size} dimensions to map`);

    // Step 2: Process dimension_data rows in batches using react-query cache
    const totalUpdated = await processDimensionDataBatches(
      queryClient,
      reportId,
      async (dimensionDataRows) => {
        // Collect all unique dimension IDs from this batch
        const allDimensionIds = collectAllDimensionIds(dimensionDataRows);

        // Fetch all old dimension IDs in ONE query using react-query cache
        const oldIdToNameMap = await createOldDimensionIdToNameMap(queryClient, allDimensionIds);

        // Process each row
        const updates: Array<{ id: string; dimension_values: Record<string, any> }> = [];

        for (const row of dimensionDataRows) {
          const oldDimensionValues = row.dimension_values as Record<string, any>;
          
          if (!oldDimensionValues || Object.keys(oldDimensionValues).length === 0) {
            continue;
          }

          // Transform dimension values
          const { newValues, hasChanges } = transformDimensionValues(
            oldDimensionValues,
            oldIdToNameMap,
            dimensionNameToIdMap
          );

          if (hasChanges) {
            updates.push({
              id: row.id,
              dimension_values: newValues,
            });
          }
        }

        return updates;
      }
    );

    console.log(`[RESYNC-DATA] Successfully updated ${totalUpdated} dimension_data rows`);
  } catch (error) {
    console.error("[RESYNC-DATA] Error resyncing dimension_data:", error);
    throw error;
  }
}

