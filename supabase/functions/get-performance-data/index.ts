import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

interface PerformanceDataRequest {
  reportId: string;
  groupByDims: string[];
  breakdownDims?: string[];
  thenByDims?: string[];
  dimensionFilters?: Record<string, string | string[]>;
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  userId?: string;
  visibleDimensionIds?: string[];
  limit?: number;
  offset?: number;
  compareEnabled?: boolean;
  compareDateFrom?: string;
  compareDateTo?: string;
  dateGranularity?: string;
  dateOrder?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests immediately - MUST be first
  if (req.method === 'OPTIONS') {
    console.log('[CORS] Handling OPTIONS preflight request');
    return new Response('ok', { 
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Length': '2'
      }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      reportId,
      groupByDims = [],
      breakdownDims = [],
      thenByDims = [],
      dimensionFilters = {},
      dateFrom,
      dateTo,
      accountId,
      userId,
      visibleDimensionIds = [],
      limit = 50000, // Reasonable limit for performance
      offset = 0,
      compareEnabled = false,
      compareDateFrom,
      compareDateTo,
      dateGranularity = 'none',
      dateOrder = 'desc',
    }: PerformanceDataRequest = await req.json();

    console.log('get-performance-data: Starting request', {
      reportId,
      groupByDims,
      limit,
      offset,
      compareEnabled,
      dateFrom,
      dateTo,
      dateGranularity,
      timestamp: new Date().toISOString()
    });
    
    console.log('get-performance-data: Date filter analysis:', {
      hasDateFrom: !!dateFrom,
      hasDateTo: !!dateTo,
      dateFromValue: dateFrom,
      dateToValue: dateTo,
      dateFromType: typeof dateFrom,
      dateToType: typeof dateTo,
      willApplyDateFilter: !!(dateFrom || dateTo)
    });

    // Helper function to parse dates in various formats
    const parseDateValue = (dateValue: any): Date | null => {
      if (!dateValue) return null;
      
      try {
        // If already a Date object, return it
        if (dateValue instanceof Date) {
          return isNaN(dateValue.getTime()) ? null : dateValue;
        }
        
        const stringValue = String(dateValue).trim();
        if (!stringValue) return null;
        
        // Try YYYY-MM-DD format (ISO format, what we store)
        // Parse as UTC to avoid timezone issues
        if (stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const parts = stringValue.split('-');
          if (parts.length === 3) {
            const [year, month, day] = parts;
            const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
            if (!isNaN(date.getTime())) return date;
          }
        }
        
        // Try MM/DD/YYYY format (legacy format)
        if (stringValue.includes('/')) {
          const parts = stringValue.split('/');
          if (parts.length === 3) {
            // Check if first part is 4 digits (YYYY) -> YYYY/MM/DD
            if (parts[0].length === 4) {
              const [year, month, day] = parts;
              const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              if (!isNaN(date.getTime())) return date;
            } else {
              // Assume MM/DD/YYYY
              const [month, day, year] = parts;
              const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              if (!isNaN(date.getTime())) return date;
            }
          }
        }
        
        // Try DD-MM-YYYY format
        if (stringValue.includes('-') && !stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const parts = stringValue.split('-');
          if (parts.length === 3 && parts[2].length === 4) {
            const [day, month, year] = parts;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            if (!isNaN(date.getTime())) return date;
          }
        }
        
        // Fallback: try standard Date parsing
        const date = new Date(stringValue);
        if (!isNaN(date.getTime())) return date;
        
        return null;
      } catch (e) {
        console.warn(`Failed to parse date value: ${dateValue}`, e);
        return null;
      }
    };

    // Helper function to retry queries with exponential backoff
    const retryQuery = async <T>(
      queryFn: () => Promise<{ data: T | null; error: any }>,
      maxRetries = 3,
      baseDelay = 1000
    ): Promise<{ data: T | null; error: any }> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const result = await queryFn();
        
        if (!result.error) {
          return result;
        }
        
        // Check if error is retryable (connection issues, timeouts, 5xx errors)
        const isRetryable = 
          result.error.message?.includes('520') ||
          result.error.message?.includes('timeout') ||
          result.error.message?.includes('ETIMEDOUT') ||
          result.error.message?.includes('ECONNREFUSED') ||
          result.error.code === 'PGRST301';
        
        if (!isRetryable || attempt === maxRetries - 1) {
          return result;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return await queryFn();
    };

    // Fetch dimensions (account-specific + custom for the user + global templates) with retry
    const dimensionsResult = await retryQuery(async () => {
      let query = supabase
        .from('dimensions')
        .select('id, name, type, formula, scope, user_id, report_id, account_id');
      
      // Load account-specific, custom, and global dimensions
      if (userId && accountId) {
        // Load: account-specific (for this account) + custom (for this user) + global (templates)
        query = query.or(`and(scope.eq.account,account_id.eq.${accountId}),and(scope.eq.custom,user_id.eq.${userId}),scope.eq.global`);
      } else if (userId) {
        // No accountId: load custom + global only
        query = query.or(`and(scope.eq.custom,user_id.eq.${userId}),scope.eq.global`);
      } else {
        // If no userId, only load global dimensions
        query = query.eq('scope', 'global');
      }
      
      return query;
    });
    
    const { data: allDimensions, error: dimError } = dimensionsResult;

    if (dimError) {
      console.error('Error fetching dimensions:', dimError);
      throw new Error(`Failed to fetch dimensions: ${dimError.message || 'Unknown error'}`);
    }

    // Filter dimensions for this specific report (include account + global + custom for this report)
    const dimensions = (allDimensions || []).filter((d: any) => 
      d.scope === 'global' || 
      d.scope === 'account' || // Include account-scoped dimensions
      (d.scope === 'custom' && d.user_id === userId && (d.report_id === null || d.report_id === reportId))
    );

    console.log(`Loaded ${dimensions.length} dimensions (${allDimensions?.length} total) for user ${userId}, report ${reportId}`);

    if (!dimensions || dimensions.length === 0) {
      console.error('No dimensions found');
      throw new Error('No dimensions configured for this report');
    }

    console.log(`Loaded ${dimensions?.length || 0} dimensions for aggregation`);

    // Load budgets for budget calculation
    const budgetsResult = await retryQuery(async () => {
      let query = supabase
        .from('budgets')
        .select('*');
      
      if (reportId) {
        query = query.eq('report_id', reportId);
      } else if (accountId) {
        query = query.eq('account_id', accountId);
      }
      
      return query;
    });

    const budgets = budgetsResult.data || [];
    console.log(`Loaded ${budgets.length} budgets for report/account`);

    // Load vlookup mappings for this report/account
    const vlookupMappings: Record<string, Array<{ sourceValue: string; targetValue: string }>> = {};
    if (userId) {
      const mappingsQuery = supabase
        .from('dimension_mappings')
        .select('*')
        .eq('user_id', userId);

      if (reportId) {
        mappingsQuery.or(`report_id.eq.${reportId},report_id.is.null`);
      }
      if (accountId) {
        mappingsQuery.or(`account_id.eq.${accountId},account_id.is.null`);
      }

      const { data: mappingsData, error: mappingsError } = await mappingsQuery;
      if (!mappingsError && mappingsData) {
        // Group mappings by target dimension ID
        mappingsData.forEach(m => {
          if (!vlookupMappings[m.target_dimension_id]) {
            vlookupMappings[m.target_dimension_id] = [];
          }
          vlookupMappings[m.target_dimension_id].push({
            sourceValue: m.source_value,
            targetValue: m.target_value,
          });
        });
        console.log(`Loaded ${mappingsData.length} vlookup mappings`);
      }
    }

    // Helper function to apply vlookup mappings to dimension values
    const applyVlookupMappings = (dimensionValues: Record<string, any>): Record<string, any> => {
      const result = { ...dimensionValues };
      for (const [dimId, value] of Object.entries(dimensionValues)) {
        const mappings = vlookupMappings[dimId];
        if (mappings && mappings.length > 0) {
          const mapping = mappings.find(m => 
            m.sourceValue.toLowerCase() === String(value).toLowerCase()
          );
          if (mapping) {
            result[dimId] = mapping.targetValue;
          }
        }
      }
      return result;
    };

    // Build filter for the main query with optimized settings
    // Fetch ALL data first, then apply date filtering in memory for better performance
    const query = supabase
      .from('dimension_data')
      .select('dimension_values, row_number')
      .eq('report_id', reportId)
      .order('row_number', { ascending: false })
      .limit(limit) // Use limit instead of range for better performance
      .abortSignal(AbortSignal.timeout(300000)); // Increased to 300 seconds (5 minutes) for very large datasets

    const rawDataResult = await retryQuery(async () => await query);
    const { data: rawData, error: dataError } = rawDataResult;

    if (dataError) {
      console.error('Error fetching dimension data:', dataError);
      throw new Error(`Failed to fetch dimension data: ${dataError.message || 'Unknown error'}`);
    }

      console.log(`Fetched ${rawData?.length || 0} raw rows`);
      console.log('Dimension filters:', JSON.stringify(dimensionFilters));
      console.log('Date range:', { dateFrom, dateTo });

      // Apply vlookup mappings to all rows
      let filteredData = (rawData || []).map(row => ({
        ...row,
        dimension_values: applyVlookupMappings(row.dimension_values as Record<string, any>)
      }));

      // Filter by dimension filters first
      if (Object.keys(dimensionFilters).length > 0) {
        const beforeCount = filteredData.length;
        filteredData = filteredData.filter((row) => {
          const dimValues = row.dimension_values as Record<string, any>;
          for (const [dimId, filterValue] of Object.entries(dimensionFilters)) {
            const rowValue = dimValues[dimId];
            
            // Handle both single values and arrays
            if (Array.isArray(filterValue)) {
              // For array filters, check if row value is in the array
              if (!filterValue.includes(rowValue)) {
                return false;
              }
            } else {
              // For single value filters, check exact match
              if (rowValue !== filterValue) {
                return false;
              }
            }
          }
          return true;
        });
        console.log(`After dimension filters: ${filteredData.length} rows (from ${beforeCount})`);
      }

      // Filter by date range (after dimension filters)
      if ((dateFrom || dateTo) && dimensions) {
        // Prioritize account-scoped date dimension over global/custom to ensure each account uses its own date dimension
        const dateDim = dimensions.find(d => d.type === 'date' && d.scope === 'account') 
          || dimensions.find(d => d.type === 'date' && d.scope === 'custom')
          || dimensions.find(d => d.type === 'date');
              console.log('get-performance-data: Applying date filter', {
        dateDimension: dateDim ? { id: dateDim.id, name: dateDim.name } : null,
        dateFrom,
        dateTo,
        dateFromParsed: dateFrom ? new Date(dateFrom).toISOString() : null,
        dateToParsed: dateTo ? new Date(dateTo).toISOString() : null,
        beforeFilterCount: filteredData.length,
        sampleRowDates: filteredData.slice(0, 3).map(row => ({
          rowNumber: row.row_number,
          dateValue: row.dimension_values[dateDim?.id || '']
        }))
      });
        if (dateDim) {
          const beforeDateCount = filteredData.length;
          filteredData = filteredData.filter((row) => {
            const dimValues = row.dimension_values as Record<string, any>;
            const dateValue = dimValues[dateDim.id];
            if (!dateValue) return false;

            const rowDate = parseDateValue(dateValue);
            if (!rowDate) return false;
            
            const dateFromObj = dateFrom ? new Date(dateFrom) : null;
            const dateToObj = dateTo ? new Date(dateTo) : null;
            
            // Normalize both dates to UTC for consistent comparison
            if (dateFromObj && !isNaN(dateFromObj.getTime())) {
              const rowDateUTC = Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth(), rowDate.getUTCDate());
              const fromDateUTC = Date.UTC(dateFromObj.getUTCFullYear(), dateFromObj.getUTCMonth(), dateFromObj.getUTCDate());
              if (rowDateUTC < fromDateUTC) return false;
            }
            
                      if (dateToObj && !isNaN(dateToObj.getTime())) {
            const rowDateUTC = Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth(), rowDate.getUTCDate());
            const toDateUTC = Date.UTC(dateToObj.getUTCFullYear(), dateToObj.getUTCMonth(), dateToObj.getUTCDate());
            // Include the end date: row date must be <= end date
            if (rowDateUTC > toDateUTC) return false;
          }
            
            return true;
          });
          console.log(`After date filters: ${filteredData.length} rows (from ${beforeDateCount})`);
        
        // Debug: Check if November 1st data is still present
        const nov1Data = filteredData.filter(row => {
          const dateValue = row.dimension_values[dateDim.id];
          return dateValue && dateValue.includes('2025-11-01');
        });
        
        if (nov1Data.length > 0) {
          console.log('🚨 ISSUE: November 1st data still present after filtering:', {
            nov1RowCount: nov1Data.length,
            sampleNov1Data: nov1Data.slice(0, 2).map(row => ({
              rowNumber: row.row_number,
              dateValue: row.dimension_values[dateDim.id],
              parsedDate: parseDateValue(row.dimension_values[dateDim.id])?.toISOString()
            }))
          });
        } else {
          console.log('✅ November 1st data correctly filtered out');
        }
        
        // Debug: Show sample dates that passed the filter
        if (filteredData.length > 0) {
          const sampleDates = filteredData.slice(0, 5).map(row => ({
            rowNumber: row.row_number,
            dateValue: row.dimension_values[dateDim.id],
            parsedDate: parseDateValue(row.dimension_values[dateDim.id])?.toISOString()
          }));
          console.log('Sample dates that passed filter:', sampleDates);
        }
        
        // Debug: Show sample dates that were filtered out
        const filteredOutSample = (rawData || []).filter(row => {
          const dimValues = row.dimension_values;
          const dateValue = dimValues[dateDim.id];
          if (!dateValue) return false;
          const rowDate = parseDateValue(dateValue);
          if (!rowDate) return false;
          
          const dateFromObj = dateFrom ? new Date(dateFrom) : null;
          const dateToObj = dateTo ? new Date(dateTo) : null;
          
          if (dateFromObj && !isNaN(dateFromObj.getTime())) {
            const rowDateUTC = Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth(), rowDate.getUTCDate());
            const fromDateUTC = Date.UTC(dateFromObj.getUTCFullYear(), dateFromObj.getUTCMonth(), dateFromObj.getUTCDate());
            if (rowDateUTC < fromDateUTC) return true;
          }
          if (dateToObj && !isNaN(dateToObj.getTime())) {
            const rowDateUTC = Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth(), rowDate.getUTCDate());
            const toDateUTC = Date.UTC(dateToObj.getUTCFullYear(), dateToObj.getUTCMonth(), dateToObj.getUTCDate());
            if (rowDateUTC > toDateUTC) return true;
          }
          return false;
        }).slice(0, 5);
        
        if (filteredOutSample.length > 0) {
          const filteredOutDates = filteredOutSample.map(row => ({
            rowNumber: row.row_number,
            dateValue: row.dimension_values[dateDim.id],
            parsedDate: parseDateValue(row.dimension_values[dateDim.id])?.toISOString(),
            reason: 'outside date range'
          }));
          console.log('Sample dates that were filtered OUT:', filteredOutDates);
        }
        }
      }

    console.log(`After all filtering: ${filteredData.length} rows`);

    // Fetch and filter comparison period data if enabled
    let compareFilteredData: any[] = [];
    if (compareEnabled && compareDateFrom && compareDateTo && dimensions) {
      // Prioritize account-scoped date dimension over global/custom
      const dateDim = dimensions.find(d => d.type === 'date' && d.scope === 'account') 
        || dimensions.find(d => d.type === 'date' && d.scope === 'custom')
        || dimensions.find(d => d.type === 'date');
      if (dateDim) {
        // Filter the same rawData for comparison period
        let compareData = rawData || [];
        
          // Apply same dimension filters (handle both single values and arrays)
          if (Object.keys(dimensionFilters).length > 0) {
            compareData = compareData.filter((row) => {
              const dimValues = row.dimension_values as Record<string, any>;
              for (const [dimId, filterValue] of Object.entries(dimensionFilters)) {
                const rowValue = dimValues[dimId];
                
                // Handle both single values and arrays
                if (Array.isArray(filterValue)) {
                  // For array filters, check if row value is in the array
                  if (!filterValue.includes(rowValue)) {
                    return false;
                  }
                } else {
                  // For single value filters, check exact match
                  if (rowValue !== filterValue) {
                    return false;
                  }
                }
              }
              return true;
            });
          }
        
          // Filter by comparison date range
          compareData = compareData.filter((row) => {
            const dimValues = row.dimension_values as Record<string, any>;
            const dateValue = dimValues[dateDim.id];
            if (!dateValue) return false;

            // Parse date using helper function
            const rowDate = parseDateValue(dateValue);
            if (!rowDate) return false;
            
            // Compare dates (ignore time component)
            const compareFromObj = compareDateFrom ? new Date(compareDateFrom) : null;
            const compareToObj = compareDateTo ? new Date(compareDateTo) : null;
            
            if (compareFromObj && !isNaN(compareFromObj.getTime())) {
              const rowDateStart = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate());
              const fromDateStart = new Date(compareFromObj.getFullYear(), compareFromObj.getMonth(), compareFromObj.getDate());
              if (rowDateStart < fromDateStart) return false;
            }
            
            if (compareToObj && !isNaN(compareToObj.getTime())) {
              const rowDateEnd = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate(), 23, 59, 59);
              const toDateEnd = new Date(compareToObj.getFullYear(), compareToObj.getMonth(), compareToObj.getDate(), 23, 59, 59);
              if (rowDateEnd > toDateEnd) return false;
            }
            
            return true;
          });
        
        compareFilteredData = compareData;
        console.log(`Comparison period: ${compareFilteredData.length} rows`);
      }
    }

      // Helper function to format date based on granularity
      const formatDateByGranularity = (dateStr: string, granularity: string): { key: string; display: string } => {
        try {
          // Handle year-only values (like "2023")
          if (/^\d{4}$/.test(String(dateStr).trim())) {
            const year = parseInt(String(dateStr));
            if (year >= 1900 && year <= 2100) {
              // Create a date for the year (January 1st)
              const date = new Date(year, 0, 1);
              
              switch (granularity) {
                case 'day':
                  return { key: `${year}-01-01`, display: `January 1, ${year}` };
                case 'week':
                  return { key: `${year}-W01`, display: `Week 1, ${year}` };
                case 'month':
                  return { key: `${year}-01`, display: `January ${year}` };
                case 'year':
                default:
                  return { key: String(year), display: String(year) };
              }
            }
          }
          
          // Parse date using helper function
          const date = parseDateValue(dateStr);
          if (!date) {
            return { key: dateStr, display: dateStr };
          }
        
        if (isNaN(date.getTime())) {
          return { key: dateStr, display: dateStr };
        }

        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11

        switch (granularity) {
          case 'year':
            return {
              key: `${year}`,
              display: `${year}`
            };
          case 'month':
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                               'July', 'August', 'September', 'October', 'November', 'December'];
            return {
              key: `${year}-${String(month + 1).padStart(2, '0')}`,
              display: `${monthNames[month]}, ${year}`
            };
          case 'week':
            // Calculate week number
            const firstDayOfYear = new Date(year, 0, 1);
            const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
            const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
            return {
              key: `${year}-W${String(weekNum).padStart(2, '0')}`,
              display: `Week ${weekNum}, ${year}`
            };
          case 'day':
          case 'none':
          default:
            return { key: dateStr, display: dateStr };
        }
      } catch (e) {
        return { key: dateStr, display: dateStr };
      }
    };

    // Group data by the first group dimension
    const groupDimId = groupByDims[0];
    
    // If no grouping is requested, return raw filtered data
    if (!groupDimId) {
      console.log('No grouping requested, returning raw filtered data');
      
      // Transform raw data to include both dimension_values and individual dimension properties
      const rawDataWithDimensions = filteredData.map((row, index) => {
        const transformedRow: any = {
          row_number: row.row_number,
          dimension_values: row.dimension_values,
        };
        
        // Add individual dimension properties for easier access
        if (dimensions) {
          for (const dim of dimensions) {
            const value = (row.dimension_values as Record<string, any>)[dim.id];
            if (value !== undefined) {
              transformedRow[dim.name] = value;
            }
          }
        }
        
        return transformedRow;
      });
      
      return new Response(
        JSON.stringify({
          data: rawDataWithDimensions.slice(offset, offset + limit),
          total: filteredData.length,
          totalCount: filteredData.length,
          hasMore: offset + limit < filteredData.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const grouped = new Map<string, any>();
    const groupDimension = dimensions?.find(d => d.id === groupDimId);
    const isDateGrouping = groupDimension?.type === 'date' && dateGranularity !== 'none';

    for (const row of filteredData) {
      const dimValues = row.dimension_values as Record<string, any>;
      const rawGroupKey = dimValues[groupDimId] || 'Unknown';
      let groupKey = rawGroupKey;
      let displayName = rawGroupKey;

      // If grouping by date with granularity, transform the date
      if (isDateGrouping && rawGroupKey !== 'Unknown') {
        const formatted = formatDateByGranularity(rawGroupKey, dateGranularity);
        groupKey = formatted.key;
        displayName = formatted.display;
      }

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          id: `${groupKey}`.toLowerCase().replace(/\s+/g, '-'),
          name: displayName,
          level: 0,
          data: {},
          rawRows: [],
          sortKey: groupKey, // Store the key for sorting
        });
      }

      const groupItem = grouped.get(groupKey);
      groupItem.rawRows.push(row);

      // Aggregate base metrics (non-formula dimensions)
      for (const dim of dimensions || []) {
        if (dim.formula) continue;

        const value = dimValues[dim.id];
        if (value !== undefined && value !== null) {
          if (dim.type === 'number' || dim.type === 'currency') {
            const numValue = parseFloat(value) || 0;
            groupItem.data[dim.name] = (groupItem.data[dim.name] || 0) + numValue;
          } else if (dim.type === 'date') {
            if (!groupItem.data[dim.name]) {
              groupItem.data[dim.name] = value;
            }
          } else {
            groupItem.data[dim.name] = value;
          }
        }
      }
    }

    // Calculate formulas for each group
    const calculateFormula = (formula: string, data: Record<string, any>): number => {
      try {
        let expression = formula;
        
        // Get dimension names and sort by length (descending) to replace longer names first
        // This prevents "Cost" from being replaced when we want "Cost of sale"
        const dimensionNames = (dimensions || []).map(d => d.name).sort((a, b) => b.length - a.length);
        
        // Also check for "Total <dimensionName>" pattern which refers to the sum of that dimension
        for (const dimName of dimensionNames) {
          // Check for "Total <dimensionName>" pattern first
          const totalPattern = `Total ${dimName}`;
          if (expression.includes(totalPattern)) {
            const value = data[dimName];
            const numValue = (value !== null && value !== undefined) ? (typeof value === 'number' ? value : parseFloat(value) || 0) : 0;
            
            const escapedPattern = totalPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedPattern, 'g');
            expression = expression.replace(regex, `(${numValue})`);
          }
          
          // Then replace individual dimension names
          if (expression.includes(dimName)) {
            const value = data[dimName];
            const numValue = (value !== null && value !== undefined) ? (typeof value === 'number' ? value : parseFloat(value) || 0) : 0;
            
            // Escape special regex characters and replace all occurrences
            const escapedName = dimName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
            expression = expression.replace(regex, `(${numValue})`);
          }
        }
        
        // Handle percentage notation (e.g., "15%" becomes "0.15")
        expression = expression.replace(/(\d+(?:\.\d+)?)\s*%/g, (match, num) => {
          return `(${parseFloat(num) / 100})`;
        });
        
        // Evaluate the expression
        const result = eval(expression);
        return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;
      } catch (error) {
        console.error('Error calculating formula:', error, 'Formula:', formula);
        return 0;
      }
    };

    const groupedArray = Array.from(grouped.values());

    // Sort by date if first dimension is a date type
    if (isDateGrouping) {
      groupedArray.sort((a, b) => {
        // Use sortKey for proper ordering
        const keyA = a.sortKey || a.name;
        const keyB = b.sortKey || b.name;
        
        // For year and month, we can compare keys directly
        if (dateGranularity === 'year' || dateGranularity === 'month' || dateGranularity === 'week') {
          return dateOrder === 'desc' ? keyB.localeCompare(keyA) : keyA.localeCompare(keyB);
        }
        
        // For day granularity or fallback
        const dateA = new Date(keyA);
        const dateB = new Date(keyB);
        
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          return 0;
        }
        
        return dateOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
      });
    }

    // Group comparison data by the same dimension if enabled
    const compareGrouped = new Map<string, any>();
    if (compareFilteredData.length > 0 && dimensions) {
      for (const row of compareFilteredData) {
        const dimValues = row.dimension_values as Record<string, any>;
        const rawGroupKey = dimValues[groupDimId] || 'Unknown';
        let groupKey = rawGroupKey;

        // If grouping by date with granularity, transform the date
        if (isDateGrouping && rawGroupKey !== 'Unknown') {
          const formatted = formatDateByGranularity(rawGroupKey, dateGranularity);
          groupKey = formatted.key;
        }

        if (!compareGrouped.has(groupKey)) {
          compareGrouped.set(groupKey, {
            data: {},
          });
        }

        const groupItem = compareGrouped.get(groupKey);

        // Aggregate base metrics (non-formula dimensions)
        for (const dim of dimensions) {
          if (dim.formula) continue;

          const value = dimValues[dim.id];
          if (value !== undefined && value !== null) {
            if (dim.type === 'number' || dim.type === 'currency') {
              const numValue = parseFloat(value) || 0;
              groupItem.data[dim.name] = (groupItem.data[dim.name] || 0) + numValue;
            }
          }
        }
      }

      // Calculate formulas for comparison groups
      for (const [key, group] of compareGrouped.entries()) {
        for (const dim of dimensions) {
          if (dim.formula) {
            const calculatedValue = calculateFormula(dim.formula, group.data);
            group.data[dim.name] = calculatedValue;
          }
        }
      }
    }

    for (const group of groupedArray) {
      // Calculate formula fields
      for (const dim of dimensions || []) {
        if (dim.formula) {
          const calculatedValue = calculateFormula(dim.formula, group.data);
          group.data[dim.name] = calculatedValue;
        }
      }

      // Calculate budget if budgets exist
      if (budgets.length > 0 && dimensions) {
        const dateDim = dimensions.find(d => d.type === 'date');
        const costDim = dimensions.find(d => d.name === 'Cost');
        
        if (dateDim && costDim && group.rawRows.length > 0) {
          let budgetTotal = 0;
          const costTotal = group.data['Cost'] || 0;
          
          // Extract year/month from the first row in the group
          const firstRow = group.rawRows[0];
          const dateValue = firstRow.dimension_values[dateDim.id];
          
          if (dateValue) {
            const date = new Date(dateValue);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            
            // Find matching budgets for this group
            budgets.forEach(budget => {
              const budgetDim = dimensions.find(d => d.name === budget.dimension_name);
              if (!budgetDim) return;
              
              // Check if any row in this group matches the budget dimension item
              const hasMatchingItem = group.rawRows.some((row: any) => 
                row.dimension_values[budgetDim.id] === budget.dimension_item
              );
              
              if (hasMatchingItem) {
                const monthlyBudget = budget.budget_data?.[year.toString()]?.[month.toString()] || 0;
                budgetTotal += monthlyBudget;
              }
            });
            
            // Add Budget dimension if we found budget data
            if (budgetTotal > 0) {
              group.data['Budget'] = budgetTotal - costTotal;
            }
          }
        }
      }

      // Add comparison data and percentage changes if available
      if (compareGrouped.size > 0) {
        const compareGroup = compareGrouped.get(group.name);
        if (compareGroup && dimensions) {
          group.compareData = {};
          group.changeData = {};
          
          for (const dim of dimensions) {
            if (dim.type === 'number' || dim.type === 'currency' || dim.formula) {
              const currentValue = group.data[dim.name] || 0;
              const compareValue = compareGroup.data[dim.name] || 0;
              
              group.compareData[dim.name] = compareValue;
              
              // Calculate percentage change
              if (compareValue !== 0) {
                const change = ((currentValue - compareValue) / compareValue) * 100;
                group.changeData[dim.name] = change;
              } else if (currentValue !== 0) {
                // If compare value is 0 but current is not, show 100% or -100%
                group.changeData[dim.name] = currentValue > 0 ? 100 : -100;
              } else {
                group.changeData[dim.name] = 0;
              }
            }
          }
        }
      }

      // Build children if breakdown dimension exists (use index 0, not 1)
      if (breakdownDims.length > 0 && breakdownDims[0] && group.rawRows.length > 0) {
        const breakdownDimId = breakdownDims[0]; // Use first dimension for breakdown
        const breakdownDimension = dimensions?.find(d => d.id === breakdownDimId);
        const isBreakdownDateGrouping = breakdownDimension?.type === 'date' && dateGranularity !== 'none';
        const breakdownGrouped = new Map<string, any>();

        for (const row of group.rawRows) {
          const dimValues = row.dimension_values as Record<string, any>;
          const rawBreakdownKey = dimValues[breakdownDimId] || 'Unknown';
          let breakdownKey = rawBreakdownKey;
          let breakdownDisplayName = rawBreakdownKey;

          // If breakdown dimension is date with granularity, transform it
          if (isBreakdownDateGrouping && rawBreakdownKey !== 'Unknown') {
            const formatted = formatDateByGranularity(rawBreakdownKey, dateGranularity);
            breakdownKey = formatted.key;
            breakdownDisplayName = formatted.display;
          }

          if (!breakdownGrouped.has(breakdownKey)) {
            breakdownGrouped.set(breakdownKey, {
              id: `${group.id}-${breakdownKey}`.toLowerCase().replace(/\s+/g, '-'),
              name: breakdownDisplayName,
              level: 1,
              data: {},
              rawRows: [], // Store raw rows for third level
              sortKey: breakdownKey,
            });
          }

          const breakdownItem = breakdownGrouped.get(breakdownKey);
          breakdownItem.rawRows.push(row);

          // Aggregate for breakdown
          for (const dim of dimensions || []) {
            if (dim.formula) continue;

            const value = dimValues[dim.id];
            if (value !== undefined && value !== null) {
              if (dim.type === 'number' || dim.type === 'currency') {
                const numValue = parseFloat(value) || 0;
                breakdownItem.data[dim.name] = (breakdownItem.data[dim.name] || 0) + numValue;
              } else {
                breakdownItem.data[dim.name] = value;
              }
            }
          }
        }

        const breakdownArray = Array.from(breakdownGrouped.values());

        // Sort breakdown by date if second dimension is a date type
        if (isBreakdownDateGrouping) {
          breakdownArray.sort((a, b) => {
            const keyA = a.sortKey || a.name;
            const keyB = b.sortKey || b.name;
            
            if (dateGranularity === 'year' || dateGranularity === 'month' || dateGranularity === 'week') {
              return dateOrder === 'desc' ? keyB.localeCompare(keyA) : keyA.localeCompare(keyB);
            }
            
            const dateA = new Date(keyA);
            const dateB = new Date(keyB);
            
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
              return 0;
            }
            
            return dateOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
          });
        }

        // Calculate formulas for breakdowns
        for (const breakdownItem of breakdownArray) {
          for (const dim of dimensions || []) {
            if (dim.formula) {
              const calculatedValue = calculateFormula(dim.formula, breakdownItem.data);
              breakdownItem.data[dim.name] = calculatedValue;
            }
          }

          // Calculate budget for breakdown items
          if (budgets.length > 0 && dimensions) {
            const dateDim = dimensions.find(d => d.type === 'date');
            const costDim = dimensions.find(d => d.name === 'Cost');
            
            if (dateDim && costDim && breakdownItem.rawRows.length > 0) {
              let budgetTotal = 0;
              const costTotal = breakdownItem.data['Cost'] || 0;
              
              const firstRow = breakdownItem.rawRows[0];
              const dateValue = firstRow.dimension_values[dateDim.id];
              
              if (dateValue) {
                const date = new Date(dateValue);
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                
                budgets.forEach(budget => {
                  const budgetDim = dimensions.find(d => d.name === budget.dimension_name);
                  if (!budgetDim) return;
                  
                  const hasMatchingItem = breakdownItem.rawRows.some((row: any) => 
                    row.dimension_values[budgetDim.id] === budget.dimension_item
                  );
                  
                  if (hasMatchingItem) {
                    const monthlyBudget = budget.budget_data?.[year.toString()]?.[month.toString()] || 0;
                    budgetTotal += monthlyBudget;
                  }
                });
                
                if (budgetTotal > 0) {
                  breakdownItem.data['Budget'] = budgetTotal - costTotal;
                }
              }
            }
          }
          
          // Build third level if "then by" dimension exists (use index 0)
          if (thenByDims.length > 0 && thenByDims[0] && breakdownItem.rawRows.length > 0) {
            const thenByDimId = thenByDims[0]; // Use first dimension for "then by"
            const thenByDimension = dimensions?.find(d => d.id === thenByDimId);
            const isThenByDateGrouping = thenByDimension?.type === 'date' && dateGranularity !== 'none';
            const thenByGrouped = new Map<string, any>();

            for (const row of breakdownItem.rawRows) {
              const dimValues = row.dimension_values as Record<string, any>;
              const rawThenByKey = dimValues[thenByDimId] || 'Unknown';
              let thenByKey = rawThenByKey;
              let thenByDisplayName = rawThenByKey;

              // If then by dimension is date with granularity, transform it
              if (isThenByDateGrouping && rawThenByKey !== 'Unknown') {
                const formatted = formatDateByGranularity(rawThenByKey, dateGranularity);
                thenByKey = formatted.key;
                thenByDisplayName = formatted.display;
              }

              if (!thenByGrouped.has(thenByKey)) {
                thenByGrouped.set(thenByKey, {
                  id: `${breakdownItem.id}-${thenByKey}`.toLowerCase().replace(/\s+/g, '-'),
                  name: thenByDisplayName,
                  level: 2,
                  data: {},
                  sortKey: thenByKey,
                });
              }

              const thenByItem = thenByGrouped.get(thenByKey);

              // Aggregate for third level
              for (const dim of dimensions || []) {
                if (dim.formula) continue;

                const value = dimValues[dim.id];
                if (value !== undefined && value !== null) {
                  if (dim.type === 'number' || dim.type === 'currency') {
                    const numValue = parseFloat(value) || 0;
                    thenByItem.data[dim.name] = (thenByItem.data[dim.name] || 0) + numValue;
                  } else {
                    thenByItem.data[dim.name] = value;
                  }
                }
              }
            }

            const thenByArray = Array.from(thenByGrouped.values());

            // Sort thenBy by date if third dimension is a date type
            if (isThenByDateGrouping) {
              thenByArray.sort((a, b) => {
                const keyA = a.sortKey || a.name;
                const keyB = b.sortKey || b.name;
                
                if (dateGranularity === 'year' || dateGranularity === 'month' || dateGranularity === 'week') {
                  return dateOrder === 'desc' ? keyB.localeCompare(keyA) : keyA.localeCompare(keyB);
                }
                
                const dateA = new Date(keyA);
                const dateB = new Date(keyB);
                
                if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                  return 0;
                }
                
                return dateOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
              });
            }

            // Calculate formulas for third level
            for (const thenByItem of thenByArray) {
              for (const dim of dimensions || []) {
                if (dim.formula) {
                  const calculatedValue = calculateFormula(dim.formula, thenByItem.data);
                  thenByItem.data[dim.name] = calculatedValue;
                }
              }

              // Calculate budget for thenBy items
              if (budgets.length > 0 && dimensions) {
                const dateDim = dimensions.find(d => d.type === 'date');
                const costDim = dimensions.find(d => d.name === 'Cost');
                
                if (dateDim && costDim && thenByItem.data['Cost'] !== undefined) {
                  let budgetTotal = 0;
                  const costTotal = thenByItem.data['Cost'] || 0;
                  
                  // Get date from thenByItem's name or data
                  let dateValue = thenByItem.data[dateDim.name];
                  if (!dateValue) {
                    // Try to parse from the group's raw data
                    const parentRows = breakdownItem.rawRows.filter((row: any) => {
                      const dimValues = row.dimension_values as Record<string, any>;
                      const rowValue = dimValues[thenByDimId];
                      return rowValue === thenByItem.sortKey || rowValue === thenByItem.name;
                    });
                    if (parentRows.length > 0) {
                      dateValue = parentRows[0].dimension_values[dateDim.id];
                    }
                  }
                  
                  if (dateValue) {
                    const date = new Date(dateValue);
                    const year = date.getFullYear();
                    const month = date.getMonth() + 1;
                    
                    budgets.forEach(budget => {
                      const budgetDim = dimensions.find(d => d.name === budget.dimension_name);
                      if (!budgetDim) return;
                      
                      // Check if any parent row matches the budget dimension item
                      const parentRows = breakdownItem.rawRows.filter((row: any) => {
                        const dimValues = row.dimension_values as Record<string, any>;
                        const rowValue = dimValues[thenByDimId];
                        return rowValue === thenByItem.sortKey || rowValue === thenByItem.name;
                      });
                      
                      const hasMatchingItem = parentRows.some((row: any) =>
                        row.dimension_values[budgetDim.id] === budget.dimension_item
                      );
                      
                      if (hasMatchingItem) {
                        const monthlyBudget = budget.budget_data?.[year.toString()]?.[month.toString()] || 0;
                        budgetTotal += monthlyBudget;
                      }
                    });
                    
                    if (budgetTotal > 0) {
                      thenByItem.data['Budget'] = budgetTotal - costTotal;
                    }
                  }
                }
              }
            }

            breakdownItem.children = thenByArray;
          }
          
          // Clean up rawRows from breakdown level
          delete breakdownItem.rawRows;
        }

        group.children = breakdownArray;
      }

      delete group.rawRows;
    }

    console.log(`Built ${groupedArray.length} grouped rows`);
    
    // Debug: Check what dates are in the final grouped data
    if (groupedArray.length > 0) {
      const groupedDates = groupedArray.map(group => ({
        name: group.name,
        sortKey: group.sortKey,
        id: group.id
      }));
      console.log('Final grouped dates:', groupedDates);
      
      // Specifically check for November dates
      const novemberGroups = groupedArray.filter(group => 
        group.name.includes('November') || 
        group.sortKey?.includes('2025-11') ||
        group.name.includes('2025-11')
      );
      
      if (novemberGroups.length > 0) {
        console.log('🚨 ISSUE: November dates found in final grouped data:', novemberGroups.map(g => ({
          name: g.name,
          sortKey: g.sortKey,
          dataKeys: Object.keys(g.data)
        })));
      } else {
        console.log('✅ No November dates in final grouped data');
      }
    }

    // Calculate total for all visible metric columns
    const totalData: Record<string, any> = {};
    for (const dim of dimensions || []) {
      if (dim.formula) continue;
      if (dim.type === 'number' || dim.type === 'currency') {
        let sum = 0;
        for (const row of filteredData) {
          const dimValues = row.dimension_values as Record<string, any>;
          const value = dimValues[dim.id];
          if (value !== undefined && value !== null) {
            sum += parseFloat(value) || 0;
          }
        }
        totalData[dim.name] = sum;
      }
    }

    // Calculate formula totals
    for (const dim of dimensions || []) {
      if (dim.formula) {
        totalData[dim.name] = calculateFormula(dim.formula, totalData);
      }
    }

    // Calculate comparison totals if enabled
    const totalCompareData: Record<string, any> = {};
    const totalChangeData: Record<string, any> = {};
    if (compareFilteredData.length > 0 && dimensions) {
      for (const dim of dimensions) {
        if (dim.formula) continue;
        if (dim.type === 'number' || dim.type === 'currency') {
          let sum = 0;
          for (const row of compareFilteredData) {
            const dimValues = row.dimension_values as Record<string, any>;
            const value = dimValues[dim.id];
            if (value !== undefined && value !== null) {
              sum += parseFloat(value) || 0;
            }
          }
          totalCompareData[dim.name] = sum;
        }
      }

      // Calculate formula totals for comparison
      for (const dim of dimensions) {
        if (dim.formula) {
          totalCompareData[dim.name] = calculateFormula(dim.formula, totalCompareData);
        }
      }

      // Calculate percentage changes for totals
      for (const dim of dimensions) {
        if (dim.type === 'number' || dim.type === 'currency' || dim.formula) {
          const currentValue = totalData[dim.name] || 0;
          const compareValue = totalCompareData[dim.name] || 0;
          
          if (compareValue !== 0) {
            const change = ((currentValue - compareValue) / compareValue) * 100;
            totalChangeData[dim.name] = change;
          } else if (currentValue !== 0) {
            totalChangeData[dim.name] = currentValue > 0 ? 100 : -100;
          } else {
            totalChangeData[dim.name] = 0;
          }
        }
      }
    }

    const response = {
      data: groupedArray,
      total: filteredData.length,
      totalData,
      totalCompareData: Object.keys(totalCompareData).length > 0 ? totalCompareData : undefined,
      totalChangeData: Object.keys(totalChangeData).length > 0 ? totalChangeData : undefined,
      hasMore: offset + limit < filteredData.length,
    };

    console.log('get-performance-data: Response prepared', {
      rowCount: groupedArray.length,
      total: filteredData.length,
      hasMore: response.hasMore,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in get-performance-data:', error);
    
    // Provide more detailed error messages
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check for specific error types
      if (errorMessage.includes('dimensions') || errorMessage.includes('dimension data')) {
        statusCode = 503; // Service Unavailable - temporary database issue
      } else if (errorMessage.includes('timeout') || errorMessage.includes('520')) {
        statusCode = 504; // Gateway Timeout
      }
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now(),
      }), 
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
