import { supabase } from "@/integrations/supabase/client";

/**
 * Retry a function with exponential backoff
 */
export const retryWithBackoff = async (
  fn: () => Promise<any>, 
  maxAttempts: number = 3, 
  delay: number = 1000
): Promise<any> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
};

/**
 * Filter dimensions by visibility settings
 */
export const filterDimensionsByVisibility = async (
  dimensions: any[], 
  reportId: string, 
  userId: string, 
  supabaseClient: any
): Promise<any[]> => {
  try {
    // Get visibility settings from report_views
    const { data: viewSettings } = await supabaseClient
      .from("report_views")
      .select("visible_dimensions")
      .eq("report_id", reportId)
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    if (viewSettings?.visible_dimensions && Array.isArray(viewSettings.visible_dimensions)) {
      const visibleDimensionIds = new Set(viewSettings.visible_dimensions);
      return dimensions.filter(d => visibleDimensionIds.has(d.id));
    }

    // If no visibility settings, return all dimensions
    return dimensions;
  } catch (error) {
    console.error('Error filtering dimensions by visibility:', error);
    // Return all dimensions on error
    return dimensions;
  }
};

/**
 * Debug logging utility
 */
export const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEBUG] ${message}`, data);
  }
};

/**
 * Performance timing utility
 */
export const timeFunction = async <T>(
  name: string, 
  fn: () => Promise<T>
): Promise<T> => {
  const start = performance.now();
  try {
    const result = await fn();
    const end = performance.now();
    debugLog(`${name} took ${(end - start).toFixed(2)}ms`);
    return result;
  } catch (error) {
    const end = performance.now();
    debugLog(`${name} failed after ${(end - start).toFixed(2)}ms`, error);
    throw error;
  }
};