import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body with better error handling
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('[fetch-google-sheets] Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected JSON.' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }
    
    const { spreadsheetId, range, tabName, action } = requestBody;
    const apiKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');

    if (!apiKey) {
      throw new Error('Google Sheets API key not configured');
    }

    if (!spreadsheetId || typeof spreadsheetId !== 'string' || spreadsheetId.trim() === '') {
      throw new Error('Spreadsheet ID is required and must be a non-empty string');
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
    
    // Construct the range with tab name if provided
    // Only include tab name if it's a non-empty string
    let fullRange: string;
    if (tabName && typeof tabName === 'string' && tabName.trim() !== '') {
      const trimmedTabName = tabName.trim();
      // Check if tab name contains spaces, special characters, or starts with a number
      // If so, wrap in single quotes and escape internal quotes
      const needsQuotes = /[\s\-_0-9]/.test(trimmedTabName) || /^[0-9]/.test(trimmedTabName);
      
      if (needsQuotes) {
        // Escape single quotes in tab name (double them)
        const escapedTabName = trimmedTabName.replace(/'/g, "''");
        fullRange = `'${escapedTabName}'!${requestedRange}`;
      } else {
        // Simple tab name without spaces - no quotes needed
        fullRange = `${trimmedTabName}!${requestedRange}`;
      }
    } else {
      fullRange = requestedRange;
    }
    
    console.log(`Fetching Google Sheets data: ${spreadsheetId}, range: ${fullRange}`);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(fullRange)}?key=${apiKey}`;
    
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
      
      console.error('[fetch-google-sheets] Google Sheets API error:', {
        status: response.status,
        statusText: response.statusText,
        message: errorMessage,
        details: errorDetails,
        url: url.replace(apiKey, 'REDACTED')
      });
      
      throw new Error(`Google Sheets API error (${response.status}): ${errorMessage}`);
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
    console.error('Error in fetch-google-sheets:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
