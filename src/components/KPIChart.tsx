import { useState, useEffect } from "react";
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

const kpiOptions = [
  { value: "Revenue", label: "Revenue" },
  { value: "Cost", label: "Cost" },
  { value: "Clicks", label: "Clicks" },
  { value: "Impressions", label: "Impressions" },
  { value: "Conversions", label: "Conversions" },
  { value: "CTR", label: "CTR" },
  { value: "CPC", label: "CPC" },
  { value: "ROAS", label: "ROAS" },
  { value: "Cost of sale", label: "Cost of sale" },
];

export const KPIChart = ({ reportId, filters, onLoadingComplete, accountId, visibilityRefreshTrigger }: KPIChartProps) => {
  const [selectedKPI, setSelectedKPI] = useState("Revenue");
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reportId) {
      loadChartData();
    }
  }, [reportId, filters, selectedKPI]);

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
        if (filters.dateRange) {
          console.log('[CHART] Date range:', {
            from: filters.dateRange.from ? filters.dateRange.from.toISOString() : 'undefined',
            to: filters.dateRange.to ? filters.dateRange.to.toISOString() : 'undefined'
          });
        } else {
          console.log('[CHART] No date range provided');
        }
        
        // Debug compare date range
        if (filters.compareEnabled && filters.compareDateRange) {
          console.log('[CHART] Compare date range:', {
            from: filters.compareDateRange.from ? filters.compareDateRange.from.toISOString() : 'undefined',
            to: filters.compareDateRange.to ? filters.compareDateRange.to.toISOString() : 'undefined'
          });
        }
        
        // Get the current user to load all dimensions
        const { data: { user } } = await supabase.auth.getUser();
        
        let dimensions: Dimension[] | null = null;

        // Fetch dimensions accessible to the user (global + custom for this report)
        if (user && reportId) {
          try {
            // Single query to get all dimensions user can access for this report
            // RLS policies will handle filtering, with retry for network resilience
            const allDims = await retryWithBackoff(
              async () => {
                const { data, error } = await supabase
                  .from("dimensions")
                  .select("*");

                if (error) {
                  const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
                  throw new Error(`Failed to fetch dimensions: ${errorMsg}`);
                }

                return data || [];
              },
              3, // max attempts
              500 // initial delay in ms
            );

            // Filter and prioritize dimensions:
            // 1. Account-specific dimensions (if accountId provided)
            // 2. Custom report dimensions
            // 3. Global dimensions (fallback)
            const dimensionsByName: Record<string, any> = {};

            // First pass: add global dimensions as base
            (allDims || []).filter((d: any) => d.scope === 'global').forEach((d: any) => {
              dimensionsByName[d.name] = d;
            });

            // Second pass: override with account-specific dimensions
            if (accountId) {
              (allDims || [])
                .filter((d: any) => d.scope === 'account' && d.account_id === accountId)
                .forEach((d: any) => {
                  dimensionsByName[d.name] = d; // Override global with account version
                });
            }

            // Third pass: add custom report dimensions (highest priority)
            if (reportId) {
              (allDims || [])
                .filter((d: any) => d.scope === 'custom' && d.report_id === reportId)
                .forEach((d: any) => {
                  dimensionsByName[d.name] = d; // Override with custom version
                });
            }

            dimensions = Object.values(dimensionsByName) as Dimension[];

            debugLog('KPIChart', `Loaded ${dimensions?.length || 0} dimensions for report ${reportId}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
            console.error('[CHART] Failed to load dimensions:', errorMsg);
            // Fallback to dimensions associated with report via data
            dimensions = [];
          }
        } else if (user) {
          // Fallback: just fetch all dimensions (RLS will filter them)
          try {
            const allDims = await retryWithBackoff(
              async () => {
                const { data, error } = await supabase
                  .from("dimensions")
                  .select("*");

                if (error) {
                  const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
                  throw new Error(`Failed to fetch dimensions: ${errorMsg}`);
                }

                return data || [];
              },
              3, // max attempts
              500 // initial delay in ms
            );

            dimensions = allDims as Dimension[];
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
            console.error('[CHART] Failed to load dimensions:', errorMsg);
            dimensions = [];
          }
        }

        // If no dimensions found, try falling back to loading from dimension_data
        if (!dimensions || dimensions.length === 0) {
          try {
            const dimensionData = await retryWithBackoff(
              async () => {
                const { data, error } = await supabase
                  .from("dimension_data")
                  .select("dimension_values")
                  .limit(1)
                  .maybeSingle();

                if (error) throw error;
                return data;
              },
              3,
              500
            );

            if (dimensionData?.dimension_values) {
              const dimensionIds = Object.keys(dimensionData.dimension_values as Record<string, string>);

              if (dimensionIds.length > 0) {
                const dimensionsById = await retryWithBackoff(
                  async () => {
                    const { data, error } = await supabase
                      .from("dimensions")
                      .select("*")
                      .in("id", dimensionIds);

                    if (error) throw error;
                    return data;
                  },
                  3,
                  500
                );

                if (dimensionsById) {
                  dimensions = dimensionsById as Dimension[];
                }
              }
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
            console.error('[CHART] Failed to load dimensions from fallback:', errorMsg);
          }
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

        // Fetch dimension_data directly in chunks (5000 rows at a time)
        const CHUNK_SIZE = 5000;
        let allDimensionData: DimensionData[] = [];
        let offset = 0;
        let hasMore = true;
        
        console.log('[CHART] Fetching dimension_data for report:', reportId);
        
        while (hasMore) {
          const chunkData = await retryWithBackoff(
            async () => {
              const { data, error } = await supabase
                .from("dimension_data")
                .select("*")
                .eq("report_id", reportId)
                .order('row_number', { ascending: true })
                .range(offset, offset + CHUNK_SIZE - 1);

              if (error) throw error;
              return data;
            },
            3,
            500
          );

          if (chunkData && chunkData.length > 0) {
            allDimensionData = [...allDimensionData, ...chunkData as DimensionData[]];
            offset += CHUNK_SIZE;
            hasMore = chunkData.length === CHUNK_SIZE;
          } else {
            hasMore = false;
          }
        }
        
        console.log(`[CHART] Fetched ${allDimensionData.length} rows of dimension_data`);
        
        if (allDimensionData.length === 0) {
          setChartData([]);
          return;
        }
        
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
        const mainPeriodData = allDimensionData.filter((row) => {
          const dimensionValues = row.dimension_values as Record<string, string>;
          
          // Apply dimension filters
          for (const [dimId, filterValue] of Object.entries(filters.dimensionFilters || {})) {
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
          if (filters.dateRange?.from || filters.dateRange?.to) {
            if (dimensionValues[dateDimension.id]) {
              const dateStr = dimensionValues[dateDimension.id];
              let rowDate: Date;
              
              if (dateStr.includes('/')) {
                const [month, day, year] = dateStr.split('/');
                rowDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              } else {
                rowDate = new Date(dateStr);
              }
              
              // Add a day to the end date to include the full day
              const adjustedEndDate = filters.dateRange?.to 
                ? addDays(filters.dateRange.to, 1)
                : undefined;
              
              if (filters.dateRange?.from && rowDate < filters.dateRange.from) {
                return false;
              }
              if (adjustedEndDate && rowDate >= adjustedEndDate) {
                return false;
              }
            }
          }
          
          return true;
        });
        
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
        
        if (filters.compareEnabled && filters.compareDateRange?.from && filters.compareDateRange?.to) {
          // Filter data for comparison period
          const comparePeriodData = allDimensionData.filter((row) => {
            const dimensionValues = row.dimension_values as Record<string, string>;
            
            // Apply dimension filters
            for (const [dimId, filterValue] of Object.entries(filters.dimensionFilters || {})) {
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
              const dateStr = dimensionValues[dateDimension.id];
              let rowDate: Date;
              
              if (dateStr.includes('/')) {
                const [month, day, year] = dateStr.split('/');
                rowDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              } else {
                rowDate = new Date(dateStr);
              }
              
              // Add a day to the end date to include the full day
              const adjustedEndDate = filters.compareDateRange?.to 
                ? addDays(filters.compareDateRange.to, 1)
                : undefined;
              
              if (filters.compareDateRange?.from && rowDate < filters.compareDateRange.from) {
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
        if (filters.compareEnabled && filters.dateRange?.from && filters.compareDateRange?.from) {
          const mainStart = filters.dateRange.from;
          const compareStart = filters.compareDateRange.from;
          
          // Calculate the difference in days
          dayOffset = Math.round((mainStart.getTime() - compareStart.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`[CHART] Day offset between periods: ${dayOffset} days`);
        }
        
        // Convert to chart data points with both main and compare values
        const chartPoints = Array.from(mainPeriodByDate.entries())
          .map(([dateStr, value]) => {
            try {
              // Parse the date
              let dateObj: Date;
              
              if (dateStr.includes('/')) {
                const [month, day, year] = dateStr.split('/');
                dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              } else {
                dateObj = parseISO(dateStr);
              }
              
              if (isNaN(dateObj.getTime())) {
                console.error('[CHART] Invalid date:', dateStr);
                return null;
              }
              
              // Format the date for display
              const formattedDate = format(dateObj, 'MMM dd');
              
              // Find the corresponding compare date if comparison is enabled
              let compareValue: number | undefined = undefined;
              
              if (filters.compareEnabled && filters.compareDateRange) {
                // Calculate the equivalent date in the compare period
                const compareDate = new Date(dateObj);
                compareDate.setDate(compareDate.getDate() - dayOffset);
                
                // Format the compare date in the same format as the data
                let compareDateStr: string;
                if (dateStr.includes('/')) {
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
              console.error('[CHART] Error parsing date:', e, dateStr);
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
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      console.error("[CHART] Error loading chart data:", errorMessage);
      setError(error instanceof Error ? error.message : 'Failed to load chart data');
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
            {kpiOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="h-[300px] flex items-center justify-center text-destructive text-sm">
            Error loading chart data: {error}
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
                  <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
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
              {filters.compareEnabled && chartData.some(d => d.compareValue !== undefined) && (
                <Area
                  type="monotone"
                  dataKey="compareValue"
                  name="compareValue"
                  stroke="hsl(var(--secondary))"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="url(#compareGradient)"
                />
              )}
              {filters.compareEnabled && (
                <Legend 
                  content={({ payload }) => (
                    <div className="flex justify-center gap-4 text-xs mt-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-primary rounded-full"></div>
                        <span>Current Period</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-secondary rounded-full"></div>
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
