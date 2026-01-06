import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Base CORS headers
const getCorsHeaders = (req?: Request) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204, 
      headers: getCorsHeaders(req) 
    });
  }

  const corsHeaders = getCorsHeaders();

  let requestBody: { spreadsheetId?: string; range?: string; tabName?: string; action?: string } | undefined;
  
  try {
    // Parse request body with better error handling
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('[fetch-google-sheets] Failed to parse request body:', parseError);
      const errorResponse = {
        error: 'Invalid request body. Expected JSON.',
        details: parseError instanceof Error ? parseError.message : String(parseError),
        timestamp: new Date().toISOString(),
      };
      return new Response(
        JSON.stringify(errorResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }
    
    const { spreadsheetId, range, tabName, action } = requestBody || {};
    const apiKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');

    if (!apiKey) {
      console.error('[fetch-google-sheets] Google Sheets API key not configured');
      return new Response(
        JSON.stringify({ error: 'Google Sheets API key not configured' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    if (!spreadsheetId || typeof spreadsheetId !== 'string' || spreadsheetId.trim() === '') {
      console.error('[fetch-google-sheets] Invalid spreadsheetId:', spreadsheetId);
      return new Response(
        JSON.stringify({ error: 'Spreadsheet ID is required and must be a non-empty string' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // If action is 'metadata', return spreadsheet metadata including available tabs
    if (action === 'metadata') {
      console.log(`Fetching spreadsheet metadata: ${spreadsheetId}`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to fetch spreadsheet metadata';
        try {
          const error = JSON.parse(errorText);
          errorMessage = error.error?.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        console.error('Google Sheets API error:', errorMessage);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const sheets = data.sheets?.map((sheet: any) => ({
        title: sheet.properties.title,
        sheetId: sheet.properties.sheetId,
      })) || [];
      
      console.log(`Successfully fetched metadata with ${sheets.length} sheets`);

      return new Response(
        JSON.stringify({ sheets }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Validate and construct the range
    const defaultRange = 'A:Z';
    const requestedRange = range || defaultRange;

    // If a tab name is provided, validate it exists and normalize it to the exact sheet title.
    // NOTE: Many Google Sheets API errors show up as "Unable to parse range" when the sheet title
    // doesn't match exactly OR when the range isn't properly URL-encoded.
    let normalizedTabName: string | undefined;
    if (tabName !== undefined && tabName !== null) {
      if (typeof tabName !== 'string' || tabName.trim() === '') {
        console.error('[fetch-google-sheets] Invalid tabName:', tabName);
        return new Response(
          JSON.stringify({ error: 'Tab name must be a non-empty string if provided' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        );
      }

      // Fetch sheet titles and normalize to an exact match when possible.
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title&key=${apiKey}`;
      const metaRes = await fetch(metaUrl);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        const titles: string[] = (meta.sheets || [])
          .map((s: any) => s?.properties?.title)
          .filter((t: any) => typeof t === 'string');

        // Prefer exact match first, then trimmed match.
        normalizedTabName =
          titles.find((t) => t === tabName) ||
          titles.find((t) => t.trim() === tabName.trim());

        if (!normalizedTabName) {
          console.error('[fetch-google-sheets] Tab not found in spreadsheet:', {
            spreadsheetId,
            requestedTabName: tabName,
            availableTabs: titles,
          });
          return new Response(
            JSON.stringify({
              error: `Tab not found: "${tabName}"`,
              availableTabs: titles,
              status: 400,
              requestParams: {
                spreadsheetId,
                tabName,
                range: requestedRange,
              },
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            }
          );
        }
      } else {
        // If metadata fetch fails (permissions, etc.), fall back to using provided tabName.
        normalizedTabName = tabName;
      }
    }

    // Construct the A1 notation range.
    // Only wrap the sheet name in single quotes when needed (spaces/special chars).
    // Also escape quotes inside the name.
    let fullRange: string;
    if (normalizedTabName !== undefined) {
      const escapedTabName = normalizedTabName.replace(/'/g, "''");
      const needsQuotes = /[^A-Za-z0-9_]/.test(normalizedTabName);
      const sheetPart = needsQuotes ? `'${escapedTabName}'` : escapedTabName;
      fullRange = `${sheetPart}!${requestedRange}`;
    } else {
      fullRange = requestedRange;
    }

    console.log(`[fetch-google-sheets] Fetching Google Sheets data:`, {
      spreadsheetId,
      tabName: normalizedTabName || tabName || 'none',
      range: requestedRange,
      fullRange,
    });

    // IMPORTANT: encodeURIComponent does NOT encode apostrophes (') which breaks the Sheets API path parsing.
    const encodedRange = encodeURIComponent(fullRange).replace(/'/g, '%27');

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?key=${apiKey}`;
    
    console.log(`[fetch-google-sheets] Request URL: ${url.replace(apiKey, 'REDACTED')}`);
    console.log(`[fetch-google-sheets] Full range: ${fullRange}`);
    console.log(`[fetch-google-sheets] Spreadsheet ID: ${spreadsheetId}`);
    console.log(`[fetch-google-sheets] Tab name: ${tabName || 'none'}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to fetch Google Sheets data';
      let errorDetails: any = {};
      
      try {
        const error = JSON.parse(errorText);
        errorMessage = error.error?.message || errorMessage;
        errorDetails = error.error || {};
      } catch {
        errorMessage = errorText || errorMessage;
      }
      
      const errorInfo = {
        status: response.status,
        statusText: response.statusText,
        message: errorMessage,
        details: errorDetails,
        requestParams: {
          spreadsheetId,
          tabName: tabName || 'none',
          range: requestedRange,
          fullRange,
        },
        url: url.replace(apiKey, 'REDACTED')
      };
      
      console.error('[fetch-google-sheets] Google Sheets API error:', errorInfo);
      
      // Return detailed error in response body for debugging
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          details: errorDetails,
          status: response.status,
          requestParams: errorInfo.requestParams
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: response.status 
        }
      );
    }

    const data = await response.json();
    console.log(`Successfully fetched ${data.values?.length || 0} rows`);

    return new Response(
      JSON.stringify(data),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('[fetch-google-sheets] Error in fetch-google-sheets:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Include request parameters in error response for debugging
    const errorResponse = {
      error: errorMessage,
      requestParams: {
        spreadsheetId: requestBody?.spreadsheetId || 'not provided',
        tabName: requestBody?.tabName || 'not provided',
        range: requestBody?.range || 'not provided',
      },
      timestamp: new Date().toISOString(),
    };
    
    return new Response(
      JSON.stringify(errorResponse),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
