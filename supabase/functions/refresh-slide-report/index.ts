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
  mergeChannelYearSlices,
  getYearsFromDateRange,
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
  /** Optional: limit refresh to these years only (e.g. [2024, 2025]). Ignored if year+month are set. */
  years?: number[];
  /** Optional: refresh a single year, or with month a single month (e.g. 2025). Ignored if `years` is set. */
  year?: number;
  /** Optional: with year, refresh only this month 1–12 (e.g. 12 for December). Enables per-month storage and minimal CPU. */
  month?: number;
}

interface SuccessResponse {
  success: true;
  /** Omitted to avoid timeout: pivot data is stored in slide_reports.pivot_data; refetch the slide report to get it. */
  pivotData?: SlideReportPivotData;
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
 * Validate request: allow x-api-key header OR valid auth (Bearer = service role key or user JWT from frontend).
 * When REFRESH_SLIDE_REPORT_API_KEY is set, requires one of: x-api-key, Bearer service role, or Bearer user JWT.
 */
async function validateRequestAuth(req: Request): Promise<boolean> {
  const expectedApiKey = Deno.env.get('REFRESH_SLIDE_REPORT_API_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  const providedApiKey =
    req.headers.get('x-api-key') ||
    req.headers.get('api-key') ||
    req.headers.get('X-API-Key') ||
    req.headers.get('API-Key');

  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!expectedApiKey) {
    console.warn('[refresh] REFRESH_SLIDE_REPORT_API_KEY not configured - allowing all requests');
    return true;
  }

  if (providedApiKey && providedApiKey === expectedApiKey) return true;
  if (bearerToken && serviceRoleKey && bearerToken === serviceRoleKey) return true;

  if (bearerToken && supabaseUrl && anonKey) {
    try {
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      });
      const { data: { user }, error } = await authClient.auth.getUser(bearerToken);
      if (!error && user) {
        return true;
      }
    } catch (_) {
      // ignore
    }
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

  if (!(await validateRequestAuth(req))) {
    const expectedApiKey = Deno.env.get('REFRESH_SLIDE_REPORT_API_KEY');
    const errorMessage = expectedApiKey
      ? 'Unauthorized: Provide x-api-key header with your API key, or Authorization: Bearer with your session (frontend) or service role key (internal).'
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

    const { slideReportId, years: requestYears, year: requestYear, month: requestMonth } = requestBody;

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

    const selectedChannels = config.selectedChannels || [];
    // Filter selectedChannels to only include channels that have reports
    const validSelectedChannels = selectedChannels.filter(channel =>
      availableChannels.includes(channel)
    );

    console.log(`[testing] refresh: accountId=${accountId}, selectedChannels=${JSON.stringify(selectedChannels)}, availableChannels=${JSON.stringify(availableChannels)}, validSelectedChannels=${JSON.stringify(validSelectedChannels)}`);
    const skippedChannels = selectedChannels.filter(ch => !availableChannels.includes(ch));
    if (skippedChannels.length > 0) {
      console.log(`[testing] refresh: channels skipped (no report ID): ${JSON.stringify(skippedChannels)}`);
    }

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

    // Step 3: Compute Pivot Data by calling channel function (per-year to split load and avoid CPU timeout)
    console.log(`[refresh] Step 3: Computing pivot data using channel functions (per-year)`);
    let pivotData: SlideReportPivotData;

    try {
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
          totals: { totalBudget: 0, totalActual: 0, variance: 0 },
        },
        computedAt: new Date().toISOString(),
      };

