// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

type RequestBody = {
  reportId?: string;
  reportIds?: string[];
  dimensionId: string;
  dimensionName?: string;
  limit?: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { reportId, reportIds, dimensionId, dimensionName: nameInput, limit = 5000 } = body || {};

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
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
        .ilike('name', dimName); // case-insensitive match

      (sameNameDims || []).forEach((d: any) => {
        if (d?.id) candidateIds.add(String(d.id));
      });
    }

    // Fetch dimension_data rows for the report(s)
    let query = supabase.from('dimension_data').select('dimension_values, report_id').limit(50000);
    if (reportId) {
      query = query.eq('report_id', reportId);
    } else if (reportIds && reportIds.length > 0) {
      query = query.in('report_id', reportIds);
    }

    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message, values: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect unique values from any candidate dimension id key present in dimension_values
    const set = new Set<string>();
    const ids = Array.from(candidateIds);

    for (const row of data || []) {
      const dv = (row as any).dimension_values || {};
      for (const id of ids) {
        const val = dv?.[id];
        if (val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str !== '') set.add(str);
        }
      }
    }

    let values = Array.from(set);
    // Sort alphabetically and apply limit
    values.sort((a, b) => String(a).localeCompare(String(b)));
    if (typeof limit === 'number' && limit > 0) {
      values = values.slice(0, limit);
    }

    return new Response(JSON.stringify({ values }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message, values: [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});