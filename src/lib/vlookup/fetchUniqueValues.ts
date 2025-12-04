/**
 * Fetch unique dimension values from the database (fast)
 * 
 * This function calls the edge function which queries the already-synced
 * dimension_data table, which is much faster than fetching from source.
 */

import { supabase } from "@/integrations/supabase/client";

type Params = {
  reportId?: string;
  reportIds?: string[];
  dimensionId: string;
  dimensionName?: string;
  limit?: number;
};

/**
 * Fetch unique dimension values from the database via edge function
 */
export async function fetchUniqueDimensionValues(params: Params): Promise<string[]> {
  const { reportId, reportIds, dimensionId, dimensionName, limit = 5000 } = params;

  console.log('[fetchUniqueDimensionValues] Fetching values from database:', { dimensionId, dimensionName, reportId });

  try {
    // Use the edge function which queries dimension_data table (much faster)
    const { data, error } = await supabase.functions.invoke('get-unique-dimension-values', {
      body: {
        reportId,
        reportIds,
        dimensionId,
        dimensionName,
        limit,
      },
    });

    if (error) {
      console.error('[fetchUniqueDimensionValues] Edge function error:', error);
      return [];
    }

    if (data?.error) {
      console.warn('[fetchUniqueDimensionValues] Edge function returned error:', data.error);
      return data.values || [];
    }

    const values = data?.values || [];
    console.log(`[fetchUniqueDimensionValues] Found ${values.length} unique values`);
    return values;
  } catch (error) {
    console.error('[fetchUniqueDimensionValues] Error:', error);
    return [];
  }
}
