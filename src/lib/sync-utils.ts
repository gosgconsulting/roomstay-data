import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Types
export interface DataSource {
  id: string;
  name: string;
  google_sheets_url?: string | null;
  spreadsheet_id?: string | null;
  tab_name?: string | null;
  csv_url?: string | null;
  source_type?: 'google_sheets' | 'csv_url';
  header_row: number;
  column_mappings: ColumnMapping[] | null;
  report_id?: string;
}

export interface ColumnMapping {
  column: string;
  dimensionId?: string | null; // Optional, kept for backward compatibility
  dimensionName?: string | null; // Primary identifier for mapping (stable across accounts)
  visible: boolean;
  newDimensionName?: string;
  newDimensionType?: string;
  dateFormat?: string;
  dimensionType?: string;
}

export interface SyncOptions {
  deleteExistingData?: boolean;
  recreateDimensions?: boolean;
  showProgress?: boolean;
  onProgress?: (message: string) => void;
}

export interface SyncResult {
  success: boolean;
  rowsProcessed: number;
  dimensionsCreated: number;
  error?: string;
}

// Utility functions
export const extractSpreadsheetId = (url: string): string | null => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

// Enhanced date parsing utility with auto-detection
export const parseDate = (value: any, dateFormat: string = 'auto-detect'): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  
  try {
    // If already a Date object, return it
    if (value instanceof Date) return value;
    
    // Auto-detect common date formats if no specific format provided
    if (dateFormat === 'auto-detect') {
      // Try YYYY-MM-DD format first (ISO format, most common in exports)
      if (stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const parts = stringValue.split('-');
        if (parts.length === 3) {
          const [year, month, day] = parts;
          // Use UTC to avoid timezone issues
          const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
          if (!isNaN(date.getTime())) {
            console.log(`[SYNC] Auto-detected YYYY-MM-DD format: ${stringValue} -> ${date.toISOString().split('T')[0]}`);
            return date;
          }
        }
      }
      
      // Try MM/DD/YYYY format
      if (stringValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const parts = stringValue.split('/');
        if (parts.length === 3) {
          const [month, day, year] = parts;
          // Use UTC to avoid timezone issues
          const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
          if (!isNaN(date.getTime())) {
            console.log(`[SYNC] Auto-detected MM/DD/YYYY format: ${stringValue} -> ${date.toISOString().split('T')[0]}`);
            return date;
          }
        }
      }
      
      // Try DD/MM/YYYY format
      if (stringValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const parts = stringValue.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          // Only try this if day > 12 (to distinguish from MM/DD/YYYY)
          if (parseInt(day) > 12) {
            // Use UTC to avoid timezone issues
            const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
            if (!isNaN(date.getTime())) {
              console.log(`[SYNC] Auto-detected DD/MM/YYYY format: ${stringValue} -> ${date.toISOString().split('T')[0]}`);
              return date;
            }
          }
        }
      }
    }
    
    // Handle ISO string with time
    if (stringValue.includes('T') || stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parsed = new Date(stringValue);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    
    // Handle Excel serial dates (numbers like 44927 for 2023-01-01)
    // Excel dates for 2000+ start at ~36526, so only consider values >= 30000
    // This prevents small numbers like "9" from being parsed as 1900-01-09
    const numValue = parseFloat(stringValue);
    if (!isNaN(numValue) && numValue >= 30000 && numValue < 100000) {
      // Excel serial date (days since 1900-01-01, but Excel treats 1900 as leap year)
      const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
      const date = new Date(excelEpoch.getTime() + numValue * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        console.log(`[SYNC] Parsed Excel serial date ${numValue} as ${date.toISOString().split('T')[0]}`);
        return date;
      }
    }
    
    // Handle year-only values (like "2023") - treat as January 1st of that year
    if (/^\d{4}$/.test(stringValue)) {
      const year = parseInt(stringValue);
      if (year >= 1900 && year <= 2100) {
        console.log(`[SYNC] Converting year-only value ${year} to ${year}-01-01`);
        // Use UTC to avoid timezone issues
        return new Date(Date.UTC(year, 0, 1)); // January 1st of that year
      }
    }
    
    // Parse based on specific format if provided
    if (dateFormat !== 'auto-detect') {
      let parts: string[] = [];
      if (dateFormat === 'yyyy-mm-dd') {
        // Try YYYY-MM-DD or YYYY/MM/DD
        parts = stringValue.split(/[-/]/);
        if (parts.length === 3 && parts[0].length === 4) {
          const [year, month, day] = parts;
          // Use UTC to avoid timezone issues
          return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        }
      } else if (dateFormat === 'dd-mm-yyyy') {
        // Try DD-MM-YYYY or DD/MM/YYYY
        parts = stringValue.split(/[-/]/);
        if (parts.length === 3 && parts[2].length === 4) {
          const [day, month, year] = parts;
          // Use UTC to avoid timezone issues
          return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        }
      } else if (dateFormat === 'mm-dd-yyyy') {
        // Try MM-DD-YYYY or MM/DD/YYYY
        parts = stringValue.split(/[-/]/);
        if (parts.length === 3 && parts[2].length === 4) {
          const [month, day, year] = parts;
          // Use UTC to avoid timezone issues
          return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        }
      }
    }
    
    // Fallback: try standard Date parsing
    const parsed = new Date(stringValue);
    if (!isNaN(parsed.getTime())) return parsed;
    
    return null;
  } catch (e) {
    console.warn(`Failed to parse date: ${stringValue} with format ${dateFormat}`, e);
    return null;
  }
};

