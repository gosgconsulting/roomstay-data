// @ts-ignore - Deno resolves remote module imports at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

/**
 * Calculate API date ranges:
 * - Current: First day of last month to today
 * - Comparison: Same date range shifted back 1 year
 */
function calculateApiDateRanges() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  const currentDate = now.getDate();

  // Calculate first day of last month
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  
  // Current period: First day of last month to today
  const currentFrom = new Date(lastMonthYear, lastMonth, 1);
  const currentTo = new Date(currentYear, currentMonth, currentDate);

  // Comparison period: Same date range shifted back 1 year
  const comparisonFrom = new Date(lastMonthYear - 1, lastMonth, 1);
  const comparisonTo = new Date(currentYear - 1, currentMonth, currentDate);

  // Format as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    current: {
      date_from: formatDate(currentFrom),
      date_to: formatDate(currentTo),
    },
    comparison: {
      date_from: formatDate(comparisonFrom),
      date_to: formatDate(comparisonTo),
    },
  };
}

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
    const body = await req.json();
    const { reportId } = body || {};

    if (!reportId) {
      return new Response(
        JSON.stringify({ error: 'reportId is required' }),
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

    console.log(`[SYNC-REPORT-API-DATA] Starting sync for report: ${reportId}`);

    // Calculate date ranges
    const dateRanges = calculateApiDateRanges();
    console.log(`[SYNC-REPORT-API-DATA] Date ranges:`, dateRanges);

    // Get date dimension for this report
    const { data: dateDimensions, error: dimError } = await supabase
      .from('dimensions')
      .select('id, name')
      .eq('report_id', reportId)
      .eq('type', 'date')
      .limit(1);

    if (dimError) {
      console.error('[SYNC-REPORT-API-DATA] Error fetching date dimension:', dimError);
      throw dimError;
    }

    if (!dateDimensions || dateDimensions.length === 0) {
      console.log(`[SYNC-REPORT-API-DATA] No date dimension found for report: ${reportId}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No date dimension found for this report' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const dateDimensionId = dateDimensions[0].id;
    console.log(`[SYNC-REPORT-API-DATA] Using date dimension: ${dateDimensionId}`);

    // Function to fetch and filter data by date range
    const fetchDataForPeriod = async (dateFrom: string, dateTo: string) => {
      // Query dimension_data filtered by date range
      // Note: We need to filter JSONB date field
      // Make dateTo inclusive by adding one day
      const toDate = new Date(dateTo);
      const adjustedToDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
      const adjustedToDateStr = adjustedToDate.toISOString().split('T')[0];
      
      const { data: dimensionData, error: dataError } = await supabase
        .from('dimension_data')
        .select('dimension_values, row_number, data_source_id')
        .eq('report_id', reportId)
        .gte(`dimension_values->>${dateDimensionId}`, dateFrom)
        .lt(`dimension_values->>${dateDimensionId}`, adjustedToDateStr)
        .order('row_number', { ascending: true });

      if (dataError) {
        console.error(`[SYNC-REPORT-API-DATA] Error fetching data for ${dateFrom} to ${dateTo}:`, dataError);
        throw dataError;
      }

      return dimensionData || [];
    };

    // Fetch data for both periods
    const [currentData, comparisonData] = await Promise.all([
      fetchDataForPeriod(dateRanges.current.date_from, dateRanges.current.date_to),
      fetchDataForPeriod(dateRanges.comparison.date_from, dateRanges.comparison.date_to)
    ]);

    console.log(`[SYNC-REPORT-API-DATA] Fetched ${currentData.length} rows for current period, ${comparisonData.length} rows for comparison period`);

    // Delete existing API data for this report
    const { error: deleteError } = await supabase
      .from('report_api_data')
      .delete()
      .eq('report_id', reportId);

    if (deleteError) {
      console.error('[SYNC-REPORT-API-DATA] Error deleting existing API data:', deleteError);
      throw deleteError;
    }

    // Insert new API data
    const now = new Date().toISOString();
    const apiDataToInsert = [
      {
        report_id: reportId,
        period_type: 'current',
        date_from: dateRanges.current.date_from,
        date_to: dateRanges.current.date_to,
        data: currentData,
        created_at: now,
        updated_at: now
      },
      {
        report_id: reportId,
        period_type: 'comparison',
        date_from: dateRanges.comparison.date_from,
        date_to: dateRanges.comparison.date_to,
        data: comparisonData,
        created_at: now,
        updated_at: now
      }
    ];

    const { error: insertError } = await supabase
      .from('report_api_data')
      .insert(apiDataToInsert);

    if (insertError) {
      console.error('[SYNC-REPORT-API-DATA] Error inserting API data:', insertError);
      throw insertError;
    }

    console.log(`[SYNC-REPORT-API-DATA] Successfully synced API data for report: ${reportId}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        reportId,
        currentPeriodRows: currentData.length,
        comparisonPeriodRows: comparisonData.length,
        dateRanges
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[SYNC-REPORT-API-DATA] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
