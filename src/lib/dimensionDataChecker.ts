import { supabase } from "@/integrations/supabase/client";

/**
 * Gets the dimension IDs that are mapped in a report's data source
 * @param reportId - The report ID
 * @returns Promise<Set<string>> - Set of dimension IDs that are mapped
 */
export async function getMappedDimensionIds(reportId: string): Promise<Set<string>> {
  try {
    const { data: dataSource, error } = await supabase
      .from("data_sources")
      .select("column_mappings")
      .eq("report_id", reportId)
      .limit(1)
      .maybeSingle();

    if (error || !dataSource) {
      console.log("[dimensionDataChecker] No data source found for report:", reportId);
      return new Set();
    }

    const mappedIds = new Set<string>();
    const mappings = (dataSource.column_mappings as any[]) || [];
    
    mappings.forEach((mapping: any) => {
      if (mapping.dimensionId && mapping.dimensionId !== 'none') {
        mappedIds.add(mapping.dimensionId);
      }
    });

    console.log("[dimensionDataChecker] Mapped dimension IDs:", Array.from(mappedIds));
    return mappedIds;
  } catch (error) {
    console.error("[dimensionDataChecker] Error getting mapped dimensions:", error);
    return new Set();
  }
}

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
 * Filters dimension IDs to only include those that are mapped in the report's data source
 * Also handles name-based matching for account-scoped dimensions
 * @param reportId - The report ID
 * @param dimensionIds - Array of dimension IDs to filter
 * @returns Promise<string[]> - Filtered array of dimension IDs that are valid for this report
 */
export async function filterDimensionsByMappedData(
  reportId: string,
  dimensionIds: string[]
): Promise<string[]> {
  if (!reportId || !dimensionIds.length) return [];

  try {
    // Get mapped dimension IDs from data source
    const mappedIds = await getMappedDimensionIds(reportId);
    
    // Also get dimension names for the mapped IDs
    const { data: mappedDimensions } = await supabase
      .from("dimensions")
      .select("id, name")
      .in("id", Array.from(mappedIds));
    
    const mappedNames = new Set((mappedDimensions || []).map(d => d.name.toLowerCase()));
    
    // Get dimension names for the requested IDs
    const { data: requestedDimensions } = await supabase
      .from("dimensions")
      .select("id, name")
      .in("id", dimensionIds);
    
    // Filter to only include dimensions that are mapped (by ID or by name)
    const validIds: string[] = [];
    (requestedDimensions || []).forEach(dim => {
      // Check if this dimension ID is directly mapped
      if (mappedIds.has(dim.id)) {
        validIds.push(dim.id);
        return;
      }
      
      // Check if a dimension with the same name is mapped (for account-scoped dimensions)
      if (mappedNames.has(dim.name.toLowerCase())) {
        validIds.push(dim.id);
      }
    });

    console.log("[dimensionDataChecker] Filtered dimensions by mapped data:", {
      requested: dimensionIds.length,
      valid: validIds.length,
      validIds
    });
    
    return validIds;
  } catch (error) {
    console.error("[dimensionDataChecker] Error filtering dimensions:", error);
    return dimensionIds; // Return original on error
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
    // First, get mapped dimension IDs from this report's data source
    const mappedIds = await getMappedDimensionIds(reportId);
    
    if (mappedIds.size === 0) {
      console.log("[dimensionDataChecker] No mapped dimensions found");
      return null;
    }

    // Get dimension info for mapped IDs
    const { data: mappedDimensions, error } = await supabase
      .from("dimensions")
      .select("id, name, type, scope, account_id")
      .in("id", Array.from(mappedIds));

    if (error || !mappedDimensions || mappedDimensions.length === 0) {
      console.log("[dimensionDataChecker] No dimension info found for mapped IDs");
      return null;
    }

    // Filter to only text dimensions
    const textDimensions = mappedDimensions.filter(d => d.type === "text");
    
    if (textDimensions.length === 0) {
      console.log("[dimensionDataChecker] No text dimensions among mapped dimensions");
      return null;
    }

    // Try to find a preferred dimension (in order of preference)
    for (const preferredName of preferredNames) {
      const match = textDimensions.find(d => d.name.toLowerCase() === preferredName.toLowerCase());
      if (match) {
        console.log(`[dimensionDataChecker] Found preferred dimension: ${preferredName}`);
        return match.id;
      }
    }

    // If no preferred dimension found, return the first text dimension
    const fallback = textDimensions[0];
    console.log(`[dimensionDataChecker] No preferred dimension found, using fallback: ${fallback.name}`);
    return fallback.id;
  } catch (error) {
    console.error("[dimensionDataChecker] Error finding default filter dimension:", error);
    return null;
  }
}
