import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      limit = 10000,
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
      dateGranularity
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
        if (stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const parts = stringValue.split('-');
          if (parts.length === 3) {
            const [year, month, day] = parts;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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

    // Fetch dimensions (global + custom for the user) with retry
    const dimensionsResult = await retryQuery(async () => {
      let query = supabase
        .from('dimensions')
        .select('id, name, type, formula, scope, user_id, report_id');
      
      // Load global dimensions and custom dimensions for the user
      if (userId) {
        query = query.or(`scope.eq.global,and(scope.eq.custom,user_id.eq.${userId})`);
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

    // Filter dimensions for this specific report (include global + custom for this report)
    const dimensions = (allDimensions || []).filter((d: any) => 
      d.scope === 'global' || 
      (d.scope === 'custom' && d.user_id === userId && (d.report_id === null || d.report_id === reportId))
    );

    console.log(`Loaded ${dimensions.length} dimensions (${allDimensions?.length} total) for user ${userId}, report ${reportId}`);

    if (!dimensions || dimensions.length === 0) {
      console.error('No dimensions found');
      throw new Error('No dimensions configured for this report');
    }

    console.log(`Loaded ${dimensions?.length || 0} dimensions for aggregation`);

    // Build filter for the main query with optimized settings
    let query = supabase
      .from('dimension_data')
      .select('dimension_values, row_number')
      .eq('report_id', reportId)
      .order('row_number', { ascending: false })
      .abortSignal(AbortSignal.timeout(60000)); // 60 second timeout

    // Apply date filters if provided
    if (dateFrom || dateTo) {
      const dateDim = dimensions?.find(d => d.type === 'date');
      if (dateDim) {
        // We'll filter client-side since JSONB queries are complex
      }
    }

    // Fetch data with limit and offset with retry
    query = query.range(offset, offset + limit - 1);

    const rawDataResult = await retryQuery(async () => await query);
    const { data: rawData, error: dataError } = rawDataResult;

    if (dataError) {
      console.error('Error fetching dimension data:', dataError);
      throw new Error(`Failed to fetch dimension data: ${dataError.message || 'Unknown error'}`);
    }

      console.log(`Fetched ${rawData?.length || 0} raw rows`);
      console.log('Dimension filters:', JSON.stringify(dimensionFilters));
      console.log('Date range:', { dateFrom, dateTo });

      // Apply filters and build hierarchical structure
      let filteredData = rawData || [];

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
        const dateDim = dimensions.find(d => d.type === 'date');
        if (dateDim) {
          const beforeDateCount = filteredData.length;
          filteredData = filteredData.filter((row) => {
            const dimValues = row.dimension_values as Record<string, any>;
            const dateValue = dimValues[dateDim.id];
            if (!dateValue) return false; // Exclude rows without date values

            // Parse date using helper function
            const rowDate = parseDateValue(dateValue);
            if (!rowDate) {
              console.warn(`Invalid date value: ${dateValue}`);
              return false;
            }
            
            // Compare dates (ignore time component)
            const dateFromObj = dateFrom ? new Date(dateFrom) : null;
            const dateToObj = dateTo ? new Date(dateTo) : null;
            
            if (dateFromObj && !isNaN(dateFromObj.getTime())) {
              // Compare dates at start of day
              const rowDateStart = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate());
              const fromDateStart = new Date(dateFromObj.getFullYear(), dateFromObj.getMonth(), dateFromObj.getDate());
              if (rowDateStart < fromDateStart) return false;
            }
            
            if (dateToObj && !isNaN(dateToObj.getTime())) {
              // Compare dates at end of day
              const rowDateEnd = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate(), 23, 59, 59);
              const toDateEnd = new Date(dateToObj.getFullYear(), dateToObj.getMonth(), dateToObj.getDate(), 23, 59, 59);
              if (rowDateEnd > toDateEnd) return false;
            }
            
            return true;
          });
          console.log(`After date filters: ${filteredData.length} rows (from ${beforeDateCount})`);
        } else {
          console.warn('Date filter requested but no date dimension found');
        }
      }

    console.log(`After all filtering: ${filteredData.length} rows`);

    // Fetch and filter comparison period data if enabled
    let compareFilteredData: any[] = [];
    if (compareEnabled && compareDateFrom && compareDateTo && dimensions) {
      const dateDim = dimensions.find(d => d.type === 'date');
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
    
    if (!groupDimId) {
      return new Response(
        JSON.stringify({
          data: [],
          total: 0,
          hasMore: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const grouped = new Map<string, any>();
    const groupDimension = dimensions?.find(d => d.id === groupDimId);
    const isDateGrouping = groupDimension?.type === 'date' && dateGranularity !== 'none';

    for (const row of filteredData) {
      const dimValues = row.dimension_values as Record<string, any>;
      let rawGroupKey = dimValues[groupDimId] || 'Unknown';
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
        let rawGroupKey = dimValues[groupDimId] || 'Unknown';
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

      // Build children if breakdown dimension exists (use index 1, not 0)
      if (breakdownDims.length > 1 && breakdownDims[1] && group.rawRows.length > 0) {
        const breakdownDimId = breakdownDims[1]; // Use second dimension for breakdown
        const breakdownDimension = dimensions?.find(d => d.id === breakdownDimId);
        const isBreakdownDateGrouping = breakdownDimension?.type === 'date' && dateGranularity !== 'none';
        const breakdownGrouped = new Map<string, any>();

        for (const row of group.rawRows) {
          const dimValues = row.dimension_values as Record<string, any>;
          let rawBreakdownKey = dimValues[breakdownDimId] || 'Unknown';
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
          
          // Build third level if "then by" dimension exists (use index 2)
          if (thenByDims.length > 2 && thenByDims[2] && breakdownItem.rawRows.length > 0) {
            const thenByDimId = thenByDims[2]; // Use third dimension for "then by"
            const thenByDimension = dimensions?.find(d => d.id === thenByDimId);
            const isThenByDateGrouping = thenByDimension?.type === 'date' && dateGranularity !== 'none';
            const thenByGrouped = new Map<string, any>();

            for (const row of breakdownItem.rawRows) {
              const dimValues = row.dimension_values as Record<string, any>;
              let rawThenByKey = dimValues[thenByDimId] || 'Unknown';
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
    let totalCompareData: Record<string, any> = {};
    let totalChangeData: Record<string, any> = {};
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