      const overviewMonthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
      const overviewYearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
      const overviewCurrent = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      const overviewPrevPeriod = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      const overviewPrevYear = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };

      const channelErrors: Array<{ channel: string; error: string }> = [];
      const channelFunctionUrl = `${supabaseUrl}/functions/v1/refresh-slide-report-channel`;
      const parseYear = (y: unknown): number | null => {
        if (y == null) return null;
        const n = typeof y === 'number' ? y : parseInt(String(y), 10);
        return !isNaN(n) && n >= 1970 && n <= 2100 ? n : null;
      };
      const parseMonth = (m: unknown): number | null => {
        if (m == null) return null;
        const n = typeof m === 'number' ? m : parseInt(String(m), 10);
        return !isNaN(n) && n >= 1 && n <= 12 ? n : null;
      };
      const requestedYearSingle = parseYear(requestYear);
      const requestedMonthSingle = parseMonth(requestMonth);
      const useMonthlyRefresh = requestedYearSingle != null && requestedMonthSingle != null;

      if (useMonthlyRefresh) {
        console.log(`[refresh] Per-month refresh: year=${requestedYearSingle}, month=${requestedMonthSingle}`);
      }

      const requestedYearsArray =
        requestYears && Array.isArray(requestYears) && requestYears.length > 0
          ? [...new Set(requestYears.map(parseYear).filter((y): y is number => y != null))].sort((a, b) => a - b)
          : [];
      const yearsToRefresh =
        useMonthlyRefresh
          ? []
          : requestedYearsArray.length > 0
            ? requestedYearsArray
            : requestedYearSingle != null
              ? [requestedYearSingle]
              : getYearsFromDateRange(dateRange);
      if (!useMonthlyRefresh && (requestYear != null || (requestYears && requestYears.length > 0))) {
        console.log(`[refresh] Request body year/years: year=${requestYear}, years=${JSON.stringify(requestYears)} -> years to refresh: ${yearsToRefresh.join(', ')}`);
      } else if (!useMonthlyRefresh) {
        console.log(`[refresh] Years to refresh (from date range): ${yearsToRefresh.join(', ')}`);
      }

      if (useMonthlyRefresh) {
        // --- Per-month path: one channel call per channel for (year, month), then merge from all month rows ---
        for (const channel of validSelectedChannels) {
          const reportId = reportIdsMap[channel];
          if (!reportId) {
            console.warn(`[refresh] Skipping channel ${channel} - no report ID found`);
            continue;
          }
          const channelConfig = filteredConfig.channelConfigs?.[channel];
          const breakdownConfig = filteredConfig.breakdownConfigs?.[channel];
          const filterConfig = filteredConfig.filterConfigs?.[channel];
          try {
            console.log(`[refresh] Processing channel ${channel} ${requestedYearSingle}-${String(requestedMonthSingle).padStart(2, '0')} (reportId: ${reportId})`);
            const channelResponse = await fetch(channelFunctionUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify({
                channel,
                reportId,
                year: requestedYearSingle,
                month: requestedMonthSingle,
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
            const slice = channelResult.channelDataSlice ?? channelResult.channelData;
            const { error: upsertError } = await supabase
              .from('slide_report_channel_month_data')
              .upsert(
                {
                  slide_report_id: slideReportId,
                  channel,
                  year: requestedYearSingle,
                  month: requestedMonthSingle,
                  data: slice,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'slide_report_id,channel,year,month' }
              );
            if (upsertError) {
              console.warn(`[refresh] Failed to upsert slide_report_channel_month_data for ${channel}:`, upsertError);
            }
            console.log(`[refresh] Successfully processed channel ${channel} for ${requestedYearSingle}-${String(requestedMonthSingle).padStart(2, '0')}`);
          } catch (channelError: any) {
            const errorMessage = channelError?.message || channelError?.error_description || channelError?.details || String(channelError);
            console.error(`[refresh] Error processing channel ${channel} (year/month):`, { error: channelError, message: errorMessage });
            channelErrors.push({ channel, error: errorMessage });
          }
        }

        // Load all month rows for this slide report and merge per channel
        const { data: monthRows, error: fetchMonthError } = await supabase
          .from('slide_report_channel_month_data')
          .select('channel, year, month, data')
          .eq('slide_report_id', slideReportId);
        if (fetchMonthError) {
          console.error('[refresh] Failed to fetch slide_report_channel_month_data:', fetchMonthError);
          throw new Error(`Failed to load month data for merge: ${fetchMonthError.message}`);
        }
        const slicesByChannel: Record<string, any[]> = {};
        for (const row of monthRows || []) {
          const ch = row.channel as string;
          if (!slicesByChannel[ch]) slicesByChannel[ch] = [];
          slicesByChannel[ch].push(row.data);
        }
        for (const channel of validSelectedChannels) {
          const slices = slicesByChannel[channel] || [];
          if (slices.length === 0) continue;
          const mergedChannelData = mergeChannelYearSlices(slices, dateRange);
          pivotData.channels[channel] = mergedChannelData;
          for (const [monthKey, m] of Object.entries(mergedChannelData.monthly || {})) {
            if (!overviewMonthly[monthKey]) {
              overviewMonthly[monthKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            }
            overviewMonthly[monthKey].impressions += m.impressions;
            overviewMonthly[monthKey].clicks += m.clicks;
            overviewMonthly[monthKey].cost += m.cost;
            overviewMonthly[monthKey].revenue += m.revenue;
            overviewMonthly[monthKey].bookings += m.bookings;
          }
          for (const [yearKey, m] of Object.entries(mergedChannelData.yearly || {})) {
            if (!overviewYearly[yearKey]) {
              overviewYearly[yearKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            }
            overviewYearly[yearKey].impressions += m.impressions;
            overviewYearly[yearKey].clicks += m.clicks;
            overviewYearly[yearKey].cost += m.cost;
            overviewYearly[yearKey].revenue += m.revenue;
            overviewYearly[yearKey].bookings += m.bookings;
          }
          if (mergedChannelData.previous_period) {
            overviewPrevPeriod.impressions += mergedChannelData.previous_period.impressions;
            overviewPrevPeriod.clicks += mergedChannelData.previous_period.clicks;
            overviewPrevPeriod.cost += mergedChannelData.previous_period.cost;
            overviewPrevPeriod.revenue += mergedChannelData.previous_period.revenue;
            overviewPrevPeriod.bookings += mergedChannelData.previous_period.bookings;
          }
          if (mergedChannelData.previous_year) {
            overviewPrevYear.impressions += mergedChannelData.previous_year.impressions;
            overviewPrevYear.clicks += mergedChannelData.previous_year.clicks;
            overviewPrevYear.cost += mergedChannelData.previous_year.cost;
            overviewPrevYear.revenue += mergedChannelData.previous_year.revenue;
            overviewPrevYear.bookings += mergedChannelData.previous_year.bookings;
          }
        }
      } else {
        // --- Per-year path (existing) ---
        const { error: deleteYearError } = await supabase
          .from('slide_report_channel_year_data')
          .delete()
          .eq('slide_report_id', slideReportId);
        if (deleteYearError) {
          console.warn('[refresh] Error deleting old slide_report_channel_year_data:', deleteYearError);
        }

        for (const channel of validSelectedChannels) {
        const reportId = reportIdsMap[channel];
        if (!reportId) {
          console.warn(`[refresh] Skipping channel ${channel} - no report ID found`);
          continue;
        }

        const channelConfig = filteredConfig.channelConfigs?.[channel];
        const breakdownConfig = filteredConfig.breakdownConfigs?.[channel];
        const filterConfig = filteredConfig.filterConfigs?.[channel];
        const slices: Array<{ year: number; channelDataSlice: any; overviewContributions: any }> = [];

        for (const year of yearsToRefresh) {
          try {
            console.log(`[refresh] Processing channel ${channel} year ${year} (reportId: ${reportId})`);
            console.log(`[testing] refresh: calling channel function channel=${channel}, year=${year}, reportId=${reportId}`);

            const channelResponse = await fetch(channelFunctionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                channel,
                reportId,
                year,
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

            const slice = channelResult.channelDataSlice ?? channelResult.channelData;
            slices.push({
              year: channelResult.year ?? year,
              channelDataSlice: slice,
              overviewContributions: channelResult.overviewContributions,
            });

            // Store per-year row
            const { error: upsertError } = await supabase
              .from('slide_report_channel_year_data')
              .upsert(
                {
                  slide_report_id: slideReportId,
                  channel,
                  year: channelResult.year ?? year,
                  data: slice,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'slide_report_id,channel,year' }
              );
            if (upsertError) {
              console.warn(`[refresh] Failed to upsert slide_report_channel_year_data for ${channel} ${year}:`, upsertError);
            }

            const contributions = channelResult.overviewContributions;
            for (const [monthKey, metrics] of Object.entries(contributions.monthly || {})) {
              if (!overviewMonthly[monthKey]) {
                overviewMonthly[monthKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
              }
              overviewMonthly[monthKey].impressions += (metrics as any).impressions;
              overviewMonthly[monthKey].clicks += (metrics as any).clicks;
              overviewMonthly[monthKey].cost += (metrics as any).cost;
              overviewMonthly[monthKey].revenue += (metrics as any).revenue;
              overviewMonthly[monthKey].bookings += (metrics as any).bookings;
            }
            for (const [yearKey, metrics] of Object.entries(contributions.yearly || {})) {
              if (!overviewYearly[yearKey]) {
                overviewYearly[yearKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
              }
              overviewYearly[yearKey].impressions += (metrics as any).impressions;
              overviewYearly[yearKey].clicks += (metrics as any).clicks;
              overviewYearly[yearKey].cost += (metrics as any).cost;
              overviewYearly[yearKey].revenue += (metrics as any).revenue;
              overviewYearly[yearKey].bookings += (metrics as any).bookings;
            }
            // Do not add contributions.current here when per-year: current is computed from merged monthly in mergeChannelYearSlices / overview below
          } catch (channelError: any) {
            const errorMessage = channelError?.message || channelError?.error_description || channelError?.details || String(channelError);
            console.error(`[refresh] Error processing channel ${channel} year ${year} (reportId: ${reportId}):`, { error: channelError, message: errorMessage });
            console.log(`[testing] refresh: channel ${channel} year ${year} FAILED, error=${errorMessage}`);
            channelErrors.push({ channel: `${channel}/${year}`, error: errorMessage });
          }
        }

        if (slices.length === 0) {
          console.error(`[refresh] No successful years for channel ${channel}`);
          channelErrors.push({ channel, error: 'All years failed for this channel' });
          continue;
        }

        const mergedChannelData = mergeChannelYearSlices(
          slices.map((s) => s.channelDataSlice),
          dateRange
        );
        pivotData.channels[channel] = mergedChannelData;

        if (mergedChannelData.previous_period) {
          overviewPrevPeriod.impressions += mergedChannelData.previous_period.impressions;
          overviewPrevPeriod.clicks += mergedChannelData.previous_period.clicks;
          overviewPrevPeriod.cost += mergedChannelData.previous_period.cost;
          overviewPrevPeriod.revenue += mergedChannelData.previous_period.revenue;
          overviewPrevPeriod.bookings += mergedChannelData.previous_period.bookings;
        }
        if (mergedChannelData.previous_year) {
          overviewPrevYear.impressions += mergedChannelData.previous_year.impressions;
          overviewPrevYear.clicks += mergedChannelData.previous_year.clicks;
          overviewPrevYear.cost += mergedChannelData.previous_year.cost;
          overviewPrevYear.revenue += mergedChannelData.previous_year.revenue;
          overviewPrevYear.bookings += mergedChannelData.previous_year.bookings;
        }

        console.log(`[refresh] Successfully processed channel ${channel} (${slices.length} year(s))`);
        console.log(`[testing] refresh: channel ${channel} OK, merged ${slices.length} years, current revenue=${mergedChannelData.current?.revenue ?? 'n/a'}`);
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

      // Per-year flow: overview current is sum of months in date range (not summed from contributions.current)
      const currentFromMonthly = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      for (const [monthKey, m] of Object.entries(overviewMonthly)) {
        const [y, mo] = monthKey.split('-').map(Number);
        const monthStart = new Date(y, mo - 1, 1);
        const monthEnd = new Date(y, mo, 0, 23, 59, 59);
        if (monthStart >= fromDate && monthEnd <= toDate) {
          currentFromMonthly.impressions += m.impressions;
          currentFromMonthly.clicks += m.clicks;
          currentFromMonthly.cost += m.cost;
          currentFromMonthly.revenue += m.revenue;
          currentFromMonthly.bookings += m.bookings;
        }
      }
      pivotData.overview.current = calculateDerivedMetrics(currentFromMonthly);
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

    // Step 4: Update Slide Report first (so pivot_data is persisted), then return 200 immediately to avoid client/invocation timeout.
    // Monthly data is written in the background after the response is sent.
    console.log(`[refresh] Step 4: Updating slide report (pivot_data)`);

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
          step: 4,
        } as ErrorResponse),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { breakdownCount, filterCount } = calculateConfigCounts(config);
    const monthlyRecords = prepareMonthlyRecords(pivotData, slideReportId, accountId);
    const summary = `Pivot data saved. ${monthlyRecords.length} monthly records queued for background. ${breakdownCount} breakdown(s), ${filterCount} filter(s). Refetch slide report for latest pivot_data.`;
    console.log(`[refresh] Refresh completed successfully (pivot_data saved): ${summary}`);

    // Return 200 immediately so client/invocation timeout is avoided. Monthly data write runs in background (may complete before process exits).
    const response = new Response(
      JSON.stringify({
        success: true,
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

    // Write monthly data in background (do not await) so invocation can end and client already has 200.
    const batchSize = 100;
    void (async () => {
      try {
        await supabase.from('slide_report_monthly_data').delete().eq('slide_report_id', slideReportId);
        for (let i = 0; i < monthlyRecords.length; i += batchSize) {
          const batch = monthlyRecords.slice(i, i + batchSize);
          const { error } = await supabase.from('slide_report_monthly_data').insert(batch);
          if (error) console.warn(`[refresh] Background monthly batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
        }
        console.log(`[refresh] Background: stored ${monthlyRecords.length} monthly records`);
      } catch (e) {
        console.warn('[refresh] Background monthly data write failed:', e);
      }
    })();

    return response;

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
