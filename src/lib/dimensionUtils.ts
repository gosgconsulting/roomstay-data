import { supabase } from "@/integrations/supabase/client";

// Cache for dimension data availability results
const dimensionDataCache = new Map<string, Record<string, boolean>>();
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Clears the dimension data cache for a specific report or all reports
 * @param reportId - Optional report ID to clear cache for. If not provided, clears all cache
 */
export function clearDimensionDataCache(reportId?: string) {
  if (reportId) {
    dimensionDataCache.delete(reportId);
    cacheTimestamps.delete(reportId);
    console.log('[DIMENSION-UTILS] Cleared cache for report:', reportId);
  } else {
    dimensionDataCache.clear();
    cacheTimestamps.clear();
    console.log('[DIMENSION-UTILS] Cleared all dimension data cache');
  }
}

/**
 * Checks if cache is valid for a report
 * @param reportId - The report ID to check
 * @returns boolean - true if cache is valid and not expired
 */
function isCacheValid(reportId: string): boolean {
  const timestamp = cacheTimestamps.get(reportId);
  if (!timestamp) return false;
  
  const isExpired = Date.now() - timestamp > CACHE_EXPIRY_MS;
  if (isExpired) {
    dimensionDataCache.delete(reportId);
    cacheTimestamps.delete(reportId);
    return false;
  }
  
  return dimensionDataCache.has(reportId);
}

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
 * Checks if multiple dimensions have data for a specific report (with caching)
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

  // Check cache first
  if (isCacheValid(reportId)) {
    const cachedResult = dimensionDataCache.get(reportId);
    if (cachedResult) {
      console.log('[DIMENSION-UTILS] Using cached data for report:', reportId);
      // Return only the requested dimensions from cache
      const filteredResult: Record<string, boolean> = {};
      dimensionIds.forEach(id => {
        filteredResult[id] = cachedResult[id] || false;
      });
      return filteredResult;
    }
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
      const result = dimensionIds.reduce((acc, id) => ({ ...acc, [id]: false }), {});
      // Cache the result
      dimensionDataCache.set(reportId, result);
      cacheTimestamps.set(reportId, Date.now());
      return result;
    }

    // Initialize all dimensions as false
    const hasDataMap: Record<string, boolean> = {};
    
    // Check each row for dimension presence
    let rowsChecked = 0;
    let dimensionsFound = 0;

    data.forEach((row, index) => {
      try {
        const dimValues = row.dimension_values as Record<string, any>;
        if (!dimValues) return;

        rowsChecked++;

        // Check all dimension keys in the data, not just requested ones
        Object.keys(dimValues).forEach((dimId) => {
          if (dimValues[dimId] !== undefined && 
              dimValues[dimId] !== null && 
              dimValues[dimId] !== '') {
            if (!hasDataMap[dimId]) {
              hasDataMap[dimId] = true;
              dimensionsFound++;
            }
          }
        });
      } catch (rowError) {
        console.warn('[DIMENSION-UTILS] Error processing row', index, ':', rowError);
      }
    });

    console.log('[DIMENSION-UTILS] Data check complete:', {
      rowsChecked,
      dimensionsFound,
      totalDimensionsInData: Object.keys(hasDataMap).length,
      requestedDimensions: dimensionIds.length
    });

    // Cache the complete result for all dimensions found
    dimensionDataCache.set(reportId, hasDataMap);
    cacheTimestamps.set(reportId, Date.now());

    // Return only the requested dimensions
    const filteredResult: Record<string, boolean> = {};
    dimensionIds.forEach(id => {
      filteredResult[id] = hasDataMap[id] || false;
    });

    return filteredResult;
  } catch (error) {
    console.error('[DIMENSION-UTILS] Error checking dimensions data:', error);
    // Return all dimensions as having data to prevent UI blocking
    return dimensionIds.reduce((acc, id) => ({ ...acc, [id]: true }), {});
  }
}

/**
 * Filters dimensions to only include those that have data for the specified report
 * @param dimensions - Array of dimension objects to filter
 * @param reportId - The ID of the report to check data for
 * @param options - Optional configuration
 * @returns Promise<Dimension[]> - Filtered array of dimensions that have data
 */
export async function filterDimensionsByDataAvailability<T extends { 
  id: string; 
  type?: string; 
  name?: string; 
  formula?: string | null;
  formula_condition_pairs?: any[];
}>(
  dimensions: T[],
  reportId: string,
  options: {
    alwaysIncludeDate?: boolean;      // Always include date dimensions (required for grouping)
    alwaysIncludeCalculated?: boolean; // Always include calculated/formula dimensions
    fallbackOnError?: boolean;        // Return all dimensions if error occurs
  } = {}
): Promise<T[]> {
  const { alwaysIncludeDate = true, alwaysIncludeCalculated = true, fallbackOnError = true } = options;

  if (!reportId || !dimensions || dimensions.length === 0) {
    console.warn('[DIMENSION-UTILS] Missing reportId or dimensions for filtering');
    return dimensions;
  }

  try {
    console.log('[DIMENSION-UTILS] Filtering', dimensions.length, 'dimensions by data availability for report:', reportId);

    // Get dimension IDs to check
    const dimensionIds = dimensions.map(d => d.id);
    
    // Check which dimensions have data
    const hasDataMap = await checkDimensionsHaveData(dimensionIds, reportId);
    
    // Filter dimensions based on data availability
    const filteredDimensions = dimensions.filter(dimension => {
      // Always include date dimensions if specified
      if (alwaysIncludeDate && dimension.type === 'date') {
        console.log('[DIMENSION-UTILS] Including date dimension:', dimension.name || dimension.id);
        return true;
      }
      
      // Always include calculated/formula dimensions if specified
      if (alwaysIncludeCalculated && (dimension.formula || (dimension.formula_condition_pairs && dimension.formula_condition_pairs.length > 0))) {
        console.log('[DIMENSION-UTILS] Including calculated dimension:', dimension.name || dimension.id);
        return true;
      }
      
      // Include dimension if it has data
      const hasData = hasDataMap[dimension.id];
      if (hasData) {
        console.log('[DIMENSION-UTILS] Including dimension with data:', dimension.name || dimension.id);
      } else {
        console.log('[DIMENSION-UTILS] Excluding dimension without data:', dimension.name || dimension.id);
      }
      
      return hasData;
    });

    console.log('[DIMENSION-UTILS] Filtered dimensions:', {
      original: dimensions.length,
      filtered: filteredDimensions.length,
      excluded: dimensions.length - filteredDimensions.length
    });

    return filteredDimensions;
  } catch (error) {
    console.error('[DIMENSION-UTILS] Error filtering dimensions by data availability:', error);
    
    if (fallbackOnError) {
      console.log('[DIMENSION-UTILS] Returning all dimensions due to error');
      return dimensions;
    } else {
      return [];
    }
  }
}