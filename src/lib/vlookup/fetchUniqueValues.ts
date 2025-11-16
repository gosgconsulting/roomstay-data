import { supabase } from "@/integrations/supabase/client";

const EDGE_URL = "https://zcxxwpwheevwavdcgfht.supabase.co/functions/v1/get-unique-dimension-values";

type Params = {
  reportId?: string;
  reportIds?: string[];
  dimensionId: string;
  search?: string;
  limit?: number;
};

export async function fetchUniqueDimensionValues(params: Params): Promise<string[]> {
  const { reportId, reportIds, dimensionId, search, limit } = params;

  console.log('[fetchUniqueDimensionValues] Calling with params:', params);

  try {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reportId, reportIds, dimensionId, search, limit }),
    });

    console.log('[fetchUniqueDimensionValues] Response status:', res.status);

    if (!res.ok) {
      console.error('[fetchUniqueDimensionValues] Response not ok:', res.status, res.statusText);
      return [];
    }

    const json = await res.json().catch((e) => {
      console.error('[fetchUniqueDimensionValues] JSON parse error:', e);
      return { values: [] };
    });

    console.log('[fetchUniqueDimensionValues] Response data:', json);

    if (json && Array.isArray(json.values)) {
      return json.values as string[];
    }
    return [];
  } catch (error) {
    console.error('[fetchUniqueDimensionValues] Fetch error:', error);
    return [];
  }
}