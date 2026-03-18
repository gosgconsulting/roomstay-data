import { supabase } from "@/integrations/supabase/client";
import { filterDimensionsByDataAvailability } from "./dimensionUtils";

export interface Dimension {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown; // allow full row from select("*")
}

/**
 * Canonical dimension loading precedence (aligned with Edge Functions):
 * 1. Account-specific dimensions (highest priority)
 * 2. Custom dimensions (user-specific, report-scoped or report_id null)
 * 3. Global dimensions (templates/fallback)
 */

/**
 * Deduplicates dimensions by name, keeping the first occurrence (used for canonical precedence).
 * Pure function for unit testing.
 */
export function dedupeDimensionsByName<T extends { name: string }>(dimensions: T[]): T[] {
  return dimensions.filter(
    (dim, index, arr) => arr.findIndex((d) => d.name === dim.name) === index
  );
}

/**
 * Gets the account ID from a report
 * @param reportId - The ID of the report
 * @returns Promise<string | null> - The account ID or null if not found
 */
export async function getAccountIdFromReport(reportId: string): Promise<string | null> {
  const { data: reportData } = await supabase
    .from('reports')
    .select('account_id')
    .eq('id', reportId)
    .single();
  
  return reportData?.account_id || null;
}

/**
 * Loads dimensions for a user using canonical precedence (account > custom > global).
 * Single source of truth for dimension loading; Edge Functions use the same rules.
 *
 * @param userId - The ID of the user
 * @param reportId - Optional report ID (used to resolve account and for report-scoped custom dimensions)
 * @param options - Optional configuration
 * @returns Promise<Dimension[]> - Array of unique dimensions
 */
export async function loadDimensionsForUser(
  userId: string,
  reportId?: string,
  options: {
    accountId?: string;  // When provided, used directly instead of resolving from reportId
    filterByDataAvailability?: boolean;
    alwaysIncludeDate?: boolean;
    alwaysIncludeCalculated?: boolean;
    fallbackOnError?: boolean;
    typeFilter?: 'text';  // When set, return only dimensions with this type
  } = {}
): Promise<Dimension[]> {
  const {
    accountId: optionsAccountId,
    filterByDataAvailability = false,
    alwaysIncludeDate = true,
    alwaysIncludeCalculated = true,
    fallbackOnError = true,
    typeFilter,
  } = options;

  let accountId: string | null = optionsAccountId ?? null;
  let accountData: Dimension[] | null = null;

  if (!accountId && reportId) {
    accountId = await getAccountIdFromReport(reportId);
  }

  if (accountId) {
    const { data: accData, error: accountError } = await supabase
      .from("dimensions")
      .select("*")
      .eq("scope", "account")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    if (accountError) throw accountError;
    accountData = (accData || []) as Dimension[];
  }

  const { data: globalData, error: globalError } = await supabase
    .from("dimensions")
    .select("*")
    .eq("scope", "global")
    .order("created_at", { ascending: false });

  if (globalError) throw globalError;

  let customQuery = supabase
    .from("dimensions")
    .select("*")
    .eq("scope", "custom")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (reportId) {
    customQuery = customQuery.or(`report_id.is.null,report_id.eq.${reportId}`);
  } else {
    customQuery = customQuery.is("report_id", null);
  }

  const { data: customData, error: customError } = await customQuery;
  if (customError) throw customError;

  const allDimensions = [
    ...(accountData || []),
    ...(customData || []),
    ...(globalData || []),
  ] as Dimension[];

  const uniqueDimensions = dedupeDimensionsByName(allDimensions);

  let result = typeFilter === "text"
    ? uniqueDimensions.filter((d) => d.type === "text")
    : uniqueDimensions;

  // console.log('[testing] DimensionLoader - Loaded dimensions before filtering:', {
  //   global: globalData?.length || 0,
  //   account: accountData?.length || 0,
  //   custom: customData?.length || 0,
  //   total: uniqueDimensions.length
  // });

  if (filterByDataAvailability && reportId) {
    try {
      result = await filterDimensionsByDataAvailability(
        result,
        reportId,
        {
          alwaysIncludeDate,
          alwaysIncludeCalculated,
          fallbackOnError,
        }
      );
    } catch (filterError) {
      console.error('[DimensionLoader] Error filtering by data availability:', filterError);
      if (fallbackOnError) {
        // keep result as-is
      } else {
        throw filterError;
      }
    }
  }

  return result;
}