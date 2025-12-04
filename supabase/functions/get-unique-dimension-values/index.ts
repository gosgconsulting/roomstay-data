// @ts-ignore - Deno resolves remote module imports at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type RequestBody = {
  reportId?: string;
  reportIds?: string[];
  dimensionId: string;
  dimensionName?: string;
  limit?: number;
};

// @ts-ignore - Deno global is provided by the Edge Functions runtime
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { reportId, reportIds, dimensionId, dimensionName: nameInput, limit = 1000 } = body || {};

    console.log('[get-unique-dimension-values] Request:', { reportId, dimensionId, dimensionName: nameInput, limit });

    if (!dimensionId) {
      return new Response(JSON.stringify({ error: 'dimensionId is required', values: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!reportId && (!reportIds || reportIds.length === 0)) {
      return new Response(JSON.stringify({ error: 'reportId or reportIds is required', values: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build candidate dimension IDs from the selected dimension and any same-name dimensions
    const candidateIds = new Set<string>();
    candidateIds.add(dimensionId);

    // Get the dimension name from input or by looking up the selected dimension id
    let dimName = nameInput?.trim();
    if (!dimName) {
      const { data: dimRow } = await supabase
        .from('dimensions')
        .select('name')
        .eq('id', dimensionId)
        .limit(1)
        .maybeSingle();

      if (dimRow?.name) {
        dimName = String(dimRow.name);
      }
    }

    // If we have a name, fetch all dimensions with that same name and add their IDs as candidates
    if (dimName) {
      const { data: sameNameDims } = await supabase
        .from('dimensions')
        .select('id, name')
        .ilike('name', dimName);

      (sameNameDims || []).forEach((d: any) => {
        if (d?.id) candidateIds.add(String(d.id));
      });
    }

    console.log('[get-unique-dimension-values] Candidate dimension IDs:', Array.from(candidateIds));

    // Build report filter
    const targetReportIds = reportId ? [reportId] : (reportIds || []);
    const ids = Array.from(candidateIds);
    
    // Use a more efficient approach: fetch a sample of rows with LIMIT
    // and extract unique values from those rows
    const set = new Set<string>();
    const maxRows = 50000; // Limit total rows to process

    // Fetch dimension_data with a reasonable limit
    let query = supabase
      .from('dimension_data')
      .select('dimension_values')
      .in('report_id', targetReportIds)
      .limit(maxRows);

    const { data, error } = await query;
    
    if (error) {
      console.error('[get-unique-dimension-values] Query error:', error);
      return new Response(JSON.stringify({ error: error.message, values: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[get-unique-dimension-values] Fetched ${data?.length || 0} rows to extract unique values`);

    // Extract unique values from the fetched rows
    if (data) {
      for (const row of data) {
        const dv = (row as any).dimension_values || {};
        for (const id of ids) {
          const val = dv?.[id];
          if (val !== undefined && val !== null) {
            const str = String(val).trim();
            if (str !== '') {
              set.add(str);
              // Early exit if we have enough values
              if (set.size >= limit) break;
            }
          }
        }
        if (set.size >= limit) break;
      }
    }

    let values = Array.from(set);
    // Sort alphabetically and apply limit
    values.sort((a, b) => String(a).localeCompare(String(b)));
    if (typeof limit === 'number' && limit > 0) {
      values = values.slice(0, limit);
    }

    console.log(`[get-unique-dimension-values] Returning ${values.length} unique values`);

    return new Response(JSON.stringify({ values }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[get-unique-dimension-values] Error:', message);
    return new Response(JSON.stringify({ error: message, values: [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
