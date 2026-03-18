/**
 * Dimension mapping and auto-detection functions
 *
 * Precedence (canonical, aligned with frontend src/lib/dimensionLoader.ts):
 * 1. Account-specific dimensions
 * 2. Custom dimensions (user/report)
 * 3. Global dimensions
 *
 * @module dimensions
 */

import type { ColumnMapping } from './types.ts';

/**
 * Resolves a dimension name to its ID based on account context
 * 
 * Searches for dimensions in priority order:
 * 1. Account-specific dimensions (if accountId provided)
 * 2. Custom dimensions (user/report specific)
 * 3. Global dimensions
 * 
 * @param {any} supabase - Supabase client instance
 * @param {string | null | undefined} dimensionName - Name of the dimension to resolve
 * @param {string | null | undefined} accountId - Account ID for account-specific dimensions
 * @param {string} reportId - Report ID for custom dimensions
 * @param {string} userId - User ID for custom dimensions
 * 
 * @returns {Promise<string | null>} Dimension ID or null if not found
 * 
 * @example
 * const dimensionId = await resolveDimensionNameToId(
 *   supabase,
 *   'Revenue',
 *   'account-uuid',
 *   'report-uuid',
 *   'user-uuid'
 * );
 */
export const resolveDimensionNameToId = async (
  supabase: any,
  dimensionName: string | null | undefined,
  accountId: string | null | undefined,
  reportId: string,
  userId: string
): Promise<string | null> => {
  if (!dimensionName || dimensionName === 'none' || dimensionName === 'create_new') {
    return null;
  }

  // If accountId is provided, prioritize account-specific dimensions
  if (accountId) {
    // First try account-specific
    const { data: accountDim, error: accountError } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'account')
      .eq('account_id', accountId)
      .maybeSingle();

    if (!accountError && accountDim) {
      console.log(`[RESYNC] Resolved dimension "${dimensionName}" to account-specific ID: ${accountDim.id}`);
      return accountDim.id;
    }

    // Then try custom dimensions for this user/report
    const { data: customDim, error: customError } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'custom')
      .eq('user_id', userId)
      .or(`report_id.eq.${reportId},report_id.is.null`)
      .maybeSingle();

    if (!customError && customDim) {
      console.log(`[RESYNC] Resolved dimension "${dimensionName}" to custom ID: ${customDim.id}`);
      return customDim.id;
    }

    // Finally try global (but only if no account-specific or custom found)
    const { data: globalDim, error: globalError } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'global')
      .maybeSingle();

    if (!globalError && globalDim) {
      console.log(`[RESYNC] Resolved dimension "${dimensionName}" to global ID: ${globalDim.id}`);
      return globalDim.id;
    }
  } else {
    // No accountId: try custom first, then global
    const { data: customDim, error: customError } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'custom')
      .eq('user_id', userId)
      .or(`report_id.eq.${reportId},report_id.is.null`)
      .maybeSingle();

    if (!customError && customDim) {
      console.log(`[RESYNC] Resolved dimension "${dimensionName}" to custom ID: ${customDim.id}`);
      return customDim.id;
    }

    const { data: globalDim, error: globalError } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'global')
      .maybeSingle();

    if (!globalError && globalDim) {
      console.log(`[RESYNC] Resolved dimension "${dimensionName}" to global ID: ${globalDim.id}`);
      return globalDim.id;
    }
  }

  console.warn(`[RESYNC] Could not resolve dimension name "${dimensionName}" to any ID`);
  return null;
};

/**
 * Creates a new dimension or returns existing one
 * 
 * If newDimensionName is provided, creates a custom dimension.
 * Otherwise, resolves existing dimension by name or ID.
 * 
 * @param {any} supabase - Supabase client instance
 * @param {ColumnMapping} mapping - Column mapping configuration
 * @param {string} userId - User ID for dimension creation
 * @param {string} reportId - Report ID for dimension creation
 * @param {string} dataSourceId - Data source ID
 * @param {string | null} [accountId] - Optional account ID
 * 
 * @returns {Promise<string | null>} Dimension ID or null
 * 
 * @throws {Error} If dimension creation fails
 * 
 * @example
 * const dimensionId = await createOrGetDimension(
 *   supabase,
 *   mapping,
 *   'user-uuid',
 *   'report-uuid',
 *   'data-source-uuid',
 *   'account-uuid'
 * );
 */