// Enhanced value parsing utility with better format detection
export const parseValue = (value: any, dimensionType: string, dateFormat?: string): any => {
  if (value === null || value === undefined || value === '') return null;
  
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  
  // For date types, parse with enhanced detection
  if (dimensionType === 'date') {
    const parsedDate = parseDate(value, dateFormat || 'auto-detect');
    if (parsedDate) {
      // Return as ISO string for storage
      return parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    return null;
  }
  
  // For numeric types, enhanced cleaning and parsing
  if (dimensionType === 'number' || dimensionType === 'currency' || dimensionType === 'percentage') {
    // Handle percentage values (like "1.76%" or "1.76214537%")
    if (stringValue.includes('%')) {
      const percentValue = stringValue.replace(/[%,\s]/g, '');
      const numValue = parseFloat(percentValue);
      if (!isNaN(numValue)) {
        // Store percentage as decimal (1.76% -> 0.0176)
        return dimensionType === 'percentage' ? numValue / 100 : numValue;
      }
    }
    
    // Handle currency values (like "$1.64", "$16.47", "$33.10", "€123.45")
    // Check for common currency symbols: $, €, £, ¥, ₹, ₽, ₩, ₦, etc.
    // Also handle cases where currency symbol appears anywhere in the string
    // This handles both explicitly currency-typed dimensions AND number dimensions that contain currency formatting
    const currencySymbolsRegex = /[$€£¥₹₽¢₩₦₨₫₪₭₮₯₰₱₲₳₴₵₶₷₸₹₺₻₼₽₾₿]/g;
    const hasCurrencySymbol = currencySymbolsRegex.test(stringValue) || stringValue.includes('$');
    
    if (hasCurrencySymbol) {
      // Remove all currency symbols, commas, spaces, and other non-numeric characters except decimal point and minus sign
      const cleanedValue = stringValue
        .replace(currencySymbolsRegex, '') // Remove currency symbols
        .replace(/[,\s]/g, '') // Remove commas and spaces
        .replace(/[^\d.-]/g, ''); // Remove any other non-numeric characters except digits, dots, and minus
      
      const numValue = parseFloat(cleanedValue);
      if (!isNaN(numValue) && isFinite(numValue)) {
        console.log(`[SYNC] Parsed currency value: "${stringValue}" -> ${numValue}`);
        return numValue;
      }
    }
    
    // Handle regular numbers with commas (like "1,234.56")
    // Also handle negative numbers and decimals
    const cleanedValue = stringValue.replace(/[,\s]/g, '');
    const numValue = parseFloat(cleanedValue);
    if (!isNaN(numValue)) {
      return numValue;
    }
    
    return null;
  }
  
  // For other types, return as-is
  return value;
};

// Fetch data from Google Sheets
export const fetchGoogleSheetsData = async (
  spreadsheetId: string,
  tabName: string,
  range: string
): Promise<any[][]> => {
  console.log(`[SYNC] Fetching Google Sheets data:`, { spreadsheetId, tabName, range });
  
  const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
    body: {
      spreadsheetId,
      tabName,
      range,
    },
  });

  // Check for invocation error
  if (sheetsError) {
    console.error('[SYNC] Edge function invocation error:', sheetsError);
    throw new Error(`Failed to fetch Google Sheets data: ${sheetsError.message || JSON.stringify(sheetsError)}`);
  }

  // Check if edge function returned an error in the response body
  if (sheetsData?.error) {
    console.error('[SYNC] Edge function returned error:', sheetsData.error);
    throw new Error(`Google Sheets error: ${sheetsData.error}`);
  }

  // Check if we have data
  if (!sheetsData?.values || sheetsData.values.length === 0) {
    console.warn('[SYNC] No data found in range:', { spreadsheetId, tabName, range });
    throw new Error(`No data found in the specified range: ${tabName}!${range}`);
  }

  console.log(`[SYNC] Successfully fetched ${sheetsData.values.length} rows from Google Sheets`);
  return sheetsData.values;
};

