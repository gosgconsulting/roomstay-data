import { supabase } from "@/integrations/supabase/client";
import { saveDimensionSettings } from "./reportViewUtils";

/**
 * Saves dimension settings for a report
 */
export async function saveDimensionsForReport(
  reportId: string,
  dimensions: string[]
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    console.log('[DIMENSION-OPERATIONS] Saving dimensions for report:', reportId, dimensions);
    await saveDimensionSettings(reportId, user.id, dimensions);
    console.log('[DIMENSION-OPERATIONS] Successfully saved dimensions');
  } catch (error) {
    console.error('[DIMENSION-OPERATIONS] Error saving dimensions for report:', error);
    throw error instanceof Error ? error : new Error(`Failed to save dimensions: ${String(error)}`);
  }
}

/**
 * Removes a dimension from the selected list
 */
export function removeDimensionFromList(
  dimensionId: string,
  selectedDimensions: string[]
): string[] {
  return selectedDimensions.filter((d) => d !== dimensionId);
}

/**
 * Adds a dimension to the selected list
 */
export function addDimensionToList(
  dimensionId: string,
  selectedDimensions: string[]
): string[] {
  if (dimensionId && !selectedDimensions.includes(dimensionId)) {
    return [...selectedDimensions, dimensionId];
  }
  return selectedDimensions;
}

/**
 * Filters out date dimensions from the selected list
 */
export function filterOutDateDimensions(
  selectedDimensions: string[],
  dateDimensionIds: string[]
): string[] {
  return selectedDimensions.filter(id => !dateDimensionIds.includes(id));
}