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
import { loadDimensionsForUser } from "@/lib/dimensionLoader";
import type { Dimension as LoaderDimension } from "@/lib/dimensionLoader";

export interface Dimension {
  id: string;
  name: string;
  type: string;
  scope?: string;
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
 * Load dimensions for account with proper priority
 */
export async function loadAccountDimensions(accountId: string, userId?: string, reportId?: string): Promise<Dimension[]> {
  try {
    console.log('[DATA-LOADING-FIX] Loading dimensions for account:', accountId, 'user:', userId, 'report:', reportId);

    // Use centralized dimension loader with reportId to include account-scoped dimensions
    if (userId) {
      const dimensions = await loadDimensionsForUser(userId, reportId);
      
      const accountDimensions = dimensions
        .map(dim => ({
          id: dim.id,
          name: dim.name,
          type: (dim as any).type,
          scope: (dim as any).scope,
          account_id: (dim as any).account_id,
          report_id: (dim as any).report_id,
          formula: (dim as any).formula,
        }))
        .filter(dim => 
          dim.scope === 'account' || 
          dim.scope === 'global' || 
          (dim.scope === 'custom' && (!dim.report_id || dim.report_id === reportId)) // Include global/custom appropriately
        );
      
      console.log('[DATA-LOADING-FIX] Loaded dimensions via centralized loader:', accountDimensions.length);
      return accountDimensions;
    }

    // Fallback for cases without userId (shared views, etc.)
    // Load account-specific dimensions
    const { data: accountData, error: accountError } = await supabase
      .from("dimensions")
      .select("*")
      .eq("scope", "account")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    if (accountError) throw accountError;

    // Load global dimensions (lowest priority)
    const { data: globalData, error: globalError } = await supabase
      .from("dimensions")
      .select("*")
      .eq("scope", "global")
      .order("created_at", { ascending: false });

    if (globalError) throw globalError;

    // Combine dimensions with proper priority: account > global
    const allDimensions = [
      ...(accountData || []),
      ...(globalData || [])
    ];

    // Remove duplicates by name (keep first occurrence = highest priority)
    const uniqueDimensions = allDimensions.filter((dim, index, arr) => 
      arr.findIndex(d => d.name === dim.name) === index
    );

    console.log('[DATA-LOADING-FIX] Loaded dimensions (fallback):', {
      account: accountData?.length || 0,
      global: globalData?.length || 0,
      total: uniqueDimensions.length
    });

    return uniqueDimensions;
  } catch (error) {
    console.error('[DATA-LOADING-FIX] Error loading account dimensions:', error);
    return [];
  }
}

/**
 * Load and filter dimension data using the edge function
 */
export async function loadReportData(
  reportId: string,
  accountId: string,
  userId?: string,
  filters?: {
    dateRange?: { from: Date; to?: Date };
    dimensionFilters?: Record<string, string[]>;
  }
): Promise<DataLoadingResult> {
  console.log('[DATA-FIX] Loading report data via edge function:', { reportId, accountId, filters });
  
  try {
    // 1. Load dimensions first (include reportId to resolve account-scoped dims)
    const dimensions = await loadAccountDimensions(accountId, userId, reportId);
    
    if (dimensions.length === 0) {
      throw new Error('No dimensions found for account');
    }

    // 2. Check if budgets exist and add virtual Budget dimension
    const { data: budgets, error: budgetError } = await supabase
      .from('budgets')
      .select('id')
      .or(`report_id.eq.${reportId},account_id.eq.${accountId}`)
      .limit(1);

    if (!budgetError && budgets && budgets.length > 0) {
      // Add virtual Budget dimension
      const budgetDimension: Dimension = {
        id: 'virtual-budget',
        name: 'Budget',
        type: 'currency',
        scope: 'virtual',
        formula: undefined,
        account_id: accountId,
        report_id: reportId
      };
      dimensions.push(budgetDimension);
      console.log('[DATA-FIX] Added virtual Budget dimension (budgets exist)');
    }

    // 3. Call edge function to get performance data
    const dateFrom = filters?.dateRange?.from?.toISOString().split('T')[0];
    const dateTo = filters?.dateRange?.to?.toISOString().split('T')[0];
    
    // Convert dimension filters to the format expected by edge function
    const dimensionFilters: Record<string, string | string[]> = {};
    if (filters?.dimensionFilters) {
      for (const [key, values] of Object.entries(filters.dimensionFilters)) {
        dimensionFilters[key] = values.length === 1 ? values[0] : values;
      }
    }

    console.log('[DATA-FIX] Calling edge function with params:', {
      reportId,
      accountId,
      userId,
      dateFrom,
      dateTo,
      dimensionFilters,
      visibleDimensionIds: dimensions.map(d => d.id)
    });

    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-performance-data', {
      body: {
        reportId,
        accountId,
        userId,
        dateFrom,
        dateTo,
        dimensionFilters,
        groupByDims: [], // No grouping for raw data
        breakdownDims: [],
        visibleDimensionIds: dimensions.map(d => d.id),
        limit: 50000,
        offset: 0
      }
    });

