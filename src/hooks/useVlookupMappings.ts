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
    queryFn: async (): Promise<VlookupMapping[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Load cluster_dimensions for this user and scope (report or account)
      let cdQuery = supabase
        .from('cluster_dimensions')
        .select('id, source_dimension_id, created_dimension_id, cluster_dimension_name, report_id, account_id, user_id')
        .eq('user_id', user.id);

      if (reportId) {
        cdQuery = cdQuery.eq('report_id', reportId);
      }
      if (accountId) {
        cdQuery = cdQuery.eq('account_id', accountId);
      }

      const { data: cds, error: cdError } = await cdQuery;
      if (cdError || !cds || cds.length === 0) return [];

      const clusterIds = cds.map(c => c.id);
      const { data: cms, error: cmError } = await supabase
        .from('cluster_mappings')
        .select('id, cluster_dimension_id, source_values, cluster_name')
        .in('cluster_dimension_id', clusterIds);

      if (cmError || !cms) return [];

      // Build mapping entries, one per source value, preserving API shape
      const mappings: VlookupMapping[] = [];
      const cdById = new Map(cds.map(c => [c.id, c]));

      for (const cm of cms) {
        const cd = cdById.get(cm.cluster_dimension_id);
        if (!cd) continue;
        const targetDimensionId = cd.created_dimension_id; // require created target dimension
        const sourceDimensionId = cd.source_dimension_id;
        if (!targetDimensionId || !sourceDimensionId) continue;

        const tgtValue = cm.cluster_name?.trim();
        const srcValues: string[] = Array.isArray(cm.source_values) ? cm.source_values : [];
        if (!tgtValue || srcValues.length === 0) continue;

        for (const sv of srcValues) {
          const s = String(sv).trim();
          if (s.length === 0) continue;
          mappings.push({
            sourceValue: s,
            sourceDimensionId,
            targetDimensionId,
            targetValue: tgtValue,
          });
        }
      }

      return mappings;
    },
    enabled: !!reportId || !!accountId,
  });
}

/**
 * Apply vlookup mappings to dimension values (kept for compatibility)
 */
export function applyVlookupMappings(
  dimensionValues: Record<string, any>,
  mappings: VlookupMapping[],
  dimensionId: string
): Record<string, any> {
  const result = { ...dimensionValues };
  const relevant = mappings.filter(m => m.targetDimensionId === dimensionId);
  if (relevant.length === 0) return result;

  for (const [key, value] of Object.entries(dimensionValues)) {
    const match = relevant.find(m => m.sourceValue.toLowerCase() === String(value).toLowerCase());
    if (match) {
      result[key] = match.targetValue;
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