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
    console.log(`[DIMENSION-SELECTOR] Starting save for report ${reportId}, user ${userId}`);
    console.log(`[DIMENSION-SELECTOR] Active dimensions:`, activeDimensions);

    // Validate inputs
    if (!reportId || !userId) {
      throw new Error('Report ID and User ID are required');
    }

    if (!Array.isArray(activeDimensions)) {
      throw new Error('Active dimensions must be an array');
    }

    // First, verify the report exists and user has access
    console.log(`[DIMENSION-SELECTOR] Verifying report access...`);
    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .select("id, user_id, account_id")
      .eq("id", reportId)
      .single();

    if (reportError) {
      console.error('[DIMENSION-SELECTOR] Report verification error:', reportError);
      throw new Error(`Report not found: ${reportError.message}`);
    }

    if (!reportData) {
      throw new Error('Report not found');
    }

    console.log(`[DIMENSION-SELECTOR] Report data:`, reportData);

    // Check if user has access to this report
    const hasAccess = reportData.user_id === userId;
    if (!hasAccess) {
      console.log(`[DIMENSION-SELECTOR] User doesn't own report, checking shares...`);
      // Check if report is shared with user
      const { data: userData } = await supabase.auth.getUser();
      const userEmail = userData.user?.email;
      
      if (userEmail) {
        const { data: shareData } = await supabase
          .from("report_shares")
          .select("id")
          .eq("report_id", reportId)
          .eq("shared_with_email", userEmail)
          .single();
        
        if (!shareData) {
          throw new Error('Access denied: You do not have permission to modify this report');
        }
        console.log(`[DIMENSION-SELECTOR] Report is shared with user`);
      } else {
        throw new Error('Access denied: Unable to verify user email');
      }
    } else {
      console.log(`[DIMENSION-SELECTOR] User owns the report`);
    }

    // Get existing view - using correct column names from schema
    console.log(`[DIMENSION-SELECTOR] Fetching existing view...`);
    const { data: existingViewData, error: existingViewError } = await supabase
      .from("report_views")
      .select("id, filter_values, date_range_start, date_range_end, date_preset, account_id")
      .eq("report_id", reportId)
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    if (existingViewError && existingViewError.code !== 'PGRST116') {
      console.error('[DIMENSION-SELECTOR] Error fetching existing view:', existingViewError);
      throw new Error(`Failed to fetch existing view: ${existingViewError.message}`);
    }

    const existingView = existingViewData;
    console.log(`[DIMENSION-SELECTOR] Existing view:`, existingView);

    const cleanedFilterValues =
      existingView && existingView.filter_values
        ? cleanupFilterValues(
            activeDimensions,
            existingView.filter_values as Record<string, any>
          )
        : {};

    // Prepare the data to save - using correct column names
    const baseViewData = {
      filter_dimensions: activeDimensions,
      filter_values: cleanedFilterValues,
      date_range_start: existingView?.date_range_start || null,
      date_range_end: existingView?.date_range_end || null,
      date_preset: existingView?.date_preset || "this_month",
    };

    if (existingView && existingView.id) {
      console.log('[DIMENSION-SELECTOR] Updating existing view:', existingView.id);
      console.log('[DIMENSION-SELECTOR] Update data:', baseViewData);
      
      const { error } = await supabase
        .from("report_views")
        .update(baseViewData)
        .eq("id", existingView.id);
      
      if (error) {
        console.error('[DIMENSION-SELECTOR] Update error:', error);
        console.error('[DIMENSION-SELECTOR] Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw new Error(`Failed to update view: ${error.message}`);
      }
      console.log('[DIMENSION-SELECTOR] Successfully updated existing view');
    } else {
      console.log('[DIMENSION-SELECTOR] Creating new default view');
      
      const insertData = {
        ...baseViewData,
        report_id: reportId,
        user_id: userId,
        account_id: reportData.account_id || null,
        name: "Default View",
        is_default: true,
      };

      console.log('[DIMENSION-SELECTOR] Insert data:', insertData);

      const { error } = await supabase
        .from("report_views")
        .insert(insertData);
      
      if (error) {
        console.error('[DIMENSION-SELECTOR] Insert error:', error);
        console.error('[DIMENSION-SELECTOR] Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw new Error(`Failed to create view: ${error.message}`);
      }
      console.log('[DIMENSION-SELECTOR] Successfully created new view');
    }

    console.log('[DIMENSION-SELECTOR] Successfully saved dimension settings');
  } catch (error) {
    console.error('[DIMENSION-SELECTOR] Error saving dimension settings:', error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}