import { supabase } from "@/integrations/supabase/client";
import type { QueryFunction } from "@tanstack/react-query";

/**
 * Query function to fetch account-scoped dimensions
 */
export const fetchAccountDimensions: QueryFunction<
  Array<{ id: string; name: string; scope: string; account_id: string }>,
  readonly ["resync", "dimensions", "account", string]
> = async ({ queryKey }) => {
  const [, , , accountId] = queryKey;
  
  const { data, error } = await supabase
    .from("dimensions")
    .select("id, name, scope, account_id")
    .eq("account_id", accountId);

  if (error) throw error;
  return data || [];
};

/**
 * Query function to fetch report-specific dimensions
 */
export const fetchReportDimensions: QueryFunction<
  Array<{ id: string; name: string; scope: string }>,
  readonly ["resync", "dimensions", "report", string]
> = async ({ queryKey }) => {
  const [, , , reportId] = queryKey;
  
  const { data, error } = await supabase
    .from("dimensions")
    .select("id, name, scope")
    .eq("report_id", reportId);

  if (error) throw error;
  return data || [];
};

/**
 * Query function to fetch old dimensions by IDs
 */
export const fetchOldDimensions: QueryFunction<
  Array<{ id: string; name: string }>,
  readonly ["resync", "dimensions", "old", string]
> = async ({ queryKey }) => {
  const [, , , dimensionIdsString] = queryKey;
  
  if (!dimensionIdsString) {
    return [];
  }

  const dimensionIds = dimensionIdsString.split(',').filter(Boolean);
  
  if (dimensionIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("dimensions")
    .select("id, name")
    .in("id", dimensionIds);

  if (error) {
    console.error("[RESYNC-DATA] Error fetching old dimensions:", error);
    throw error;
  }

  return data || [];
};

/**
 * Query function to fetch dimension_data rows for a batch
 */
export const fetchDimensionDataBatch: QueryFunction<
  Array<{ id: string; dimension_values: Record<string, any>; data_source_id?: string }>,
  readonly ["resync", "dimension-data", "report", string, "batch", number]
> = async ({ queryKey }) => {
  const [, , , reportId, , offset] = queryKey;
  const BATCH_SIZE = 1000;
  
  const { data, error } = await supabase
    .from("dimension_data")
    .select("id, dimension_values, data_source_id")
    .eq("report_id", reportId)
    .range(offset, offset + BATCH_SIZE - 1);

  if (error) throw error;
  return data || [];
};

