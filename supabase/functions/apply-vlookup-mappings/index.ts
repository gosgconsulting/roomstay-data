import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

interface DimensionMappingRow {
  source_dimension_id: string;
  source_value: string;
  target_dimension_id: string;
  target_dimension_name: string;
  target_value: string;
}

/**
 * Gets an existing dimension or creates it if it doesn't exist
 */
async function getOrCreateTargetDimension(
  supabase: any,
  targetDimensionId: string,
  targetDimensionName: string,
  userId: string,
  reportId: string | null,
  accountId: string | null
): Promise<{ name: string; type: string; id: string } | null> {
  // First, try to fetch existing dimension by ID
  const { data: existingById } = await supabase
    .from('dimensions')
    .select('id, name, type')
    .eq('id', targetDimensionId)
    .maybeSingle();

  if (existingById) {
    console.log(`[VLOOKUP-APPLY] Found existing target dimension: ${existingById.name} (${existingById.id})`);
    return existingById;
  }

  // If not found by ID and we have a name, try to find by name and scope
  if (targetDimensionName) {
    let query = supabase
      .from('dimensions')
      .select('id, name, type')
      .eq('name', targetDimensionName);
    
    if (accountId) {
      query = query.eq('scope', 'account').eq('account_id', accountId);
    } else if (reportId) {
      query = query.eq('scope', 'custom').eq('report_id', reportId);
    }

    const { data: existingByName } = await query.maybeSingle();

    if (existingByName) {
      console.log(`[VLOOKUP-APPLY] Found existing dimension by name: ${existingByName.name} (${existingByName.id})`);
      
      // Update mappings to use the correct ID
      await supabase
        .from('dimension_mappings')
        .update({ target_dimension_id: existingByName.id })
        .eq('target_dimension_id', targetDimensionId)
        .eq('target_dimension_name', targetDimensionName);
      
      return existingByName;
    }
  }

  // Dimension doesn't exist - create it
  if (!targetDimensionName) {
    console.error(`[VLOOKUP-APPLY] Cannot create dimension without a name`);
    return null;
  }

  console.log(`[VLOOKUP-APPLY] Creating new dimension: ${targetDimensionName}`);
  
  const scope = accountId ? 'account' : 'custom';
  const dimensionData: any = {
    user_id: userId,
    name: targetDimensionName,
    type: 'text',
    scope: scope,
  };

  if (accountId) {
    dimensionData.account_id = accountId;
  } else if (reportId) {
    dimensionData.report_id = reportId;
  }

  const { data: newDim, error: createError } = await supabase
    .from('dimensions')
    .insert(dimensionData)
    .select('id, name, type')
    .single();

  if (createError) {
    console.error(`[VLOOKUP-APPLY] Failed to create dimension:`, createError);
    return null;
  }

  // Update all mappings to use the new dimension ID
  await supabase
    .from('dimension_mappings')
    .update({ target_dimension_id: newDim.id })
    .eq('target_dimension_id', targetDimensionId)
    .eq('target_dimension_name', targetDimensionName);

  console.log(`[VLOOKUP-APPLY] Created new ${scope} dimension: ${newDim.name} (${newDim.id})`);
  return newDim;
}

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
    console.log('[VLOOKUP-APPLY] Getting environment variables');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[VLOOKUP-APPLY] Missing environment variables:', { 
        hasUrl: !!supabaseUrl, 
        hasKey: !!supabaseKey 
      });
      throw new Error('Missing required environment variables');
    }
    
    console.log('[VLOOKUP-APPLY] Creating Supabase client with service role');
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[VLOOKUP-APPLY] Parsing request body');
    let body;
    try {
      body = await req.json();
      console.log('[VLOOKUP-APPLY] Request body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[VLOOKUP-APPLY] Failed to parse request body:', parseError);
      throw new Error('Invalid request body: ' + (parseError instanceof Error ? parseError.message : 'Unknown error'));
    }
    
    const { reportId, accountId } = body;

    if (!reportId && !accountId) {
      console.error('[VLOOKUP-APPLY] Missing reportId or accountId');
      throw new Error('Either reportId or accountId is required');
    }

    console.log(`[VLOOKUP-APPLY] Validating vlookup mappings for report: ${reportId}, account: ${accountId}`);

    // Get user_id from the report or account
    let userId: string | null = null;
    
    if (reportId) {
      const { data: report } = await supabase
        .from('reports')
        .select('user_id')
        .eq('id', reportId)
        .single();
      userId = report?.user_id || null;
    } else if (accountId) {
      const { data: account } = await supabase
        .from('accounts')
        .select('user_id')
        .eq('id', accountId)
        .single();
      userId = account?.user_id || null;
    }

    if (!userId) {
      console.error('[VLOOKUP-APPLY] Could not find user_id from report or account');
      throw new Error('Could not determine user_id');
    }

    console.log(`[VLOOKUP-APPLY] Found user_id: ${userId}`);

    // Load vlookup mappings
    let mappingsQuery = supabase
      .from('dimension_mappings')
      .select('*')
      .eq('user_id', userId);

    if (reportId) {
      mappingsQuery = mappingsQuery.eq('report_id', reportId);
    } else if (accountId) {
      mappingsQuery = mappingsQuery.eq('account_id', accountId);
    }

    const { data: mappings, error: mappingsError } = await mappingsQuery;
    if (mappingsError) {
      console.error('[VLOOKUP-APPLY] Error loading mappings:', mappingsError);
      throw mappingsError;
    }

    if (!mappings || mappings.length === 0) {
      console.log('[VLOOKUP-APPLY] No mappings found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No mappings configured',
          mappingsCount: 0,
          note: 'Vlookup mappings work like tags/categories and are applied dynamically when filtering and displaying data.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[VLOOKUP-APPLY] Found ${mappings.length} mappings to validate`);
    
    // Validate that all mappings have source_dimension_id
    const invalidMappings = mappings.filter((m: DimensionMappingRow) => !m.source_dimension_id);
    if (invalidMappings.length > 0) {
      console.error('[VLOOKUP-APPLY] Found mappings without source_dimension_id:', invalidMappings);
      throw new Error(`${invalidMappings.length} mappings are missing source_dimension_id. Please update your mappings.`);
    }

    // Collect unique target dimensions that need to exist
    const uniqueTargetDims = new Map<string, { id: string; name: string }>();
    for (const mapping of mappings as DimensionMappingRow[]) {
      if (!uniqueTargetDims.has(mapping.target_dimension_id)) {
        uniqueTargetDims.set(mapping.target_dimension_id, {
          id: mapping.target_dimension_id,
          name: mapping.target_dimension_name
        });
      }
    }

    console.log(`[VLOOKUP-APPLY] Validating ${uniqueTargetDims.size} unique target dimensions`);

    // Ensure target dimensions exist (create them if needed)
    let dimensionsCreated = 0;
    let dimensionsValidated = 0;
    
    for (const [targetId, targetInfo] of uniqueTargetDims) {
      const targetDim = await getOrCreateTargetDimension(
        supabase,
        targetId,
        targetInfo.name,
        userId,
        reportId,
        accountId
      );
      
      if (targetDim) {
        if (targetDim.id !== targetId) {
          dimensionsCreated++;
        } else {
          dimensionsValidated++;
        }
      }
    }

    console.log(`[VLOOKUP-APPLY] Validation complete - ${dimensionsValidated} validated, ${dimensionsCreated} created`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Vlookup mappings are ready and will be applied dynamically',
        mappingsCount: mappings.length,
        dimensionsValidated: uniqueTargetDims.size,
        dimensionsCreated,
        note: 'Mappings work like tags/categories - they are applied on-the-fly when filtering and displaying data. No database updates needed, making data syncing much faster!'
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
