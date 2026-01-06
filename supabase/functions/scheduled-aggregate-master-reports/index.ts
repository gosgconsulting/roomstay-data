import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Scheduled Aggregation Job for Master Reports
 * 
 * This edge function runs daily (via cron or scheduled trigger) to re-aggregate
 * all master reports, ensuring data consistency and freshness.
 * 
 * It calls the aggregate-master-reports function for all reports with
 * master_report_configs, ensuring aggregated tables are up-to-date.
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required environment variables' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[SCHEDULED-AGGREGATE] Starting scheduled aggregation for all master reports...');

    // Call the aggregate-master-reports function without reportId to process all reports
    const aggregateResponse = await fetch(`${supabaseUrl}/functions/v1/aggregate-master-reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({}), // Empty body = process all reports
    });

    if (!aggregateResponse.ok) {
      const errorText = await aggregateResponse.text();
      console.error('[SCHEDULED-AGGREGATE] Error calling aggregate-master-reports:', errorText);
      throw new Error(`Failed to aggregate: ${aggregateResponse.status} ${errorText}`);
    }

    const aggregateResult = await aggregateResponse.json();

    if (aggregateResult.success) {
      console.log(`[SCHEDULED-AGGREGATE] Successfully aggregated ${aggregateResult.aggregated} of ${aggregateResult.total} report(s)`);
      console.log(`[SCHEDULED-AGGREGATE] Total rows: ${aggregateResult.totalDailyRows} daily, ${aggregateResult.totalMonthlyRows} monthly`);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Scheduled aggregation completed',
          aggregated: aggregateResult.aggregated,
          total: aggregateResult.total,
          totalDailyRows: aggregateResult.totalDailyRows,
          totalMonthlyRows: aggregateResult.totalMonthlyRows,
          results: aggregateResult.results,
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } else {
      console.error('[SCHEDULED-AGGREGATE] Aggregation failed:', aggregateResult.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: aggregateResult.error || 'Unknown error during aggregation',
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('[SCHEDULED-AGGREGATE] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
