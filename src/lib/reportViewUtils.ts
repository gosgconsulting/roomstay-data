import { supabase } from "@/integrations/supabase/client";

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

    const viewData = {
      filter_dimensions: dimensions,
      // Preserve existing filter settings if they exist
      filter_values: existingView?.filter_values || {},
      date_range_start: existingView?.date_range_start || null,
      date_range_end: existingView?.date_range_end || null,
      date_range_preset: existingView?.date_range_preset || "this_month",
    };

    if (existingView) {
      // Update existing view
      const { error } = await supabase
        .from("report_views")
        .update(viewData)
        .eq("id", existingView.id);

      if (error) {
        console.error('[DIMENSION-SELECTOR] Error updating report view:', error);
        throw error;
      }
      
      console.log('[DIMENSION-SELECTOR] Successfully updated dimension settings for report');
    } else {
      // Create new view
      const { error } = await supabase
        .from("report_views")
        .insert({
          ...viewData,
          report_id: reportId,
          user_id: userId,
          is_default: true,
        });

      if (error) {
        console.error('[DIMENSION-SELECTOR] Error creating report view:', error);
        throw error;
      }
      
      console.log('[DIMENSION-SELECTOR] Successfully created dimension settings for report');
    }
  } catch (error) {
    console.error('[DIMENSION-SELECTOR] Error saving dimension settings:', error);
    throw error;
  }
}

