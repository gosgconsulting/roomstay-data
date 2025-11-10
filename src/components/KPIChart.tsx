import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, addDays } from "date-fns";
import { FilterState } from "./FiltersBar";
import { debugLog, inspectObject, validateChartData, retryWithBackoff, filterDimensionsByVisibility } from "@/lib/debug";
import { trackPerformance } from "@/lib/monitoring";

interface ChartData {
  date: string;
  value: number;
  compareValue?: number;
}

interface KPIChartProps {
  reportId: string | null;
  filters: FilterState;
  onLoadingComplete?: () => void;
  accountId?: string;
  visibilityRefreshTrigger?: number; // Trigger to refresh when dimension visibility changes
}

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula?: string;
}

interface DimensionData {
  row_number: number;
  report_id: string;
  dimension_values: Record<string, string>;
  [key: string]: unknown;
}

interface DimensionValue {
  [key: string]: string | number;
}


export const KPIChart = ({ reportId, filters, onLoadingComplete, accountId, visibilityRefreshTrigger }: KPIChartProps) => {
  const [selectedKPI, setSelectedKPI] = useState("Revenue");
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableKPIs, setAvailableKPIs] = useState<Array<{ value: string; label: string }>>([]);

  // Create a stable reference for filters to prevent unnecessary re-renders
  const stableFilters = useMemo(() => {
    console.log('[testing] KPIChart - Creating stable filters reference:', filters);
    return {
      dimensionFilters: filters.dimensionFilters,
      dateRange: filters.dateRange,
      datePreset: filters.datePreset,
      compareEnabled: filters.compareEnabled,
      compareType: filters.compareType,
      compareDateRange: filters.compareDateRange,
    };
  }, [
    JSON.stringify(filters.dimensionFilters),
    filters.dateRange?.from?.toISOString(),
    filters.dateRange?.to?.toISOString(),
    filters.datePreset,
    filters.compareEnabled,
    filters.compareType,
    filters.compareDateRange?.from?.toISOString(),
    filters.compareDateRange?.to?.toISOString(),
  ]);

  useEffect(() => {
    console.log('[CHART-DEBUG] ========== KPIChart useEffect ==========');
    console.log('[CHART-DEBUG] reportId:', reportId);
    console.log('[CHART-DEBUG] selectedKPI:', selectedKPI);
    console.log('[CHART-DEBUG] stableFilters:', JSON.stringify(stableFilters, null, 2));
    console.log('[CHART-DEBUG] =======================================');
    if (reportId) {
      console.log('[CHART-DEBUG] ✓ reportId exists, calling loadChartData...');
      loadChartData();
    } else {
      console.log('[CHART-DEBUG] ✗ No reportId, skipping loadChartData');
    }
  }, [reportId, selectedKPI, stableFilters, visibilityRefreshTrigger]);

  // Refresh chart when dimension visibility changes
  useEffect(() => {
    if (reportId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[testing] Refreshing KPI chart due to dimension visibility change');
      loadChartData();
    }
  }, [visibilityRefreshTrigger, reportId]);

  const loadChartData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await trackPerformance('KPIChart', 'loadData', async () => {
        debugLog('KPIChart', `Loading chart data for report ${reportId} with KPI ${selectedKPI}`);
        console.log('[CHART] Loading data with filters:', filters);
        
                // Debug date range
        if (stableFilters.dateRange) {
          console.log('[CHART] Date range:', {
            from: stableFilters.dateRange.from ? stableFilters.dateRange.from.toISOString() : 'undefined',
            to: stableFilters.dateRange.to ? stableFilters.dateRange.to.toISOString() : 'undefined'
          });
        } else {
          console.log('[CHART] No date range provided');
        }

        // Debug compare date range
        if (stableFilters.compareEnabled && stableFilters.compareDateRange) {
          console.log('[CHART] Compare date range:', {
            from: stableFilters.compareDateRange.from ? stableFilters.compareDateRange.from.toISOString() : 'undefined',
            to: stableFilters.compareDateRange.to ? stableFilters.compareDateRange.to.toISOString() : 'undefined'
          });
        }
        
        // Get the current user to load all dimensions
        const { data: { user } } = await supabase.auth.getUser();
        
        let dimensions: Dimension[] | null = null;

        // Load dimensions using the same approach as FiltersBar
        if (user) {
          try {
            console.log('[CHART] Loading dimensions for user:', user.id, 'report:', reportId, 'account:', accountId);

            // Load global dimensions (available to all users)
            const { data: globalData, error: globalError } = await supabase
              .from("dimensions")
              .select("*")
              .eq("scope", "global")
              .order("created_at", { ascending: false });

            if (globalError) throw globalError;

            // Load account-specific dimensions if accountId is provided
            let accountData: Dimension[] = [];
            if (accountId) {
              const { data, error: accountError } = await supabase
                .from("dimensions")
                .select("*")
                .eq("scope", "account")
                .eq("account_id", accountId)
                .order("created_at", { ascending: false });

              if (accountError) throw accountError;
              accountData = (data || []) as Dimension[];
            }

            // Load custom dimensions for this user (both global custom and report-specific)
            let customData: Dimension[] = [];
            const { data, error: customError } = await supabase
              .from("dimensions")
              .select("*")
              .eq("user_id", user.id)
              .eq("scope", "custom")
              .or(`report_id.is.null,report_id.eq.${reportId}`) // Include both global custom (report_id=null) and report-specific
              .order("created_at", { ascending: false });

            if (customError) throw customError;
            customData = (data || []) as Dimension[];

            // Combine all dimensions - prioritize account-scoped over global
            // Order: account (highest priority) > custom > global (lowest priority)
                          const allDimensions = [
                ...accountData,
                ...customData,
                ...(globalData || [])
              ] as Dimension[];

            console.log('[CHART] Loaded dimensions - Global:', globalData?.length || 0, 'Account:', accountData?.length || 0, 'Custom:', customData?.length || 0);

            // Deduplicate dimensions by name (keep first occurrence, which prioritizes account-scoped)
            const seenNames = new Set<string>();
            const uniqueDimensions = allDimensions.filter(dim => {
              if (seenNames.has(dim.name)) {
                return false;
              }
              seenNames.add(dim.name);
              return true;
            });

            dimensions = uniqueDimensions;
            debugLog('KPIChart', `Loaded ${dimensions?.length || 0} dimensions for report ${reportId}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
            console.error('[CHART] Failed to load dimensions:', errorMsg);
            dimensions = [];
          }
        } else {
          console.error('[CHART] No user authenticated');
          dimensions = [];
        }

        debugLog('KPIChart', `Found ${dimensions?.length || 0} dimensions`);
        console.log('[CHART] All dimensions:', dimensions);

        if (!dimensions || dimensions.length === 0) {
          debugLog('KPIChart', 'No dimensions found for report');
          console.error('[CHART] No dimensions found');
          setChartData([]);
          return;
        }

        // Filter dimensions by visibility settings
        if (user && reportId) {
          dimensions = await filterDimensionsByVisibility(dimensions, reportId, user.id, supabase);
          console.log('[CHART] Dimensions after visibility filter:', dimensions?.length);
        }

        // Build available KPIs list from metric dimensions (number, currency, percentage)
        const metricDimensions = dimensions.filter(d => 
          ['number', 'currency', 'percentage'].includes(d.type)
        );
        const kpiOptions = metricDimensions.map(d => ({
          value: d.name,
          label: d.name
        }));
        setAvailableKPIs(kpiOptions);
        console.log('[CHART] Available KPIs:', kpiOptions.length, kpiOptions.map(k => k.label));

        // Find the date dimension
        const dateDimension = dimensions.find((d: Dimension) => d.type === 'date');

        if (!dateDimension) {
          debugLog('KPIChart', 'No date dimension found');
          const dimensionNames = dimensions.map((d: Dimension) => `${d.name} (${d.type})`).join(', ');
          console.error('[CHART] No date dimension found. Available dimensions:', dimensionNames);
          setChartData([]);
          return;
        }

        // Find the dimension that matches the selected KPI
        const kpiDimension = dimensions.find((d: Dimension) => d.name === selectedKPI);
        console.log(`[CHART] KPI dimension for ${selectedKPI}:`, kpiDimension);

        debugLog('KPIChart', `Using date dimension: ${dateDimension.name} (${dateDimension.id})`);
        console.log('[CHART] Date dimension:', dateDimension);

        // Implement more efficient data fetching - LOAD LATEST DATA FIRST
        const CHUNK_SIZE = 2000; // Larger chunk size to reduce number of requests
        // REMOVED: MAX_ROWS limit to ensure ALL data is fetched regardless of size
        let allDimensionData: DimensionData[] = [];
        let offset = 0;
        let hasMore = true;
        
        // Enhanced timeout handling for large datasets
        const MAX_TIMEOUTS = 5; // Increased from 3 for large datasets
        let timeoutCount = 0;

        console.log('[CHART] Fetching dimension_data for report (LATEST FIRST):', reportId);
        
        try {
          while (hasMore && timeoutCount < MAX_TIMEOUTS) {
            console.log(`[CHART] Fetching chunk at offset ${offset} (timeouts: ${timeoutCount})`);
            
            try {
              const chunkData = await retryWithBackoff(
                async () => {
                  const { data, error } = await supabase
                    .from("dimension_data")
                    .select("id, row_number, report_id, dimension_values") // Added report_id
                    .eq("report_id", reportId)
                    .order('row_number', { ascending: false }) // LATEST DATA FIRST
                    .range(offset, offset + CHUNK_SIZE - 1);

                  if (error) {
                    console.error(`[CHART] Database error at offset ${offset}:`, error);
                    // Check if it's a timeout error
                    if (error.message && error.message.includes('timeout')) {
                      throw new Error(`Database timeout at offset ${offset}`);
                    }
                    throw error;
                  }
                  return data;
                },
                3, // max attempts
                1000 // Increased delay between retries
              );

              if (chunkData && chunkData.length > 0) {
                allDimensionData = [...allDimensionData, ...chunkData as DimensionData[]];
                offset += CHUNK_SIZE;
                hasMore = chunkData.length === CHUNK_SIZE;
                console.log(`[CHART] Loaded ${chunkData.length} rows, total: ${allDimensionData.length}`);
                
                // Reset timeout count on successful fetch
                timeoutCount = 0;
                
                // Add progressive loading feedback for large datasets
                if (allDimensionData.length > 5000 && allDimensionData.length % 10000 === 0) {
                  console.log(`[CHART] Progress: ${allDimensionData.length} rows loaded...`);
                }
              } else {
                hasMore = false;
                console.log('[CHART] No more data to fetch');
              }
            } catch (chunkError) {
              console.error(`[CHART] Error fetching chunk at offset ${offset}:`, chunkError);
              
              // Handle timeout errors gracefully
              if (chunkError instanceof Error && chunkError.message.includes('timeout')) {
                timeoutCount++;
                console.warn(`[CHART] Timeout ${timeoutCount}/${MAX_TIMEOUTS} at offset ${offset}, continuing with available data`);
                
                if (timeoutCount >= MAX_TIMEOUTS) {
                  console.warn('[CHART] Max timeouts reached, using available data');
                  hasMore = false;
                } else {
                  // Skip this chunk and try the next one
                  offset += CHUNK_SIZE;
                  continue;
                }
              } else {
                // For non-timeout errors, stop fetching but continue with available data
                console.warn('[CHART] Non-timeout error, stopping fetch but continuing with available data:', chunkError);
                hasMore = false;
              }
            }
          }
          
          console.log(`[CHART] Data loading complete. Total rows: ${allDimensionData.length}`);
          
        } catch (chunkError) {
          console.error('[CHART] Error during chunk fetching:', chunkError);
          
          // If we have some data, continue with what we have
          if (allDimensionData.length > 0) {
            console.warn(`[CHART] Continuing with ${allDimensionData.length} rows despite error:`, chunkError);
          } else {
            // If no data at all, show error but don't crash
            console.error('[CHART] No data loaded, showing empty chart');
            setChartData([]);
            return;
          }
        }
        
        console.log('[CHART-DEBUG] ========== DATA LOADING SUMMARY ==========');
        console.log('[CHART-DEBUG] Total dimension_data rows loaded:', allDimensionData.length);
        console.log('[CHART-DEBUG] Total dimensions:', dimensions?.length);
        console.log('[CHART-DEBUG] Date dimension:', dateDimension?.name, '(', dateDimension?.id, ')');
        console.log('[CHART-DEBUG] KPI dimension:', kpiDimension?.name, '(', kpiDimension?.id, ')');
        console.log('[CHART-DEBUG] Sample data row:', allDimensionData[0]?.dimension_values);
        console.log('[CHART-DEBUG] =============================================');
        
        if (allDimensionData.length === 0) {
          console.error('[CHART-DEBUG] ✗ NO DATA FOUND - Showing empty chart');
          setChartData([]);
          return;
        }

        // If we have a large dataset, consider sampling for better performance
        if (allDimensionData.length > 20000) {
          console.warn(`[CHART] Large dataset detected (${allDimensionData.length} rows), using sampling for performance`);
          // Sample every nth row to reduce processing time
          const sampleRate = Math.ceil(allDimensionData.length / 10000);
          allDimensionData = allDimensionData.filter((_, index) => index % sampleRate === 0);
          console.log(`[CHART] Sampled dataset to ${allDimensionData.length} rows (sample rate: 1/${sampleRate})`);
        }

        // Validate that we have the required dimensions
        if (!dateDimension) {
          throw new Error('No date dimension found for chart data');
        }

        // Validate that dimension data has the expected structure
        const sampleRow = allDimensionData[0];
        if (!sampleRow.dimension_values || typeof sampleRow.dimension_values !== 'object') {
          throw new Error('Invalid dimension data structure: missing or invalid dimension_values');
        }

        console.log('[CHART] Sample dimension data structure:', {
          keys: Object.keys(sampleRow.dimension_values),
          dateDimensionId: dateDimension.id,
          hasDateDimension: dateDimension.id in sampleRow.dimension_values
        });
        
        // Create a sample of date values for debugging
        const sampleDates = allDimensionData
          .slice(0, 5)
          .map(row => row.dimension_values[dateDimension.id])
          .filter(Boolean);
        console.log('[CHART] Sample date values:', sampleDates);
        
        // Sample of dimension values for debugging
        if (allDimensionData.length > 0) {
          const sampleRow = allDimensionData[0];
          console.log('[CHART] Sample dimension values:', sampleRow.dimension_values);
          
          // Check for the selected KPI in dimension values
          const kpiKeys = Object.keys(sampleRow.dimension_values);
          const possibleKpiKeys = kpiKeys.filter(key => {
            const dim = dimensions.find(d => d.id === key);
            return dim && dim.name === selectedKPI;
          });
          
          console.log(`[CHART] Possible keys for ${selectedKPI}:`, possibleKpiKeys);
        }
        
        // Find the dimension ID for the selected KPI
        const kpiDimensionId = kpiDimension?.id;
        console.log(`[CHART] KPI dimension ID for ${selectedKPI}:`, kpiDimensionId);
        
        // Helper function to extract KPI value from dimension values
        const extractKpiValue = (dimensionValues: Record<string, string>): number => {
          let value = 0;
          
          // If we have a matching dimension for the KPI, use its ID to get the value
          if (kpiDimensionId && dimensionValues[kpiDimensionId] !== undefined) {
            value = parseFloat(dimensionValues[kpiDimensionId]) || 0;
          } 
          // Otherwise try to find by name (legacy approach)
          else if (dimensionValues[selectedKPI] !== undefined) {
            value = parseFloat(dimensionValues[selectedKPI]) || 0;
          } else {
            // Look for a key that might contain the KPI name
            const matchingKey = Object.keys(dimensionValues).find(key => {
              const dim = dimensions.find(d => d.id === key);
              return dim && dim.name === selectedKPI;
            });
            
            if (matchingKey) {
              value = parseFloat(dimensionValues[matchingKey]) || 0;
            }
          }
          
          return value;
        };
        
        // Filter and process main period data
        console.log('[CHART-DEBUG] ========== FILTERING MAIN PERIOD DATA ==========');
        console.log('[CHART-DEBUG] Date range:', {
          from: stableFilters.dateRange?.from?.toISOString(),
          to: stableFilters.dateRange?.to?.toISOString()
        });
        console.log('[CHART-DEBUG] Dimension filters:', stableFilters.dimensionFilters);
        console.log('[CHART-DEBUG] Total rows to filter:', allDimensionData.length);
        
        const mainPeriodData = allDimensionData.filter((row) => {
          const dimensionValues = row.dimension_values as Record<string, string>;
          
          // Apply dimension filters
          for (const [dimId, filterValue] of Object.entries(stableFilters.dimensionFilters || {})) {
            // Handle both string and array filter values
            if (Array.isArray(filterValue)) {
              if (!filterValue.includes(dimensionValues[dimId])) {
                return false;
              }
            } else if (dimensionValues[dimId] !== filterValue) {
              return false;
            }
          }
          
          // Apply date range filter if there's a Date dimension
          if (stableFilters.dateRange?.from || stableFilters.dateRange?.to) {
            if (dimensionValues[dateDimension.id]) {
              const dateValue = dimensionValues[dateDimension.id];
              let rowDate: Date;
              
              // Handle different date formats - string or number
              if (typeof dateValue === 'number') {
                // Handle Excel serial dates or timestamps
                if (dateValue > 1 && dateValue < 100000) {
                  // Excel serial date
                  const excelEpoch = new Date(1899, 11, 30);
                  rowDate = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
                } else {
                  // Timestamp
                  rowDate = new Date(dateValue);
                }
              } else {
                const dateStr = String(dateValue);
                if (dateStr.includes('/')) {
                  const [month, day, year] = dateStr.split('/');
                  rowDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                } else {
                  rowDate = new Date(dateStr);
                }
              }
              
              // Add a day to the end date to include the full day
              const adjustedEndDate = stableFilters.dateRange?.to 
                ? addDays(stableFilters.dateRange.to, 1)
                : undefined;
              
              if (stableFilters.dateRange?.from && rowDate < stableFilters.dateRange.from) {
                return false;
              }
              if (adjustedEndDate && rowDate >= adjustedEndDate) {
                return false;
              }
            }
          }
          
          return true;
        });
        
        console.log('[CHART-DEBUG] Main period filtered data:', mainPeriodData.length, 'rows');
        if (mainPeriodData.length > 0) {
          const sample = mainPeriodData.slice(0, 3).map(row => ({
            date: row.dimension_values[dateDimension.id],
            sampleValue: extractKpiValue(row.dimension_values)
          }));
          console.log('[CHART-DEBUG] First 3 rows sample:', sample);
        }
        
        // Group main period data by date
        const mainPeriodByDate = new Map<string, number>();
        
        mainPeriodData.forEach((row) => {
          const dimensionValues = row.dimension_values as Record<string, string>;
          const dateValue = dimensionValues[dateDimension.id];
          
          if (!dateValue) return;
          
          // Get or initialize value for this date
          const currentValue = mainPeriodByDate.get(dateValue) || 0;
          const rowValue = extractKpiValue(dimensionValues);
          
          mainPeriodByDate.set(dateValue, currentValue + rowValue);
        });
        
        console.log(`[CHART] Main period data by date:`, Object.fromEntries(mainPeriodByDate));
        
        // Process comparison period if enabled
        const comparePeriodByDate = new Map<string, number>();
        
        if (stableFilters.compareEnabled && stableFilters.compareDateRange?.from && stableFilters.compareDateRange?.to) {
          // Filter data for comparison period
          const comparePeriodData = allDimensionData.filter((row) => {
            const dimensionValues = row.dimension_values as Record<string, string>;
            
            // Apply dimension filters
            for (const [dimId, filterValue] of Object.entries(stableFilters.dimensionFilters || {})) {
              // Handle both string and array filter values
              if (Array.isArray(filterValue)) {
                if (!filterValue.includes(dimensionValues[dimId])) {
                  return false;
                }
              } else if (dimensionValues[dimId] !== filterValue) {
                return false;
              }
            }
            
            // Apply compare date range filter
            if (dimensionValues[dateDimension.id]) {
              const dateValue = dimensionValues[dateDimension.id];
              let rowDate: Date;
              
              // Handle different date formats - string or number
              if (typeof dateValue === 'number') {
                // Handle Excel serial dates or timestamps
                if (dateValue > 1 && dateValue < 100000) {
                  // Excel serial date
                  const excelEpoch = new Date(1899, 11, 30);
                  rowDate = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
                } else {
                  // Timestamp
                  rowDate = new Date(dateValue);
                }
              } else {
                const dateStr = String(dateValue);
                if (dateStr.includes('/')) {
                  const [month, day, year] = dateStr.split('/');
                  rowDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                } else {
                  rowDate = new Date(dateStr);
                }
              }
              
              // Add a day to the end date to include the full day
              const adjustedEndDate = stableFilters.compareDateRange?.to 
                ? addDays(stableFilters.compareDateRange.to, 1)
                : undefined;
              
              if (stableFilters.compareDateRange?.from && rowDate < stableFilters.compareDateRange.from) {
                return false;
              }
              if (adjustedEndDate && rowDate >= adjustedEndDate) {
                return false;
              }
            } else {
              return false;
            }
            
            return true;
          });
          
          console.log(`[CHART] Compare period filtered data: ${comparePeriodData.length} rows`);
          
          // Group comparison period data by date
          comparePeriodData.forEach((row) => {
            const dimensionValues = row.dimension_values as Record<string, string>;
            const dateValue = dimensionValues[dateDimension.id];
            
            if (!dateValue) return;
            
            // Get or initialize value for this date
            const currentValue = comparePeriodByDate.get(dateValue) || 0;
            const rowValue = extractKpiValue(dimensionValues);
            
            comparePeriodByDate.set(dateValue, currentValue + rowValue);
          });
          
          console.log(`[CHART] Compare period data by date:`, Object.fromEntries(comparePeriodByDate));
        }
        
        // Calculate the day difference between main and compare periods
        let dayOffset = 0;
        if (stableFilters.compareEnabled && stableFilters.dateRange?.from && stableFilters.compareDateRange?.from) {
          const mainStart = stableFilters.dateRange.from;
          const compareStart = stableFilters.compareDateRange.from;
          
          // Calculate the difference in days
          dayOffset = Math.round((mainStart.getTime() - compareStart.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`[CHART] Day offset between periods: ${dayOffset} days`);
        }
        
        // Convert to chart data points with both main and compare values
        const chartPoints = Array.from(mainPeriodByDate.entries())
          .map(([dateKey, value]) => {
            try {
              // Parse the date
              let dateObj: Date;
              
              // Handle different date formats - string or number
              if (typeof dateKey === 'number') {
                // Handle Excel serial dates or timestamps
                if (dateKey > 1 && dateKey < 100000) {
                  // Excel serial date
                  const excelEpoch = new Date(1899, 11, 30);
                  dateObj = new Date(excelEpoch.getTime() + dateKey * 24 * 60 * 60 * 1000);
                } else {
                  // Timestamp
                  dateObj = new Date(dateKey);
                }
              } else {
                const dateStr = String(dateKey);
                if (dateStr.includes('/')) {
                  const [month, day, year] = dateStr.split('/');
                  dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                } else {
                  dateObj = parseISO(dateStr);
                }
              }
              
              if (isNaN(dateObj.getTime())) {
                console.error('[CHART] Invalid date:', dateKey);
                return null;
              }
              
              // Format the date for display
              const formattedDate = format(dateObj, 'MMM dd');
              
              // Find the corresponding compare date if comparison is enabled
              let compareValue: number | undefined = undefined;
              
              if (stableFilters.compareEnabled && stableFilters.compareDateRange) {
                // Calculate the equivalent date in the compare period
                const compareDate = new Date(dateObj);
                compareDate.setDate(compareDate.getDate() - dayOffset);
                
                // Format the compare date in the same format as the data
                let compareDateStr: string;
                const originalDateStr = String(dateKey);
                if (originalDateStr.includes('/')) {
                  compareDateStr = `${compareDate.getMonth() + 1}/${compareDate.getDate()}/${compareDate.getFullYear()}`;
                } else {
                  compareDateStr = compareDate.toISOString().split('T')[0];
                }
                
                // Look up the value for this date in the compare period
                if (comparePeriodByDate.has(compareDateStr)) {
                  compareValue = comparePeriodByDate.get(compareDateStr);
                }
              }
              
              return {
                date: formattedDate,
                value: value,
                compareValue: compareValue,
              } as ChartData;
            } catch (e) {
              console.error('[CHART] Error parsing date:', e, dateKey);
              return null;
            }
          })
          .filter((item): item is ChartData => item !== null)
          .sort((a, b) => a.date.localeCompare(b.date));
        
        debugLog('KPIChart', `Processed ${chartPoints.length} valid data points`);
        console.log('[CHART] Final chart data points:', chartPoints);
        
        validateChartData(chartPoints);
        
        setChartData(chartPoints);
      });
    } catch (error) {
      // Enhanced error handling to get more specific error information
      let errorMessage = 'Unknown error occurred';
      let detailedError = '';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        detailedError = error.stack || error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Handle Supabase errors and other objects
        if ('message' in error) {
          errorMessage = String(error.message);
        }
        if ('details' in error) {
          detailedError = `${errorMessage} - Details: ${String(error.details)}`;
        }
        if ('hint' in error) {
          detailedError += ` - Hint: ${String(error.hint)}`;
        }
        if ('code' in error) {
          detailedError += ` - Code: ${String(error.code)}`;
        }
        // Fallback to JSON stringify if we still don't have a good message
        if (!errorMessage || errorMessage === 'Unknown error occurred') {
          try {
            errorMessage = JSON.stringify(error, null, 2);
          } catch {
            errorMessage = 'Failed to serialize error object';
          }
        }
      } else {
        errorMessage = String(error);
      }
      
      console.error("[CHART] Error loading chart data:", {
        error,
        errorMessage,
        detailedError,
        reportId,
        selectedKPI,
        filtersApplied: stableFilters
      });
      
      setError(errorMessage);
      setChartData([]);
    } finally {
      setIsLoading(false);
      onLoadingComplete?.();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Performance Chart</CardTitle>
          <Skeleton className="h-10 w-[180px]" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <Skeleton className="h-full w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Performance Chart</CardTitle>
        <Select value={selectedKPI} onValueChange={setSelectedKPI}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            {availableKPIs.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
              <CardContent>
        {error ? (
          <div className="h-[300px] flex flex-col items-center justify-center text-destructive text-sm space-y-2">
            <div className="font-medium">Error loading chart data</div>
            <div className="text-xs text-center max-w-md">
              {error.includes('timeout') ? (
                <>
                  The dataset is too large and caused a timeout. Try applying filters to reduce the data size, or the system will automatically sample the data for display.
                </>
              ) : (
                error
              )}
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            No chart data for selected date range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="compareGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => {
                  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                  return value.toFixed(0);
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number, name: string) => {
                  const label = name === 'value' ? 'Current' : 'Previous';
                  return [value.toLocaleString(), `${label} ${selectedKPI}`];
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#chartGradient)"
              />
              {stableFilters.compareEnabled && chartData.some(d => d.compareValue !== undefined) && (
                <Area
                  type="monotone"
                  dataKey="compareValue"
                  name="compareValue"
                  stroke="#eab308"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="url(#compareGradient)"
                />
              )}
              {stableFilters.compareEnabled && (
                <Legend 
                  content={({ payload }) => (
                    <div className="flex justify-center gap-4 text-xs mt-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-primary rounded-full"></div>
                        <span>Current Period</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#eab308' }}></div>
                        <span>Previous Period</span>
                      </div>
                    </div>
                  )}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
