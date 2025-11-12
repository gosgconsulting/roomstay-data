import { supabase } from "@/integrations/supabase/client";

export interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
}

/**
 * Map old dimension IDs to account-scoped dimension IDs
 */
export async function mapDimensionIds(
  dimIds: string[],
  dimensions: Dimension[]
): Promise<string[]> {
  if (!dimIds || dimIds.length === 0) return [];
  
  const mapped: string[] = [];
  const unmappedIds: string[] = [];
  
  // First, find dimensions that are already valid
  for (const dimId of dimIds) {
    const dimension = dimensions.find(d => d.id === dimId);
    if (dimension) {
      mapped.push(dimension.id);
    } else {
      unmappedIds.push(dimId);
    }
  }
  
  // If we have unmapped IDs, query them to get their names and map to account-scoped dimensions
  if (unmappedIds.length > 0) {
    try {
      const dimensionNameToIdMap = new Map<string, string>();
      dimensions.forEach(dim => {
        dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
      });
      
      const { data: oldDimensions } = await supabase
        .from("dimensions")
        .select("id, name")
        .in("id", unmappedIds);
      
      if (oldDimensions) {
        oldDimensions.forEach((oldDim) => {
          const normalizedName = oldDim.name.toLowerCase();
          const newDimensionId = dimensionNameToIdMap.get(normalizedName);
          
          if (newDimensionId) {
            mapped.push(newDimensionId);
            console.log(`[testing] Mapped dimension "${oldDim.name}": ${oldDim.id} -> ${newDimensionId}`);
          } else {
            console.warn(`[testing] Could not find account-scoped dimension for "${oldDim.name}" (${oldDim.id})`);
          }
        });
      }
    } catch (error) {
      console.error('[testing] Error mapping old dimension IDs:', error);
    }
  }
  
  return mapped;
}

/**
 * Map visible column IDs from old dimension IDs to account-scoped dimension IDs
 */
export async function mapVisibleColumns(
  visibleColumnIds: string[],
  dimensions: Dimension[]
): Promise<string[]> {
  if (!visibleColumnIds || visibleColumnIds.length === 0) {
    return [];
  }

  // Create a map of dimension name to account-scoped dimension ID
  const dimensionNameToIdMap = new Map<string, string>();
  dimensions.forEach(dim => {
    dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
  });
  
  // Validate and map visible_columns
  const mappedVisibleColumns: string[] = [];
  
  // First, collect all unmapped IDs to query them in one batch
  const idsToCheck = visibleColumnIds.filter((id: string) => 
    !dimensions.find(d => d.id === id)
  );
  
  // If we have unmapped IDs, query them to get their names and map to account-scoped dimensions
  if (idsToCheck.length > 0) {
    try {
      const { data: oldDimensions } = await supabase
        .from("dimensions")
        .select("id, name")
        .in("id", idsToCheck);
      
      if (oldDimensions) {
        oldDimensions.forEach((oldDim) => {
          const normalizedName = oldDim.name.toLowerCase();
          const newDimensionId = dimensionNameToIdMap.get(normalizedName);
          
          if (newDimensionId) {
            mappedVisibleColumns.push(newDimensionId);
            console.log(`[testing] Mapped visible column "${oldDim.name}": ${oldDim.id} -> ${newDimensionId}`);
          } else {
            console.warn(`[testing] Could not find account-scoped dimension for "${oldDim.name}" (${oldDim.id})`);
          }
        });
      }
    } catch (error) {
      console.error('[testing] Error mapping old dimension IDs:', error);
    }
  }
  
  // Add all valid dimension IDs (those that already exist in loaded dimensions)
  visibleColumnIds.forEach((colDimId: string) => {
    const dimension = dimensions.find(d => d.id === colDimId);
    if (dimension && !mappedVisibleColumns.includes(dimension.id)) {
      mappedVisibleColumns.push(dimension.id);
    }
  });
  
  return mappedVisibleColumns;
}

