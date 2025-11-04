import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Types
export interface DataSource {
  id: string;
  name: string;
  google_sheets_url: string;
  spreadsheet_id: string;
  tab_name: string;
  header_row: number;
  column_mappings: ColumnMapping[] | null;
  report_id?: string;
}

export interface ColumnMapping {
  column: string;
  dimensionId: string | null;
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

// Date parsing utility
export const parseDate = (value: any, dateFormat: string): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  
  try {
    // If already a Date object or ISO string, parse directly
    if (value instanceof Date) return value;
    if (stringValue.includes('T') || stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parsed = new Date(stringValue);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    
    // Parse based on format
    let parts: string[] = [];
    if (dateFormat === 'yyyy-mm-dd') {
      // Try YYYY-MM-DD or YYYY/MM/DD
      parts = stringValue.split(/[-/]/);
      if (parts.length === 3 && parts[0].length === 4) {
        const [year, month, day] = parts;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
    } else if (dateFormat === 'dd-mm-yyyy') {
      // Try DD-MM-YYYY or DD/MM/YYYY
      parts = stringValue.split(/[-/]/);
      if (parts.length === 3 && parts[2].length === 4) {
        const [day, month, year] = parts;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
    } else if (dateFormat === 'mm-dd-yyyy') {
      // Try MM-DD-YYYY or MM/DD/YYYY
      parts = stringValue.split(/[-/]/);
      if (parts.length === 3 && parts[2].length === 4) {
        const [month, day, year] = parts;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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

// Value parsing utility
export const parseValue = (value: any, dimensionType: string, dateFormat?: string): any => {
  if (value === null || value === undefined || value === '') return null;
  
  // For date types, parse with the specified format
  if (dimensionType === 'date' && dateFormat) {
    const parsedDate = parseDate(value, dateFormat);
    if (parsedDate) {
      // Return as ISO string for storage
      return parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    return null;
  }
  
  // For numeric types, clean and parse the value
  if (dimensionType === 'number' || dimensionType === 'currency' || dimensionType === 'percentage') {
    const stringValue = String(value);
    // Remove currency symbols ($, €, £, etc.), commas, and spaces
    const cleanedValue = stringValue.replace(/[$€£¥,\s]/g, '');
    const numValue = parseFloat(cleanedValue);
    return isNaN(numValue) ? null : numValue;
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
  const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
    body: {
      spreadsheetId,
      tabName,
      range,
    },
  });

  if (sheetsError) throw sheetsError;
  if (!sheetsData?.values || sheetsData.values.length === 0) {
    throw new Error("No data found in the specified range");
  }

  return sheetsData.values;
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

// Create or get dimension
export const createOrGetDimension = async (
  mapping: ColumnMapping,
  userId: string,
  reportId: string,
  dataSourceId: string
): Promise<string | null> => {
  if (!mapping.dimensionId || mapping.dimensionId === 'none') {
    return null;
  }

  // If it's an existing dimension (not create_new), return the ID
  if (mapping.dimensionId !== 'create_new' && !mapping.newDimensionName) {
    return mapping.dimensionId;
  }

  // Create new custom dimension
  const dimensionName = mapping.newDimensionName || mapping.column;
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
    // Use existing dimension
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
};

// Build dimension mapping
export const buildDimensionMapping = async (
  mappings: ColumnMapping[],
  headers: string[],
  userId: string,
  reportId: string,
  dataSourceId: string,
  recreateDimensions: boolean = false
): Promise<{ dimensionIdMap: Record<string, string>; columnIndexMap: Record<string, number>; createdCount: number }> => {
  const dimensionIdMap: Record<string, string> = {};
  const columnIndexMap: Record<string, number> = {};
  const visibleMappings = mappings.filter(m => m.visible);
  let createdCount = 0;
  
  console.log(`[SYNC] Processing ${visibleMappings.length} visible column mappings`);
  
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

  // Process each mapping
  for (const mapping of visibleMappings) {
    // Find column index
    let colIndex = headers.indexOf(mapping.column);
    if (colIndex === -1) {
      const normalizedMappingCol = mapping.column.trim().toLowerCase();
      colIndex = normalizedHeaderMap.get(normalizedMappingCol) ?? -1;
    }
    
    if (colIndex !== -1) {
      // Get or create dimension
      const dimensionId = await createOrGetDimension(mapping, userId, reportId, dataSourceId);
      
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

// Transform data rows
export const transformDataRows = (
  dataRows: any[][],
  mappings: ColumnMapping[],
  dimensionIdMap: Record<string, string>,
  columnIndexMap: Record<string, number>,
  reportId: string,
  dataSourceId: string
): any[] => {
  console.log(`[SYNC] Transforming ${dataRows.length} data rows...`);
  
  const visibleMappings = mappings.filter(m => m.visible);
  
  const rowsToInsert = dataRows.map((row, index) => {
    const dimensionValues: Record<string, any> = {};
    
    if (!Array.isArray(row)) return null;
    
    visibleMappings.forEach((mapping: ColumnMapping) => {
      const colIndex = columnIndexMap[mapping.column];
      
      if (colIndex !== undefined && colIndex >= 0 && dimensionIdMap[mapping.column] && colIndex < row.length) {
        const rawValue = row[colIndex];
        const dimensionType = mapping.newDimensionType || mapping.dimensionType || 'text';
        const dateFormat = mapping.dateFormat;
        const value = parseValue(rawValue, dimensionType, dateFormat);
        
        if (value !== null) {
          dimensionValues[dimensionIdMap[mapping.column]] = value;
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
  
  const batchSize = 1000;
  const totalBatches = Math.ceil(rowsToInsert.length / batchSize);
  
  for (let i = 0; i < rowsToInsert.length; i += batchSize) {
    const batch = rowsToInsert.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    
    const progressMessage = `Inserting batch ${currentBatch}/${totalBatches} (${batch.length} rows)`;
    console.log(`[SYNC] ${progressMessage}`);
    
    if (onProgress) {
      onProgress(progressMessage);
    }
    
    const { error: insertError } = await supabase
      .from('dimension_data')
      .insert(batch);

    if (insertError) {
      console.error(`[SYNC] Error inserting batch ${currentBatch}:`, insertError);
      throw new Error(`Failed at batch ${currentBatch}/${totalBatches}: ${insertError.message}`);
    }
  }
  
  console.log(`[SYNC] Successfully inserted all ${rowsToInsert.length} rows`);
};

// Update column mappings with new dimension IDs
export const updateColumnMappings = async (
  dataSourceId: string,
  mappings: ColumnMapping[],
  dimensionIdMap: Record<string, string>
): Promise<void> => {
  const updatedMappings = mappings.map((mapping: ColumnMapping) => {
    if (mapping.column in dimensionIdMap && (mapping.dimensionId === 'create_new' || mapping.newDimensionName)) {
      return {
        ...mapping,
        dimensionId: dimensionIdMap[mapping.column],
        newDimensionName: undefined, // Clear temporary fields
        newDimensionType: undefined,
      };
    }
    return mapping;
  });

  const { error: updateError } = await supabase
    .from('data_sources')
    .update({ column_mappings: updatedMappings })
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
      .update({ column_mappings: updatedMappings })
      .eq('id', dataSource.id);

    if (updateError) {
      console.warn(`[SYNC] Failed to update column_mappings with new columns:`, updateError);
    } else {
      console.log(`[SYNC] Updated column_mappings with ${newColumns.length} new columns`);
    }
  }

  return { newColumns, updatedMappings };
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
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    // Get report_id
    let reportId = dataSource.report_id;
    if (!reportId) {
      const { data: dsData, error: dsError } = await supabase
        .from('data_sources')
        .select('report_id')
        .eq('id', dataSource.id)
        .maybeSingle();
      
      if (dsError) throw dsError;
      reportId = dsData?.report_id || '';
    }

    console.log(`[SYNC] Starting sync for data source: ${dataSource.name}`);
    
    // Step 1: Delete existing data if requested
    if (shouldDeleteData) {
      await deleteExistingData(dataSource.id);
      
      if (recreateDimensions) {
        await deleteCustomDimensions(dataSource.id);
      }
    }

    // Step 2: Fetch headers
    const headerRange = `A${dataSource.header_row}:Z${dataSource.header_row}`;
    const headerData = await fetchGoogleSheetsData(
      dataSource.spreadsheet_id,
      dataSource.tab_name,
      headerRange
    );
    
    const headers = headerData[0].map((h: any) => 
      h === null || h === undefined ? '' : String(h).trim()
    );

    // Step 3: Fetch all data
    const dataRange = `A${dataSource.header_row + 1}:Z`;
    const allData = await fetchGoogleSheetsData(
      dataSource.spreadsheet_id,
      dataSource.tab_name,
      dataRange
    );

    // Step 4: Build dimension mapping
    const { dimensionIdMap, columnIndexMap, createdCount } = await buildDimensionMapping(
      dataSource.column_mappings || [],
      headers,
      user.id,
      reportId,
      dataSource.id,
      recreateDimensions
    );

    // Step 5: Transform data
    const rowsToInsert = transformDataRows(
      allData,
      dataSource.column_mappings || [],
      dimensionIdMap,
      columnIndexMap,
      reportId,
      dataSource.id
    );

    // Step 6: Insert data
    await insertDataInBatches(rowsToInsert, onProgress);

    // Step 7: Update column mappings if dimensions were created
    if (createdCount > 0) {
      await updateColumnMappings(dataSource.id, dataSource.column_mappings || [], dimensionIdMap);
    }

    console.log(`[SYNC] Complete! Processed ${allData.length} rows with ${Object.keys(dimensionIdMap).length} dimensions`);

    return {
      success: true,
      rowsProcessed: allData.length,
      dimensionsCreated: createdCount,
    };

  } catch (error) {
    console.error(`[SYNC] Error syncing data source:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown sync error";
    
    return {
      success: false,
      rowsProcessed: 0,
      dimensionsCreated: 0,
      error: errorMessage,
    };
  }
};