export const createOrGetDimension = async (
  supabase: any,
  mapping: ColumnMapping,
  userId: string,
  reportId: string,
  dataSourceId: string,
  accountId?: string | null
): Promise<string | null> => {
  // If creating a new dimension
  if (mapping.newDimensionName) {
    const dimensionName = mapping.newDimensionName;
    const dimensionType = mapping.newDimensionType || mapping.dimensionType || 'text';
    
    console.log(`[RESYNC] Creating/checking custom dimension: ${dimensionName} (${dimensionType})`);
    
    // Check if a dimension with this name already exists for this report
    const { data: existingDim, error: checkError } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('report_id', reportId)
      .eq('scope', 'custom')
      .maybeSingle();

    if (checkError) {
      console.error(`[RESYNC] Error checking existing dimension:`, checkError);
      throw checkError;
    }

    if (existingDim) {
      console.log(`[RESYNC] Using existing dimension ${dimensionName} with ID: ${existingDim.id}`);
      return existingDim.id;
    }

    // Create new dimension
    const { data: newDimension, error: createError } = await supabase
      .from('dimensions')
      .insert({
        user_id: userId,
        report_id: reportId,
        data_source_id: dataSourceId,
        name: dimensionName,
        type: dimensionType,
        scope: 'custom',
      })
      .select()
      .single();

    if (createError) {
      console.error(`[RESYNC] Error creating dimension ${dimensionName}:`, createError);
      throw createError;
    }
    
    console.log(`[RESYNC] Created new dimension ${dimensionName} with ID: ${newDimension.id}`);
    return newDimension.id;
  }

  // If dimensionName is provided, resolve it to ID
  if (mapping.dimensionName) {
    return await resolveDimensionNameToId(supabase, mapping.dimensionName, accountId || null, reportId, userId);
  }

  // Fallback to dimensionId for backward compatibility
  if (mapping.dimensionId && mapping.dimensionId !== 'none' && mapping.dimensionId !== 'create_new') {
    return mapping.dimensionId;
  }

  return null;
};

/**
 * Auto-detects column data type and format from sample values
 * 
 * Analyzes sample values to determine the most likely type:
 * - date: If >=70% of values match date patterns
 * - currency: If >=70% contain currency symbols
 * - percentage: If >=70% contain % symbol
 * - number: If >=70% are numeric
 * - text: Default fallback
 * 
 * @param {any[]} sampleValues - Array of sample values from the column
 * @returns {{ type: string; dateFormat?: string }} Detected type and optional date format
 * 
 * @example
 * const detected = autoDetectColumnType(['$100', '$200', '$300']);
 * // Returns: { type: 'currency' }
 * 
 * @example
 * const detected = autoDetectColumnType(['2023-01-01', '2023-01-02']);
 * // Returns: { type: 'date', dateFormat: 'yyyy-mm-dd' }
 */
export const autoDetectColumnType = (sampleValues: any[]): { type: string; dateFormat?: string } => {
  const nonEmptyValues = sampleValues.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmptyValues.length === 0) return { type: 'text' };

  // Use the same capped sample for both counting and threshold calculation
  const sample = nonEmptyValues.slice(0, 10);
  
  let dateCount = 0;
  let currencyCount = 0;
  let percentageCount = 0;
  let numberCount = 0;
  
  for (const value of sample) {
    const stringValue = String(value).trim();
    
    // Check for date patterns
    if (stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateCount++;
    } else if (stringValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
      dateCount++;
    } else if (stringValue.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
      dateCount++;
    }
    // Check for currency patterns
    const currencySymbolsRegex = /[$€£¥₹₽¢₩₦₨₫₪₭₮₯₰₱₲₳₴₵₶₷₸₹₺₻₼₽₾₿]/g;
    if (currencySymbolsRegex.test(stringValue) || stringValue.includes('$')) {
      currencyCount++;
    }
    // Check for percentage patterns
    else if (stringValue.includes('%')) {
      percentageCount++;
    }
    // Check for number patterns
    else if (!isNaN(parseFloat(stringValue.replace(/[,\s]/g, '')))) {
      numberCount++;
    }
  }
  
  const total = sample.length;
  
  // Determine type based on majority (>= 70% threshold)
  if (dateCount / total >= 0.7) {
    // Determine date format
    const firstDateValue = nonEmptyValues.find(v => {
      const s = String(v).trim();
      return s.match(/^\d{4}-\d{2}-\d{2}$/) || s.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/) || s.match(/^\d{1,2}-\d{1,2}-\d{4}$/);
    });
    
    if (firstDateValue) {
      const s = String(firstDateValue).trim();
      if (s.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return { type: 'date', dateFormat: 'yyyy-mm-dd' };
      } else if (s.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        return { type: 'date', dateFormat: 'mm-dd-yyyy' };
      } else if (s.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
        return { type: 'date', dateFormat: 'dd-mm-yyyy' };
      }
    }
    return { type: 'date', dateFormat: 'yyyy-mm-dd' };
  }
  
  if (currencyCount / total >= 0.7) {
    return { type: 'currency' };
  }
  
  if (percentageCount / total >= 0.7) {
    return { type: 'percentage' };
  }
  
  if (numberCount / total >= 0.7) {
    return { type: 'number' };
  }
  
  return { type: 'text' };
};