// Fetch data from CSV URL
export const fetchCSVUrlData = async (
  csvUrl: string
): Promise<any[][]> => {
  console.log(`[SYNC] Fetching CSV URL data:`, { csvUrl });
  
  const { data: csvData, error: csvError } = await supabase.functions.invoke('fetch-csv-url', {
    body: {
      csvUrl,
    },
  });

  // Check for invocation error
  if (csvError) {
    console.error('[SYNC] Edge function invocation error:', csvError);
    throw new Error(`Failed to fetch CSV URL data: ${csvError.message || JSON.stringify(csvError)}`);
  }

  // Check if edge function returned an error in the response body
  if (csvData?.error) {
    console.error('[SYNC] Edge function returned error:', csvData.error);
    throw new Error(`CSV URL error: ${csvData.error}`);
  }

  // Check if we have data
  if (!csvData?.values || csvData.values.length === 0) {
    console.warn('[SYNC] No data found in CSV:', { csvUrl });
    throw new Error(`No data found in the CSV file`);
  }

  console.log(`[SYNC] Successfully fetched ${csvData.values.length} rows from CSV URL`);
  return csvData.values;
};

// Delete existing dimension data
export const deleteExistingData = async (dataSourceId: string): Promise<number> => {
  console.log(`[SYNC] Deleting existing dimension_data for data source: ${dataSourceId}`);
  
  let totalDeleted = 0;
  let continueDeleting = true;
  
  while (continueDeleting) {
    const { error: deleteError, count } = await supabase
      .from('dimension_data')
      .delete({ count: 'exact' })
      .eq('data_source_id', dataSourceId)
      .limit(5000);

    if (deleteError) throw deleteError;
    
    if (count !== null && count !== undefined) {
      totalDeleted += count;
      if (count < 5000) {
        continueDeleting = false;
      }
    } else {
      const { data: checkData, error: checkError } = await supabase
        .from('dimension_data')
        .select('id', { count: 'exact', head: true })
        .eq('data_source_id', dataSourceId)
        .limit(1);
      
      if (checkError) throw checkError;
      continueDeleting = checkData && checkData.length > 0;
    }
  }
  
  console.log(`[SYNC] Deleted ${totalDeleted} existing rows`);
  return totalDeleted;
};

// Delete custom dimensions created by data source
export const deleteCustomDimensions = async (dataSourceId: string): Promise<void> => {
  console.log(`[SYNC] Deleting custom dimensions for data source: ${dataSourceId}`);
  
  const { error: deleteDimensionsError } = await supabase
    .from('dimensions')
    .delete()
    .eq('data_source_id', dataSourceId)
    .eq('scope', 'custom');
  
  if (deleteDimensionsError) {
    console.warn(`[SYNC] Warning: Could not delete custom dimensions:`, deleteDimensionsError);
    // Don't throw error, continue with sync
  }
};

// Resolve dimension name to ID based on account context
export const resolveDimensionNameToId = async (
  dimensionName: string | null | undefined,
  accountId: string | null | undefined,
  reportId: string,
  userId: string
): Promise<string | null> => {
  if (!dimensionName || dimensionName === 'none' || dimensionName === 'create_new') {
    return null;
  }

  // Priority: account-specific > custom (user-specific) > global
  let query = supabase
    .from('dimensions')
    .select('id, scope, account_id')
    .eq('name', dimensionName)
    .order('created_at', { ascending: false });

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
      console.log(`[SYNC] Resolved dimension "${dimensionName}" to account-specific ID: ${accountDim.id}`);
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
      console.log(`[SYNC] Resolved dimension "${dimensionName}" to custom ID: ${customDim.id}`);
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
      console.log(`[SYNC] Resolved dimension "${dimensionName}" to global ID: ${globalDim.id}`);
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
      console.log(`[SYNC] Resolved dimension "${dimensionName}" to custom ID: ${customDim.id}`);
      return customDim.id;
    }

    const { data: globalDim, error: globalError } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'global')
      .maybeSingle();

    if (!globalError && globalDim) {
      console.log(`[SYNC] Resolved dimension "${dimensionName}" to global ID: ${globalDim.id}`);
      return globalDim.id;
    }
  }

  console.warn(`[SYNC] Could not resolve dimension name "${dimensionName}" to any ID`);
  return null;
};