    if (edgeError) {
      console.error('[DATA-FIX] Edge function error:', edgeError);
      throw edgeError;
    }

    if (!edgeData) {
      throw new Error('No data returned from edge function');
    }

    console.log('[DATA-FIX] Edge function returned data:', {
      totalCount: edgeData.totalCount,
      dataLength: edgeData.data?.length
    });

    const allData = edgeData.data || [];

    console.log('[DATA-FIX] Loaded raw data rows:', allData.length);

    // 4. Normalize data structure - ensure all rows have dimension_values
    const normalizedData = allData.map((row: any, idx: number) => {
      // If row already has dimension_values, return as is
      if (row.dimension_values) {
        return row;
      }
      // If dimension_values are spread at root level, wrap them
      return {
        dimension_values: row,
        row_number: row._row_number || row.row_number,
        data_source_id: row._data_source_id || row.data_source_id,
      };
    });

    console.log('[DATA-FIX] Normalized data rows:', normalizedData.length);

    // 5. Validate data structure
    const validationResult = validateDataStructure(normalizedData, dimensions);
    
    return {
      success: true,
      data: normalizedData,
      dimensions,
      totalRows: edgeData.totalCount || normalizedData.length,
      filteredRows: normalizedData.length,
      debugInfo: {
        validation: validationResult,
        sampleRow: normalizedData[0]?.dimension_values,
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
    dateRange?: { from: Date; to?: Date };
    dimensionFilters?: Record<string, string[]>;
  }
): any[] {
  if (!filters) return data;

  return data.filter(row => {
    // Ensure row has dimension_values
    if (!row || !row.dimension_values) {
      console.warn('[DATA-FIX] Row missing dimension_values:', row);
      return false;
    }

    const dimensionValues = row.dimension_values as Record<string, any>;

    // Apply date filter
    if (filters.dateRange) {
      // Prioritize account-scoped date dimension over global/custom
      const dateDimension = dimensions.find(d => d.type === 'date' && d.scope === 'account') 
        || dimensions.find(d => d.type === 'date' && d.scope === 'custom')
        || dimensions.find(d => d.type === 'date');
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

  const firstRow = data[0];
  if (!firstRow) {
    return { valid: false, reason: 'First row is null or undefined' };
  }

  // Handle both formats: row.dimension_values or row itself (if dimension_values are spread)
  const sampleRow = firstRow.dimension_values || firstRow;
  
  if (!sampleRow || typeof sampleRow !== 'object') {
    return { valid: false, reason: 'Sample row is not an object', sampleRow };
  }

  const dataKeys = Object.keys(sampleRow).filter(key => !key.startsWith('_'));
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
export async function calculateKPIMetrics(
  data: any[],
  dimensions: Dimension[],
  reportId?: string,
  accountId?: string
): Promise<Record<string, number>> {
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

  // Calculate budget if available
  if (reportId || accountId) {
    const budgetMetric = await calculateBudgetMetric(data, dimensions, reportId, accountId);
    if (budgetMetric !== null) {
      metrics['Budget'] = budgetMetric;
    }
  }

  // Calculate derived metrics with formulas
  const derivedDimensions = dimensions.filter(d => d.formula || (d.formula_condition_pairs && d.formula_condition_pairs.length > 0));
  derivedDimensions.forEach(dimension => {
    // Handle new multiple formula-condition pairs structure
    if (dimension.formula_condition_pairs && dimension.formula_condition_pairs.length > 0) {
      // For KPI metrics, we use the first formula without conditions, or the first formula overall
      const firstFormula = dimension.formula_condition_pairs.find(pair => !pair.conditions || pair.conditions.length === 0) 
                          || dimension.formula_condition_pairs[0];
      if (firstFormula && firstFormula.formula) {
        const calculatedValue = calculateFormula(firstFormula.formula, metrics, dimensions);
        if (calculatedValue !== null) {
          metrics[dimension.name] = calculatedValue;
        }
      }
    }
    // Handle backward compatibility with old single formula structure
    else if (dimension.formula) {
      const calculatedValue = calculateFormula(dimension.formula, metrics, dimensions);
      if (calculatedValue !== null) {
        metrics[dimension.name] = calculatedValue;
      }
    }
  });

  return metrics;
}

/**
 * Calculate budget metric (Budget - Cost)
 */
async function calculateBudgetMetric(
  data: any[],
  dimensions: Dimension[],
  reportId?: string,
  accountId?: string
): Promise<number | null> {
  try {
    console.log('[BUDGET-DEBUG] Starting budget calculation for:', { reportId, accountId });
    
    // Load budgets
    const { data: budgets, error } = await supabase
      .from('budgets')
      .select('*')
      .or(`report_id.eq.${reportId},account_id.eq.${accountId}`);

    if (error || !budgets || budgets.length === 0) {
      console.log('[BUDGET-DEBUG] No budgets found:', { error, budgetsLength: budgets?.length });
      return null;
    }
    
    console.log('[BUDGET-DEBUG] Found budgets:', budgets.map(b => ({ 
      dimension_name: b.dimension_name, 
      dimension_item: b.dimension_item,
      budget_data: b.budget_data 
    })));

    // Find date dimension
    const dateDimension = dimensions.find(d => d.type === 'date');
    if (!dateDimension) return null;

    // Find cost dimension
    const costDimension = dimensions.find(d => d.name === 'Cost');
    if (!costDimension) return null;

    let totalBudget = 0;
    let totalCost = 0;

    // Group data by month/year and dimension item
    const dataByMonthAndItem = new Map<string, { cost: number; budget: number }>();

    data.forEach(row => {
      const dateValue = row.dimension_values[dateDimension.id];
      if (!dateValue) return;

      const date = new Date(dateValue);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      
      console.log('[BUDGET-DEBUG] Processing date:', { dateValue, year, month });
      const cost = typeof row.dimension_values[costDimension.id] === 'number' 
        ? row.dimension_values[costDimension.id]
        : parseFloat(row.dimension_values[costDimension.id]) || 0;

      // Find matching budget
      budgets.forEach(budget => {
        const budgetDimension = dimensions.find(d => d.name === budget.dimension_name);
        if (!budgetDimension) return;

        const itemValue = row.dimension_values[budgetDimension.id];
        
        // Debug log to see what values we're trying to match
        if (budget.dimension_name === 'Account') {
          console.log('[BUDGET-DEBUG] Trying to match:', {
            itemValue,
            budgetItem: budget.dimension_item,
            cost,
            year,
            month
          });
        }
        
        // More flexible matching for budget items
        let isMatch = false;
        if (typeof itemValue === 'string' && typeof budget.dimension_item === 'string') {
          // Exact match first
          if (itemValue === budget.dimension_item) {
            isMatch = true;
          }
          // Partial match (case insensitive) - check if budget item is contained in the data value
          else if (itemValue.toLowerCase().includes(budget.dimension_item.toLowerCase()) ||
                   budget.dimension_item.toLowerCase().includes(itemValue.toLowerCase())) {
            isMatch = true;
          }
        } else if (itemValue === budget.dimension_item) {
          isMatch = true;
        }
        
        if (isMatch) {
          const monthlyBudget = budget.budget_data?.[year.toString()]?.[month.toString()] || 0;
          const key = `${year}-${month}-${budget.dimension_item}`;
          
          const existing = dataByMonthAndItem.get(key) || { cost: 0, budget: monthlyBudget };
          existing.cost += cost;
          dataByMonthAndItem.set(key, existing);
          
          console.log('[BUDGET-DEBUG] Matched budget:', {
            itemValue,
            budgetItem: budget.dimension_item,
            monthlyBudget,
            cost,
            key
          });
        }
      });
    });

    // Calculate total budget remaining
    dataByMonthAndItem.forEach(({ cost, budget }) => {
      totalBudget += budget;
      totalCost += cost;
    });

    const budgetRemaining = totalBudget > 0 ? totalBudget - totalCost : null;
    
    console.log('[BUDGET-DEBUG] Final calculation:', {
      totalBudget,
      totalCost,
      budgetRemaining,
      dataByMonthAndItemSize: dataByMonthAndItem.size
    });

    return budgetRemaining;
  } catch (error) {
    console.warn('[BUDGET] Error calculating budget metric:', error);
    return null;
  }
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

    // Handle percentage notation (e.g., "15%" becomes "0.15")
    processedFormula = processedFormula.replace(/(\d+(?:\.\d+)?)\s*%/g, (match, num) => {
      return `(${parseFloat(num) / 100})`;
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