import { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resyncQueryKeys } from "./queryKeys";
import { fetchDimensionDataBatch } from "./queryFunctions";

const BATCH_SIZE = 1000;

interface DimensionDataRow {
  id: string;
  dimension_values: Record<string, any>;
  data_source_id?: string;
}

interface UpdateRow {
  id: string;
  dimension_values: Record<string, any>;
}

/**
 * Processes dimension_data rows in batches using react-query cache
 */
export async function processDimensionDataBatches(
  queryClient: QueryClient,
  reportId: string,
  processBatch: (rows: DimensionDataRow[]) => Promise<UpdateRow[]>
): Promise<number> {
  let offset = 0;
  let hasMore = true;
  let totalUpdated = 0;

  while (hasMore) {
    // Fetch batch using react-query cache
    const dimensionDataRows = await queryClient.fetchQuery({
      queryKey: resyncQueryKeys.dimensionData.batch(reportId, offset),
      queryFn: fetchDimensionDataBatch,
      staleTime: 2 * 60 * 1000, // 2 minutes
    });

    if (!dimensionDataRows || dimensionDataRows.length === 0) {
      hasMore = false;
      break;
    }

    // Process batch
    const updates = await processBatch(dimensionDataRows);

    // Update rows with changes
    if (updates.length > 0) {
      totalUpdated += await updateDimensionDataRows(queryClient, reportId, updates, offset);
    }

    offset += BATCH_SIZE;

    // If we got fewer rows than batch size, we're done
    if (dimensionDataRows.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  return totalUpdated;
}

/**
 * Updates dimension_data rows in the database
 * Invalidates cache after updates
 */
async function updateDimensionDataRows(
  queryClient: QueryClient,
  reportId: string,
  updates: UpdateRow[],
  offset: number
): Promise<number> {
  console.log(`[RESYNC-DATA] Updating ${updates.length} rows in batch starting at offset ${offset}`);

  let successCount = 0;

  // Update rows one by one (could be optimized to batch update if Supabase supports it)
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("dimension_data")
      .update({ dimension_values: update.dimension_values })
      .eq("id", update.id);

    if (updateError) {
      console.error(`[RESYNC-DATA] Error updating row ${update.id}:`, updateError);
    } else {
      successCount++;
    }
  }

  // Invalidate cache for this report's dimension data after updates
  queryClient.invalidateQueries({
    queryKey: resyncQueryKeys.dimensionData.report(reportId),
  });

  return successCount;
}

