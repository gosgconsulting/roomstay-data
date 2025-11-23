import { supabase } from "@/integrations/supabase/client";

/**
 * Checks which dimensions actually have data in dimension_data for a given report
 * @param reportId - The report ID to check
 * @param dimensionIds - Optional array of dimension IDs to check. If not provided, checks all.
 * @returns Promise<Set<string>> - Set of dimension IDs that have data
 */
export async function getDimensionsWithData(
  reportId: string,
  dimensionIds?: string[]
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("dimension_data")
      .select("dimension_values")
      .eq("report_id", reportId)
      .limit(100); // Sample enough rows to find dimensions with data

    if (error) {
      console.error("[dimensionDataChecker] Error fetching dimension data:", error);
      return new Set();
    }

    const dimensionsWithData = new Set<string>();
    
    // Check which dimension IDs appear as keys in dimension_values
    data?.forEach(row => {
      const dv = row.dimension_values as Record<string, any>;
      if (dv) {
        Object.keys(dv).forEach(dimId => {
          // Only include if we're not filtering, or if this ID is in our filter list
          if (!dimensionIds || dimensionIds.includes(dimId)) {
            // Check if the dimension actually has a non-empty value
            const value = dv[dimId];
            if (value !== null && value !== undefined && value !== "") {
              dimensionsWithData.add(dimId);
            }
          }
        });
      }
    });

    console.log("[dimensionDataChecker] Dimensions with data:", Array.from(dimensionsWithData));
    return dimensionsWithData;
  } catch (error) {
    console.error("[dimensionDataChecker] Error checking dimension data:", error);
    return new Set();
  }
}

/**
 * Finds the best dimension to use as a default filter, prioritizing dimensions with data
 * @param reportId - The report ID
 * @param accountId - The account ID
 * @param preferredNames - Array of dimension names to prefer (e.g., ["Account", "Campaign", "Hotel"])
 * @returns Promise<string | null> - The dimension ID to use, or null
 */
export async function findBestDefaultFilterDimension(
  reportId: string,
  accountId: string | null,
  preferredNames: string[] = ["Account", "Campaign", "Ad Group", "Hotel", "Channel"]
): Promise<string | null> {
  try {
    // First, get all text dimensions for this account/report
    let query = supabase
      .from("dimensions")
      .select("id, name, scope, account_id")
      .eq("type", "text");

    // Build a list of all potential dimensions
    const conditions = [];
    if (accountId) {
      conditions.push(`scope.eq.account,account_id.eq.${accountId}`);
    }
    conditions.push("scope.eq.global");
    
    if (conditions.length > 0) {
      query = query.or(conditions.join(","));
    }

    const { data: dimensions, error } = await query.order("created_at", { ascending: false });

    if (error || !dimensions || dimensions.length === 0) {
      console.log("[dimensionDataChecker] No text dimensions found");
      return null;
    }

    // Get dimensions that have data in this report
    const dimensionIds = dimensions.map(d => d.id);
    const dimensionsWithData = await getDimensionsWithData(reportId, dimensionIds);

    // Filter to only dimensions that have data
    const dimensionsWithDataList = dimensions.filter(d => dimensionsWithData.has(d.id));

    if (dimensionsWithDataList.length === 0) {
      console.log("[dimensionDataChecker] No dimensions have data for this report");
      return null;
    }

    // Try to find a preferred dimension (in order of preference)
    for (const preferredName of preferredNames) {
      // First try account-scoped
      const accountMatch = dimensionsWithDataList.find(
        d => d.name === preferredName && d.scope === "account" && d.account_id === accountId
      );
      if (accountMatch) {
        console.log(`[dimensionDataChecker] Found preferred dimension with data: ${preferredName} (account-scoped)`);
        return accountMatch.id;
      }

      // Then try global
      const globalMatch = dimensionsWithDataList.find(
        d => d.name === preferredName && d.scope === "global"
      );
      if (globalMatch) {
        console.log(`[dimensionDataChecker] Found preferred dimension with data: ${preferredName} (global)`);
        return globalMatch.id;
      }
    }

    // If no preferred dimension found, return the first dimension with data
    const fallback = dimensionsWithDataList[0];
    console.log(`[dimensionDataChecker] No preferred dimension found, using fallback: ${fallback.name}`);
    return fallback.id;
  } catch (error) {
    console.error("[dimensionDataChecker] Error finding default filter dimension:", error);
    return null;
  }
}
