import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MasterReportConfig {
  id: string;
  user_id: string;
  account_id: string | null;
  report_id: string;
  group_by_dimension_id: string;
  group_by_dimension_name: string;
  selected_values: string[];
  selected_metrics: string[];
}

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface AggregatedRow {
  report_id: string;
  account_id: string | null;
  group_by_dimension_id: string;
  group_by_value: string;
  date?: string;
  year_month?: string;
  cost: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  bookings: number | null;
  cpc: number;
  ctr: number;
  conversion_rate: number;
  roas: number;
  cost_of_sale: number | null;
}

/**
 * Extract date from dimension_values JSONB
 * Supports common date dimension names and formats
 */
function extractDate(dimensionValues: any, dateDimensionId: string): Date | null {
  if (!dimensionValues || !dateDimensionId) return null;
  
  const dateValue = dimensionValues[dateDimensionId];
  if (!dateValue) return null;
  
  // Handle string dates (YYYY-MM-DD format)
  if (typeof dateValue === 'string') {
    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  // Handle Date objects (shouldn't happen in JSONB but just in case)
  if (dateValue instanceof Date) {
    return dateValue;
  }
  
  return null;
}

/**
 * Calculate derived metrics from base metrics
 */
function calculateMetrics(base: {
  cost: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  bookings: number | null;
}): {
  cpc: number;
  ctr: number;
  conversion_rate: number;
  roas: number;
  cost_of_sale: number | null;
} {
  const cpc = base.clicks > 0 ? base.cost / base.clicks : 0;
  const ctr = base.impressions > 0 ? (base.clicks / base.impressions) * 100 : 0;
  const conversion_rate = base.clicks > 0 ? (base.conversions / base.clicks) * 100 : 0;
  const roas = base.cost > 0 ? base.revenue / base.cost : 0;
  const cost_of_sale = base.conversions > 0 ? base.cost / base.conversions : null;
  
  return { cpc, ctr, conversion_rate, roas, cost_of_sale };
}

/**
 * Aggregate data for a single report
 */
async function aggregateReport(
  supabase: any,
  config: MasterReportConfig,
  dateDimensionId: string | null
): Promise<{ dailyRows: number; monthlyRows: number; error?: string }> {
  try {
    // Fetch all dimension_data for this report
    const { data: dimensionData, error: dataError } = await supabase
      .from('dimension_data')
      .select('dimension_values, report_id')
      .eq('report_id', config.report_id);
    
    if (dataError) {
      console.error(`[AGGREGATE] Error fetching dimension_data for report ${config.report_id}:`, dataError);
      return { dailyRows: 0, monthlyRows: 0, error: dataError.message };
    }
    
    if (!dimensionData || dimensionData.length === 0) {
      console.log(`[AGGREGATE] No dimension_data found for report ${config.report_id}`);
      return { dailyRows: 0, monthlyRows: 0 };
    }
    
    // Get account_id from report
    const { data: reportData } = await supabase
      .from('reports')
      .select('account_id')
      .eq('id', config.report_id)
      .maybeSingle();
    
    const accountId = reportData?.account_id || null;
    
    // Group data by group_by_value and date
    const dailyGroups: Record<string, Record<string, {
      cost: number;
      revenue: number;
      clicks: number;
      impressions: number;
      conversions: number;
      bookings: number;
    }>> = {};
    
    const monthlyGroups: Record<string, Record<string, {
      cost: number;
      revenue: number;
      clicks: number;
      impressions: number;
      conversions: number;
      bookings: number;
    }>> = {};
    
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    for (const row of dimensionData) {
      const dv = row.dimension_values || {};
      
      // Get group_by_value
      const groupByValue = dv[config.group_by_dimension_id];
      if (!groupByValue) continue;
      
      // Filter by selected_values if specified
      if (config.selected_values && config.selected_values.length > 0) {
        if (!config.selected_values.includes(String(groupByValue))) {
          continue;
        }
      }
      
      // Extract date
      if (!dateDimensionId) continue;
      const date = extractDate(dv, dateDimensionId);
      if (!date) continue;
      
      // Skip if date is too old for daily (beyond 90 days)
      const isWithin90Days = date >= ninetyDaysAgo;
      const isWithin2Years = date >= twoYearsAgo;
      
      // Extract metric values (case-insensitive matching)
      const cost = parseFloat(dv.Cost || dv.cost || '0') || 0;
      const revenue = parseFloat(dv.Revenue || dv.revenue || '0') || 0;
      const clicks = parseFloat(dv.Clicks || dv.clicks || '0') || 0;
      const impressions = parseFloat(dv.Impressions || dv.impressions || '0') || 0;
      const conversions = parseFloat(dv.Conversions || dv.conversions || '0') || 0;
      const bookings = parseFloat(dv.Bookings || dv.bookings || '0') || 0;
      
      // Daily aggregation (last 90 days)
      if (isWithin90Days) {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const groupKey = String(groupByValue);
        
        if (!dailyGroups[dateStr]) {
          dailyGroups[dateStr] = {};
        }
        if (!dailyGroups[dateStr][groupKey]) {
          dailyGroups[dateStr][groupKey] = {
            cost: 0,
            revenue: 0,
            clicks: 0,
            impressions: 0,
            conversions: 0,
            bookings: 0,
          };
        }
        
        dailyGroups[dateStr][groupKey].cost += cost;
        dailyGroups[dateStr][groupKey].revenue += revenue;
        dailyGroups[dateStr][groupKey].clicks += clicks;
        dailyGroups[dateStr][groupKey].impressions += impressions;
        dailyGroups[dateStr][groupKey].conversions += conversions;
        dailyGroups[dateStr][groupKey].bookings += bookings;
      }
      
      // Monthly aggregation (last 2 years)
      if (isWithin2Years) {
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const groupKey = String(groupByValue);
        
        if (!monthlyGroups[yearMonth]) {
          monthlyGroups[yearMonth] = {};
        }
        if (!monthlyGroups[yearMonth][groupKey]) {
          monthlyGroups[yearMonth][groupKey] = {
            cost: 0,
            revenue: 0,
            clicks: 0,
            impressions: 0,
            conversions: 0,
            bookings: 0,
          };
        }
        
        monthlyGroups[yearMonth][groupKey].cost += cost;
        monthlyGroups[yearMonth][groupKey].revenue += revenue;
        monthlyGroups[yearMonth][groupKey].clicks += clicks;
        monthlyGroups[yearMonth][groupKey].impressions += impressions;
        monthlyGroups[yearMonth][groupKey].conversions += conversions;
        monthlyGroups[yearMonth][groupKey].bookings += bookings;
      }
    }
    
    // Prepare daily aggregates for upsert
    const dailyAggregates: AggregatedRow[] = [];
    for (const [dateStr, groups] of Object.entries(dailyGroups)) {
      for (const [groupValue, base] of Object.entries(groups)) {
        const metrics = calculateMetrics(base);
        dailyAggregates.push({
          report_id: config.report_id,
          account_id: accountId,
          group_by_dimension_id: config.group_by_dimension_id,
          group_by_value: groupValue,
          date: dateStr,
          cost: base.cost,
          revenue: base.revenue,
          clicks: base.clicks,
          impressions: base.impressions,
          conversions: base.conversions,
          bookings: base.bookings > 0 ? base.bookings : null,
          ...metrics,
        });
      }
    }
    
    // Prepare monthly aggregates for upsert
    const monthlyAggregates: AggregatedRow[] = [];
    for (const [yearMonth, groups] of Object.entries(monthlyGroups)) {
      for (const [groupValue, base] of Object.entries(groups)) {
        const metrics = calculateMetrics(base);
        monthlyAggregates.push({
          report_id: config.report_id,
          account_id: accountId,
          group_by_dimension_id: config.group_by_dimension_id,
          group_by_value: groupValue,
          year_month: yearMonth,
          cost: base.cost,
          revenue: base.revenue,
          clicks: base.clicks,
          impressions: base.impressions,
          conversions: base.conversions,
          bookings: base.bookings > 0 ? base.bookings : null,
          ...metrics,
        });
      }
    }
    
    // Upsert daily aggregates
    let dailyUpserted = 0;
    if (dailyAggregates.length > 0) {
      // Delete existing aggregates for this report and group_by_dimension_id first
      await supabase
        .from('master_report_daily_aggregates')
        .delete()
        .eq('report_id', config.report_id)
        .eq('group_by_dimension_id', config.group_by_dimension_id)
        .gte('date', ninetyDaysAgo.toISOString().split('T')[0]);
      
      // Insert new aggregates in batches
      const batchSize = 1000;
      for (let i = 0; i < dailyAggregates.length; i += batchSize) {
        const batch = dailyAggregates.slice(i, i + batchSize);
        // Remove year_month field for daily aggregates (it doesn't exist in daily table)
        const batchToInsert = batch.map(({ year_month, ...rest }) => {
          const { year_month: _, ...dailyRow } = rest;
          return dailyRow;
        });
        const { error: insertError } = await supabase
          .from('master_report_daily_aggregates')
          .insert(batchToInsert);
        
        if (insertError) {
          console.error(`[AGGREGATE] Error inserting daily aggregates batch:`, insertError);
          return { dailyRows: 0, monthlyRows: 0, error: insertError.message };
        }
        dailyUpserted += batch.length;
      }
    }
    
    // Upsert monthly aggregates
    let monthlyUpserted = 0;
    if (monthlyAggregates.length > 0) {
      // Delete existing aggregates for this report and group_by_dimension_id first
      await supabase
        .from('master_report_monthly_aggregates')
        .delete()
        .eq('report_id', config.report_id)
        .eq('group_by_dimension_id', config.group_by_dimension_id)
        .gte('year_month', `${twoYearsAgo.getFullYear()}-${String(twoYearsAgo.getMonth() + 1).padStart(2, '0')}`);
      
      // Insert new aggregates in batches
      const batchSize = 1000;
      for (let i = 0; i < monthlyAggregates.length; i += batchSize) {
        const batch = monthlyAggregates.slice(i, i + batchSize);
        // Remove date field for monthly aggregates (it doesn't exist in monthly table)
        const batchToInsert = batch.map(({ date, ...rest }) => {
          const { date: _, ...monthlyRow } = rest;
          return monthlyRow;
        });
        const { error: insertError } = await supabase
          .from('master_report_monthly_aggregates')
          .insert(batchToInsert);
        
        if (insertError) {
          console.error(`[AGGREGATE] Error inserting monthly aggregates batch:`, insertError);
          return { dailyRows: dailyUpserted, monthlyRows: 0, error: insertError.message };
        }
        monthlyUpserted += batch.length;
      }
    }
    
    console.log(`[AGGREGATE] Aggregated report ${config.report_id}: ${dailyUpserted} daily rows, ${monthlyUpserted} monthly rows`);
    
    return { dailyRows: dailyUpserted, monthlyRows: monthlyUpserted };
  } catch (error) {
    console.error(`[AGGREGATE] Error aggregating report ${config.report_id}:`, error);
    return {
      dailyRows: 0,
      monthlyRows: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Main aggregation function
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request body (optional - can specify reportId to aggregate single report)
    let reportId: string | null = null;
    try {
      if (req.method === 'POST') {
        const body = await req.json();
        reportId = body.reportId || null;
      }
    } catch {
      // No body or invalid JSON - continue with all reports
    }
    
    // Fetch all master report configs
    let configsQuery = supabase
      .from('master_report_configs')
      .select('*');
    
    if (reportId) {
      configsQuery = configsQuery.eq('report_id', reportId);
    }
    
    const { data: configs, error: configsError } = await configsQuery;
    
    if (configsError) {
      console.error('[AGGREGATE] Error fetching master_report_configs:', configsError);
      return new Response(
        JSON.stringify({ error: configsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No master report configs found', aggregated: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[AGGREGATE] Found ${configs.length} master report config(s) to aggregate`);
    
    const results = [];
    
    // Process each config
    for (const config of configs as MasterReportConfig[]) {
      // Find date dimension for this report
      const { data: dimensions, error: dimError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .or(`report_id.eq.${config.report_id},report_id.is.null,scope.eq.global`)
        .eq('type', 'date')
        .limit(1);
      
      if (dimError) {
        console.error(`[AGGREGATE] Error fetching date dimension for report ${config.report_id}:`, dimError);
        results.push({
          report_id: config.report_id,
          success: false,
          error: dimError.message,
        });
        continue;
      }
      
      const dateDimension = dimensions && dimensions.length > 0 ? dimensions[0] : null;
      
      if (!dateDimension) {
        console.warn(`[AGGREGATE] No date dimension found for report ${config.report_id}, skipping`);
        results.push({
          report_id: config.report_id,
          success: false,
          error: 'No date dimension found',
        });
        continue;
      }
      
      // Aggregate this report
      const result = await aggregateReport(supabase, config, dateDimension.id);
      results.push({
        report_id: config.report_id,
        success: !result.error,
        dailyRows: result.dailyRows,
        monthlyRows: result.monthlyRows,
        error: result.error,
      });
    }
    
    const successCount = results.filter(r => r.success).length;
    const totalDailyRows = results.reduce((sum, r) => sum + r.dailyRows, 0);
    const totalMonthlyRows = results.reduce((sum, r) => sum + r.monthlyRows, 0);
    
    return new Response(
      JSON.stringify({
        success: true,
        aggregated: successCount,
        total: configs.length,
        totalDailyRows,
        totalMonthlyRows,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[AGGREGATE] Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
