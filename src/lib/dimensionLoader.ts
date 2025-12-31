import { supabase } from "@/integrations/supabase/client";
import { filterDimensionsByDataAvailability } from "./dimensionUtils";

export interface Dimension {
  id: string;
  name: string;
  type: string;
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
 * Loads dimensions for a user, prioritizing by scope:
 * 1. Account-specific dimensions (highest priority)
 * 2. Custom dimensions (user-specific)
 * 3. Global dimensions (templates/fallback)
 * 4. Vlookup dimensions (now included as regular dimensions)
 * 
 * @param userId - The ID of the user
 * @param reportId - Optional report ID to get account-specific dimensions
 * @param options - Optional configuration for filtering
 * @returns Promise<Dimension[]> - Array of unique dimensions
 */
export async function loadDimensionsForUser(
  userId: string,
  reportId?: string,
  options: {
    filterByDataAvailability?: boolean;  // Filter to only dimensions with data
    alwaysIncludeDate?: boolean;         // Always include date dimensions
    alwaysIncludeCalculated?: boolean;   // Always include calculated/formula dimensions
    fallbackOnError?: boolean;           // Return all dimensions if filtering fails
  } = {}
): Promise<Dimension[]> {
  const { filterByDataAvailability = false, alwaysIncludeDate = true, alwaysIncludeCalculated = true, fallbackOnError = true } = options;
  
  // console.log('[testing] DimensionLoader - Loading dimensions for user:', userId, {
  //   reportId,
  //   filterByDataAvailability,
  //   alwaysIncludeDate,
  //   alwaysIncludeCalculated
  // });

  let accountId: string | null = null;
  let accountData: Dimension[] | null = null;

  // Load account-specific dimensions if reportId is provided
  if (reportId) {
    accountId = await getAccountIdFromReport(reportId);
    
    if (accountId) {
      const { data: accData, error: accountError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "account")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (accountError) throw accountError;
      accountData = accData as Dimension[];
      // console.log('[testing] DimensionLoader - Loaded account-specific dimensions:', accData?.length || 0);
    }
  }

  // Load global dimensions (templates)
  const { data: globalData, error: globalError } = await supabase
    .from("dimensions")
    .select("*")
    .eq("scope", "global")
    .order("created_at", { ascending: false });

  if (globalError) throw globalError;

  // Load user's custom dimensions (including vlookup dimensions)
  const { data: customData, error: customError } = await supabase
    .from("dimensions")
    .select("*")
    .eq("scope", "custom")
    .eq("user_id", userId)
    .or(`report_id.is.null,report_id.eq.${reportId}`)
    .order("created_at", { ascending: false });

  if (customError) throw customError;

  // Combine all dimensions with priority: account > custom > global
  const allDimensions = [
    ...(accountData || []),
    ...(customData || []),
    ...(globalData || [])
  ];

  // Remove duplicates by name, keeping the first occurrence (most specific scope)
  const uniqueDimensions = allDimensions.filter((dim, index, arr) => 
    arr.findIndex(d => d.name === dim.name) === index
  );

  // console.log('[testing] DimensionLoader - Loaded dimensions before filtering:', {
  //   global: globalData?.length || 0,
  //   account: accountData?.length || 0,
  //   custom: customData?.length || 0,
  //   total: uniqueDimensions.length
  // });

  // Filter by data availability if requested and reportId is provided
  let finalDimensions = uniqueDimensions;
  if (filterByDataAvailability && reportId) {
    try {
      // console.log('[testing] DimensionLoader - Filtering dimensions by data availability...');
      finalDimensions = await filterDimensionsByDataAvailability(
        uniqueDimensions,
        reportId,
        {
          alwaysIncludeDate,
          alwaysIncludeCalculated,
          fallbackOnError
        }
      );
      // console.log('[testing] DimensionLoader - Data availability filtering:', {
      //   original: uniqueDimensions.length,
      //   filtered: finalDimensions.length,
      //   excluded: uniqueDimensions.length - finalDimensions.length
      // });
    } catch (filterError) {
      console.error('[testing] DimensionLoader - Error filtering by data availability:', filterError);
      if (fallbackOnError) {
        finalDimensions = uniqueDimensions;
      } else {
        throw filterError;
      }
    }
  }

  // console.log('[testing] DimensionLoader - Final dimensions loaded:', finalDimensions.length);
  return finalDimensions;
}