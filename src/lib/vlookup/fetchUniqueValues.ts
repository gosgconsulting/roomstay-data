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

  const res = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reportId, reportIds, dimensionId, search, limit }),
  });

  const json = await res.json().catch(() => ({ values: [] }));
  if (json && Array.isArray(json.values)) {
    return json.values as string[];
  }
  return [];
}