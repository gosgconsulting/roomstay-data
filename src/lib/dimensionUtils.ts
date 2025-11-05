import { supabase } from "@/integrations/supabase/client";

/**
 * Checks if a dimension has data for a specific report
 * @param dimensionId - The ID of the dimension to check
 * @param reportId - The ID of the report to check data for
 * @returns Promise<boolean> - true if dimension has data, false otherwise
 */
export async function checkDimensionHasData(
  dimensionId: string,
  reportId: string
): Promise<boolean> {
  try {
    // Query dimension_data table to check if this dimension exists in any row's dimension_values
    const { data, error } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .limit(1);

    if (error) {
      console.error('[testing] Error checking dimension data:', error);
      return false;
    }

    if (!data || data.length === 0) {
      return false;
    }

    // Check if any row has this dimension in its dimension_values
    return data.some((row) => {
      const dimValues = row.dimension_values as Record<string, any>;
      return dimValues && dimValues[dimensionId] !== undefined && dimValues[dimensionId] !== null;
    });
  } catch (error) {
    console.error('[testing] Error checking dimension data:', error);
    return false;
  }
}

/**
 * Checks if multiple dimensions have data for a specific report
 * @param dimensionIds - Array of dimension IDs to check
 * @param reportId - The ID of the report to check data for
 * @returns Promise<Record<string, boolean>> - Map of dimension ID to hasData boolean
 */
export async function checkDimensionsHaveData(
  dimensionIds: string[],
  reportId: string
): Promise<Record<string, boolean>> {
  if (!reportId || dimensionIds.length === 0) {
    return {};
  }

  try {
    // Fetch all dimension_data for this report (limit to reasonable amount for performance)
    const { data, error } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .limit(1000); // Limit to first 1000 rows for performance

    if (error) {
      console.error('[testing] Error checking dimensions data:', error);
      return dimensionIds.reduce((acc, id) => ({ ...acc, [id]: false }), {});
    }

    if (!data || data.length === 0) {
      return dimensionIds.reduce((acc, id) => ({ ...acc, [id]: false }), {});
    }

    // Initialize all dimensions as false
    const hasDataMap: Record<string, boolean> = dimensionIds.reduce(
      (acc, id) => ({ ...acc, [id]: false }),
      {}
    );

    // Check each row for dimension presence
    data.forEach((row) => {
      const dimValues = row.dimension_values as Record<string, any>;
      if (!dimValues) return;

      dimensionIds.forEach((dimId) => {
        if (!hasDataMap[dimId] && dimValues[dimId] !== undefined && dimValues[dimId] !== null) {
          hasDataMap[dimId] = true;
        }
      });
    });

    return hasDataMap;
  } catch (error) {
    console.error('[testing] Error checking dimensions data:', error);
    return dimensionIds.reduce((acc, id) => ({ ...acc, [id]: false }), {});
  }
}

