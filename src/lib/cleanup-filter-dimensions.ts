import { supabase } from "@/integrations/supabase/client";

/**
 * One-time cleanup script to reset excessive filter dimensions in all reports
 * This should be run once to fix existing data
 */
export async function cleanupExcessiveFilterDimensions() {
  try {
    console.log('[CLEANUP] Starting filter dimensions cleanup...');
    
    // Get the Date dimension ID
    const { data: dateDimension, error: dateError } = await supabase
      .from("dimensions")
      .select("id")
      .eq("scope", "global")
      .eq("type", "date")
      .eq("name", "Date")
      .maybeSingle();
    
    if (dateError || !dateDimension) {
      console.error('[CLEANUP] Failed to fetch Date dimension:', dateError);
      return { success: false, error: 'Date dimension not found' };
    }
    
    const dateDimensionId = dateDimension.id;
    console.log('[CLEANUP] Date dimension ID:', dateDimensionId);
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('[CLEANUP] No authenticated user');
      return { success: false, error: 'Not authenticated' };
    }
    
    // Find all report views with excessive filter_dimensions
    const { data: viewsToCleanup, error: fetchError } = await supabase
      .from("report_views")
      .select("id, report_id, filter_dimensions, user_id")
      .eq("user_id", user.id)
      .eq("is_default", true);
    
    if (fetchError) {
      console.error('[CLEANUP] Error fetching views:', fetchError);
      return { success: false, error: fetchError.message };
    }
    
    if (!viewsToCleanup || viewsToCleanup.length === 0) {
      console.log('[CLEANUP] No views found to cleanup');
      return { success: true, cleaned: 0 };
    }
    
    // Filter to only views with more than 1 filter dimension
    const excessiveViews = viewsToCleanup.filter(
      view => view.filter_dimensions && view.filter_dimensions.length > 1
    );
    
    console.log('[CLEANUP] Found', excessiveViews.length, 'views with excessive dimensions');
    
    if (excessiveViews.length === 0) {
      return { success: true, cleaned: 0 };
    }
    
    // Reset each view to Date dimension only
    let cleanedCount = 0;
    for (const view of excessiveViews) {
      console.log('[CLEANUP] Cleaning view:', view.id, 'Current dimensions:', view.filter_dimensions);
      
      const { error: updateError } = await supabase
        .from("report_views")
        .update({ 
          filter_dimensions: [dateDimensionId],
          filter_values: {}
        })
        .eq("id", view.id);
      
      if (updateError) {
        console.error('[CLEANUP] Error updating view:', view.id, updateError);
      } else {
        cleanedCount++;
        console.log('[CLEANUP] Successfully cleaned view:', view.id);
      }
    }
    
    console.log('[CLEANUP] Cleanup complete. Cleaned', cleanedCount, 'views');
    
    return { 
      success: true, 
      cleaned: cleanedCount,
      total: excessiveViews.length
    };
  } catch (error) {
    console.error('[CLEANUP] Unexpected error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
