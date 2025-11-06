/**
 * Data Loading Fix Utility
 * 
 * This utility ensures consistent data loading across all accounts by:
 * 1. Standardizing dimension loading logic
 * 2. Fixing date filtering issues
 * 3. Ensuring proper account-scoped dimension resolution
 * 4. Providing debugging capabilities
 */

import { supabase } from "@/integrations/supabase/client";

export interface Dimension {
  id: string;
  name: string;
  type: string;
  scope: string;
  account_id?: string;
  report_id?: string;
  formula?: string;
}

export interface DataLoadingResult {
  success: boolean;
  data: any[];
  dimensions: Dimension[];
  totalRows: number;
  filteredRows: number;
  error?: string;
  debugInfo?: any;
}

/**
 * Load dimensions for an account using the same pattern as Roomstay
 */
export async function loadAccountDimensions(accountId: string, userId: string): Promise<Dimension[]> {
  console.log('[DATA-FIX] Loading dimensions for account:', accountId, 'user:', userId);
  
  try {
    // Load account-scoped dimensions (highest priority)
    const { data: accountData, error: accountError } = await supabase
      .from("dimensions")
      .select("*")
      .eq("scope", "account")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    if (accountError) throw accountError;

    // Load custom dimensions for the user
    const { data: customData, error: customError } = await supabase
      .from("dimensions")
      .select("*")
      .eq("user_id", userId)
      .eq("scope", "custom")
      .order("created_at", { ascending: false });

    if (customError) throw customError;

    // Load global dimensions (lowest priority)
    const { data: globalData, error: globalError } = await supabase
      .from("dimensions")
      .select("*")
      .eq("scope", "global")
      .order("created_at", { ascending: false });

    if (globalError) throw globalError;

    // Combine dimensions with proper priority: account > custom > global
    const allDimensions = [
      ...(accountData || []),
      ...(customData || []),
      ...(globalData || [])
    ];

    // Deduplicate by name, keeping the highest priority version
    const seenNames = new Set<string>();
    const uniqueDimensions = allDimensions.filter(dim => {
      if (seenNames.has(dim.name)) {
        return false;
      }
      seenNames.add(dim.name);
      return true;
    });

    console.log('[DATA-FIX] Loaded dimensions:', {
      account: accountData?.length || 0,
      custom: customData?.length || 0,
      global: globalData?.length || 0,
      unique: uniqueDimensions.length
    });

    return uniqueDimensions;
  } catch (error) {
    console.error('[DATA-FIX] Error loading dimensions:', error);
    throw error;
  }
}

/**
 * Load and filter dimension data with proper date handling
 */
