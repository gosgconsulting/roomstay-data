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
  search?: string;
  limit?: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { reportId, reportIds, dimensionId, search, limit = 5000 } = body || {};

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

    // Fetch only the JSONB field we need; apply where report_id in (...) server-side
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

    const set = new Set<string>();
    for (const row of data || []) {
      const dv = (row as any).dimension_values || {};
      const val = dv[dimensionId];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        set.add(String(val));
      }
    }

    let values = Array.from(set);

    if (search && search.trim() !== '') {
      const needle = search.trim().toLowerCase();
      values = values.filter(v => String(v).toLowerCase().includes(needle));
    }

    // Sort alphabetically for a nice UX and limit
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