import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    const {
      reportId,
      accountId,
      userId,
      dateFrom,
      dateTo,
      dimensionFilters = {},
      visibleDimensionIds = [],
      limit = 50000,
      offset = 0,
    } = await req.json();

    console.log('[GET-PERFORMANCE-DATA] Starting query:', {
      reportId,
      accountId,
      dateFrom,
      dateTo,
      filterCount: Object.keys(dimensionFilters).length,
    });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Helper function to retry database queries
    const retryQuery = async (queryFn: () => any, maxRetries = 3) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          const result = await queryFn();
          if (result.error) {
            if (i === maxRetries - 1) throw result.error;
            console.log(`[GET-PERFORMANCE-DATA] Query error, retrying (${i + 1}/${maxRetries}):`, result.error);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            continue;
          }
          return result;
        } catch (error) {
          if (i === maxRetries - 1) throw error;
          console.log(`[GET-PERFORMANCE-DATA] Exception, retrying (${i + 1}/${maxRetries}):`, error);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    };

    // Load dimensions to map IDs to names with retry
    const dimensionsResult = await retryQuery(async () => 
      await supabase
        .from('dimensions')
        .select('id, name, type')
        .or(`and(scope.eq.account,account_id.eq.${accountId}),and(scope.eq.custom,user_id.eq.${userId}),scope.eq.global`)
    );

    if (!dimensionsResult || dimensionsResult.error) {
      const error = dimensionsResult?.error || new Error('Failed to load dimensions');
      console.error('[GET-PERFORMANCE-DATA] Error loading dimensions:', error);
      throw error;
    }

    const dimensions = dimensionsResult.data;

    // Create dimension ID to name mapping
    const dimensionMap = new Map();
    dimensions?.forEach((dim: any) => {
      dimensionMap.set(dim.id, { name: dim.name, type: dim.type });
    });

    // Build query for dimension_data with retry
    const dimensionDataResult = await retryQuery(async () => {
      let query = supabase
        .from('dimension_data')
        .select('dimension_values, row_number, data_source_id')
        .eq('report_id', reportId);

<<<<<<< HEAD
    // Load vlookup mappings for this report/account
    const vlookupMappings: Record<string, Array<{ sourceValue: string; targetValue: string }>> = {};
    if (userId) {
      const mappingsQuery = supabase
        .from('dimension_mappings')
        .select('*')
        .eq('user_id', userId);

      if (reportId) {
        mappingsQuery.or(`report_id.eq.${reportId},report_id.is.null`);
=======
      // Apply limit and offset
      if (limit) {
        query = query.limit(limit);
>>>>>>> 1c998a4f68425652b77fe9d79c9ba9a120bfd221
      }
      if (offset) {
        query = query.range(offset, offset + limit - 1);
      }

      return await query;
    });

    if (!dimensionDataResult || dimensionDataResult.error) {
      const error = dimensionDataResult?.error || new Error('Failed to load dimension data');
      console.error('[GET-PERFORMANCE-DATA] Query error:', error);
      throw error;
    }

    const dimensionData = dimensionDataResult.data;

    console.log('[GET-PERFORMANCE-DATA] Fetched rows:', dimensionData?.length || 0);

    // Filter data based on date range and dimension filters
    let filteredData = dimensionData || [];

    // Apply date filter if provided
    if (dateFrom || dateTo) {
      // First, find which date dimension is actually used in the data for this report
      // Check all date dimensions and see which one has data
      const { data: allDateDimensions } = await supabase
        .from('dimensions')
        .select('id, name')
        .eq('type', 'date')
        .eq('name', 'Date')
        .or(`and(scope.eq.account,account_id.eq.${accountId}),and(scope.eq.custom,user_id.eq.${userId}),scope.eq.global`)
        .order('scope', { ascending: false }); // Prefer account > custom > global

      // Find the date dimension that's actually used in the data
      let dateDimension = null;
      if (allDateDimensions && allDateDimensions.length > 0) {
        // Check which date dimension has data in the fetched rows
        for (const dim of allDateDimensions) {
          const hasData = filteredData.some((row: any) => {
            const dateValue = row.dimension_values?.[dim.id];
            return dateValue !== undefined && dateValue !== null && dateValue !== '';
          });
          
          if (hasData) {
            dateDimension = dim;
            console.log('[GET-PERFORMANCE-DATA] Found date dimension in data:', dim.id);
            break;
          }
        }
        
        // If no date dimension found in data, use the first one (fallback)
        if (!dateDimension && allDateDimensions.length > 0) {
          dateDimension = allDateDimensions[0];
          console.log('[GET-PERFORMANCE-DATA] No date dimension found in data, using fallback:', dateDimension.id);
        }
      }

<<<<<<< HEAD
    // Build filter for the main query with optimized settings
    // Fetch ALL data first, then apply date filtering in memory for better performance
    const query = supabase
      .from('dimension_data')
      .select('dimension_values, row_number')
      .eq('report_id', reportId)
      .order('row_number', { ascending: false })
      .limit(limit) // Use limit instead of range for better performance
      .abortSignal(AbortSignal.timeout(300000)); // Increased to 300 seconds (5 minutes) for very large datasets
=======
      if (dateDimension) {
        const beforeFilterCount = filteredData.length;
        filteredData = filteredData.filter((row: any) => {
          const dateValue = row.dimension_values?.[dateDimension.id];
          // Only filter out rows that have a date value but it's outside the range
          // If a row doesn't have a date value, include it (don't filter it out)
          if (!dateValue || dateValue === '') return true;
>>>>>>> 1c998a4f68425652b77fe9d79c9ba9a120bfd221

          const rowDate = new Date(dateValue);
          if (dateFrom && rowDate < new Date(dateFrom)) return false;
          if (dateTo && rowDate > new Date(dateTo)) return false;

          return true;
        });
        
        const afterFilterCount = filteredData.length;
        console.log('[GET-PERFORMANCE-DATA] Date filter applied:', {
          dateDimensionId: dateDimension.id,
          dateFrom,
          dateTo,
          beforeFilter: beforeFilterCount,
          afterFilter: afterFilterCount,
          filteredOut: beforeFilterCount - afterFilterCount
        });
        
        // If date filter resulted in 0 rows but we had data before, log a warning
        if (afterFilterCount === 0 && beforeFilterCount > 0) {
          console.warn('[GET-PERFORMANCE-DATA] Date filter excluded all data. Consider expanding date range.');
          // Check what date range the data actually covers (use original data before filtering)
          const dateValues = (dimensionData || []).map((row: any) => row.dimension_values?.[dateDimension.id]).filter(Boolean);
          if (dateValues.length > 0) {
            const minDate = new Date(Math.min(...dateValues.map((d: string) => new Date(d).getTime())));
            const maxDate = new Date(Math.max(...dateValues.map((d: string) => new Date(d).getTime())));
            console.warn('[GET-PERFORMANCE-DATA] Data date range:', {
              min: minDate.toISOString().split('T')[0],
              max: maxDate.toISOString().split('T')[0],
              requestedFrom: dateFrom,
              requestedTo: dateTo
            });
          }
        }
<<<<<<< HEAD

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
=======
>>>>>>> 1c998a4f68425652b77fe9d79c9ba9a120bfd221
      } else {
        console.log('[GET-PERFORMANCE-DATA] No date dimension found, skipping date filter');
      }
    }

    // Apply dimension filters
    if (Object.keys(dimensionFilters).length > 0) {
      filteredData = filteredData.filter((row: any) => {
        const dimensionValues = row.dimension_values || {};

        for (const [dimId, filterValues] of Object.entries(dimensionFilters)) {
          // Normalize filterValues to always be an array
          const filterValuesArray = Array.isArray(filterValues) 
            ? filterValues 
            : (filterValues ? [filterValues] : []);
            
          if (filterValuesArray.length === 0) continue;

          const rowValue = dimensionValues[dimId];
          if (rowValue === undefined || rowValue === null) return false;

          const rowValueStr = String(rowValue).toLowerCase();
          const hasMatch = filterValuesArray.some((filterValue: string) => {
            const filterLower = String(filterValue).toLowerCase();
            return rowValueStr.includes(filterLower);
          });

          if (!hasMatch) return false;
        }

        return true;
      });
    }

    console.log('[GET-PERFORMANCE-DATA] Filtered rows:', filteredData.length);

<<<<<<< HEAD
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
=======
    // Transform data from dimension IDs to dimension names
    const transformedData = filteredData.map((row: any) => {
      const dimensionValues = row.dimension_values || {};
      const transformedRow: any = {};
      
      // Map dimension IDs to names
      for (const [dimId, value] of Object.entries(dimensionValues)) {
        const dimInfo = dimensionMap.get(dimId);
        if (dimInfo) {
          transformedRow[dimInfo.name] = value;
>>>>>>> 1c998a4f68425652b77fe9d79c9ba9a120bfd221
        }
      }
      
      return {
        id: row.id || `row-${row.row_number}`,
        name: '', // Will be set by grouping logic in frontend
        level: 0,
        data: transformedRow,
        _row_number: row.row_number,
        _data_source_id: row.data_source_id,
      };
    });

    console.log('[GET-PERFORMANCE-DATA] Sample transformed row:', transformedData[0]);

    // Return the filtered data
    const response = {
      data: transformedData,
      total: filteredData.length,
      totalRows: filteredData.length, // Keep for backward compatibility
      hasMore: false,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GET-PERFORMANCE-DATA] Error:', error);
    
    // Extract meaningful error information
    let errorMessage = 'Unknown error';
    let errorDetails = undefined;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack;
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
