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
    if (!dimensionId || !reportId) {
      console.warn('[DIMENSION-UTILS] Missing dimensionId or reportId');
      return false;
    }

    // Query dimension_data table to check if this dimension exists in any row's dimension_values
    const { data, error } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .limit(10); // Check only first 10 rows for performance

    if (error) {
      console.error('[DIMENSION-UTILS] Error checking dimension data:', error);
      return false;
    }

    if (!data || data.length === 0) {
      console.log('[DIMENSION-UTILS] No data found for report:', reportId);
      return false;
    }

    // Check if any row has this dimension in its dimension_values
    const hasData = data.some((row) => {
      try {
        const dimValues = row.dimension_values as Record<string, any>;
        return dimValues && 
               dimValues[dimensionId] !== undefined && 
               dimValues[dimensionId] !== null && 
               dimValues[dimensionId] !== '';
      } catch (rowError) {
        console.warn('[DIMENSION-UTILS] Error checking row data:', rowError);
        return false;
      }
    });

    return hasData;
  } catch (error) {
    console.error('[DIMENSION-UTILS] Error checking dimension data:', error);
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
  if (!reportId || !dimensionIds || dimensionIds.length === 0) {
    console.warn('[DIMENSION-UTILS] Missing reportId or dimensionIds');
    return {};
  }

  try {
    console.log('[DIMENSION-UTILS] Checking data for', dimensionIds.length, 'dimensions in report:', reportId);

    // Fetch sample dimension_data for this report (limit for performance)
    const { data, error } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .limit(100); // Check first 100 rows for better coverage while maintaining performance

    if (error) {
      console.error('[DIMENSION-UTILS] Error checking dimensions data:', error);
      // Return all dimensions as having data to prevent UI issues
      return dimensionIds.reduce((acc, id) => ({ ...acc, [id]: true }), {});
    }

    if (!data || data.length === 0) {
      console.log('[DIMENSION-UTILS] No data found for report:', reportId);
      return dimensionIds.reduce((acc, id) => ({ ...acc, [id]: false }), {});
    }

    // Initialize all dimensions as false
    const hasDataMap: Record<string, boolean> = dimensionIds.reduce(
      (acc, id) => ({ ...acc, [id]: false }),
      {}
    );

    // Check each row for dimension presence
    let rowsChecked = 0;
    let dimensionsFound = 0;

    data.forEach((row, index) => {
      try {
        const dimValues = row.dimension_values as Record<string, any>;
        if (!dimValues) return;

        rowsChecked++;

        dimensionIds.forEach((dimId) => {
          if (!hasDataMap[dimId] && 
              dimValues[dimId] !== undefined && 
              dimValues[dimId] !== null && 
              dimValues[dimId] !== '') {
            hasDataMap[dimId] = true;
            dimensionsFound++;
          }
        });
      } catch (rowError) {
        console.warn('[DIMENSION-UTILS] Error processing row', index, ':', rowError);
      }
    });

    console.log('[DIMENSION-UTILS] Data check complete:', {
      rowsChecked,
      dimensionsFound,
      totalDimensions: dimensionIds.length,
      hasDataMap
    });

    return hasDataMap;
  } catch (error) {
    console.error('[DIMENSION-UTILS] Error checking dimensions data:', error);
    // Return all dimensions as having data to prevent UI blocking
    return dimensionIds.reduce((acc, id) => ({ ...acc, [id]: true }), {});
  }
}