export async function loadReportData(
  reportId: string,
  accountId: string,
  userId: string,
  filters?: {
    dateRange?: { from: Date; to: Date };
    dimensionFilters?: Record<string, string[]>;
  }
): Promise<DataLoadingResult> {
  console.log('[DATA-FIX] Loading report data:', { reportId, accountId, filters });
  
  try {
    // 1. Load dimensions first
    const dimensions = await loadAccountDimensions(accountId, userId);
    
    if (dimensions.length === 0) {
      throw new Error('No dimensions found for account');
    }

    // 2. Load dimension data in chunks for performance
    const CHUNK_SIZE = 5000;
    const MAX_ROWS = 50000;
    let offset = 0;
    let hasMore = true;
    let allData: any[] = [];

    while (hasMore && offset < MAX_ROWS) {
      const { data: chunkData, error } = await supabase
        .from("dimension_data")
        .select("id, row_number, dimension_values")
        .eq("report_id", reportId)
        .order('row_number', { ascending: false }) // Latest data first
        .range(offset, offset + CHUNK_SIZE - 1);

      if (error) throw error;

      if (!chunkData || chunkData.length === 0) {
        hasMore = false;
        break;
      }

      allData = allData.concat(chunkData);
      offset += CHUNK_SIZE;

      if (chunkData.length < CHUNK_SIZE) {
        hasMore = false;
      }
    }

    console.log('[DATA-FIX] Loaded raw data rows:', allData.length);

    // 3. Apply filters
    const filteredData = applyDataFilters(allData, dimensions, filters);

    console.log('[DATA-FIX] Filtered data rows:', filteredData.length);

    // 4. Validate data structure
    const validationResult = validateDataStructure(filteredData, dimensions);
    
    return {
      success: true,
      data: filteredData,
      dimensions,
      totalRows: allData.length,
      filteredRows: filteredData.length,
      debugInfo: {
        validation: validationResult,
        sampleRow: filteredData[0]?.dimension_values,
        dimensionIds: dimensions.map(d => ({ id: d.id, name: d.name }))
      }
    };

  } catch (error) {
    console.error('[DATA-FIX] Error loading report data:', error);
    return {
      success: false,
      data: [],
      dimensions: [],
      totalRows: 0,
      filteredRows: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Apply filters to dimension data
 */
function applyDataFilters(
  data: any[],
  dimensions: Dimension[],
  filters?: {
    dateRange?: { from: Date; to: Date };
    dimensionFilters?: Record<string, string[]>;
  }
): any[] {
  if (!filters) return data;

  return data.filter(row => {
    const dimensionValues = row.dimension_values as Record<string, any>;

    // Apply date filter
    if (filters.dateRange) {
      const dateDimension = dimensions.find(d => d.type === 'date');
      if (dateDimension) {
        const rowDateStr = dimensionValues[dateDimension.id];
        if (rowDateStr) {
          const rowDate = new Date(rowDateStr);
          
          // Check date range (inclusive)
          if (filters.dateRange.from && rowDate < filters.dateRange.from) {
            return false;
          }
          
          if (filters.dateRange.to) {
            // Add one day to make the end date inclusive
            const adjustedToDate = new Date(filters.dateRange.to);
            adjustedToDate.setDate(adjustedToDate.getDate() + 1);
            if (rowDate >= adjustedToDate) {
              return false;
            }
          }
        }
      }
    }

    // Apply dimension filters
    if (filters.dimensionFilters) {
      for (const [dimensionId, filterValues] of Object.entries(filters.dimensionFilters)) {
        if (filterValues && filterValues.length > 0) {
          const rowValue = dimensionValues[dimensionId];
          if (!rowValue || !filterValues.includes(String(rowValue))) {
            return false;
          }
        }
      }
    }

    return true;
  });
}

/**
 * Validate data structure to ensure dimensions match data
 */
function validateDataStructure(data: any[], dimensions: Dimension[]): any {
  if (data.length === 0) {
    return { valid: false, reason: 'No data rows' };
  }

  const sampleRow = data[0].dimension_values;
  const dataKeys = Object.keys(sampleRow);
  const dimensionIds = dimensions.map(d => d.id);

  const matchingIds = dataKeys.filter(key => dimensionIds.includes(key));
  const missingIds = dimensionIds.filter(id => !dataKeys.includes(id));
  const extraIds = dataKeys.filter(key => !dimensionIds.includes(key));

  return {
    valid: matchingIds.length > 0,
    totalDataKeys: dataKeys.length,
    totalDimensionIds: dimensionIds.length,
    matchingIds: matchingIds.length,
    missingIds: missingIds.length,
    extraIds: extraIds.length,
    missingDimensions: missingIds.map(id => {
      const dim = dimensions.find(d => d.id === id);
      return dim ? { id, name: dim.name } : { id, name: 'Unknown' };
    }),
    extraKeys: extraIds
  };
}

/**
 * Calculate KPI metrics from filtered data
 */
export function calculateKPIMetrics(
  data: any[],
  dimensions: Dimension[]
): Record<string, number> {
  const metrics: Record<string, number> = {};

  // Initialize base metrics
  const baseMetrics = ['Impressions', 'Clicks', 'Cost', 'Revenue', 'Conversions', 'Bookings'];
  baseMetrics.forEach(metric => {
    const dimension = dimensions.find(d => d.name === metric);
    if (dimension) {
      const total = data.reduce((sum, row) => {
        const value = row.dimension_values[dimension.id];
        return sum + (typeof value === 'number' ? value : parseFloat(value) || 0);
      }, 0);
      metrics[metric] = total;
    }
  });

  // Calculate derived metrics with formulas
  const derivedDimensions = dimensions.filter(d => d.formula);
  derivedDimensions.forEach(dimension => {
    if (dimension.formula) {
      const calculatedValue = calculateFormula(dimension.formula, metrics, dimensions);
      if (calculatedValue !== null) {
        metrics[dimension.name] = calculatedValue;
      }
    }
  });

  return metrics;
}

/**
 * Calculate formula-based metrics
 */
function calculateFormula(
  formula: string,
  data: Record<string, number>,
  dimensions: Dimension[]
): number | null {
  try {
    // Replace dimension names with their values
    let processedFormula = formula;
    
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      processedFormula = processedFormula.replace(regex, String(data[key] || 0));
    });

    // Handle division by zero and other edge cases
    if (processedFormula.includes('/ 0')) {
      return 0;
    }

    // Evaluate the formula safely
    const result = Function(`"use strict"; return (${processedFormula})`)();
    return isFinite(result) ? result : null;
  } catch (error) {
    console.warn('[DATA-FIX] Formula calculation error:', formula, error);
    return null;
  }
}

/**
 * Get current month date range (timezone-free)
 */
export function getCurrentMonthDateRange(): { from: Date; to: Date } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  const fromDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const toDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
  
  return {
    from: new Date(fromDateString),
    to: new Date(toDateString)
  };
}

/**
 * Debug data loading for a specific report
 */
export async function debugReportDataLoading(reportId: string, accountId: string): Promise<void> {
  console.log('=== DATA LOADING DEBUG ===');
  console.log('Report ID:', reportId);
  console.log('Account ID:', accountId);

  try {
    // Check if report exists
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('*, accounts(name)')
      .eq('id', reportId)
      .single();

    if (reportError) throw reportError;
    console.log('Report:', report);

    // Check dimension data count
    const { count, error: countError } = await supabase
      .from('dimension_data')
      .select('*', { count: 'exact', head: true })
      .eq('report_id', reportId);

    if (countError) throw countError;
    console.log('Dimension data rows:', count);

    // Check account dimensions
    const { data: dimensions, error: dimError } = await supabase
      .from('dimensions')
      .select('*')
      .eq('account_id', accountId)
      .eq('scope', 'account');

    if (dimError) throw dimError;
    console.log('Account dimensions:', dimensions?.length);

    // Sample data
    const { data: sampleData, error: sampleError } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .limit(1);

    if (sampleError) throw sampleError;
    
    if (sampleData && sampleData.length > 0) {
      const dataKeys = Object.keys(sampleData[0].dimension_values);
      const dimensionIds = dimensions?.map(d => d.id) || [];
      const matchingIds = dataKeys.filter(key => dimensionIds.includes(key));
      
      console.log('Data structure validation:');
      console.log('- Data keys:', dataKeys.length);
      console.log('- Dimension IDs:', dimensionIds.length);
      console.log('- Matching IDs:', matchingIds.length);
      console.log('- Match ratio:', matchingIds.length / dataKeys.length);
    }

  } catch (error) {
    console.error('Debug error:', error);
  }
}