// Create or get dimension
export const createOrGetDimension = async (
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
    
    console.log(`[SYNC] Creating/checking custom dimension: ${dimensionName} (${dimensionType})`);
    
    // Check if a dimension with this name already exists for this report
    const { data: existingDim, error: checkError } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('report_id', reportId)
      .eq('scope', 'custom')
      .maybeSingle();

    if (checkError) {
      console.error(`[SYNC] Error checking existing dimension:`, checkError);
      throw checkError;
    }

    if (existingDim) {
      console.log(`[SYNC] Using existing dimension ${dimensionName} with ID: ${existingDim.id}`);
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
      console.error(`[SYNC] Error creating dimension ${dimensionName}:`, createError);
      throw createError;
    }
    
    console.log(`[SYNC] Created new dimension ${dimensionName} with ID: ${newDimension.id}`);
    return newDimension.id;
  }

  // If dimensionName is provided, resolve it to ID
  if (mapping.dimensionName) {
    return await resolveDimensionNameToId(mapping.dimensionName, accountId || null, reportId, userId);
  }

  // Fallback to dimensionId for backward compatibility
  if (mapping.dimensionId && mapping.dimensionId !== 'none' && mapping.dimensionId !== 'create_new') {
    return mapping.dimensionId;
  }

  return null;
};

