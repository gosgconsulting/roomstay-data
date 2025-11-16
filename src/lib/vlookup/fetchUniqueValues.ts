import { supabase } from "@/integrations/supabase/client";

type Params = {
  reportId?: string;
  reportIds?: string[];
  dimensionId: string;
  dimensionName?: string;
  limit?: number;
};

export async function fetchUniqueDimensionValues(params: Params): Promise<string[]> {
  const { reportId, reportIds, dimensionId, dimensionName, limit } = params;

  console.log('[fetchUniqueDimensionValues] Calling with params:', params);

  try {
    // Use supabase.functions.invoke instead of fetch to automatically include auth headers
    const { data, error } = await supabase.functions.invoke('get-unique-dimension-values', {
      body: { reportId, reportIds, dimensionId, dimensionName, limit },
    });

    if (error) {
      console.error('[fetchUniqueDimensionValues] Error:', error);
      return [];
    }

    console.log('[fetchUniqueDimensionValues] Response data:', data);

    if (data && Array.isArray(data.values)) {
      return data.values as string[];
    }
    return [];
  } catch (error) {
    console.error('[fetchUniqueDimensionValues] Fetch error:', error);
    return [];
  }
}