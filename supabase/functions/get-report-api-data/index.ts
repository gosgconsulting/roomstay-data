// @ts-ignore - Deno resolves remote module imports at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

// @ts-ignore - Deno global is available in Edge Functions runtime
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    // Get reportId from query parameters
    const url = new URL(req.url);
    const reportId = url.searchParams.get('reportId');

    if (!reportId) {
      return new Response(
        JSON.stringify({ error: 'reportId query parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    // @ts-ignore - Deno env is available in Edge Functions runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno env is available in Edge Functions runtime
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[GET-REPORT-API-DATA] Fetching API data for report: ${reportId}`);

    // Fetch both current and comparison period data
    const { data: apiData, error: fetchError } = await supabase
      .from('report_api_data')
      .select('period_type, date_from, date_to, data')
      .eq('report_id', reportId)
      .in('period_type', ['current', 'comparison']);

    if (fetchError) {
      console.error('[GET-REPORT-API-DATA] Error fetching API data:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch API data', details: fetchError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!apiData || apiData.length === 0) {
      console.log(`[GET-REPORT-API-DATA] No API data found for report: ${reportId}`);
      return new Response(
        JSON.stringify({ 
          error: 'No API data found for this report. Data may not have been synced yet.',
          current_period: null,
          comparison_period: null
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Separate current and comparison data
    const currentPeriodData = apiData.find(d => d.period_type === 'current');
    const comparisonPeriodData = apiData.find(d => d.period_type === 'comparison');

    const response = {
      current_period: currentPeriodData ? {
        date_from: currentPeriodData.date_from,
        date_to: currentPeriodData.date_to,
        data: currentPeriodData.data
      } : null,
      comparison_period: comparisonPeriodData ? {
        date_from: comparisonPeriodData.date_from,
        date_to: comparisonPeriodData.date_to,
        data: comparisonPeriodData.data
      } : null
    };

    console.log(`[GET-REPORT-API-DATA] Returning data for report: ${reportId}`);
    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[GET-REPORT-API-DATA] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
