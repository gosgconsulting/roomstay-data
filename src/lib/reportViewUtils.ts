import { supabase } from "@/integrations/supabase/client";

/**
 * Cleans up filter_values to remove any dimension IDs not in filter_dimensions
 * @param filterDimensions - Array of active dimension IDs
 * @param filterValues - Current filter values object
 * @returns Cleaned filter values object
 */
export function cleanupFilterValues(
  filterDimensions: string[],
  filterValues: Record<string, any>
): Record<string, any> {
  const cleaned: Record<string, any> = {};
  
  Object.keys(filterValues).forEach(dimensionId => {
    if (filterDimensions.includes(dimensionId)) {
      cleaned[dimensionId] = filterValues[dimensionId];
    }
  });
  
  return cleaned;
}

/**
 * Saves dimension settings to a report view
 * Creates or updates the default view for a report with the specified dimensions
 * 
 * @param reportId - The ID of the report
 * @param userId - The ID of the user
 * @param dimensions - Array of dimension IDs to save
 */
export async function saveDimensionSettings(
  reportId: string,
  userId: string,
  dimensions: string[]
): Promise<void> {
  try {
    console.log(`[DIMENSION-SELECTOR] Saving dimensions for report ${reportId}:`, dimensions);

    // Check if a default view already exists for this report
    const { data: existingView } = await supabase
      .from("report_views")
      .select("id, filter_values, date_range_start, date_range_end, date_range_preset")
      .eq("report_id", reportId)
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    // Clean up filter_values to only include active dimensions
    const cleanedFilterValues = (existingView && 'filter_values' in existingView && existingView.filter_values)
      ? cleanupFilterValues(dimensions, existingView.filter_values as Record<string, any>)
      : {};

    const viewData = {
      filter_dimensions: activeDimensions,
      filter_values: cleanedFilterValues, // Use cleaned values
      date_range_start: (existingView && 'date_range_start' in existingView) ? existingView.date_range_start : null,
      date_range_end: (existingView && 'date_range_end' in existingView) ? existingView.date_range_end : null,
      date_range_preset: (existingView && 'date_range_preset' in existingView) ? existingView.date_range_preset : "all_time",
    };

    if (existingView && 'id' in existingView) {
      const { error } = await supabase
        .from("report_views")
        .update(viewData)
        .eq("id", existingView.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("report_views")
        .insert({
          ...viewData,
          report_id: reportId,
          user_id: userId,
          name: "Default View",
          is_default: true,
        });
      if (error) throw error;
    }
  } catch (error) {
    console.error('[DIMENSION-SELECTOR] Error saving dimension settings:', error);
    throw error;
  }
}