// @ts-ignore - Deno resolves remote module imports at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// @ts-ignore - Deno global is available in Edge Functions runtime
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get cardId from query parameters
    const url = new URL(req.url);
    const cardId = url.searchParams.get('cardId');

    if (!cardId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'cardId query parameter is required',
          count: 0,
          data: []
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cardId)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid card ID format. Expected UUID.',
          count: 0,
          data: []
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    // @ts-ignore - Deno env is available in Edge Functions runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno env is available in Edge Functions runtime
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[GET-AI-SUMMARY-DATA] Fetching data for card: ${cardId}`);

    // Fetch AI Summary card with cached data
    const { data: card, error: cardError } = await supabase
      .from('ai_summary_cards')
      .select('id, report_ids, report_configs, selected_metrics, since_date, cached_pivot_data, pivot_data_refreshed_at')
      .eq('id', cardId)
      .maybeSingle();

    if (cardError) {
      console.error('[GET-AI-SUMMARY-DATA] Error fetching card:', cardError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: cardError.message,
          count: 0,
          data: []
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!card) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Card not found',
          count: 0,
          data: []
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reportIds = card.report_ids || [];
    const sinceDate = card.since_date;

    // Calculate toDate
    const now = new Date();
    const toDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // If cached_pivot_data exists, return it directly
    if (card.cached_pivot_data && Object.keys(card.cached_pivot_data).length > 0) {
      console.log(`[GET-AI-SUMMARY-DATA] Returning cached data for card ${cardId}`);
      
      const cachedData = card.cached_pivot_data as Record<string, unknown>;
      
      // Count total data rows
      let totalCount = 0;
      if (typeof cachedData === 'object') {
        const monthlyData = (cachedData.monthly_data || cachedData) as Record<string, unknown>;
        if (typeof monthlyData === 'object') {
          Object.values(monthlyData).forEach((reportData) => {
            if (typeof reportData === 'object' && reportData !== null) {
              Object.values(reportData as Record<string, unknown>).forEach((monthData) => {
                if (Array.isArray(monthData)) {
                  totalCount += monthData.length;
                } else if (typeof monthData === 'object' && monthData !== null && 'metrics' in monthData) {
                  totalCount += 1;
                }
              });
            }
          });
        }
      }

      // Build reports metadata
      const actualDataRanges = (cachedData.actual_data_ranges || {}) as Record<string, { reportName?: string }>;
      const reportMetadata = reportIds.map((reportId: string) => ({
        report_id: reportId,
        report_name: actualDataRanges[reportId]?.reportName || 'Unknown',
        count: 0
      }));

      return new Response(
        JSON.stringify({
          success: true,
          count: totalCount,
          since: sinceDate,
          to: toDate,
          cached: true,
          cached_at: card.pivot_data_refreshed_at,
          data: cachedData,
          reports: reportMetadata,
          dimensions: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No cached data - return empty with message
    console.log(`[GET-AI-SUMMARY-DATA] No cached data for card ${cardId}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        count: 0,
        since: sinceDate,
        to: toDate,
        cached: false,
        message: 'No cached data available. Please refresh the data in the UI.',
        data: {},
        reports: reportIds.map((id: string) => ({ report_id: id, count: 0 })),
        dimensions: []
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GET-AI-SUMMARY-DATA] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        count: 0,
        data: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
