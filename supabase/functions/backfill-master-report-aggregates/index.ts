import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Backfill Master Report Aggregates
 * 
 * This edge function can be called once to backfill aggregated data for all
 * existing reports that have master_report_configs.
 * 
 * It simply calls the aggregate-master-reports function without a reportId,
 * which will process all reports.
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

    console.log('[BACKFILL] Starting backfill of master report aggregates for all reports...');

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
      console.error('[BACKFILL] Error calling aggregate-master-reports:', errorText);
      throw new Error(`Failed to aggregate: ${aggregateResponse.status} ${errorText}`);
    }

    const aggregateResult = await aggregateResponse.json();

    if (aggregateResult.success) {
      console.log(`[BACKFILL] Successfully backfilled ${aggregateResult.aggregated} of ${aggregateResult.total} report(s)`);
      console.log(`[BACKFILL] Total rows: ${aggregateResult.totalDailyRows} daily, ${aggregateResult.totalMonthlyRows} monthly`);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Backfill completed successfully',
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
      console.error('[BACKFILL] Backfill failed:', aggregateResult.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: aggregateResult.error || 'Unknown error during backfill',
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('[BACKFILL] Fatal error:', error);
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
