import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

interface VlookupMapping {
  source_dimension_id: string;
  source_value: string;
  target_dimension_id: string;
  target_value: string;
}

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

    console.log(`[VLOOKUP-APPLY] Starting to apply mappings for report: ${reportId}, account: ${accountId}`);

    // Use service role - no need for user authentication since this is called from backend
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
        JSON.stringify({ success: true, message: 'No mappings to apply', rowsUpdated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[VLOOKUP-APPLY] Found ${mappings.length} mappings to apply`);
    
    // Validate that all mappings have source_dimension_id
    const invalidMappings = mappings.filter((m: DimensionMappingRow) => !m.source_dimension_id);
    if (invalidMappings.length > 0) {
      console.error('[VLOOKUP-APPLY] Found mappings without source_dimension_id:', invalidMappings);
      throw new Error(`${invalidMappings.length} mappings are missing source_dimension_id. Please update your mappings.`);
    }

    // Group mappings by source and target dimension pair
    const mappingsByDimensionPair = new Map<string, DimensionMappingRow[]>();
    for (const mapping of mappings as DimensionMappingRow[]) {
      const key = `${mapping.source_dimension_id}:${mapping.target_dimension_id}`;
      if (!mappingsByDimensionPair.has(key)) {
        mappingsByDimensionPair.set(key, []);
      }
      mappingsByDimensionPair.get(key)!.push(mapping);
    }

    console.log(`[VLOOKUP-APPLY] Processing ${mappingsByDimensionPair.size} dimension pairs`);

    let totalUpdated = 0;

    // Process each source-target dimension pair
    for (const [key, pairMappings] of mappingsByDimensionPair.entries()) {
      const [sourceDimId, targetDimId] = key.split(':');
      const targetDimName = pairMappings[0]?.target_dimension_name || '';
      console.log(`[VLOOKUP-APPLY] Processing dimension pair: ${sourceDimId} -> ${targetDimId} (${targetDimName}) with ${pairMappings.length} mappings`);

      // Get source dimension details
      const { data: sourceDim, error: sourceDimError } = await supabase
        .from('dimensions')
        .select('name, type')
        .eq('id', sourceDimId)
        .single();

      if (sourceDimError || !sourceDim) {
        console.error(`[VLOOKUP-APPLY] Source dimension ${sourceDimId} not found:`, sourceDimError);
        continue;
      }

      // Get or create target dimension
      const targetDim = await getOrCreateTargetDimension(
        supabase,
        targetDimId,
        targetDimName,
        userId,
        reportId,
        accountId
      );

      if (!targetDim) {
        console.error(`[VLOOKUP-APPLY] Failed to get or create target dimension ${targetDimId}`);
        continue;
      }

      console.log(`[VLOOKUP-APPLY] Source: ${sourceDim.name} (${sourceDimId}), Target: ${targetDim.name} (${targetDim.id})`);

      // Load all dimension_data rows that have values for the source dimension
      const queryBuilder = supabase
        .from('dimension_data')
        .select('id, dimension_values');
      
      if (reportId) {
        queryBuilder.eq('report_id', reportId);
      }

      const { data: dimensionDataRows, error: dataError } = await queryBuilder;

      if (dataError) {
        console.error('[VLOOKUP-APPLY] Error loading dimension_data:', dataError);
        throw dataError;
      }

      if (!dimensionDataRows || dimensionDataRows.length === 0) {
        console.log('[VLOOKUP-APPLY] No dimension_data rows found');
        continue;
      }

      // Filter rows that have the source dimension
      const relevantRows = dimensionDataRows.filter((row: any) => 
        row.dimension_values && row.dimension_values[sourceDimId] !== undefined
      );

      console.log(`[VLOOKUP-APPLY] Found ${relevantRows.length} rows with source dimension`);

      // Create a lookup map for efficient matching (case-insensitive)
      const lookupMap = new Map<string, string>();
      for (const mapping of pairMappings) {
        const normalizedSource = mapping.source_value.toLowerCase().trim();
        lookupMap.set(normalizedSource, mapping.target_value);
      }

      // Process rows in batches
      const BATCH_SIZE = 100;
      const updates: Array<{ id: string; dimension_values: any }> = [];

      for (const row of relevantRows) {
        const sourceValue = row.dimension_values[sourceDimId];
        if (!sourceValue) continue;

        const normalizedValue = sourceValue.toString().toLowerCase().trim();
        const targetValue = lookupMap.get(normalizedValue);

        if (targetValue) {
          // Create updated dimension_values with the target dimension value
          const updatedValues = { ...row.dimension_values };
          updatedValues[targetDim.id] = targetValue;

          updates.push({
            id: row.id,
            dimension_values: updatedValues
          });
        }

        // Update in batches
        if (updates.length >= BATCH_SIZE) {
          console.log(`[VLOOKUP-APPLY] Updating batch of ${updates.length} rows`);
          for (const update of updates) {
            const { error: updateError } = await supabase
              .from('dimension_data')
              .update({ dimension_values: update.dimension_values })
              .eq('id', update.id);

            if (updateError) {
              console.error(`[VLOOKUP-APPLY] Error updating row ${update.id}:`, updateError);
            } else {
              totalUpdated++;
            }
          }
          updates.length = 0; // Clear the batch
        }
      }

      // Update remaining rows
      if (updates.length > 0) {
        console.log(`[VLOOKUP-APPLY] Updating final batch of ${updates.length} rows`);
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('dimension_data')
            .update({ dimension_values: update.dimension_values })
            .eq('id', update.id);

          if (updateError) {
            console.error(`[VLOOKUP-APPLY] Error updating row ${update.id}:`, updateError);
          } else {
            totalUpdated++;
          }
        }
      }

      console.log(`[VLOOKUP-APPLY] Completed processing dimension pair. Updated ${totalUpdated} rows so far.`);
    }

    console.log(`[VLOOKUP-APPLY] Vlookup application complete. Total rows updated: ${totalUpdated}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Applied vlookup mappings to ${totalUpdated} rows`,
        rowsUpdated: totalUpdated
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[VLOOKUP-APPLY] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = error instanceof Error ? error.stack : JSON.stringify(error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        details: errorDetails
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
