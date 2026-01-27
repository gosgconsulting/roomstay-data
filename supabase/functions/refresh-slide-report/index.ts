/**
 * Refresh Slide Report Edge Function
 * 
 * Handles the complete refresh process for slide reports:
 * 1. Verify settings
 * 2. Validate report IDs
 * 3. Compute pivot data
 * 4. Store monthly data
 * 5. Update slide report
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  SlideReportConfiguration,
  SlideReportDateRange,
  SlideReportPivotData,
} from './types.ts';
import { getAccountReportIds } from './accountReports.ts';
import {
  prepareMonthlyRecords,
  extractFilterDimensionValues,
  calculateConfigCounts,
  normalizeErrorMessage,
  calculateDerivedMetrics,
} from './utils.ts';

// Base CORS headers - dynamically handle requested headers
const getCorsHeaders = (req?: Request) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };

  // For preflight requests, echo back the requested headers
  if (req) {
    const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
    if (requestedHeaders) {
      headers['Access-Control-Allow-Headers'] = requestedHeaders;
    } else {
      // Default headers if none requested
      headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-api-key, api-key';
    }
  } else {
    // For regular responses, include common headers
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-api-key, api-key';
  }

  return headers;
};

interface RequestBody {
  slideReportId: string;
}

interface SuccessResponse {
  success: true;
  pivotData: SlideReportPivotData;
  summary: string;
  monthlyRecordsCount: number;
  breakdownCount: number;
  filterCount: number;
}

interface ErrorResponse {
  success: false;
  error: string;
  step?: number;
  details?: any;
}

/**
 * Validate API key from request headers
 * Since verify_jwt=false in config.toml, we don't need Authorization header
 * Validate our custom API key from x-api-key header
 * Also allows service role key for internal calls
 */
