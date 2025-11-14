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
