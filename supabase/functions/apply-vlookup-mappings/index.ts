// @deno-types="https://deno.land/x/supabase_functions@v1.0.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  console.log('[VLOOKUP-APPLY] Function invoked');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('[VLOOKUP-APPLY] Handling OPTIONS preflight request');
    return new Response('ok', { 
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Length': '2'
      }
    });
  }

  try {
    console.log('[VLOOKUP-APPLY] Parsing request body');
    const body = await req.json();
    const { reportId, accountId } = body;

    console.log(`[VLOOKUP-APPLY] Vlookup mappings configured for ${reportId ? 'report: ' + reportId : 'account: ' + accountId}`);

    // Mappings are now applied client-side during data loading
    // This function just confirms the mappings are saved
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Vlookup mappings saved successfully',
        note: 'Mappings are applied automatically when data loads in the performance table, KPI cards, and charts.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[VLOOKUP-APPLY] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});