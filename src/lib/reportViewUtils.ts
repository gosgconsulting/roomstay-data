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
 * @param activeDimensions - Array of dimension IDs to save
 */
export async function saveDimensionSettings(
  reportId: string,
  userId: string,
  activeDimensions: string[]
): Promise<void> {
  try {
    console.log(`[DIMENSION-SELECTOR] Saving dimensions for report ${reportId}:`, activeDimensions);

    const { data: existingView } = await supabase
      .from("report_views")
      .select("id, filter_values, date_range_start, date_range_end, date_preset")
      .eq("report_id", reportId)
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    const cleanedFilterValues =
      existingView && (existingView as any).filter_values
        ? cleanupFilterValues(
            activeDimensions,
            (existingView as any).filter_values as Record<string, any>
          )
        : {};

    const viewData = {
      filter_dimensions: activeDimensions,
      filter_values: cleanedFilterValues,
      date_range_start: (existingView?.date_range_start as string) || null,
      date_range_end: (existingView?.date_range_end as string) || null,
      date_preset: (existingView?.date_preset as string) || "all_time",
    };

    if (existingView && (existingView as any).id) {
      const { error } = await supabase
        .from("report_views")
        .update(viewData)
        .eq("id", (existingView as any).id as string);
      if (error) throw new Error((error as any)?.message ?? 'Supabase update error');
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
      if (error) throw new Error((error as any)?.message ?? 'Supabase insert error');
    }
  } catch (error) {
    console.error('[DIMENSION-SELECTOR] Error saving dimension settings:', error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}