import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface VlookupMapping {
  sourceValue: string;
  sourceDimensionId: string;
  targetDimensionId: string;
  targetValue: string;
}

export function useVlookupMappings(reportId?: string, accountId?: string) {
  return useQuery({
    queryKey: ['vlookup-mappings', reportId, accountId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('dimension_mappings')
        .select('*')
        .eq('user_id', user.id);

      if (reportId) {
        query = query.eq('report_id', reportId);
      } else if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data || []) as any).map((m: any) => ({
        sourceValue: m.source_value,
        sourceDimensionId: m.source_dimension_id,
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