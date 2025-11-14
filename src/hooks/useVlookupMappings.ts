import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface VlookupMapping {
  sourceValue: string;
  targetDimensionId: string;
  targetValue: string;
}

export function useVlookupMappings(reportId?: string, accountId?: string) {
  return useQuery({
    queryKey: ['vlookup-mappings', reportId, accountId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const query = supabase
        .from('dimension_mappings' as any)
        .select('*')
        .eq('user_id', user.id);

      if (reportId) {
        query.eq('report_id', reportId);
      } else if (accountId) {
        query.eq('account_id', accountId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data || []) as any).map((m: any) => ({
        sourceValue: m.source_value,
        targetDimensionId: m.target_dimension_id,
        targetValue: m.target_value,
      })) as VlookupMapping[];
    },
    enabled: !!reportId || !!accountId,
  });
}

/**
 * Apply vlookup mappings to dimension values
 */
export function applyVlookupMappings(
  dimensionValues: Record<string, any>,
  mappings: VlookupMapping[],
  dimensionId: string
): Record<string, any> {
  const result = { ...dimensionValues };
  
  // Find mappings that target this dimension
  const relevantMappings = mappings.filter(m => m.targetDimensionId === dimensionId);
  
  if (relevantMappings.length === 0) {
    return result;
  }

  // Apply mappings
  for (const [key, value] of Object.entries(dimensionValues)) {
    const mapping = relevantMappings.find(m => 
      m.sourceValue.toLowerCase() === String(value).toLowerCase()
    );
    
    if (mapping) {
      result[key] = mapping.targetValue;
    }
  }
  
  return result;
}

/**
 * Get the mapped value for a source value, or return the source if no mapping exists
 */
export function getMappedValue(
  sourceValue: string,
  mappings: VlookupMapping[],
  dimensionId: string
): string {
  const mapping = mappings.find(
    m => m.targetDimensionId === dimensionId && 
         m.sourceValue.toLowerCase() === sourceValue.toLowerCase()
  );
  return mapping ? mapping.targetValue : sourceValue;
}

/**
 * Get all source values that map to a specific target value
 */
export function getSourceValues(
  targetValue: string,
  mappings: VlookupMapping[],
  dimensionId: string
): string[] {
  return mappings
    .filter(
      m => m.targetDimensionId === dimensionId && 
           m.targetValue.toLowerCase() === targetValue.toLowerCase()
    )
    .map(m => m.sourceValue);
}

/**
 * Get all values (both the selected value and any source values that map to it)
 * This is used for filtering - when a user selects "Brady", we want to match
 * both "Brady" and all hotels that map to "Brady"
 */
export function getAllValuesForFilter(
  selectedValue: string,
  mappings: VlookupMapping[],
  dimensionId: string
): string[] {
  const sourceValues = getSourceValues(selectedValue, mappings, dimensionId);
  
  // If there are source values, this is a mapped value - return all sources + the mapped value
  if (sourceValues.length > 0) {
    return [selectedValue, ...sourceValues];
  }
  
  // Otherwise, return just the value itself (it might be an unmapped original value)
  return [selectedValue];
}
