/**
 * Debug utility functions for troubleshooting data issues
 */

/**
 * Filters dimensions based on visibility settings from report_views
 * Always includes filter dimensions even if they're not in visible_dimensions
 * @param dimensions The dimensions array to filter
 * @param reportId The report ID
 * @param userId The user ID
 * @param supabase The Supabase client
 * @returns Filtered dimensions array
 */
export const filterDimensionsByVisibility = async (
  dimensions: any[],
  reportId: string | null,
  userId: string,
  supabase: any
): Promise<any[]> => {
  if (!reportId || !dimensions || dimensions.length === 0) {
    return dimensions;
  }

  try {
    const { data: viewSettings, error } = await supabase
      .from("report_views")
      .select("visible_dimensions, filter_dimensions")
      .eq("report_id", reportId)
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    if (error) {
      console.warn("[DEBUG] Could not load visibility settings, showing all dimensions:", error);
      // If we can't load settings, show all dimensions (default behavior)
      return dimensions;
    }

    // If visibility settings exist and have items, filter to only visible dimensions
    if (viewSettings?.visible_dimensions && Array.isArray(viewSettings.visible_dimensions) && viewSettings.visible_dimensions.length > 0) {
      const visibleSet = new Set(viewSettings.visible_dimensions);
      
      // Always include filter dimensions, even if they're not in visible_dimensions
      if (viewSettings.filter_dimensions && Array.isArray(viewSettings.filter_dimensions)) {
        viewSettings.filter_dimensions.forEach((filterId: string) => {
          visibleSet.add(filterId);
        });
      }
      
      // Always include date dimensions (critical for charts and date-based filtering)
      dimensions.forEach(dim => {
        if (dim.type === 'date') {
          visibleSet.add(dim.id);
        }
      });
      
      const filtered = dimensions.filter(d => visibleSet.has(d.id));
      console.log("[DEBUG] Filtered dimensions by visibility (including filter and date dimensions):", filtered.length, "of", dimensions.length);
      console.log("[DEBUG] Filter dimensions included:", viewSettings.filter_dimensions);
      return filtered;
    }

    // If no visibility settings exist, show all dimensions (default: everything is visible)
    console.log("[DEBUG] No visibility settings found, showing all", dimensions.length, "dimensions");
    return dimensions;
  } catch (error) {
    console.error("[DEBUG] Error filtering dimensions by visibility:", error);
    // Fallback: return all dimensions if filter fails
    return dimensions;
  }
};

/**
 * Retries a function with exponential backoff
 * @param fn The async function to retry
 * @param maxAttempts Maximum number of attempts (default: 3)
 * @param delayMs Initial delay in milliseconds (default: 1000)
 * @returns The result of the function
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(2, attempt - 1);
        console.warn(`[RETRY] Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Failed after max attempts');
};

/**
 * Logs data with a prefix for easier filtering in console
 * @param prefix The prefix to add to the log
 * @param data The data to log
 */
export const debugLog = (prefix: string, data: any) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEBUG:${prefix}]`, data);
  }
};

/**
 * Inspects an object structure and logs its keys and types
 * @param prefix The prefix to add to the log
 * @param obj The object to inspect
 * @param depth Maximum depth to inspect (default: 2)
 */
export const inspectObject = (prefix: string, obj: any, depth = 2) => {
  if (process.env.NODE_ENV !== 'production') {
    const inspect = (o: any, currentDepth = 0): any => {
      if (currentDepth >= depth) return '...';
      if (o === null) return 'null';
      if (o === undefined) return 'undefined';
      
      const type = typeof o;
      
      if (type !== 'object') return type;
      if (Array.isArray(o)) {
        return o.length === 0 
          ? 'empty array' 
          : `array[${o.length}] of ${typeof o[0]}`;
      }
      
      const entries = Object.entries(o);
      if (entries.length === 0) return 'empty object';
      
      return entries.reduce((acc, [key, value]) => {
        acc[key] = inspect(value, currentDepth + 1);
        return acc;
      }, {} as Record<string, any>);
    };
    
    console.log(`[INSPECT:${prefix}]`, inspect(obj));
  }
};

/**
 * Validates chart data and logs any issues found
 * @param chartData The chart data array to validate
 * @returns True if data is valid, false otherwise
 */
export const validateChartData = (chartData: any[]) => {
  if (!Array.isArray(chartData)) {
    console.error('[VALIDATE:CHART] Data is not an array', chartData);
    return false;
  }
  
  if (chartData.length === 0) {
    console.warn('[VALIDATE:CHART] Chart data array is empty');
    return false;
  }
  
  // Check if all items have required properties
  const invalidItems = chartData.filter(
    item => !item || typeof item !== 'object' || !('date' in item) || !('value' in item)
  );
  
  if (invalidItems.length > 0) {
    console.error('[VALIDATE:CHART] Some chart data items are invalid', invalidItems);
    return false;
  }
  
  return true;
};
