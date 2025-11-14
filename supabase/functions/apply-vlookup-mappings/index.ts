const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  console.log('[VLOOKUP-APPLY] Function invoked');
  // Handle CORS preflight requests immediately - MUST be first
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

    console.log(`[VLOOKUP-APPLY] Mappings are ready for ${reportId ? 'report: ' + reportId : 'account: ' + accountId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Vlookup mappings are configured and will be applied dynamically',
        note: 'Mappings work like tags/categories - they are applied on-the-fly when filtering and displaying data. No database updates needed!'
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