function validateApiKey(req: Request): boolean {
  // Get API key from environment variable
  const expectedApiKey = Deno.env.get('REFRESH_SLIDE_REPORT_API_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  // Get custom API key from headers (try both common header names)
  const providedApiKey = req.headers.get('x-api-key') || 
                         req.headers.get('api-key') ||
                         req.headers.get('X-API-Key') ||
                         req.headers.get('API-Key');
  
  // Check Authorization header for Bearer token (service role key for internal calls)
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;
  
  // If no custom API key is configured, allow all requests (backward compatibility)
  if (!expectedApiKey) {
    console.warn('[refresh] REFRESH_SLIDE_REPORT_API_KEY not configured - allowing all requests');
    return true;
  }
  
  // When custom API key is configured, require it
  // Allow if:
  // 1. Service role key in Authorization header (for internal calls from channel function)
  if (bearerToken && serviceRoleKey && bearerToken === serviceRoleKey) {
    return true;
  }
  
  // 2. Custom API key in x-api-key header
  if (providedApiKey && providedApiKey === expectedApiKey) {
    return true;
  }
  
  return false;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  
  // Get CORS headers for this request
  const corsHeaders = getCorsHeaders(req);

  // Validate API key (unless no API key is configured)
  // Since verify_jwt=false, we don't need Authorization header
  // Just validate custom API key from x-api-key header
  if (!validateApiKey(req)) {
    const expectedApiKey = Deno.env.get('REFRESH_SLIDE_REPORT_API_KEY');
    const errorMessage = expectedApiKey
      ? 'Unauthorized: Missing or invalid API key. Provide x-api-key header with your API key, or Authorization header with service role key for internal calls.'
      : 'Unauthorized: Missing API key.';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        step: 0,
      } as ErrorResponse),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required environment variables',
          step: 1,
        } as ErrorResponse),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body with error handling
    let requestBody: RequestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body',
          step: 1,
        } as ErrorResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { slideReportId } = requestBody;

    if (!slideReportId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'slideReportId is required',
          step: 1,
        } as ErrorResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[refresh] Starting refresh for slide report ${slideReportId}`);

    // Step 1: Verify Settings
    console.log(`[refresh] Step 1: Verifying settings`);
    const { data: slideReport, error: fetchError } = await supabase
      .from('slide_reports')
      .select('*')
      .eq('id', slideReportId)
      .single();

    if (fetchError) {
      console.error(`[refresh] Error fetching slide report:`, fetchError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch slide report: ${fetchError.message}`,
          step: 1,
        } as ErrorResponse),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!slideReport) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Slide report not found',
          step: 1,
        } as ErrorResponse),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!slideReport.configuration || !slideReport.date_range) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Configuration or date range not found. Please save Edit Source settings first.',
          step: 1,
        } as ErrorResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const config = slideReport.configuration as unknown as SlideReportConfiguration;
    let reportIdsMap = slideReport.report_ids as unknown as Record<string, string>;
    const dateRange = slideReport.date_range as unknown as SlideReportDateRange;
    const accountId = slideReport.account_id as string | null;

    // Step 2: Validate Report IDs
    console.log(`[refresh] Step 2: Validating report IDs`);
    
    if (!accountId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Account ID not found in slide report',
          step: 2,
        } as ErrorResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get account-specific report IDs
    const accountReportIds = await getAccountReportIds(supabase, accountId);
    
    // Determine available channels (channels that have reports)
    const availableChannels: string[] = [];
    if (accountReportIds.metasearch) availableChannels.push('metasearch');
    if (accountReportIds.sem) availableChannels.push('sem');
    if (accountReportIds.social) availableChannels.push('social');

    // Filter selectedChannels to only include channels that have reports
    const validSelectedChannels = (config.selectedChannels || []).filter(channel => 
      availableChannels.includes(channel)
    );
    
    if (validSelectedChannels.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No valid channels found. Please configure at least one channel with a report in Edit Source.',
          step: 2,
        } as ErrorResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Validate report IDs are account-specific - update if they don't match
    let needsUpdate = false;
    const validatedReportIds: Record<string, string> = {};
    
    for (const channel of validSelectedChannels) {
      const storedReportId = reportIdsMap[channel];
      const accountSpecificId = accountReportIds[channel as keyof typeof accountReportIds];
      
      if (accountSpecificId) {
        validatedReportIds[channel] = accountSpecificId;
        if (storedReportId !== accountSpecificId) {
          console.warn(`[refresh] Report ID mismatch for ${channel}. Stored: ${storedReportId}, Account-specific: ${accountSpecificId}. Using account-specific.`);
          needsUpdate = true;
        }
      } else if (storedReportId) {
        validatedReportIds[channel] = storedReportId;
        console.warn(`[refresh] No account-specific report ID found for ${channel}, using stored ID: ${storedReportId}`);
      } else {
        console.error(`[refresh] No report ID available for channel ${channel}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `No report found for ${channel} channel. Please configure it in Edit Source.`,
            step: 2,
          } as ErrorResponse),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }
    
    // Update slide_report if report IDs changed
    if (needsUpdate && Object.keys(validatedReportIds).length > 0) {
      console.log('[refresh] Updating slide_report with account-specific report IDs:', validatedReportIds);
      const { error: updateError } = await supabase
        .from('slide_reports')
        .update({ report_ids: validatedReportIds })
        .eq('id', slideReportId);
      
      if (updateError) {
        console.warn('[refresh] Failed to update report_ids:', updateError);
      }
    }
    
    reportIdsMap = validatedReportIds;
    
    // Create filtered config with only valid channels
    const filteredConfig: SlideReportConfiguration = {
      ...config,
      selectedChannels: validSelectedChannels,
      channelConfigs: Object.fromEntries(
        validSelectedChannels.map(ch => [ch, config.channelConfigs?.[ch] || { dimensionId: null, selectedValues: [] }])
      ),
      breakdownConfigs: Object.fromEntries(
        validSelectedChannels.map(ch => [ch, config.breakdownConfigs?.[ch] || { breakdownDimensionIds: [] }])
      ),
      filterConfigs: Object.fromEntries(
        validSelectedChannels.map(ch => [ch, config.filterConfigs?.[ch] || { filterDimensionIds: [] }])
      ),
    };

    // Step 3: Compute Pivot Data by calling channel function for each channel
    console.log(`[refresh] Step 3: Computing pivot data using channel functions`);
    let pivotData: SlideReportPivotData;
    
    try {
      // Initialize pivot data structure
      const fromDate = new Date(dateRange.from);
      const toDate = new Date(dateRange.to);
      
      pivotData = {
        overview: {
          current: {
            impressions: 0,
            clicks: 0,
            cost: 0,
            revenue: 0,
            bookings: 0,
            ctr: 0,
            conversionRate: 0,
            cpc: 0,
            roas: 0,
            costOfSale: 0,
          },
          monthly: {},
          yearly: {},
        },
        channels: {},
        budget: {
          monthly: [],
          totals: {
            totalBudget: 0,
            totalActual: 0,
            variance: 0,
          },
        },
        computedAt: new Date().toISOString(),
      };

      // Aggregate overview contributions from all channels
      const overviewMonthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
      const overviewYearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
      const overviewCurrent = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      const overviewPrevPeriod = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      const overviewPrevYear = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };

      const channelErrors: Array<{ channel: string; error: string }> = [];
      const channelFunctionUrl = `${supabaseUrl}/functions/v1/refresh-slide-report-channel`;

      // Process each channel by calling the channel function
      for (const channel of validSelectedChannels) {
        const reportId = reportIdsMap[channel];
        if (!reportId) {
          console.warn(`[refresh] Skipping channel ${channel} - no report ID found`);
          continue;
        }

        try {
          console.log(`[refresh] Processing channel ${channel} via channel function (reportId: ${reportId})`);

          const channelConfig = filteredConfig.channelConfigs?.[channel];
          const breakdownConfig = filteredConfig.breakdownConfigs?.[channel];
          const filterConfig = filteredConfig.filterConfigs?.[channel];

          // Call the channel function
          const channelResponse = await fetch(channelFunctionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              channel,
              reportId,
              channelConfig,
              breakdownConfig,
              filterConfig,
              dateRange,
            }),
          });

          if (!channelResponse.ok) {
            const errorText = await channelResponse.text();
            throw new Error(`Channel function returned ${channelResponse.status}: ${errorText}`);
          }

          const channelResult = await channelResponse.json();
          
          if (!channelResult.success) {
            throw new Error(channelResult.error || 'Channel function returned unsuccessful result');
          }

          // Store channel data
          pivotData.channels[channel] = channelResult.channelData;

          // Aggregate overview contributions
          const contributions = channelResult.overviewContributions;

          // Aggregate monthly
          for (const [monthKey, metrics] of Object.entries(contributions.monthly)) {
            if (!overviewMonthly[monthKey]) {
              overviewMonthly[monthKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            }
            overviewMonthly[monthKey].impressions += metrics.impressions;
            overviewMonthly[monthKey].clicks += metrics.clicks;
            overviewMonthly[monthKey].cost += metrics.cost;
            overviewMonthly[monthKey].revenue += metrics.revenue;
            overviewMonthly[monthKey].bookings += metrics.bookings;
          }

          // Aggregate yearly
          for (const [yearKey, metrics] of Object.entries(contributions.yearly)) {
            if (!overviewYearly[yearKey]) {
              overviewYearly[yearKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            }
            overviewYearly[yearKey].impressions += metrics.impressions;
            overviewYearly[yearKey].clicks += metrics.clicks;
            overviewYearly[yearKey].cost += metrics.cost;
            overviewYearly[yearKey].revenue += metrics.revenue;
            overviewYearly[yearKey].bookings += metrics.bookings;
          }

          // Aggregate current
          overviewCurrent.impressions += contributions.current.impressions;
          overviewCurrent.clicks += contributions.current.clicks;
          overviewCurrent.cost += contributions.current.cost;
          overviewCurrent.revenue += contributions.current.revenue;
          overviewCurrent.bookings += contributions.current.bookings;

          // Aggregate previous period and year from channel data
          const channelData = channelResult.channelData;
          if (channelData.previous_period) {
            overviewPrevPeriod.impressions += channelData.previous_period.impressions;
            overviewPrevPeriod.clicks += channelData.previous_period.clicks;
            overviewPrevPeriod.cost += channelData.previous_period.cost;
            overviewPrevPeriod.revenue += channelData.previous_period.revenue;
            overviewPrevPeriod.bookings += channelData.previous_period.bookings;
          }
          if (channelData.previous_year) {
            overviewPrevYear.impressions += channelData.previous_year.impressions;
            overviewPrevYear.clicks += channelData.previous_year.clicks;
            overviewPrevYear.cost += channelData.previous_year.cost;
            overviewPrevYear.revenue += channelData.previous_year.revenue;
            overviewPrevYear.bookings += channelData.previous_year.bookings;
          }

          console.log(`[refresh] Successfully processed channel ${channel}`);
        } catch (channelError: any) {
          const errorMessage = channelError?.message || channelError?.error_description || channelError?.details || String(channelError);
          console.error(`[refresh] Error processing channel ${channel} (reportId: ${reportId}):`, {
            error: channelError,
            message: errorMessage,
            stack: channelError?.stack,
          });
          
          channelErrors.push({
            channel,
            error: errorMessage,
          });
          
          console.warn(`[refresh] Continuing with other channels despite error in ${channel}`);
        }
      }

      // Check if we have any successful channels
      if (Object.keys(pivotData.channels).length === 0) {
        if (channelErrors.length > 0) {
          const errorSummary = channelErrors.map(e => `${e.channel}: ${e.error}`).join('; ');
          throw new Error(`Failed to process all channels: ${errorSummary}`);
        } else {
          throw new Error('No channels were processed');
        }
      }

      // Calculate derived metrics for overview
      pivotData.overview.current = calculateDerivedMetrics(overviewCurrent);
      pivotData.overview.previous_period = calculateDerivedMetrics(overviewPrevPeriod);
      pivotData.overview.previous_year = calculateDerivedMetrics(overviewPrevYear);

      // Calculate derived metrics for monthly overview
      pivotData.overview.monthly = {};
      for (const [monthKey, baseMetrics] of Object.entries(overviewMonthly)) {
        pivotData.overview.monthly[monthKey] = calculateDerivedMetrics(baseMetrics);
      }

      // Calculate derived metrics for yearly overview
      pivotData.overview.yearly = {};
      for (const [yearKey, baseMetrics] of Object.entries(overviewYearly)) {
        pivotData.overview.yearly[yearKey] = calculateDerivedMetrics(baseMetrics);
      }

      // Report any channel errors (but don't fail if at least one channel succeeded)
      if (channelErrors.length > 0) {
        const errorSummary = channelErrors.map(e => `${e.channel}: ${e.error}`).join('; ');
        console.warn(`[refresh] Some channels failed to process: ${errorSummary}`);
      }

      console.log(`[refresh] Pivot data computation completed successfully for ${Object.keys(pivotData.channels).length} channel(s)`);
    } catch (pivotError: any) {
      const details =
        pivotError?.message ||
        pivotError?.error_description ||
        pivotError?.details ||
        (typeof pivotError === 'string' ? pivotError : '');

      const safeJson = (() => {
        try {
          return JSON.stringify(pivotError);
        } catch {
          return '';
        }
      })();

      console.error('[refresh] Step 3: Pivot computation error:', {
        error: pivotError,
        message: details,
        stack: pivotError?.stack,
      });

      // Check for resource limit errors
      const errorMessage = (details || safeJson || 'Unknown error').toString();
      let friendlyMessage = errorMessage;
      
      if (errorMessage.includes('WORKER_LIMIT') || errorMessage.includes('compute resources')) {
        friendlyMessage = 'The dataset is too large for the current edge function limits. Please try reducing the date range or contact support to increase resource limits.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        friendlyMessage = 'The computation took too long. Please try reducing the date range or contact support.';
      } else if (errorMessage.includes('memory') || errorMessage.includes('Memory')) {
        friendlyMessage = 'The dataset is too large to process in memory. Please try reducing the date range.';
      } else {
        friendlyMessage = `Pivot data computation failed: ${errorMessage}`;
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: friendlyMessage,
          step: 3,
          details: pivotError,
        } as ErrorResponse),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    if (!pivotData || !pivotData.channels || Object.keys(pivotData.channels).length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Pivot data computation returned invalid data or no channels were processed',
          step: 3,
        } as ErrorResponse),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Step 4: Store Monthly Data
    console.log(`[refresh] Step 4: Storing monthly data`);
    
    // Delete existing monthly data for this slide report
    const { error: deleteError } = await supabase
      .from('slide_report_monthly_data')
      .delete()
      .eq('slide_report_id', slideReportId);

    if (deleteError) {
      console.warn('[refresh] Error deleting old monthly data:', deleteError);
    }

    // Prepare monthly data records
    const monthlyRecords = prepareMonthlyRecords(pivotData, slideReportId, accountId);
    
    // Insert in batches (100 records at a time)
    const batchSize = 100;
    const errors: string[] = [];
    let inserted = 0;
    
    for (let i = 0; i < monthlyRecords.length; i += batchSize) {
      const batch = monthlyRecords.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      try {
        const { error } = await supabase
          .from('slide_report_monthly_data')
          .insert(batch);
        
        if (error) {
          console.error(`[refresh] Error inserting batch ${batchNumber}:`, error);
          errors.push(`Batch ${batchNumber}: ${error.message}`);
        } else {
          inserted += batch.length;
        }
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        console.error(`[refresh] Exception inserting batch ${batchNumber}:`, err);
        errors.push(`Batch ${batchNumber}: ${errorMsg}`);
      }
    }
    
    if (errors.length > 0) {
      console.warn('[refresh] Some batches failed to insert:', errors);
    }

    // Step 5: Update Slide Report
    console.log(`[refresh] Step 5: Updating slide report`);
    
    const { error: updateError } = await supabase
      .from('slide_reports')
      .update({
        pivot_data: pivotData as any,
        last_refreshed_at: new Date().toISOString(),
      })
      .eq('id', slideReportId);

    if (updateError) {
      console.error('[refresh] Error updating slide report:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to save pivot data: ${updateError.message}`,
          step: 5,
        } as ErrorResponse),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Calculate config counts for summary
    const { breakdownCount, filterCount } = calculateConfigCounts(config);

    const summary = `Stored ${monthlyRecords.length} monthly records with ${breakdownCount} breakdown(s) and ${filterCount} filter(s).`;
    console.log(`[refresh] Refresh completed successfully: ${summary}`);

    return new Response(
      JSON.stringify({
        success: true,
        pivotData,
        summary,
        monthlyRecordsCount: monthlyRecords.length,
        breakdownCount,
        filterCount,
      } as SuccessResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[refresh] Unexpected error:', error);
    const errorMessage = normalizeErrorMessage(error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: error,
      } as ErrorResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
