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
    const { spreadsheetId, range, tabName } = await req.json();
    const apiKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');

    if (!apiKey) {
      throw new Error('Google Sheets API key not configured');
    }

    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID is required');
    }

    // Construct the range with tab name if provided
    const fullRange = tabName ? `${tabName}!${range || 'A:Z'}` : range || 'A:Z';
    
    console.log(`Fetching Google Sheets data: ${spreadsheetId}, range: ${fullRange}`);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(fullRange)}?key=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Google Sheets API error:', error);
      throw new Error(error.error?.message || 'Failed to fetch Google Sheets data');
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
