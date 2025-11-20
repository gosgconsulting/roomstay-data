import { supabase } from "@/integrations/supabase/client";

/**
 * Automatically fixes dimension ID mismatches in data loading
 * This runs on the client side to handle any remaining inconsistencies
 */
export async function autoFixDimensionSync(
  rawData: any[],
  currentDimensions: Array<{ id: string; name: string; type: string }>
): Promise<any[]> {
  if (!rawData || rawData.length === 0 || currentDimensions.length === 0) {
    return rawData;
  }

  try {
    // Step 1: Analyze dimension IDs used in the data
    const usedDimensionIds = new Set<string>();
    rawData.forEach(row => {
      if (row.dimension_values) {
        Object.keys(row.dimension_values).forEach(dimId => {
          usedDimensionIds.add(dimId);
        });
      }
    });

    // Step 2: Check which dimension IDs are missing
    const currentDimensionIds = new Set(currentDimensions.map(d => d.id));
    const missingDimensionIds = Array.from(usedDimensionIds).filter(id => !currentDimensionIds.has(id));

    if (missingDimensionIds.length === 0) {
      // No missing dimensions, return data as-is
      console.log('[AUTO-FIX] No dimension ID mismatches found');
      return rawData;
    }

    console.log('[AUTO-FIX] Found missing dimension IDs:', missingDimensionIds.length);

    // Step 3: Create mapping from old IDs to new IDs
    const dimensionMapping = new Map<string, string>();

    // Try to map missing IDs to current dimensions by name
    if (missingDimensionIds.length > 0) {
      try {
        const { data: oldDimensions, error } = await supabase
          .from('dimensions')
          .select('id, name')
          .in('id', missingDimensionIds);

        if (error) {
          console.warn('[AUTO-FIX] Error fetching old dimensions:', error);
          // Continue without mapping - data will still load with original IDs
        } else if (oldDimensions) {
          oldDimensions.forEach(oldDim => {
            const currentDim = currentDimensions.find(d => 
              d.name.toLowerCase().trim() === oldDim.name.toLowerCase().trim()
            );
            if (currentDim) {
              dimensionMapping.set(oldDim.id, currentDim.id);
              console.log('[AUTO-FIX] Mapped dimension:', oldDim.name, oldDim.id, '->', currentDim.id);
            } else {
              console.warn('[AUTO-FIX] No matching dimension found for:', oldDim.name);
            }
          });
        }
      } catch (error) {
        console.warn('[AUTO-FIX] Could not load old dimensions for mapping:', error);
        // Continue without mapping - data will still load
      }
    }

    // Step 4: Apply mappings to the data (even if no mappings found)
    const fixedData = rawData.map(row => {
      if (!row.dimension_values) return row;

      const fixedDimensionValues: Record<string, any> = {};
      
      Object.entries(row.dimension_values).forEach(([oldId, value]) => {
        const newId = dimensionMapping.get(oldId) || oldId;
        fixedDimensionValues[newId] = value;
      });

      return {
        ...row,
        dimension_values: fixedDimensionValues
      };
    });

    if (dimensionMapping.size > 0) {
      console.log('[AUTO-FIX] Applied dimension mappings to', fixedData.length, 'rows');
    } else {
      console.log('[AUTO-FIX] No mappings applied, returning data as-is');
    }
    
    return fixedData;

  } catch (error) {
    console.error('[AUTO-FIX] Error in autoFixDimensionSync:', error);
    // Return original data if auto-fix fails completely
    console.log('[AUTO-FIX] Returning original data due to error');
    return rawData;
  }
}

/**
 * Enhanced data loading with automatic dimension sync fix
 */
export async function loadDataWithAutoFix(
  reportId: string,
  currentDimensions: Array<{ id: string; name: string; type: string }>,
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    dimensionFilters?: Record<string, string[]>;
  }
): Promise<any[]> {
  try {
    console.log('[AUTO-FIX] Loading data with automatic dimension sync fix');

    // Fetch raw data
    let query = supabase
      .from('dimension_data')
      .select('dimension_values, row_number, data_source_id')
      .eq('report_id', reportId)
      .order('row_number', { ascending: true });

    const { data: rawData, error } = await query;
    if (error) {
      console.error('[AUTO-FIX] Error fetching data:', error);
      throw error;
    }

    if (!rawData || rawData.length === 0) {
      console.log('[AUTO-FIX] No data found for report:', reportId);
      return [];
    }

    // Apply automatic dimension sync fix with error handling
    let fixedData: any[];
    try {
      fixedData = await autoFixDimensionSync(rawData, currentDimensions);
    } catch (autoFixError) {
      console.error('[AUTO-FIX] Auto-fix failed, using original data:', autoFixError);
      fixedData = rawData;
    }

    // Apply filters if provided
    let filteredData = fixedData;

    // Date filtering
    if (filters?.dateFrom || filters?.dateTo) {
      const dateDimension = currentDimensions.find(d => d.type === 'date');
      if (dateDimension) {
        try {
          const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
          const toDate = filters.dateTo ? new Date(filters.dateTo) : null;
          const adjustedToDate = toDate
            ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
            : null;

          filteredData = filteredData.filter(row => {
            const dv = row.dimension_values || {};
            const val = dv[dateDimension.id];
            if (!val) return true;
            
            try {
              const rowDate = new Date(String(val));
              if (isNaN(rowDate.getTime())) return true; // Invalid date, keep row
              if (fromDate && rowDate < fromDate) return false;
              if (adjustedToDate && rowDate >= adjustedToDate) return false;
              return true;
            } catch (dateError) {
              console.warn('[AUTO-FIX] Error parsing date:', val, dateError);
              return true; // Keep row if date parsing fails
            }
          });
        } catch (dateFilterError) {
          console.warn('[AUTO-FIX] Error applying date filter:', dateFilterError);
          // Continue with unfiltered data
        }
      }
    }

    // Dimension filtering
    if (filters?.dimensionFilters && Object.keys(filters.dimensionFilters).length > 0) {
      try {
        filteredData = filteredData.filter(row => {
          const dv = row.dimension_values || {};
          for (const [dimId, values] of Object.entries(filters.dimensionFilters)) {
            if (!values || values.length === 0) continue;
            const rowVal = dv[dimId];
            if (rowVal === undefined || rowVal === null) return false;
            const rowStr = String(rowVal).trim().toLowerCase();
            const filterValuesLower = values.map(v => String(v).trim().toLowerCase());
            if (!filterValuesLower.some(v => v === rowStr)) return false;
          }
          return true;
        });
      } catch (dimensionFilterError) {
        console.warn('[AUTO-FIX] Error applying dimension filters:', dimensionFilterError);
        // Continue with unfiltered data
      }
    }

    console.log('[AUTO-FIX] Loaded and processed', filteredData.length, 'rows');
    return filteredData;

  } catch (error) {
    console.error('[AUTO-FIX] Error loading data:', error);
    throw error;
  }
}