// Auto-detect data type and format from sample values
export const autoDetectColumnType = (sampleValues: any[]): { type: string; dateFormat?: string } => {
  const nonEmptyValues = sampleValues.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmptyValues.length === 0) return { type: 'text' };
  
  let dateCount = 0;
  let currencyCount = 0;
  let percentageCount = 0;
  let numberCount = 0;
  
  for (const value of nonEmptyValues.slice(0, 10)) { // Check first 10 non-empty values
    const stringValue = String(value).trim();
    
    // Check for date patterns
    if (stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateCount++;
    } else if (stringValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
      dateCount++;
    } else if (stringValue.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
      dateCount++;
    }
    // Check for currency patterns - look for currency symbols anywhere in the string
    // Match the same pattern used in parseValue for consistency
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
  
  const total = nonEmptyValues.length;
  
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

// Enhanced column mapping with auto-detection
export const buildDimensionMappingWithAutoDetection = async (
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
  
  console.log(`[SYNC] Processing ${visibleMappings.length} visible column mappings with auto-detection`);
  
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
      let finalMapping = { ...mapping };
      if (mapping.dimensionId === 'create_new' || !mapping.dimensionType || mapping.dimensionType === 'text') {
        const detected = autoDetectColumnType(sampleValues);
        console.log(`[SYNC] Auto-detected type for column "${mapping.column}": ${detected.type}${detected.dateFormat ? ` (${detected.dateFormat})` : ''}`);
        
        finalMapping.newDimensionType = detected.type;
        finalMapping.dimensionType = detected.type;
        if (detected.dateFormat) {
          finalMapping.dateFormat = detected.dateFormat;
        }
      }
      
      // Helper function to get dimension name from mapping (either from dimensionName or by looking up dimensionId)
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
        dimensionId = await resolveDimensionNameToId(dimensionName, accountId || null, reportId, userId);
      } else if (finalMapping.newDimensionName) {
        // Creating a new dimension
        dimensionId = await createOrGetDimension(finalMapping, userId, reportId, dataSourceId, accountId);
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
  
  console.log(`[SYNC] Successfully mapped ${Object.keys(dimensionIdMap).length} columns to dimensions`);
  return { dimensionIdMap, columnIndexMap, createdCount };
};

// Build dimension mapping (legacy function for compatibility)
export const buildDimensionMapping = async (
  mappings: ColumnMapping[],
  headers: string[],
  userId: string,
  reportId: string,
  dataSourceId: string,
  recreateDimensions: boolean = false,
  accountId?: string | null
): Promise<{ dimensionIdMap: Record<string, string>; columnIndexMap: Record<string, number>; createdCount: number }> => {
  // Use the enhanced version with empty sample data
  return buildDimensionMappingWithAutoDetection(mappings, headers, [], userId, reportId, dataSourceId, recreateDimensions, accountId);
};

// Transform data rows
export const transformDataRows = async (
  dataRows: any[][],
  mappings: ColumnMapping[],
  dimensionIdMap: Record<string, string>,
  columnIndexMap: Record<string, number>,
  reportId: string,
  dataSourceId: string
): Promise<any[]> => {
  console.log(`[SYNC] Transforming ${dataRows.length} data rows...`);
  
  const visibleMappings = mappings.filter(m => m.visible);
  
  // Load dimension types from database for all mapped dimensions
  const dimensionTypeMap: Record<string, string> = {};
  const dimensionIds = Object.values(dimensionIdMap).filter(id => id !== 'none' && id !== 'create_new');
  
  if (dimensionIds.length > 0) {
    const { data: dimensionsData, error: dimError } = await supabase
      .from('dimensions')
      .select('id, type')
      .in('id', dimensionIds);
    
    if (!dimError && dimensionsData) {
      dimensionsData.forEach((dim: any) => {
        dimensionTypeMap[dim.id] = dim.type;
      });
      console.log('[SYNC] Loaded dimension types from database:', dimensionTypeMap);
    }
  }
  
  const rowsToInsert = dataRows.map((row, index) => {
    const dimensionValues: Record<string, any> = {};
    
    if (!Array.isArray(row)) return null;
    
    visibleMappings.forEach((mapping: ColumnMapping) => {
      const colIndex = columnIndexMap[mapping.column];
      
      if (colIndex !== undefined && colIndex >= 0 && dimensionIdMap[mapping.column] && colIndex < row.length) {
        const rawValue = row[colIndex];
        const dimensionId = dimensionIdMap[mapping.column];
        // Priority: mapping types > dimension type from DB > default to text
        const dimensionType = mapping.newDimensionType || mapping.dimensionType || dimensionTypeMap[dimensionId] || 'text';
        const dateFormat = mapping.dateFormat;
        const value = parseValue(rawValue, dimensionType, dateFormat);
        
        if (value !== null) {
          dimensionValues[dimensionIdMap[mapping.column]] = value;
          
          // Debug logging for date and currency values
          if (index < 3) { // Log first 3 rows
            if (dimensionType === 'date' || dimensionType === 'currency') {
              console.log(`[SYNC] Row ${index + 1} - ${mapping.column} (${dimensionType}): "${rawValue}" -> "${value}"`);
            }
          }
        }
      }
    });
    
    return {
      report_id: reportId,
      data_source_id: dataSourceId,
      row_number: index + 1,
      dimension_values: dimensionValues,
    };
  }).filter(row => row !== null);
  
  console.log(`[SYNC] Prepared ${rowsToInsert.length} rows for insertion`);
  return rowsToInsert;
};

// Insert data in batches
export const insertDataInBatches = async (
  rowsToInsert: any[],
  onProgress?: (message: string) => void
): Promise<void> => {
  console.log(`[SYNC] Inserting ${rowsToInsert.length} rows in batches...`);
  
  // Adaptive batch sizing based on dataset size to prevent statement timeouts
  let batchSize: number;
  if (rowsToInsert.length > 100000) {
    batchSize = 250; // Very large datasets: smaller batches
  } else if (rowsToInsert.length > 50000) {
    batchSize = 500; // Large datasets: medium batches
  } else if (rowsToInsert.length > 10000) {
    batchSize = 750; // Medium datasets: larger batches
  } else {
    batchSize = 1000; // Small datasets: standard batches
  }
  
  console.log(`[SYNC] Using adaptive batch size: ${batchSize} (total rows: ${rowsToInsert.length})`);
  
  const totalBatches = Math.ceil(rowsToInsert.length / batchSize);
  let successfulBatches = 0;
  
  for (let i = 0; i < rowsToInsert.length; i += batchSize) {
    const batch = rowsToInsert.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    
    const progressMessage = `Inserting batch ${currentBatch}/${totalBatches} (${batch.length} rows)`;
    console.log(`[SYNC] ${progressMessage}`);
    
    if (onProgress) {
      onProgress(progressMessage);
    }
    
    try {
      // Add retry logic for individual batches
      const maxRetries = 3;
      let retryCount = 0;
      let batchSuccess = false;
      
      while (!batchSuccess && retryCount < maxRetries) {
        try {
          const { error: insertError } = await supabase
            .from('dimension_data')
            .insert(batch);

          if (insertError) {
            throw insertError;
          }
          
          batchSuccess = true;
          successfulBatches++;
          
          // Add small delay between batches for large datasets to prevent overwhelming the database
          if (rowsToInsert.length > 50000 && currentBatch % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms pause every 10 batches
          }
          
        } catch (batchError: any) {
          retryCount++;
          console.warn(`[SYNC] Batch ${currentBatch} attempt ${retryCount} failed:`, batchError.message);
          
          if (retryCount < maxRetries) {
            // Exponential backoff for retries
            const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
            console.log(`[SYNC] Retrying batch ${currentBatch} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.error(`[SYNC] Batch ${currentBatch} failed after ${maxRetries} attempts:`, batchError);
            throw new Error(`Failed at batch ${currentBatch}/${totalBatches}: ${batchError.message}`);
          }
        }
      }
      
      // Progress feedback for large datasets
      if (rowsToInsert.length > 10000 && currentBatch % 20 === 0) {
        const progress = Math.round((successfulBatches / totalBatches) * 100);
        console.log(`[SYNC] Progress: ${progress}% complete (${successfulBatches}/${totalBatches} batches)`);
      }
      
    } catch (error) {
      console.error(`[SYNC] Critical error in batch ${currentBatch}:`, error);
      throw error;
    }
  }
  
  console.log(`[SYNC] Successfully inserted all ${rowsToInsert.length} rows in ${successfulBatches} batches`);
};

// Update column mappings with new dimension IDs
export const updateColumnMappings = async (
  dataSourceId: string,
  mappings: ColumnMapping[],
  dimensionIdMap: Record<string, string>
): Promise<void> => {
  // Get dimension names for the IDs in dimensionIdMap
  const dimensionIds = Object.values(dimensionIdMap).filter(id => id && id !== 'none');
  const dimensionNameMap: Record<string, string> = {};
  
  if (dimensionIds.length > 0) {
    const { data: dimensions, error } = await supabase
      .from('dimensions')
      .select('id, name')
      .in('id', dimensionIds);
    
    if (!error && dimensions) {
      dimensions.forEach((dim: any) => {
        dimensionNameMap[dim.id] = dim.name;
      });
    }
  }

  const updatedMappings = mappings.map((mapping: ColumnMapping) => {
    if (mapping.column in dimensionIdMap && (mapping.dimensionId === 'create_new' || mapping.newDimensionName)) {
      const dimensionId = dimensionIdMap[mapping.column];
      const dimensionName = dimensionNameMap[dimensionId] || null;
      
      return {
        ...mapping,
        dimensionId: dimensionId, // Keep for backward compatibility
        dimensionName: dimensionName, // Store name for stable mapping
        newDimensionName: undefined, // Clear temporary fields
        newDimensionType: undefined,
      };
    }
    return mapping;
  });

  const { error: updateError } = await supabase
    .from('data_sources')
    .update({ column_mappings: updatedMappings as any })
    .eq('id', dataSourceId);

  if (updateError) {
    console.warn(`[SYNC] Warning: Could not update column mappings:`, updateError);
    // Don't throw error, sync was successful
  }
};

// Detect new columns in headers
export const detectNewColumns = async (
  headers: string[],
  dataSource: DataSource
): Promise<{ newColumns: string[]; updatedMappings: ColumnMapping[] }> => {
  const currentMappings = dataSource.column_mappings || [];
  const mappedColumns = new Set(currentMappings.map((m: any) => m.column));
  const normalizedMappedColumns = new Set(
    currentMappings.map((m: any) => m.column.trim().toLowerCase())
  );
  
  const newColumns: string[] = [];
  
  headers.forEach((header: string, index: number) => {
    if (header && header.trim() !== '') {
      const trimmedHeader = header.trim();
      const normalizedHeader = trimmedHeader.toLowerCase();
      
      const isExactMatch = mappedColumns.has(trimmedHeader);
      const isNormalizedMatch = normalizedMappedColumns.has(normalizedHeader);
      
      if (!isExactMatch && !isNormalizedMatch) {
        newColumns.push(trimmedHeader);
        console.log(`[SYNC] New column detected at index ${index}: "${trimmedHeader}"`);
      }
    }
  });

  let updatedMappings = [...currentMappings];
  
  if (newColumns.length > 0) {
    newColumns.forEach((column) => {
      updatedMappings.push({
        column: column,
        dimensionId: 'none',
        visible: false,
        dimensionType: 'text',
      });
    });

    // Update data source with new mappings
    const { error: updateError } = await supabase
      .from('data_sources')
      .update({ column_mappings: updatedMappings as any })
      .eq('id', dataSource.id);

    if (updateError) {
      console.warn(`[SYNC] Failed to update column_mappings with new columns:`, updateError);
    } else {
      console.log(`[SYNC] Updated column_mappings with ${newColumns.length} new columns`);
    }
  }

  return { newColumns, updatedMappings };
};

// Fix problematic column mappings (remove create_new, none, etc.)
export const fixColumnMappings = async (dataSourceId: string): Promise<void> => {
  console.log(`[SYNC] Fixing problematic column mappings for data source: ${dataSourceId}`);
  
  const { data: dataSource, error: fetchError } = await supabase
    .from('data_sources')
    .select('column_mappings')
    .eq('id', dataSourceId)
    .single();
    
  if (fetchError || !dataSource) {
    console.warn(`[SYNC] Could not fetch data source for mapping fix:`, fetchError);
    return;
  }
  
  const mappings = (dataSource.column_mappings as any[]) || [];
  let hasChanges = false;
  
  const fixedMappings = mappings.map((mapping: any) => {
    let fixed = { ...mapping };
    
    // Fix create_new mappings that weren't properly resolved
    if (mapping.dimensionId === 'create_new') {
      console.log(`[SYNC] Fixing create_new mapping for column: ${mapping.column}`);
      fixed.dimensionId = 'none'; // Will be auto-detected during sync
      fixed.newDimensionName = undefined;
      fixed.newDimensionType = undefined;
      hasChanges = true;
    }
    
    // Fix null dimensionId
    if (mapping.dimensionId === null) {
      fixed.dimensionId = 'none';
      hasChanges = true;
    }
    
    return fixed;
  });
  
  if (hasChanges) {
    const { error: updateError } = await supabase
      .from('data_sources')
      .update({ column_mappings: fixedMappings })
      .eq('id', dataSourceId);
      
    if (updateError) {
      console.warn(`[SYNC] Could not update fixed mappings:`, updateError);
    } else {
      console.log(`[SYNC] Fixed column mappings for data source: ${dataSourceId}`);
    }
  }
};

// Main sync function
export const syncDataSource = async (
  dataSource: DataSource,
  options: SyncOptions = {}
): Promise<SyncResult> => {
  const {
    deleteExistingData: shouldDeleteData = true,
    recreateDimensions = false,
    showProgress = false,
    onProgress
  } = options;

  try {
    // Validate session and get current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      // Try to refresh the session
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !refreshedSession) {
        throw new Error("Your session has expired. Please refresh the page and try again.");
      }
    }
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("Authentication failed. Please refresh the page and log in again.");
    }

    // Get report_id and account_id
    let reportId = dataSource.report_id;
    let accountId: string | null = null;
    
    if (!reportId) {
      const { data: dsData, error: dsError } = await supabase
        .from('data_sources')
        .select('report_id')
        .eq('id', dataSource.id)
        .maybeSingle();
      
      if (dsError) throw dsError;
      reportId = dsData?.report_id || '';
    }

    // Get account_id from report
    if (reportId) {
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('account_id')
        .eq('id', reportId)
        .maybeSingle();
      
      if (!reportError && reportData) {
        accountId = reportData.account_id;
      }
    }

    console.log(`[SYNC] Starting sync for data source: ${dataSource.name} (account: ${accountId || 'none'})`);
    
    // Step 1: Fix problematic column mappings
    await fixColumnMappings(dataSource.id);
    
    // Step 2: Delete existing data if requested
    if (shouldDeleteData) {
      await deleteExistingData(dataSource.id);
      
      if (recreateDimensions) {
        await deleteCustomDimensions(dataSource.id);
      }
    }

    // Step 3: Determine source type and fetch headers/data
    const sourceType = dataSource.source_type || 'google_sheets'; // Default to google_sheets for backward compatibility
    let headers: string[] = [];
    let allData: any[] = [];
    
    if (sourceType === 'csv_url') {
      // CSV URL source
      if (!dataSource.csv_url) {
        throw new Error('CSV URL is required for CSV data source');
      }
      
      console.log(`[SYNC] Fetching data from CSV URL...`);
      const csvData = await fetchCSVUrlData(dataSource.csv_url);
      
      if (csvData.length === 0) {
        throw new Error('No data found in CSV file');
      }
      
      // Extract headers from the specified header row
      const headerRowNum = dataSource.header_row || 1;
      if (headerRowNum < 1 || headerRowNum > csvData.length) {
        throw new Error(`Header row ${headerRowNum} is out of range. CSV has ${csvData.length} rows.`);
      }
      
      headers = csvData[headerRowNum - 1].map((h: any) => 
        h === null || h === undefined ? '' : String(h).trim()
      );
      
      // Get all data rows (skip header row)
      allData = csvData.slice(headerRowNum);
      
      console.log(`[SYNC] Successfully fetched ${allData.length} rows from CSV URL`);
    } else {
      // Google Sheets source
      if (!dataSource.spreadsheet_id || !dataSource.tab_name) {
        throw new Error('Spreadsheet ID and tab name are required for Google Sheets data source');
      }
      
      // Fetch headers
      const headerRange = `A${dataSource.header_row}:Z${dataSource.header_row}`;
      const headerData = await fetchGoogleSheetsData(
        dataSource.spreadsheet_id,
        dataSource.tab_name,
        headerRange
      );
      
      headers = headerData[0].map((h: any) => 
        h === null || h === undefined ? '' : String(h).trim()
      );

      // Step 4: Fetch all data in chunks for large datasets
      console.log(`[SYNC] Fetching data from Google Sheets...`);
      
      // First, try to get an estimate of total rows by fetching a small sample
      const sampleRange = `A${dataSource.header_row + 1}:A${dataSource.header_row + 100}`;
      const sampleData = await fetchGoogleSheetsData(
        dataSource.spreadsheet_id,
        dataSource.tab_name,
        sampleRange
      );
      
      // Determine if we need chunked fetching based on sample size and available data
      const SHEET_CHUNK_SIZE = 25000; // Fetch 25K rows at a time to prevent timeouts
      
      // Try to fetch all data first, with fallback to chunked approach
      try {
        console.log(`[SYNC] Attempting to fetch all data at once...`);
        const dataRange = `A${dataSource.header_row + 1}:Z`;
        const initialData = await fetchGoogleSheetsData(
          dataSource.spreadsheet_id,
          dataSource.tab_name,
          dataRange
        );
        
        if (initialData && initialData.length > 0) {
          allData = initialData;
          console.log(`[SYNC] Successfully fetched ${allData.length} rows in single request`);
        }
      } catch (fetchError) {
        console.warn(`[SYNC] Single fetch failed, switching to chunked approach:`, fetchError);
        
        // Fallback to chunked fetching for very large datasets
        let startRow = dataSource.header_row + 1;
        let hasMoreData = true;
        let chunkCount = 0;
        
        while (hasMoreData) {
          const endRow = startRow + SHEET_CHUNK_SIZE - 1;
          const chunkRange = `A${startRow}:Z${endRow}`;
          
          console.log(`[SYNC] Fetching chunk ${++chunkCount}: rows ${startRow}-${endRow}`);
          
          try {
            const chunkData = await fetchGoogleSheetsData(
              dataSource.spreadsheet_id,
              dataSource.tab_name,
              chunkRange
            );
            
            if (chunkData && chunkData.length > 0) {
              allData = [...allData, ...chunkData];
              console.log(`[SYNC] Chunk ${chunkCount}: ${chunkData.length} rows, total: ${allData.length}`);
              
              // If we got less than the chunk size, we've reached the end
              if (chunkData.length < SHEET_CHUNK_SIZE) {
                hasMoreData = false;
                console.log(`[SYNC] Reached end of data at chunk ${chunkCount}`);
              } else {
                startRow = endRow + 1;
              }
            } else {
              hasMoreData = false;
              console.log(`[SYNC] No more data found at chunk ${chunkCount}`);
            }
          } catch (chunkError) {
            console.error(`[SYNC] Error fetching chunk ${chunkCount}:`, chunkError);
            // Continue with data we have so far
            hasMoreData = false;
          }
          
          // Add progress feedback for large datasets
          if (allData.length > 0 && allData.length % 50000 === 0) {
            console.log(`[SYNC] Progress: ${allData.length} rows fetched from Google Sheets...`);
          }
        }
        
        console.log(`[SYNC] Chunked fetch complete: ${allData.length} total rows in ${chunkCount} chunks`);
      }
    }

    // Step 5: Build dimension mapping with auto-detection
    // Use first 10 rows as sample data for auto-detection
    const sampleDataForAutoDetection = allData.slice(0, 10);
    
    const { dimensionIdMap, columnIndexMap, createdCount } = await buildDimensionMappingWithAutoDetection(
      dataSource.column_mappings || [],
      headers,
      sampleDataForAutoDetection,
      user.id,
      reportId,
      dataSource.id,
      recreateDimensions,
      accountId
    );

    // Step 6: Transform data
    const rowsToInsert = await transformDataRows(
      allData,
      dataSource.column_mappings || [],
      dimensionIdMap,
      columnIndexMap,
      reportId,
      dataSource.id
    );

    // Step 7: Insert data
    await insertDataInBatches(rowsToInsert, onProgress);

    // Step 8: Update column mappings if dimensions were created
    if (createdCount > 0) {
      await updateColumnMappings(dataSource.id, dataSource.column_mappings || [], dimensionIdMap);
    }

    console.log(`[SYNC] Complete! Processed ${allData.length} rows with ${Object.keys(dimensionIdMap).length} dimensions. Vlookup mappings will be applied dynamically during filtering.`);

    return {
      success: true,
      rowsProcessed: allData.length,
      dimensionsCreated: createdCount,
    };

  } catch (error) {
    console.error(`[SYNC] Error syncing data source:`, error);
    
    // Enhanced error message extraction
    let errorMessage = "Failed to sync data";
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      // Try to extract error message from various error object structures
      const err = error as any;
      errorMessage = err.message || err.msg || err.error || err.details || JSON.stringify(error);
    }
    
    // Log full error for debugging
    console.error(`[SYNC] Error details:`, {
      message: errorMessage,
      type: typeof error,
      error: error,
    });
    
    return {
      success: false,
      rowsProcessed: 0,
      dimensionsCreated: 0,
      error: errorMessage,
    };
  }
};
