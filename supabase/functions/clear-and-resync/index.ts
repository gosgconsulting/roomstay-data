// @ts-ignore - Deno resolves remote module imports at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

// @ts-ignore - Deno global is provided by the Edge Functions runtime
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { accountId, reportId } = body || {};

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'accountId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[CLEAR-AND-RESYNC] Starting clear operation for accountId:', accountId);

    // Get all reports for this account
    let reportsQuery = supabase
      .from('reports')
      .select('id, name')
      .eq('account_id', accountId);
    
    if (reportId) {
      reportsQuery = reportsQuery.eq('id', reportId);
    }

    const { data: reports, error: reportsError } = await reportsQuery;

    if (reportsError) {
      console.error('[CLEAR-AND-RESYNC] Error fetching reports:', reportsError);
      throw reportsError;
    }

    if (!reports || reports.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No reports found for this account', cleared: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[CLEAR-AND-RESYNC] Found reports:', reports.map(r => r.name));

    const reportIds = reports.map(r => r.id);
    const results: any[] = [];

    // Clear dimension_data for each report
    for (const report of reports) {
      console.log(`[CLEAR-AND-RESYNC] Clearing dimension_data for report: ${report.name} (${report.id})`);
      
      const { error: deleteError, count } = await supabase
        .from('dimension_data')
        .delete()
        .eq('report_id', report.id);

      if (deleteError) {
        console.error(`[CLEAR-AND-RESYNC] Error clearing dimension_data for ${report.name}:`, deleteError);
        results.push({
          reportId: report.id,
          reportName: report.name,
          status: 'error',
          error: deleteError.message
        });
      } else {
        console.log(`[CLEAR-AND-RESYNC] Cleared dimension_data for ${report.name}`);
        results.push({
          reportId: report.id,
          reportName: report.name,
          status: 'cleared',
          rowsDeleted: count || 'unknown'
        });
      }
    }

    // Also clear sheet_data for data sources linked to these reports
    console.log('[CLEAR-AND-RESYNC] Clearing sheet_data for related data sources...');
    
    const { data: dataSources } = await supabase
      .from('data_sources')
      .select('id, name')
      .in('report_id', reportIds);

    if (dataSources && dataSources.length > 0) {
      for (const ds of dataSources) {
        const { error: sheetDeleteError } = await supabase
          .from('sheet_data')
          .delete()
          .eq('data_source_id', ds.id);

        if (sheetDeleteError) {
          console.error(`[CLEAR-AND-RESYNC] Error clearing sheet_data for ${ds.name}:`, sheetDeleteError);
        } else {
          console.log(`[CLEAR-AND-RESYNC] Cleared sheet_data for data source: ${ds.name}`);
        }
      }
    }

    // Also clear monthly_dimension_data
    console.log('[CLEAR-AND-RESYNC] Clearing monthly_dimension_data...');
    const { error: monthlyDeleteError } = await supabase
      .from('monthly_dimension_data')
      .delete()
      .in('report_id', reportIds);

    if (monthlyDeleteError) {
      console.error('[CLEAR-AND-RESYNC] Error clearing monthly_dimension_data:', monthlyDeleteError);
    } else {
      console.log('[CLEAR-AND-RESYNC] Cleared monthly_dimension_data');
    }

    // Clear slide report data if slideReportId provided (or find it from account)
    const slideReportId = body.slideReportId;
    if (slideReportId) {
      console.log('[CLEAR-AND-RESYNC] Clearing slide report data for:', slideReportId);

      const slideReportTables = [
        'slide_report_monthly_data',
        'slide_report_channel_month_data',
        'slide_report_channel_year_data',
        'slide_report_channel_raw_rows',
      ];

      for (const table of slideReportTables) {
        const { error: srError, count: srCount } = await supabase
          .from(table)
          .delete()
          .eq('slide_report_id', slideReportId);

        if (srError) {
          console.error(`[CLEAR-AND-RESYNC] Error clearing ${table}:`, srError);
        } else {
          console.log(`[CLEAR-AND-RESYNC] Cleared ${table}, count: ${srCount}`);
        }
      }
    }

    console.log('[CLEAR-AND-RESYNC] Clear operation completed');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Data cleared successfully',
        results,
        clearedReports: reports.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[CLEAR-AND-RESYNC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
