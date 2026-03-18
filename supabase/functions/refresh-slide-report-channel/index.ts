/**
 * Refresh Slide Report Channel Edge Function
 * 
 * Processes pivot data for a single channel to avoid resource limits.
 * This function is called by the main refresh-slide-report function for each channel.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  SlideReportConfiguration,
  SlideReportDateRange,
} from './types.ts';
import { computeChannelPivotData, computeChannelPivotDataForYear, computeChannelPivotDataForMonth } from './pivotComputation.ts';

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
      headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-supabase-client-info';
    }
  } else {
    // For regular responses, include common headers
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-supabase-client-info';
  }

  return headers;
};

interface RequestBody {
  channel: string;
  reportId: string;
  /** When set with month, compute only this month (store in slide_report_channel_month_data). */
  year?: number;
  /** When set with year, compute only this month (store in slide_report_channel_month_data). */
  month?: number;
  channelConfig?: SlideReportConfiguration['channelConfigs'][string];
  breakdownConfig?: SlideReportConfiguration['breakdownConfigs'][string];
  filterConfig?: SlideReportConfiguration['filterConfigs'][string];
  dateRange: SlideReportDateRange;
}

interface SuccessResponse {
  success: true;
  channel: string;
  /** Set when year was requested (per-year or per-month slice). */
  year?: number;
  /** Set when month was requested (per-month slice). */
  month?: number;
  channelData: any;
  /** Per-year or per-month slice for storage; only set when year (or year+month) was requested. */
  channelDataSlice?: any;
  overviewContributions: {
    monthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
    yearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
    current: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number };
  };
}

interface ErrorResponse {
  success: false;
  error: string;
  channel?: string;
  details?: any;
}

const SLIDE_REPORT_CACHE_ENABLED = Deno.env.get('SLIDE_REPORT_CACHE_ENABLED') === 'true';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  
  // Get CORS headers for this request
  const corsHeaders = getCorsHeaders(req);

  if (!SLIDE_REPORT_CACHE_ENABLED) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Slide report cache refresh is deprecated and disabled (set SLIDE_REPORT_CACHE_ENABLED=true to allow).',
      } as ErrorResponse),
      { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
        } as ErrorResponse),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const body: RequestBody = await req.json();
    const { channel, reportId, year, month, channelConfig, breakdownConfig, filterConfig, dateRange } = body;

    if (!channel || !reportId || !dateRange) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: channel, reportId, and dateRange are required',
        } as ErrorResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const yearInt = year != null && Number.isInteger(year) ? year : (year != null ? parseInt(String(year), 10) : null);
    const monthInt = month != null && Number.isInteger(month) && month >= 1 && month <= 12
      ? month
      : (month != null ? (() => { const m = parseInt(String(month), 10); return m >= 1 && m <= 12 ? m : null; })() : null);

    console.log(`[channel-refresh] Processing channel ${channel} with reportId ${reportId}${yearInt != null ? ` year=${yearInt}` : ''}${monthInt != null ? ` month=${monthInt}` : ''}`);
    console.log(`[testing] channel function invoked: channel=${channel}, reportId=${reportId}, year=${yearInt ?? 'full'}, month=${monthInt ?? 'full'}, dateRange=${JSON.stringify(dateRange)}`);

    if (yearInt != null && monthInt != null) {
      // Per-month: fetch and compute only that month (minimal load)
      const result = await computeChannelPivotDataForMonth(
        supabase,
        channel,
        reportId,
        yearInt,
        monthInt,
        channelConfig,
        breakdownConfig,
        filterConfig
      );
      console.log(`[channel-refresh] Successfully processed channel ${channel} ${yearInt}-${String(monthInt).padStart(2, '0')}`);
      const responsePayload: SuccessResponse = {
        success: true,
        channel,
        year: yearInt,
        month: monthInt,
        channelData: result.channelDataSlice,
        channelDataSlice: result.channelDataSlice,
        overviewContributions: result.overviewContributions,
      };
      if ((result as any).rawDataRows) {
        (responsePayload as any).rawDataRows = (result as any).rawDataRows;
        (responsePayload as any).dimension_map = (result as any).dimensionMap ?? result.channelDataSlice.dimensionMap;
      }
      return new Response(
        JSON.stringify(responsePayload),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (yearInt != null) {
      // Per-year: fetch and compute only that year (split load, reduce CPU per invocation)
      const result = await computeChannelPivotDataForYear(
        supabase,
        channel,
        reportId,
        yearInt,
        channelConfig,
        breakdownConfig,
        filterConfig
      );
      console.log(`[channel-refresh] Successfully processed channel ${channel} year ${yearInt}`);
      return new Response(
        JSON.stringify({
          success: true,
          channel,
          year: yearInt,
          channelData: result.channelDataSlice,
          channelDataSlice: result.channelDataSlice,
          overviewContributions: result.overviewContributions,
        } as SuccessResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Full load: all years (original behavior)
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    const currentDateRange = { start: fromDate, end: toDate };

    const result = await computeChannelPivotData(
      supabase,
      channel,
      reportId,
      channelConfig,
      breakdownConfig,
      filterConfig,
      currentDateRange
    );

    console.log(`[channel-refresh] Successfully processed channel ${channel}`);
    const rowCount = result.channelData?.rawDataRows?.length ?? 0;
    console.log(`[testing] channel function success: channel=${channel}, reportId=${reportId}, rawDataRows=${rowCount}, current.revenue=${result.channelData?.current?.revenue ?? 'n/a'}`);

    return new Response(
      JSON.stringify({
        success: true,
        channel,
        channelData: result.channelData,
        overviewContributions: result.overviewContributions,
      } as SuccessResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[channel-refresh] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`[testing] channel function FAILED: error=${errorMessage} (channel/reportId unknown in catch - see main refresh [testing] logs for which channel was being processed)`);

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
