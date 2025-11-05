/**
 * Force refresh utility for report views
 * This triggers a visibility refresh to reload views with updated dimension mappings
 */

import { supabase } from "./supabase";

export async function forceRefreshReportViews(reportId: string): Promise<void> {
  try {
    console.log('[FORCE-REFRESH] Triggering visibility refresh for report:', reportId);
    
    // Update a dummy field to trigger view refresh
    const { error } = await supabase
      .from("reports")
      .update({ 
        updated_at: new Date().toISOString() 
      })
      .eq("id", reportId);
    
    if (error) {
      console.error('[FORCE-REFRESH] Error updating report:', error);
      throw error;
    }
    
    console.log('[FORCE-REFRESH] Successfully triggered refresh for report:', reportId);
  } catch (error) {
    console.error('[FORCE-REFRESH] Failed to refresh report views:', error);
    throw error;
  }
}

// Specific function for Diji - Social
export async function refreshDijiSocialViews(): Promise<void> {
  const DIJI_SOCIAL_REPORT_ID = "8c2f7db9-acbd-4c59-9593-74e8953e7787";
  await forceRefreshReportViews(DIJI_SOCIAL_REPORT_ID);
}
