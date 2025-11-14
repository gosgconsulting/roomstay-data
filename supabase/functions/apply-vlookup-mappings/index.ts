import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VlookupMapping {
  source_dimension_id: string;
  source_value: string;
  target_dimension_id: string;
  target_value: string;
}

Deno.serve(async (req) => {
  console.log('[VLOOKUP-APPLY] Function invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('[VLOOKUP-APPLY] Creating Supabase client with service role');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log('[VLOOKUP-APPLY] Request body:', JSON.stringify(body));
    
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

    // Group mappings by source and target dimension pair
    const mappingsByDimensionPair = new Map<string, VlookupMapping[]>();
    for (const mapping of mappings) {
      const key = `${mapping.source_dimension_id}:${mapping.target_dimension_id}`;
      if (!mappingsByDimensionPair.has(key)) {
        mappingsByDimensionPair.set(key, []);
      }
      mappingsByDimensionPair.get(key)!.push({
        source_dimension_id: mapping.source_dimension_id,
        source_value: mapping.source_value,
        target_dimension_id: mapping.target_dimension_id,
        target_value: mapping.target_value,
      });
    }

    // For each dimension pair, apply mappings
    let totalRowsUpdated = 0;

    for (const [dimensionPairKey, dimMappings] of mappingsByDimensionPair.entries()) {
      const [sourceDimensionId, targetDimensionId] = dimensionPairKey.split(':');
      console.log(`[VLOOKUP-APPLY] Processing ${dimMappings.length} mappings from ${sourceDimensionId} to ${targetDimensionId}`);

      // Get target dimension details
      const { data: targetDimension, error: targetDimError } = await supabase
        .from('dimensions')
        .select('name, type')
        .eq('id', targetDimensionId)
        .single();

      if (targetDimError || !targetDimension) {
        console.error(`[VLOOKUP-APPLY] Could not find target dimension ${targetDimensionId}`);
        continue;
      }

      console.log(`[VLOOKUP-APPLY] Target dimension: ${targetDimension.name} (${targetDimension.type})`);

      // Load dimension_data rows for this report only
      let dataQuery = supabase
        .from('dimension_data')
        .select('id, dimension_values');

      if (reportId) {
        dataQuery = dataQuery.eq('report_id', reportId);
      } else if (accountId) {
        // Get all reports for this account
        const { data: reports } = await supabase
          .from('reports')
          .select('id')
          .eq('account_id', accountId);
        
        if (reports && reports.length > 0) {
          const reportIds = reports.map(r => r.id);
          dataQuery = dataQuery.in('report_id', reportIds);
        }
      }

      const { data: dimensionDataRows, error: dataError } = await dataQuery;
      if (dataError) {
        console.error('[VLOOKUP-APPLY] Error loading dimension_data:', dataError);
        continue;
      }

      if (!dimensionDataRows || dimensionDataRows.length === 0) {
        console.log('[VLOOKUP-APPLY] No dimension_data rows found');
        continue;
      }

      console.log(`[VLOOKUP-APPLY] Processing ${dimensionDataRows.length} dimension_data rows using source dimension: ${sourceDimensionId}`);

      // Create a lookup map for fast matching
      const lookupMap = new Map<string, string>();
      for (const mapping of dimMappings) {
        lookupMap.set(mapping.source_value.toLowerCase().trim(), mapping.target_value);
      }

      // Process rows in batches
      const batchSize = 500;
      let updatedCount = 0;

      for (let i = 0; i < dimensionDataRows.length; i += batchSize) {
        const batch = dimensionDataRows.slice(i, i + batchSize);
        const updates = [];

        for (const row of batch) {
          const dimensionValues = row.dimension_values as Record<string, any>;
          const sourceValue = dimensionValues[sourceDimensionId];

          if (sourceValue) {
            const normalizedSource = String(sourceValue).toLowerCase().trim();
            const targetValue = lookupMap.get(normalizedSource);

            if (targetValue) {
              // Inject or update the target dimension
              const updatedValues = {
                ...dimensionValues,
                [targetDimensionId]: targetValue,
              };

              updates.push({
                id: row.id,
                dimension_values: updatedValues,
              });
            }
          }
        }

        // Batch update
        if (updates.length > 0) {
          for (const update of updates) {
            const { error: updateError } = await supabase
              .from('dimension_data')
              .update({ dimension_values: update.dimension_values })
              .eq('id', update.id);

            if (updateError) {
              console.error(`[VLOOKUP-APPLY] Error updating row ${update.id}:`, updateError);
            } else {
              updatedCount++;
            }
          }

          console.log(`[VLOOKUP-APPLY] Updated batch of ${updates.length} rows`);
        }
      }

      totalRowsUpdated += updatedCount;
      console.log(`[VLOOKUP-APPLY] Updated ${updatedCount} rows for target dimension ${targetDimension.name}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Applied vlookup mappings to ${totalRowsUpdated} rows`,
        rowsUpdated: totalRowsUpdated 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[VLOOKUP-APPLY] Error:', errorMessage);
    console.error('[VLOOKUP-APPLY] Stack:', errorStack);
    console.error('[VLOOKUP-APPLY] Full error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        details: errorStack
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

