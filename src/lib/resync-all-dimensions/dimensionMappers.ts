import { QueryClient } from "@tanstack/react-query";
import { resyncQueryKeys } from "./queryKeys";
import {
  fetchAccountDimensions,
  fetchReportDimensions,
  fetchOldDimensions,
} from "./queryFunctions";

/**
 * Creates a map of dimension name (lowercase) to dimension ID for account-scoped dimensions
 * Uses react-query cache for efficient fetching
 */
export async function createAccountDimensionMap(
  queryClient: QueryClient,
  accountId: string,
  reportId: string
): Promise<Map<string, string>> {
  const dimensionNameToIdMap = new Map<string, string>();

  // Fetch account-scoped dimensions using react-query cache
  const accountDimensions = await queryClient.fetchQuery({
    queryKey: resyncQueryKeys.dimensions.account(accountId),
    queryFn: fetchAccountDimensions,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  accountDimensions.forEach((dim) => {
    dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
  });

  // Fetch report-specific dimensions using react-query cache
  const reportDimensions = await queryClient.fetchQuery({
    queryKey: resyncQueryKeys.dimensions.report(reportId),
    queryFn: fetchReportDimensions,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  reportDimensions.forEach((dim) => {
    dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
  });

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

  // Remove duplicates and sort for consistent cache key
  const uniqueIds = Array.from(new Set(oldDimensionIds)).sort();

  // Fetch old dimensions using react-query cache
  const oldDimensions = await queryClient.fetchQuery({
    queryKey: resyncQueryKeys.dimensions.oldDimensions(uniqueIds),
    queryFn: fetchOldDimensions,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const oldIdToNameMap = new Map<string, string>();
  oldDimensions.forEach((dim) => {
    oldIdToNameMap.set(dim.id, dim.name);
  });

  return oldIdToNameMap;
}

