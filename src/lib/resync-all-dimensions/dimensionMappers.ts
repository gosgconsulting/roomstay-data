import { QueryClient } from "@tanstack/react-query";
import { resyncQueryKeys } from "./queryKeys";
import {
  fetchAccountDimensions,
  fetchReportDimensions,
  fetchOldDimensions,
} from "./queryFunctions";
import { supabase } from "@/integrations/supabase/client";

/**
 * Normalize a dimension name for matching
 */
function normalizeName(name: string): { lower: string; compact: string } {
  const lower = (name || "").trim().toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  return { lower, compact };
}

/**
 * Adds a name entry (lower and compact) to the map if not present
 */
function addNameEntries(
  map: Map<string, string>,
  name: string,
  id: string
) {
  const { lower, compact } = normalizeName(name);
  if (!map.has(lower)) map.set(lower, id);
  if (!map.has(compact)) map.set(compact, id);
}

/**
 * Creates a map of dimension name (normalized) to dimension ID
 * Priority order: account > report > global
 */
export async function createAccountDimensionMap(
  queryClient: QueryClient,
  accountId: string,
  reportId: string
): Promise<Map<string, string>> {
  const dimensionNameToIdMap = new Map<string, string>();

  // 1) Account-scoped dimensions (highest priority)
  const accountDimensions = await queryClient.fetchQuery({
    queryKey: resyncQueryKeys.dimensions.account(accountId),
    queryFn: fetchAccountDimensions,
    staleTime: 5 * 60 * 1000,
  });
  accountDimensions.forEach((dim) => addNameEntries(dimensionNameToIdMap, dim.name, dim.id));

  // 2) Report-specific dimensions
  const reportDimensions = await queryClient.fetchQuery({
    queryKey: resyncQueryKeys.dimensions.report(reportId),
    queryFn: fetchReportDimensions,
    staleTime: 5 * 60 * 1000,
  });
  reportDimensions.forEach((dim) => addNameEntries(dimensionNameToIdMap, dim.name, dim.id));

  // 3) Global dimensions (fallback if account/report not found)
  const { data: globalDimensions, error: globalError } = await supabase
    .from("dimensions")
    .select("id, name, scope")
    .eq("scope", "global");

  if (!globalError && globalDimensions) {
    globalDimensions.forEach((dim: any) => addNameEntries(dimensionNameToIdMap, dim.name, dim.id));
  }

  return dimensionNameToIdMap;
}

/**
 * Creates a map of old dimension ID to dimension name
 * Fetches all unique dimension IDs in a single query using react-query cache
 */
export async function createOldDimensionIdToNameMap(
  queryClient: QueryClient,
  oldDimensionIds: string[]
): Promise<Map<string, string>> {
  if (oldDimensionIds.length === 0) {
    return new Map();
  }

  const uniqueIds = Array.from(new Set(oldDimensionIds)).sort();

  const oldDimensions = await queryClient.fetchQuery({
    queryKey: resyncQueryKeys.dimensions.oldDimensions(uniqueIds),
    queryFn: fetchOldDimensions,
    staleTime: 5 * 60 * 1000,
  });

  const oldIdToNameMap = new Map<string, string>();
  oldDimensions.forEach((dim) => {
    if (dim?.id && dim?.name) {
      oldIdToNameMap.set(dim.id, dim.name);
    }
  });

  return oldIdToNameMap;
}