/**
 * Builds dimension mapping with auto-detection of column types
 * 
 * Maps columns to dimensions by:
 * 1. Finding column indices in headers (case-insensitive)
 * 2. Auto-detecting column types from sample data
 * 3. Resolving or creating dimensions based on mappings
 * 4. Handling account context for dimension resolution
 * 
 * @param {any} supabase - Supabase client instance
 * @param {ColumnMapping[]} mappings - Column mapping configurations
 * @param {string[]} headers - Array of header names from Google Sheets
 * @param {any[][]} sampleDataRows - Sample data rows for auto-detection (first 10 rows)
 * @param {string} userId - User ID for dimension creation
 * @param {string} reportId - Report ID
 * @param {string} dataSourceId - Data source ID
 * @param {boolean} [recreateDimensions=false] - Whether to recreate dimensions
 * @param {string | null} [accountId] - Optional account ID for account-specific dimensions
 * 
 * @returns {Promise<{ dimensionIdMap: Record<string, string>; columnIndexMap: Record<string, number>; createdCount: number }>}
 *   - dimensionIdMap: Map of column names to dimension IDs
 *   - columnIndexMap: Map of column names to column indices
 *   - createdCount: Number of new dimensions created
 * 
 * @example
 * const { dimensionIdMap, columnIndexMap, createdCount } = await buildDimensionMappingWithAutoDetection(
 *   supabase,
 *   mappings,
 *   ['Revenue', 'Date', 'Status'],
 *   sampleRows,
 *   'user-uuid',
 *   'report-uuid',
 *   'data-source-uuid',
 *   true,
 *   'account-uuid'
 * );
 */
export const buildDimensionMappingWithAutoDetection = async (
  supabase: any,
  mappings: ColumnMapping[],
  headers: string[],
  sampleDataRows: any[][],
  userId: string,
  reportId: string,
  dataSourceId: string,
  recreateDimensions: boolean = false,
  accountId?: string | null
): Promise<{ dimensionIdMap: Record<string, string>; columnIndexMap: Record<string, number>; createdCount: number }> => {
  const dimensionIdMap: Record<string, string> = {};
  const columnIndexMap: Record<string, number> = {};
  const visibleMappings = mappings.filter(m => m.visible);
  let createdCount = 0;
  
  console.log(`[RESYNC] Processing ${visibleMappings.length} visible column mappings with auto-detection`);
  
  // Create normalized header map for case-insensitive matching
  const normalizedHeaderMap = new Map<string, number>();
  headers.forEach((header: string, index: number) => {
    if (header && header.trim()) {
      const normalized = header.trim().toLowerCase();
      if (!normalizedHeaderMap.has(normalized)) {
        normalizedHeaderMap.set(normalized, index);
      }
    }
  });

  // Process each mapping with auto-detection
  for (const mapping of visibleMappings) {
    // Find column index
    let colIndex = headers.indexOf(mapping.column);
    if (colIndex === -1) {
      const normalizedMappingCol = mapping.column.trim().toLowerCase();
      colIndex = normalizedHeaderMap.get(normalizedMappingCol) ?? -1;
    }
    
    if (colIndex !== -1) {
      // Get sample values for this column
      const sampleValues = sampleDataRows.map(row => row && row[colIndex]).filter(v => v !== null && v !== undefined);
      
      // Auto-detect type if not properly set or if it's create_new
      const finalMapping = { ...mapping };
      if (mapping.dimensionId === 'create_new' || !mapping.dimensionType || mapping.dimensionType === 'text') {
        const detected = autoDetectColumnType(sampleValues);
        console.log(`[RESYNC] Auto-detected type for column "${mapping.column}": ${detected.type}${detected.dateFormat ? ` (${detected.dateFormat})` : ''}`);
        
        finalMapping.newDimensionType = detected.type;
        finalMapping.dimensionType = detected.type;
        if (detected.dateFormat) {
          finalMapping.dateFormat = detected.dateFormat;
        }
      }
      
      // Helper function to get dimension name from mapping
      const getDimensionName = async (m: ColumnMapping): Promise<string | null> => {
        // If dimensionName is already set, use it
        if (m.dimensionName) {
          return m.dimensionName;
        }

        // If dimensionId is set and not a special value, look up the name
        if (m.dimensionId && m.dimensionId !== 'none' && m.dimensionId !== 'create_new') {
          const { data: dimension, error } = await supabase
            .from('dimensions')
            .select('name')
            .eq('id', m.dimensionId)
            .maybeSingle();

          if (!error && dimension) {
            return dimension.name;
          }
        }

        return null;
      };

      // Get dimension name (either from mapping or by looking up dimensionId)
      const dimensionName = await getDimensionName(finalMapping);
      
      // If we have a dimension name, resolve it to ID; otherwise try createOrGetDimension
      let dimensionId: string | null = null;
      if (dimensionName) {
        // Resolve dimension name to ID based on account context
        dimensionId = await resolveDimensionNameToId(supabase, dimensionName, accountId || null, reportId, userId);
      } else if (finalMapping.newDimensionName) {
        // Creating a new dimension
        dimensionId = await createOrGetDimension(supabase, finalMapping, userId, reportId, dataSourceId, accountId);
      }
      
      if (dimensionId) {
        dimensionIdMap[mapping.column] = dimensionId;
        columnIndexMap[mapping.column] = colIndex;
        
        // Count if it was a newly created dimension
        if (mapping.dimensionId === 'create_new' || mapping.newDimensionName) {
          createdCount++;
        }
      }
    }
  }
  
  console.log(`[RESYNC] Successfully mapped ${Object.keys(dimensionIdMap).length} columns to dimensions`);
  return { dimensionIdMap, columnIndexMap, createdCount };
};

