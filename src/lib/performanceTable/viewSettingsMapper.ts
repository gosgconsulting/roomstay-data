import { supabase } from "@/integrations/supabase/client";

/**
 * Canonical view-settings mapping: visible_columns, visible_kpis, kpi_order.
 * Used by usePerformanceTableViews for mapping persisted
 * dimension IDs to the current account-scoped dimensions.
 */
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
          } else {
            console.warn(`[viewSettingsMapper] Could not find account-scoped dimension for "${oldDim.name}" (${oldDim.id})`);
          }
        });
      }
    } catch (error) {
      console.error('[viewSettingsMapper] Error mapping old dimension IDs:', error);
    }
  }
  
  return mapped;
}

/**
 * Map visible column IDs from old dimension IDs to account-scoped dimension IDs.
 * Preserves the original input order.
 */
export async function mapVisibleColumns(
  visibleColumnIds: string[],
  dimensions: Dimension[]
): Promise<string[]> {
  if (!visibleColumnIds || visibleColumnIds.length === 0) {
    return [];
  }

  const dimensionNameToIdMap = new Map<string, string>();
  dimensions.forEach(dim => {
    dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
  });

  // Build a resolution map: old ID → new ID (for stale IDs that need name-based lookup)
  const staleIdResolutionMap = new Map<string, string>();

  const idsToCheck = visibleColumnIds.filter(id => !dimensions.find(d => d.id === id));

  if (idsToCheck.length > 0) {
    try {
      const { data: oldDimensions } = await supabase
        .from("dimensions")
        .select("id, name")
        .in("id", idsToCheck);

      if (oldDimensions) {
        oldDimensions.forEach((oldDim) => {
          const newId = dimensionNameToIdMap.get(oldDim.name.toLowerCase());
          if (newId) {
            staleIdResolutionMap.set(oldDim.id, newId);
          } else {
            console.warn(`[viewSettingsMapper] Could not find account-scoped dimension for "${oldDim.name}" (${oldDim.id})`);
          }
        });
      }
    } catch (error) {
      console.error('[viewSettingsMapper] Error mapping old dimension IDs:', error);
    }
  }

  // Resolve each input ID in order, deduplicating the output
  const seen = new Set<string>();
  const result: string[] = [];

  for (const colDimId of visibleColumnIds) {
    let resolvedId: string | undefined;

    const directMatch = dimensions.find(d => d.id === colDimId);
    if (directMatch) {
      resolvedId = directMatch.id;
    } else {
      resolvedId = staleIdResolutionMap.get(colDimId);
    }

    if (resolvedId && !seen.has(resolvedId)) {
      seen.add(resolvedId);
      result.push(resolvedId);
    }
  }

  return result;
}

