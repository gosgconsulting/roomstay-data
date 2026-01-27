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
import { computeChannelPivotData } from './pivotComputation.ts';

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
  channelConfig?: SlideReportConfiguration['channelConfigs'][string];
  breakdownConfig?: SlideReportConfiguration['breakdownConfigs'][string];
  filterConfig?: SlideReportConfiguration['filterConfigs'][string];
  dateRange: SlideReportDateRange;
}

interface SuccessResponse {
  success: true;
  channel: string;
  channelData: any;
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  
  // Get CORS headers for this request
  const corsHeaders = getCorsHeaders(req);

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
    const { channel, reportId, channelConfig, breakdownConfig, filterConfig, dateRange } = body;

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

    console.log(`[channel-refresh] Processing channel ${channel} with reportId ${reportId}`);

    // Parse date range
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    
    const currentDateRange = {
      start: fromDate,
      end: toDate,
    };

    // Compute channel pivot data
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
