import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Database, 
  Calendar, 
  Clock, 
  FolderOpen, 
  Folder, 
  ChevronRight,
  ChevronLeft
} from "lucide-react";
import { SlideReportPivotData, SlideReportConfiguration, BreakdownRow } from "@/types/slideReports";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, TrendingUp, Table2 } from "lucide-react";

interface SlideDataBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pivotData?: SlideReportPivotData | null;
  lastRefreshedAt?: string | null;
  configuration?: SlideReportConfiguration | null;
  reportIds?: Record<string, string> | null; // channel -> report_id mapping
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type ViewLevel = 'years' | 'months' | 'channels' | 'data_rows';

// MCP-based data fetching functions
// Note: These functions are structured to work with MCP tools when available
// Currently using Supabase client as fallback for React component context

/**
 * Build dimension ID to name mapping using MCP or Supabase client
 */
async function buildDimensionMapping(reportId: string): Promise<Record<string, { id: string; name: string; type: string }>> {
  // TODO: Use MCP mcp_supabase-modelisation_execute_sql when available in this context
  // For now, using Supabase client
  const { data: dimensions, error } = await supabase
    .from('dimensions')
    .select('id, name, type')
    .or(`report_id.eq.${reportId},report_id.is.null`)
    .order('name', { ascending: true });

  if (error) {
    console.error('[buildDimensionMapping] Error:', error);
    return {};
  }

  const mapping: Record<string, { id: string; name: string; type: string }> = {};
  dimensions?.forEach(dim => {
    mapping[dim.id] = { id: dim.id, name: dim.name, type: dim.type };
  });

  return mapping;
}

/**
 * Find date dimension ID for a report
 */
async function findDateDimensionId(reportId: string, dimensionMapping: Record<string, { id: string; name: string; type: string }>): Promise<string | null> {
  // Find date dimension by type
  for (const [id, dim] of Object.entries(dimensionMapping)) {
    if (dim.type === 'date') {
      return id;
    }
  }
  
  // Fallback: try to find by name patterns
  for (const [id, dim] of Object.entries(dimensionMapping)) {
    const nameLower = dim.name.toLowerCase();
    if (nameLower.includes('date') || nameLower.includes('day') || nameLower === 'date') {
      return id;
    }
  }
  
  return null;
}

/**
 * Fetch dimension_data rows for a specific report, year, and month
 * Uses MCP pattern (currently Supabase client as fallback)
 */
async function fetchDimensionDataForPeriod(
  reportId: string,
  year: number,
  month: number,
  dateDimensionId: string | null
): Promise<any[]> {
  // Calculate date range for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // TODO: Use MCP mcp_supabase-modelisation_execute_sql when available
  // Query: SELECT dimension_values FROM dimension_data 
  // WHERE report_id = $1 AND (dimension_values->>$2)::date >= $3 AND (dimension_values->>$2)::date <= $4
  
  const allRows: any[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .range(offset, offset + batchSize - 1);

    const { data, error } = await query;

    if (error) {
      console.error('[fetchDimensionDataForPeriod] Error:', error);
      break;
    }

    if (data && data.length > 0) {
      // Filter by date range in memory
      const filtered = data.filter(row => {
        const dimValues = row.dimension_values as Record<string, any>;
        
        if (!dateDimensionId) {
          // Try to find date value by pattern
          for (const [key, value] of Object.entries(dimValues)) {
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
              const dateValue = new Date(value);
              return dateValue >= startDate && dateValue <= endDate;
            }
          }
          return true; // Include if no date found
        }
        
        const dateValue = dimValues[dateDimensionId];
        if (!dateValue) return false;
        
        const dateStr = typeof dateValue === 'string' ? dateValue : String(dateValue);
        const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!dateMatch) return false;
        
        const rowDate = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
        return rowDate >= startDate && rowDate <= endDate;
      });
      
      allRows.push(...filtered);
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Get available years and months from dimension_data
 */
async function getAvailableYearsMonths(reportId: string, dateDimensionId: string | null): Promise<Record<string, number[]>> {
  // TODO: Use MCP mcp_supabase-modelisation_execute_sql
  // Query: SELECT DISTINCT EXTRACT(YEAR FROM (dimension_values->>$1)::date) as year,
  //        EXTRACT(MONTH FROM (dimension_values->>$1)::date) as month
  //        FROM dimension_data WHERE report_id = $2
  
  const { data, error } = await supabase
    .from('dimension_data')
    .select('dimension_values')
    .eq('report_id', reportId)
    .limit(10000); // Sample to find years/months

  if (error || !data) {
    return {};
  }

  const yearMonths: Record<string, Set<number>> = {};

  data.forEach(row => {
    const dimValues = row.dimension_values as Record<string, any>;
    let dateValue: any = null;

    if (dateDimensionId) {
      dateValue = dimValues[dateDimensionId];
    } else {
      // Find date by pattern
      for (const [key, value] of Object.entries(dimValues)) {
        if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = value;
          break;
        }
      }
    }

    if (dateValue) {
      const dateStr = typeof dateValue === 'string' ? dateValue : String(dateValue);
      const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const year = dateMatch[1];
        const month = parseInt(dateMatch[2]);
        if (!yearMonths[year]) {
          yearMonths[year] = new Set();
        }
        yearMonths[year].add(month);
      }
    }
  });

  // Convert Sets to arrays
  const result: Record<string, number[]> = {};
  Object.entries(yearMonths).forEach(([year, months]) => {
    result[year] = Array.from(months).sort((a, b) => a - b);
  });

  return result;
}

/**
 * Get breakdown dimension row count for a specific period
 */
async function getBreakdownDimensionRowCount(
  reportId: string,
  breakdownDimensionId: string,
  year: number,
  month: number,
  dateDimensionId: string | null
): Promise<number> {
  const rows = await fetchDimensionDataForPeriod(reportId, year, month, dateDimensionId);
  
  const uniqueValues = new Set<string>();
  rows.forEach(row => {
    const dimValues = row.dimension_values as Record<string, any>;
    const value = dimValues[breakdownDimensionId];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      uniqueValues.add(String(value).trim());
    }
  });

  return uniqueValues.size;
}

/**
 * Fetch aggregated breakdown data from aggregated_breakdown_data table
 * Uses MCP pattern (currently Supabase client as fallback)
 */
async function fetchAggregatedBreakdownData(
  reportId: string,
  channel: string,
  year: number,
  month: number,
  primaryDimensionId: string,
  secondaryDimensionId: string | null
): Promise<any[]> {
  // TODO: Use MCP mcp_supabase-modelisation_execute_sql when available
  // Query: SELECT * FROM aggregated_breakdown_data
  // WHERE report_id = $1 AND channel = $2 AND year = $3 AND month = $4 
  // AND primary_dimension_id = $5 AND (secondary_dimension_id = $6 OR secondary_dimension_id IS NULL)
  
  let query = supabase
    .from('aggregated_breakdown_data')
    .select('*')
    .eq('report_id', reportId)
    .eq('channel', channel)
    .eq('year', year)
    .eq('month', month)
    .eq('primary_dimension_id', primaryDimensionId);

  if (secondaryDimensionId) {
    query = query.eq('secondary_dimension_id', secondaryDimensionId);
  } else {
    query = query.is('secondary_dimension_id', null);
  }

  const { data, error } = await query.order('primary_dimension_value', { ascending: true });

  if (error) {
    console.error('[fetchAggregatedBreakdownData] Error:', error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Transform aggregated data to table row format
  return data.map(row => {
    const metrics = row.metrics as Record<string, number> || {};
    const derivedMetrics = row.derived_metrics as Record<string, number> || {};
    
    // Build row object with dimension values and all metrics
    const tableRow: any = {
      [row.primary_dimension_value.toLowerCase().replace(/\s+/g, '_')]: row.primary_dimension_value,
      name: row.primary_dimension_value,
      ...metrics,
      ...derivedMetrics,
    };

    // Add secondary dimension if present
    if (row.secondary_dimension_value) {
      const secondaryKey = row.secondary_dimension_value.toLowerCase().replace(/\s+/g, '_');
      tableRow[secondaryKey] = row.secondary_dimension_value;
      tableRow.secondaryName = row.secondary_dimension_value;
    }

    return tableRow;
  });
}

// Helper function to calculate derived metrics
function calculateDerivedMetrics(data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) {
  const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
  const conversionRate = data.clicks > 0 ? (data.bookings / data.clicks) * 100 : 0;
  const cpc = data.clicks > 0 ? data.cost / data.clicks : 0;
  const roas = data.cost > 0 ? data.revenue / data.cost : 0;
  const costOfSale = data.revenue > 0 ? (data.cost / data.revenue) * 100 : 0;
  
  return {
    ...data,
    ctr: Number(ctr.toFixed(2)),
    conversionRate: Number(conversionRate.toFixed(2)),
    cpc: Number(cpc.toFixed(2)),
    roas: Number(roas.toFixed(2)),
    costOfSale: Number(costOfSale.toFixed(2)),
  };
}

// Dimension Selector View Component
interface DimensionSelectorViewProps {
  channel: string;
  availableBreakdowns: string[];
  onBreakdownSelect: (breakdownName: string) => void;
  pivotData?: SlideReportPivotData | null;
  configuration?: SlideReportConfiguration | null;
  reportIds?: Record<string, string> | null;
  selectedYear?: string | null;
  selectedMonth?: string | null;
}

function DimensionSelectorView({
  channel,
  availableBreakdowns,
  onBreakdownSelect,
  pivotData,
  configuration,
  reportIds,
  selectedYear,
  selectedMonth,
}: DimensionSelectorViewProps) {
  const [dimensionNames, setDimensionNames] = useState<Record<string, string>>({});
  const [dimensionRowCounts, setDimensionRowCounts] = useState<Record<string, number>>({});
  const [isLoadingNames, setIsLoadingNames] = useState(false);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);

  // Fetch dimension names and row counts if we have dimension IDs
  useEffect(() => {
    const fetchDimensionData = async () => {
      if (!configuration?.breakdownConfigs?.[channel]?.breakdownDimensionIds) return;
      if (!reportIds || !reportIds[channel]) return;
      if (!selectedYear || !selectedMonth) return;
      
      const dimIds = configuration.breakdownConfigs[channel].breakdownDimensionIds;
      const reportId = reportIds[channel];
      const names: Record<string, string> = {};
      const counts: Record<string, number> = {};
      
      setIsLoadingNames(true);
      setIsLoadingCounts(true);
      try {
        // Build dimension mapping
        const dimensionMapping = await buildDimensionMapping(reportId);
        const dateDimensionId = await findDateDimensionId(reportId, dimensionMapping);
        
        // Map dimension IDs to names
        dimIds.forEach(dimId => {
          const dim = dimensionMapping[dimId];
          if (dim) {
            names[dimId] = dim.name;
          }
        });
        setDimensionNames(names);
        
        // Fetch row counts for each breakdown dimension
        const yearNum = parseInt(selectedYear);
        const monthNum = parseInt(selectedMonth);
        
        for (const dimId of dimIds) {
          try {
            const count = await getBreakdownDimensionRowCount(
              reportId,
              dimId,
              yearNum,
              monthNum,
              dateDimensionId
            );
            counts[dimId] = count;
          } catch (error) {
            console.error(`Error fetching row count for dimension ${dimId}:`, error);
            counts[dimId] = 0;
          }
        }
        setDimensionRowCounts(counts);
      } catch (error) {
        console.error('Error fetching dimension data:', error);
      } finally {
        setIsLoadingNames(false);
        setIsLoadingCounts(false);
      }
    };

    // Only fetch if we don't have pivot_data breakdowns
    if (!pivotData?.channels?.[channel]?.breakdowns) {
      fetchDimensionData();
    }
  }, [channel, configuration, pivotData, reportIds, selectedYear, selectedMonth]);

  // Get breakdown display names with row counts
  const breakdownDisplayNames = useMemo(() => {
    return availableBreakdowns.map(idOrName => {
      // If it's already a name (from pivot_data), use it
      if (pivotData?.channels?.[channel]?.breakdowns?.[idOrName]) {
        const breakdownData = pivotData.channels[channel].breakdowns[idOrName];
        return { id: idOrName, name: idOrName, rowCount: breakdownData.length };
      }
      // Otherwise, look up the name and row count
      const name = dimensionNames[idOrName] || idOrName;
      const rowCount = dimensionRowCounts[idOrName] || 0;
      return { id: idOrName, name, rowCount };
    });
  }, [availableBreakdowns, dimensionNames, dimensionRowCounts, pivotData, channel]);

  return (
    <div className="space-y-4 p-2">
      <div className="text-xs text-muted-foreground mb-2 font-mono bg-muted/30 p-2 rounded">
        Channel: {channel.charAt(0).toUpperCase() + channel.slice(1)} | Select a dimension to view data
      </div>
      
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Dimension Groups</span>
      </div>
      
      {(isLoadingNames || isLoadingCounts) ? (
        <div className="text-center py-12 text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
          <p>Loading dimensions...</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {breakdownDisplayNames.map(({ id, name, rowCount }) => {
            return (
              <button
                key={id}
                onClick={() => onBreakdownSelect(name)}
                className="flex flex-col gap-3 p-5 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-lg">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {rowCount > 0 ? `${rowCount} ${rowCount === 1 ? 'row' : 'rows'}` : 'Click to load data'}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
          {breakdownDisplayNames.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>No breakdown dimensions configured for {channel.charAt(0).toUpperCase() + channel.slice(1)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Dimension Table View Component - Fetches data and creates Account-first/Campaign-first views
interface DimensionTableViewProps {
  channel: string;
  breakdownName: string;
  selectedYear: string | null;
  selectedMonth: string | null;
  availableBreakdowns: string[];
  pivotData?: SlideReportPivotData | null;
  reportIds?: Record<string, string> | null;
  configuration?: SlideReportConfiguration | null;
}

function DimensionTableView({
  channel,
  breakdownName,
  selectedYear,
  selectedMonth,
  availableBreakdowns,
  pivotData,
  reportIds,
  configuration,
}: DimensionTableViewProps) {
  const [tableData, setTableData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dimensionId, setDimensionId] = useState<string | null>(null);
  const [metricNameToIdMap, setMetricNameToIdMap] = useState<Record<string, string>>({});
  const [dateDimensionId, setDateDimensionId] = useState<string | null>(null);
  const [allDimensionIds, setAllDimensionIds] = useState<Record<string, string>>({}); // name -> id mapping
  const [secondaryDimension, setSecondaryDimension] = useState<string | null>(null);
  const [secondaryDimensionName, setSecondaryDimensionName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'primary' | 'cross-tab'>('primary');
  const [allAvailableMetrics, setAllAvailableMetrics] = useState<string[]>([]); // All metric names to display

  // Aggregate ALL available metrics from dimension_data
  const aggregateAllMetricsForRows = (rows: any[], dateRange: { start: Date; end: Date }, dimensionMapping: Record<string, { id: string; name: string; type: string }>) => {
    // Initialize result with all numeric dimensions (metrics)
    const result: Record<string, number> = {};
    
    // First pass: identify all numeric dimensions
    const numericDimensions: Record<string, string> = {}; // dimensionId -> dimensionName
    Object.entries(dimensionMapping).forEach(([id, dim]) => {
      if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
        numericDimensions[id] = dim.name;
        result[dim.name] = 0; // Initialize metric
      }
    });

    const filteredRows = rows.filter((row) => {
      const rowData = row.dimension_values || row;
      
      // Date filter
      let dateValue: any = null;
      if (dateDimensionId) {
        dateValue = rowData[dateDimensionId];
      } else {
        // Try to find date by pattern
        for (const [key, val] of Object.entries(rowData)) {
          if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
            dateValue = val;
            break;
          }
        }
      }
      
      if (!dateValue) return false;
      
      const dateStr = typeof dateValue === 'string' ? dateValue : String(dateValue);
      const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!dateMatch) return false;
      
      const rowDate = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
      return rowDate >= dateRange.start && rowDate <= dateRange.end;
    });

    // Aggregate all numeric metrics
    filteredRows.forEach((row) => {
      const rowData = row.dimension_values || row;
      
      // Sum all numeric dimensions
      Object.entries(numericDimensions).forEach(([dimId, dimName]) => {
        const value = rowData[dimId];
        if (value !== undefined && value !== null) {
          const numValue = parseFloat(String(value));
          if (!isNaN(numValue)) {
            result[dimName] = (result[dimName] || 0) + numValue;
          }
        }
      });
    });

    return result;
  };

  // Fetch and process data
  useEffect(() => {
    const fetchAndProcessData = async () => {
      if (!selectedYear || !selectedMonth || !reportIds || !reportIds[channel]) {
        return;
      }

      // Check if we have pivot_data first
      if (pivotData?.channels?.[channel]?.breakdowns?.[breakdownName]) {
        const breakdownData = pivotData.channels[channel].breakdowns[breakdownName];
        setTableData(breakdownData.map(row => ({
          ...row,
          ...calculateDerivedMetrics({
            impressions: row.impressions || 0,
            clicks: row.clicks || 0,
            cost: row.cost || 0,
            revenue: row.revenue || 0,
            bookings: row.bookings || 0,
          }),
        })));
        return;
      }

      setIsLoading(true);
      try {
        const reportId = reportIds[channel];
        
        // Build dimension mapping using MCP helper
        const dimensionMapping = await buildDimensionMapping(reportId);
        const dateDimId = await findDateDimensionId(reportId, dimensionMapping);
        
        // Build name to ID mapping
        const nameToIdMap: Record<string, string> = {};
        const allDimIds: Record<string, string> = {}; // name -> id
        let breakdownDimId: string | null = null;

        Object.entries(dimensionMapping).forEach(([id, dim]) => {
          nameToIdMap[dim.name] = id;
          allDimIds[dim.name] = id;
          if (dim.name === breakdownName || dim.name.toLowerCase() === breakdownName.toLowerCase()) {
            breakdownDimId = id;
          }
        });

        setMetricNameToIdMap(nameToIdMap);
        setAllDimensionIds(allDimIds);
        setDateDimensionId(dateDimId);
        setDimensionId(breakdownDimId);

        // Find secondary dimension (e.g., if primary is Account, find Campaign)
        const otherBreakdowns = availableBreakdowns.filter(b => b !== breakdownName);
        let secondaryDimId: string | null = null;
        let secondaryDimName: string | null = null;
        if (otherBreakdowns.length > 0) {
          const secondaryName = otherBreakdowns[0];
          // Try to find secondary dimension by name
          for (const [id, dim] of Object.entries(dimensionMapping)) {
            if (dim.name === secondaryName || dim.name.toLowerCase() === secondaryName.toLowerCase()) {
              secondaryDimId = id;
              secondaryDimName = dim.name;
              break;
            }
          }
          setSecondaryDimension(secondaryDimId);
          setSecondaryDimensionName(secondaryDimName);
        } else {
          setSecondaryDimension(null);
          setSecondaryDimensionName(null);
        }

        if (!breakdownDimId) {
          console.warn(`Breakdown dimension "${breakdownName}" not found`);
          setTableData([]);
          return;
        }

        // Calculate date range for selected month
        const monthNum = parseInt(selectedMonth);
        const yearNum = parseInt(selectedYear);
        const startDate = new Date(yearNum, monthNum - 1, 1);
        const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

        // FIRST: Try to fetch from aggregated_breakdown_data table
        const aggregatedData = await fetchAggregatedBreakdownData(
          reportId,
          channel,
          yearNum,
          monthNum,
          breakdownDimId,
          secondaryDimId
        );

        if (aggregatedData && aggregatedData.length > 0) {
          // Use aggregated data directly
          console.log(`[DimensionTableView] Using aggregated data: ${aggregatedData.length} rows`);
          
          // Extract all available metrics from the first row
          if (aggregatedData.length > 0) {
            const firstRow = aggregatedData[0];
            const excludedKeys = new Set([
              'name', 'secondaryName', 'ctr', 'conversionRate', 'cpc', 'roas', 'costOfSale',
              breakdownName.toLowerCase().replace(/\s+/g, '_'),
              ...(secondaryDimName ? [secondaryDimName.toLowerCase().replace(/\s+/g, '_')] : [])
            ]);
            
            const metrics = Object.keys(firstRow)
              .filter(key => {
                if (excludedKeys.has(key)) return false;
                const value = firstRow[key];
                return typeof value === 'number' && !isNaN(value);
              })
              .sort();
            
            setAllAvailableMetrics(metrics);
          }
          
          // Sort by revenue descending
          const revenueKey = Object.keys(aggregatedData[0] || {}).find(k => k.toLowerCase() === 'revenue') || 'Revenue';
          aggregatedData.sort((a, b) => (b[revenueKey] || 0) - (a[revenueKey] || 0));
          
          setTableData(aggregatedData);
          setIsLoading(false);
          return;
        }

        // FALLBACK: Fetch from dimension_data and aggregate
        console.log(`[DimensionTableView] Aggregated data not available, fetching from dimension_data`);
        const dateFilteredRows = await fetchDimensionDataForPeriod(reportId, yearNum, monthNum, dateDimId);

        // Group by primary breakdown dimension value, then by secondary if available
        const grouped: Record<string, Record<string, any[]>> = {}; // primaryValue -> secondaryValue -> rows
        
        dateFilteredRows.forEach(row => {
          const rowData = row.dimension_values || row;
          const primaryValue = rowData[breakdownDimId!];
          
          if (primaryValue !== undefined && primaryValue !== null) {
            const primaryStr = String(primaryValue).trim();
            if (primaryStr) {
              if (!grouped[primaryStr]) {
                grouped[primaryStr] = {};
              }
              
              // If we have a secondary dimension, group by it too
              if (secondaryDimId) {
                const secondaryValue = rowData[secondaryDimId];
                const secondaryStr = secondaryValue !== undefined && secondaryValue !== null 
                  ? String(secondaryValue).trim() 
                  : 'Uncategorized';
                
                if (!grouped[primaryStr][secondaryStr]) {
                  grouped[primaryStr][secondaryStr] = [];
                }
                grouped[primaryStr][secondaryStr].push(row);
              } else {
                // No secondary dimension, just group all rows under primary
                if (!grouped[primaryStr]['_all']) {
                  grouped[primaryStr]['_all'] = [];
                }
                grouped[primaryStr]['_all'].push(row);
              }
            }
          }
        });

        // Build table rows - flatten grouped structure with ALL available metrics
        const tableRows: any[] = [];
        
        Object.entries(grouped).forEach(([primaryValue, secondaryGroups]) => {
          if (secondaryDimId && Object.keys(secondaryGroups).length > 1) {
            // Create a row for each secondary dimension value (cross-tabulation)
            Object.entries(secondaryGroups).forEach(([secondaryValue, rows]) => {
              // Aggregate ALL available metrics
              const allMetrics = aggregateAllMetricsForRows(rows, { start: startDate, end: endDate }, dimensionMapping);
              const secondaryDimName = Object.entries(dimensionMapping).find(([id]) => id === secondaryDimId)?.[1]?.name || 'Secondary';
              
              // Calculate derived metrics from common KPIs if available
              const impressions = allMetrics['Impressions'] || 0;
              const clicks = allMetrics['Clicks'] || 0;
              const cost = allMetrics['Cost'] || allMetrics['Spend'] || 0;
              const revenue = allMetrics['Revenue'] || 0;
              const bookings = allMetrics['Bookings'] || allMetrics['Conversions'] || 0;
              
              tableRows.push({
                [breakdownName.toLowerCase().replace(/\s+/g, '_')]: primaryValue,
                [secondaryDimName.toLowerCase().replace(/\s+/g, '_')]: secondaryValue,
                name: primaryValue,
                secondaryName: secondaryValue,
                ...allMetrics, // Include all available metrics
                ...calculateDerivedMetrics({
                  impressions,
                  clicks,
                  cost,
                  revenue,
                  bookings,
                }),
              });
            });
          } else {
            // Single group, aggregate all rows
            const allRowsForPrimary = Object.values(secondaryGroups).flat();
            // Aggregate ALL available metrics
            const allMetrics = aggregateAllMetricsForRows(allRowsForPrimary, { start: startDate, end: endDate }, dimensionMapping);
            
            // Calculate derived metrics from common KPIs if available
            const impressions = allMetrics['Impressions'] || 0;
            const clicks = allMetrics['Clicks'] || 0;
            const cost = allMetrics['Cost'] || allMetrics['Spend'] || 0;
            const revenue = allMetrics['Revenue'] || 0;
            const bookings = allMetrics['Bookings'] || allMetrics['Conversions'] || 0;
            
            tableRows.push({
              [breakdownName.toLowerCase().replace(/\s+/g, '_')]: primaryValue,
              name: primaryValue,
              ...allMetrics, // Include all available metrics
              ...calculateDerivedMetrics({
                impressions,
                clicks,
                cost,
                revenue,
                bookings,
              }),
            });
          }
        });

        // Sort by revenue descending (or first available metric)
        const revenueKey = Object.keys(tableRows[0] || {}).find(k => k.toLowerCase() === 'revenue') || 'Revenue';
        tableRows.sort((a, b) => (b[revenueKey] || 0) - (a[revenueKey] || 0));
        setTableData(tableRows);
        
        // Extract all available metric names from the first row (excluding derived metrics and dimension values)
        if (tableRows.length > 0) {
          const firstRow = tableRows[0];
          const excludedKeys = new Set([
            'name', 'secondaryName', 'ctr', 'conversionRate', 'cpc', 'roas', 'costOfSale',
            breakdownName.toLowerCase().replace(/\s+/g, '_'),
            ...(secondaryDimension ? [Object.entries(dimensionMapping).find(([id]) => id === secondaryDimension)?.[1]?.name.toLowerCase().replace(/\s+/g, '_') || ''] : [])
          ]);
          
          const metrics = Object.keys(firstRow)
            .filter(key => {
              // Exclude dimension values and derived metrics
              if (excludedKeys.has(key)) return false;
              // Include numeric values (metrics)
              const value = firstRow[key];
              return typeof value === 'number' && !isNaN(value);
            })
            .sort(); // Sort alphabetically
          
          setAllAvailableMetrics(metrics);
        }

      } catch (error) {
        console.error('Error fetching dimension table data:', error);
        setTableData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndProcessData();
  }, [selectedYear, selectedMonth, channel, breakdownName, reportIds, pivotData]);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p>Loading data for {breakdownName}...</p>
      </div>
    );
  }

  if (tableData.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Table2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p>No data available for {breakdownName} in {MONTH_NAMES[parseInt(selectedMonth || '1') - 1]} {selectedYear}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <div className="text-xs text-muted-foreground mb-2 font-mono bg-muted/30 p-2 rounded">
        Breakdown: {breakdownName} | Channel: {channel} | Period: {MONTH_NAMES[parseInt(selectedMonth || '1') - 1]} {selectedYear}
      </div>
      
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 border-b">
          <h3 className="font-semibold text-sm">{breakdownName} - {MONTH_NAMES[parseInt(selectedMonth || '1') - 1]} {selectedYear}</h3>
        </div>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">{breakdownName}</TableHead>
                {secondaryDimension && secondaryDimensionName && (
                  <TableHead className="font-semibold">{secondaryDimensionName}</TableHead>
                )}
                <TableHead className="text-right">Month</TableHead>
                {/* Dynamically render all available metrics */}
                {allAvailableMetrics.map(metric => (
                  <TableHead key={metric} className="text-right">{metric}</TableHead>
                ))}
                {/* Derived metrics */}
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Conv. Rate</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">Cost of Sale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row, rowIdx) => {
                const rowValue = row[breakdownName.toLowerCase().replace(/\s+/g, '_')] || row.name || `Row ${rowIdx + 1}`;
                return (
                  <TableRow key={rowIdx}>
                    <TableCell className="font-medium">{rowValue}</TableCell>
                    {secondaryDimension && secondaryDimensionName && (
                      <TableCell className="font-medium">{row.secondaryName || 'N/A'}</TableCell>
                    )}
                    <TableCell className="text-right">{MONTH_NAMES[parseInt(selectedMonth || '1') - 1]} {selectedYear}</TableCell>
                    {/* Dynamically render all available metrics */}
                    {allAvailableMetrics.map(metric => {
                      const value = row[metric] || 0;
                      // Format based on metric type (currency, percentage, or number)
                      const isCurrency = metric.toLowerCase().includes('cost') || metric.toLowerCase().includes('revenue') || metric.toLowerCase().includes('spend');
                      const isPercentage = metric.toLowerCase().includes('rate') || metric.toLowerCase().includes('share');
                      
                      return (
                        <TableCell key={metric} className="text-right">
                          {isCurrency 
                            ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : isPercentage
                            ? `${value.toFixed(2)}%`
                            : value.toLocaleString()
                          }
                        </TableCell>
                      );
                    })}
                    {/* Derived metrics */}
                    <TableCell className="text-right">{row.ctr?.toFixed(2) || '0.00'}%</TableCell>
                    <TableCell className="text-right">{row.conversionRate?.toFixed(2) || '0.00'}%</TableCell>
                    <TableCell className="text-right">${row.cpc?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell className="text-right">{row.roas?.toFixed(2) || '0.00'}x</TableCell>
                    <TableCell className="text-right">{row.costOfSale?.toFixed(2) || '0.00'}%</TableCell>
                  </TableRow>
                );
              })}
              {/* Totals row */}
              {(() => {
                // Calculate totals for all metrics
                const totals: Record<string, number> = {};
                allAvailableMetrics.forEach(metric => {
                  totals[metric] = tableData.reduce((sum, row) => sum + (row[metric] || 0), 0);
                });
                
                // Calculate derived metrics from common KPIs
                const impressions = totals['Impressions'] || totals['impressions'] || 0;
                const clicks = totals['Clicks'] || totals['clicks'] || 0;
                const cost = totals['Cost'] || totals['cost'] || totals['Spend'] || totals['spend'] || 0;
                const revenue = totals['Revenue'] || totals['revenue'] || 0;
                const bookings = totals['Bookings'] || totals['bookings'] || totals['Conversions'] || totals['conversions'] || 0;
                
                const totalMetrics = calculateDerivedMetrics({
                  impressions,
                  clicks,
                  cost,
                  revenue,
                  bookings,
                });
                
                return (
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>Total</TableCell>
                    {secondaryDimension && secondaryDimensionName && <TableCell></TableCell>}
                    <TableCell className="text-right">{MONTH_NAMES[parseInt(selectedMonth || '1') - 1]} {selectedYear}</TableCell>
                    {/* Dynamically render totals for all metrics */}
                    {allAvailableMetrics.map(metric => {
                      const value = totals[metric] || 0;
                      const isCurrency = metric.toLowerCase().includes('cost') || metric.toLowerCase().includes('revenue') || metric.toLowerCase().includes('spend');
                      const isPercentage = metric.toLowerCase().includes('rate') || metric.toLowerCase().includes('share');
                      
                      return (
                        <TableCell key={metric} className="text-right">
                          {isCurrency 
                            ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : isPercentage
                            ? `${value.toFixed(2)}%`
                            : value.toLocaleString()
                          }
                        </TableCell>
                      );
                    })}
                    {/* Derived metrics totals */}
                    <TableCell className="text-right">{totalMetrics.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">{totalMetrics.conversionRate.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">${totalMetrics.cpc.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{totalMetrics.roas.toFixed(2)}x</TableCell>
                    <TableCell className="text-right">{totalMetrics.costOfSale.toFixed(2)}%</TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
}

// Pivot Table View Component
interface PivotTableViewProps {
  pivotData?: SlideReportPivotData | null;
  channel: string;
  breakdownName: string;
  selectedYear: string | null;
  selectedMonth: string | null;
  availableBreakdowns: string[];
}

function PivotTableView({
  pivotData,
  channel,
  breakdownName,
  selectedYear,
  selectedMonth,
  availableBreakdowns,
}: PivotTableViewProps) {
  const channelData = pivotData?.channels?.[channel];
  const primaryBreakdownData = channelData?.breakdowns?.[breakdownName] || [];
  
  // Get other breakdown dimensions (excluding the primary one)
  const otherBreakdowns = availableBreakdowns.filter(b => b !== breakdownName);
  
  // Generate pivot tables for all combinations
  const pivotTables = useMemo(() => {
    const tables: Array<{
      title: string;
      type: '2d' | '3d';
      data: any[];
    }> = [];
    
    if (primaryBreakdownData.length === 0) return tables;
    
    // Table 1: Primary breakdown × Month (if we have monthly data)
    if (selectedYear && selectedMonth) {
      // For now, show all-time data (monthly breakdown would require additional computation)
      // This is a placeholder - in a full implementation, we'd compute monthly breakdowns
      tables.push({
        title: `${breakdownName} × All Time`,
        type: '2d',
        data: primaryBreakdownData.map(row => ({
          ...row,
          ...calculateDerivedMetrics({
            impressions: row.impressions || 0,
            clicks: row.clicks || 0,
            cost: row.cost || 0,
            revenue: row.revenue || 0,
            bookings: row.bookings || 0,
          }),
        })),
      });
    }
    
    // Table 2-N: Primary breakdown × Other breakdown dimensions
    for (const otherBreakdown of otherBreakdowns) {
      const otherBreakdownData = channelData?.breakdowns?.[otherBreakdown] || [];
      
      // Create a cross-tabulation
      const crossTab: Record<string, Record<string, any>> = {};
      
      // Initialize structure
      primaryBreakdownData.forEach(primaryRow => {
        const primaryValue = primaryRow[breakdownName.toLowerCase().replace(/\s+/g, '_')] || primaryRow.name || 'Unknown';
        if (!crossTab[primaryValue]) {
          crossTab[primaryValue] = {};
        }
        
        otherBreakdownData.forEach(otherRow => {
          const otherValue = otherRow[otherBreakdown.toLowerCase().replace(/\s+/g, '_')] || otherRow.name || 'Unknown';
          if (!crossTab[primaryValue][otherValue]) {
            crossTab[primaryValue][otherValue] = {
              impressions: 0,
              clicks: 0,
              cost: 0,
              revenue: 0,
              bookings: 0,
            };
          }
        });
      });
      
      // Aggregate data (simplified - in reality, we'd need to join on common dimensions)
      // For now, we'll show the primary breakdown with totals
      tables.push({
        title: `${breakdownName} × ${otherBreakdown}`,
        type: '2d',
        data: primaryBreakdownData.map(row => ({
          ...row,
          ...calculateDerivedMetrics({
            impressions: row.impressions || 0,
            clicks: row.clicks || 0,
            cost: row.cost || 0,
            revenue: row.revenue || 0,
            bookings: row.bookings || 0,
          }),
        })),
      });
    }
    
    return tables;
  }, [primaryBreakdownData, breakdownName, otherBreakdowns, channelData, selectedYear, selectedMonth]);
  
  if (primaryBreakdownData.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Table2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p>No breakdown data available for {breakdownName}</p>
      </div>
    );
  }
  
  // Note: Monthly breakdowns would require computing breakdown data by month from dimension_data
  // For now, we show all-time aggregated breakdown data in pivot format
  const hasMonthlyBreakdownNote = selectedYear && selectedMonth && otherBreakdowns.length > 0;
  
  return (
    <div className="space-y-6">
      {hasMonthlyBreakdownNote && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium mb-1">Note: Monthly Breakdown Data</p>
          <p>
            Currently showing all-time aggregated breakdown data. Monthly breakdowns (e.g., "{breakdownName} × Month") 
            would require computing breakdown data by month from raw dimension_data, which can be added as an enhancement.
          </p>
        </div>
      )}
      {pivotTables.map((table, idx) => (
        <div key={idx} className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 border-b">
            <h3 className="font-semibold text-sm">{table.title}</h3>
          </div>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">{breakdownName}</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Conv. Rate</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">Cost of Sale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.data.map((row, rowIdx) => {
                  const rowValue = row[breakdownName.toLowerCase().replace(/\s+/g, '_')] || row.name || `Row ${rowIdx + 1}`;
                  return (
                    <TableRow key={rowIdx}>
                      <TableCell className="font-medium">{rowValue}</TableCell>
                      <TableCell className="text-right">{(row.impressions || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(row.clicks || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.ctr?.toFixed(2) || '0.00'}%</TableCell>
                      <TableCell className="text-right">{(row.bookings || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.conversionRate?.toFixed(2) || '0.00'}%</TableCell>
                      <TableCell className="text-right">${row.cpc?.toFixed(2) || '0.00'}</TableCell>
                      <TableCell className="text-right">${(row.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">${(row.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">{row.roas?.toFixed(2) || '0.00'}x</TableCell>
                      <TableCell className="text-right">{row.costOfSale?.toFixed(2) || '0.00'}%</TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals row */}
                {(() => {
                  const totals = table.data.reduce((acc, row) => ({
                    impressions: acc.impressions + (row.impressions || 0),
                    clicks: acc.clicks + (row.clicks || 0),
                    cost: acc.cost + (row.cost || 0),
                    revenue: acc.revenue + (row.revenue || 0),
                    bookings: acc.bookings + (row.bookings || 0),
                  }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });
                  const totalMetrics = calculateDerivedMetrics(totals);
                  return (
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{totalMetrics.impressions.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{totalMetrics.clicks.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{totalMetrics.ctr.toFixed(2)}%</TableCell>
                      <TableCell className="text-right">{totalMetrics.bookings.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{totalMetrics.conversionRate.toFixed(2)}%</TableCell>
                      <TableCell className="text-right">${totalMetrics.cpc.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${totalMetrics.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">${totalMetrics.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">{totalMetrics.roas.toFixed(2)}x</TableCell>
                      <TableCell className="text-right">{totalMetrics.costOfSale.toFixed(2)}%</TableCell>
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}

// Data Rows View Component - Shows all raw data rows from dimension_data
interface DataRowsViewProps {
  channel: string;
  selectedYear: string;
  selectedMonth: string;
  reportIds?: Record<string, string> | null;
}

function DataRowsView({
  channel,
  selectedYear,
  selectedMonth,
  reportIds,
}: DataRowsViewProps) {
  const [tableData, setTableData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dimensionMapping, setDimensionMapping] = useState<Record<string, { id: string; name: string; type: string }>>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!reportIds || !reportIds[channel]) {
        setTableData([]);
        return;
      }

      setIsLoading(true);
      try {
        const reportId = reportIds[channel];
        const yearNum = parseInt(selectedYear);
        const monthNum = parseInt(selectedMonth);

        // Build dimension mapping
        const mapping = await buildDimensionMapping(reportId);
        setDimensionMapping(mapping);

        // Find date dimension
        const dateDimId = await findDateDimensionId(reportId, mapping);

        // Fetch all data for the period
        const rows = await fetchDimensionDataForPeriod(reportId, yearNum, monthNum, dateDimId);

        // Transform rows to table format
        const transformedRows = rows.map(row => {
          const dimValues = row.dimension_values as Record<string, any>;
          const transformed: Record<string, any> = {};
          
          // Map dimension IDs to names
          Object.entries(dimValues).forEach(([dimId, value]) => {
            const dim = mapping[dimId];
            if (dim) {
              transformed[dim.name] = value;
            } else {
              // Fallback: use dimension ID if name not found
              transformed[dimId] = value;
            }
          });
          
          return transformed;
        });

        // Determine column order: date first, then dimensions, then metrics
        const dateCols: string[] = [];
        const dimensionCols: string[] = [];
        const metricCols: string[] = [];

        Object.entries(mapping).forEach(([id, dim]) => {
          if (dim.type === 'date') {
            dateCols.push(dim.name);
          } else if (dim.type === 'text' || dim.type === 'select') {
            dimensionCols.push(dim.name);
          } else if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
            metricCols.push(dim.name);
          }
        });

        // Sort columns: date, dimensions (alphabetically), metrics (alphabetically)
        const orderedCols = [
          ...dateCols,
          ...dimensionCols.sort(),
          ...metricCols.sort()
        ];

        setColumnOrder(orderedCols);
        setTableData(transformedRows);

      } catch (error) {
        console.error('[DataRowsView] Error fetching data:', error);
        setTableData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [channel, selectedYear, selectedMonth, reportIds]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-2">
        <div className="text-center py-12 text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
          <p>Loading data rows...</p>
        </div>
      </div>
    );
  }

  if (tableData.length === 0) {
    return (
      <div className="space-y-4 p-2">
        <div className="text-xs text-muted-foreground mb-2 font-mono bg-muted/30 p-2 rounded">
          Channel: {channel.charAt(0).toUpperCase() + channel.slice(1)} | Period: {MONTH_NAMES[parseInt(selectedMonth) - 1]} {selectedYear}
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <Table2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>No data rows found for this period</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <div className="text-xs text-muted-foreground mb-2 font-mono bg-muted/30 p-2 rounded">
        Channel: {channel.charAt(0).toUpperCase() + channel.slice(1)} | Period: {MONTH_NAMES[parseInt(selectedMonth) - 1]} {selectedYear} | Rows: {tableData.length}
      </div>
      
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 border-b">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Data Rows</h3>
            <Badge variant="secondary" className="ml-auto">{tableData.length} rows</Badge>
          </div>
        </div>
        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                {columnOrder.map(col => (
                  <TableHead key={col} className="font-semibold">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row, rowIdx) => (
                <TableRow key={rowIdx}>
                  {columnOrder.map(col => {
                    const value = row[col];
                    const dim = Object.values(dimensionMapping).find(d => d.name === col);
                    const isCurrency = dim?.type === 'currency';
                    const isPercentage = dim?.type === 'percentage';
                    const isNumber = dim?.type === 'number';
                    
                    return (
                      <TableCell key={col} className={isCurrency || isNumber || isPercentage ? "text-right" : ""}>
                        {value === null || value === undefined ? (
                          <span className="text-muted-foreground">—</span>
                        ) : isCurrency ? (
                          `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        ) : isPercentage ? (
                          `${Number(value).toFixed(2)}%`
                        ) : isNumber ? (
                          Number(value).toLocaleString()
                        ) : (
                          String(value)
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
}

export function SlideDataBrowser({
  open,
  onOpenChange,
  pivotData,
  lastRefreshedAt,
  configuration,
  reportIds,
}: SlideDataBrowserProps) {
  const [viewLevel, setViewLevel] = useState<ViewLevel>('years');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setViewLevel('years');
      setSelectedYear(null);
      setSelectedMonth(null);
      setSelectedChannel(null);
    }
    onOpenChange(isOpen);
  };

  // Fetch data from dimension_data when pivot_data is empty
  const [rawDataByYear, setRawDataByYear] = useState<Record<string, Set<number>>>({});
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Fetch available years and months from dimension_data
  useEffect(() => {
    const fetchAvailableYears = async () => {
      if (pivotData && Object.keys(pivotData).length > 0) {
        // Use pivot_data if available
        return;
      }

      if (!reportIds || !configuration?.selectedChannels) {
        return;
      }

      setIsLoadingData(true);
      try {
        const yearsMap: Record<string, Set<number>> = {};
        
        // Fetch data for each channel to determine available years/months
        for (const channel of configuration.selectedChannels) {
          const reportId = reportIds[channel];
          if (!reportId) continue;

          // Fetch a sample of dimension_data to find date values
          const { data: sampleData } = await supabase
            .from('dimension_data')
            .select('dimension_values')
            .eq('report_id', reportId)
            .limit(1000);

          if (sampleData) {
            // Find date dimension by looking for date-like values
            for (const row of sampleData) {
              const dimValues = row.dimension_values as Record<string, any>;
              for (const [key, value] of Object.entries(dimValues)) {
                if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                  const dateStr = value as string;
                  const [year, month] = dateStr.split('-');
                  if (year && month) {
                    if (!yearsMap[year]) {
                      yearsMap[year] = new Set();
                    }
                    yearsMap[year].add(parseInt(month));
                  }
                  break; // Found date, move to next row
                }
              }
            }
          }
        }

        setRawDataByYear(yearsMap);
      } catch (error) {
        console.error('Error fetching available years:', error);
      } finally {
        setIsLoadingData(false);
      }
    };

    if (open) {
      fetchAvailableYears();
    }
  }, [open, pivotData, reportIds, configuration]);

  // Extract available years from pivot data, raw data, or master report settings (since 2024)
  const availableYears = useMemo(() => {
    // If we have pivot_data, use it
    if (pivotData && Object.keys(pivotData).length > 0) {
    const years = new Set<string>();
    
    // Check overview.yearly
    if (pivotData?.overview?.yearly) {
      Object.keys(pivotData.overview.yearly).forEach(y => years.add(y));
    }
    
    // Check overview.monthly (keys like "2024-01")
    if (pivotData?.overview?.monthly) {
      Object.keys(pivotData.overview.monthly).forEach(key => {
        const year = key.split('-')[0];
        if (year) years.add(year);
      });
    }
    
    // Check channels.*.yearly and channels.*.monthly
    if (pivotData?.channels) {
      Object.values(pivotData.channels).forEach((channelData: any) => {
        if (channelData?.yearly) {
          Object.keys(channelData.yearly).forEach(y => years.add(y));
        }
        if (channelData?.monthly) {
          Object.keys(channelData.monthly).forEach(key => {
            const year = key.split('-')[0];
            if (year) years.add(year);
          });
        }
      });
    }

    return Array.from(years).sort().reverse();
    }

    // If we have raw data, use it
    if (Object.keys(rawDataByYear).length > 0) {
      return Object.keys(rawDataByYear).sort().reverse();
    }

    // Fallback: Use master report "since 2024" setting - show 2024, 2025, 2026
    // Always include 2024, 2025, 2026 regardless of current year
    return ['2026', '2025', '2024'];
  }, [pivotData, rawDataByYear]);

  // Extract available months for selected year
  const availableMonths = useMemo(() => {
    if (!selectedYear) return [];
    
    // If we have pivot_data, use it
    if (pivotData && Object.keys(pivotData).length > 0) {
    const months = new Set<number>();
    
    if (pivotData?.overview?.monthly) {
      Object.keys(pivotData.overview.monthly).forEach(key => {
        const [year, month] = key.split('-');
        if (year === selectedYear && month) {
          months.add(parseInt(month));
        }
      });
    }
    
    if (pivotData?.channels) {
      Object.values(pivotData.channels).forEach((channelData: any) => {
        if (channelData?.monthly) {
          Object.keys(channelData.monthly).forEach(key => {
            const [year, month] = key.split('-');
            if (year === selectedYear && month) {
              months.add(parseInt(month));
            }
          });
        }
      });
    }

    return Array.from(months).sort((a, b) => a - b);
    }

    // Otherwise, use raw data
    if (rawDataByYear[selectedYear]) {
      return Array.from(rawDataByYear[selectedYear]).sort((a, b) => a - b);
    }

    return [];
  }, [pivotData, selectedYear, rawDataByYear]);


  // Format timestamp
  const formattedRefreshTime = useMemo(() => {
    if (!lastRefreshedAt) return null;
    try {
      const date = new Date(lastRefreshedAt);
      return date.toLocaleString('en-US', { 
        dateStyle: 'medium', 
        timeStyle: 'short' 
      });
    } catch {
      return null;
    }
  }, [lastRefreshedAt]);

  // Handle year click
  const handleYearClick = (year: string) => {
    setSelectedYear(year);
    setViewLevel('months');
  };

  // Handle month click
  const handleMonthClick = (month: number) => {
    setSelectedMonth(month.toString());
    setViewLevel('channels');
  };

  // Handle channel click
  const handleChannelClick = (channel: string) => {
    setSelectedChannel(channel);
    setViewLevel('data_rows');
  };

  // Handle back navigation
  const handleBack = () => {
    if (viewLevel === 'data_rows') {
      setSelectedChannel(null);
      setViewLevel('channels');
    } else if (viewLevel === 'channels') {
      setSelectedMonth(null);
      setViewLevel('months');
    } else if (viewLevel === 'months') {
      setSelectedYear(null);
      setViewLevel('years');
    }
  };

  // Get available channels for selected month
  const availableChannels = useMemo(() => {
    if (!selectedYear || !selectedMonth) return [];
    
    // If we have pivot_data, use it
    if (pivotData && Object.keys(pivotData).length > 0) {
      const monthKey = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
      const channels: string[] = [];
      
      if (pivotData?.channels) {
        Object.keys(pivotData.channels).forEach(channel => {
          const channelData = pivotData.channels[channel];
          if (channelData?.monthly?.[monthKey]) {
            channels.push(channel);
          }
        });
      }
      
      return channels;
    }

    // Otherwise, use configuration to get available channels
    if (configuration?.selectedChannels) {
      return configuration.selectedChannels;
    }

    return [];
  }, [pivotData, selectedYear, selectedMonth, configuration]);

  // Get available breakdowns for selected channel
  const availableBreakdowns = useMemo(() => {
    if (!selectedChannel) return [];
    
    // If we have pivot_data, use it
    if (pivotData?.channels?.[selectedChannel]?.breakdowns) {
      return Object.keys(pivotData.channels[selectedChannel].breakdowns);
    }

    // Otherwise, use configuration to get breakdown dimensions
    if (configuration?.breakdownConfigs?.[selectedChannel]?.breakdownDimensionIds) {
      // We'll need to fetch dimension names from the database
      // For now, return the dimension IDs - we'll fetch names when needed
      return configuration.breakdownConfigs[selectedChannel].breakdownDimensionIds;
    }

    return [];
  }, [pivotData, selectedChannel, configuration]);

  // Get breadcrumb path
  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'Years', level: 'years' as ViewLevel }];
    if (selectedYear) {
      crumbs.push({ label: selectedYear, level: 'months' as ViewLevel });
    }
    if (selectedMonth) {
      const monthName = MONTH_NAMES[parseInt(selectedMonth) - 1];
      crumbs.push({ label: monthName, level: 'channels' as ViewLevel });
    }
    if (selectedChannel) {
      const channelLabel = selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1);
      crumbs.push({ label: channelLabel, level: 'data_rows' as ViewLevel });
    }
    return crumbs;
  }, [selectedYear, selectedMonth, selectedChannel]);

  const hasData = availableYears.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">Data Browser</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Raw JSON from slide_reports.pivot_data column
                </DialogDescription>
              </div>
            </div>
            {formattedRefreshTime && (
              <Badge variant="outline" className="gap-1.5">
                <Clock className="h-3 w-3" />
                {formattedRefreshTime}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Breadcrumb navigation */}
        {viewLevel !== 'years' && (
          <div className="flex items-center gap-2 pt-4 pb-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBack}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {breadcrumbs.map((crumb, i) => (
                <div key={crumb.level} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <span 
                    className={`${
                      i === breadcrumbs.length - 1 
                        ? 'text-foreground font-medium' 
                        : 'hover:text-foreground cursor-pointer'
                    }`}
                    onClick={() => {
                      if (crumb.level === 'years') {
                        setSelectedYear(null);
                        setSelectedMonth(null);
                        setSelectedChannel(null);
                        setSelectedBreakdown(null);
                        setViewLevel('years');
                      } else if (crumb.level === 'months') {
                        setSelectedMonth(null);
                        setSelectedChannel(null);
                        setViewLevel('months');
                      } else if (crumb.level === 'channels') {
                        setSelectedChannel(null);
                        setViewLevel('channels');
                      } else if (crumb.level === 'data_rows') {
                        setViewLevel('data_rows');
                      }
                    }}
                  >
                    {crumb.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 pt-2">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Database className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No Data Available</p>
              <p className="text-sm text-center max-w-md">
                Click "Refresh Data" to fetch and cache data from your sources.
              </p>
            </div>
          ) : (
            <>
              {/* Years View */}
              {viewLevel === 'years' && (
                <div className="space-y-4 p-2">
                  <div className="text-xs text-muted-foreground mb-4 font-mono bg-muted/30 p-2 rounded">
                    Source: Supabase → slide_reports.pivot_data (JSONB column)
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {availableYears.map(year => (
                      <button
                        key={year}
                        onClick={() => handleYearClick(year)}
                        className="flex items-center gap-4 p-5 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group text-left"
                      >
                        <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <Folder className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xl font-semibold">{year}</p>
                          <p className="text-sm text-muted-foreground">
                            {availableYears.indexOf(year) === 0 ? 'Latest' : 'Historical'}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Months View - show year summary + month folders */}
              {viewLevel === 'months' && selectedYear && (
                <div className="space-y-4 p-2">
                  <div className="text-xs text-muted-foreground mb-2 font-mono bg-muted/30 p-2 rounded">
                    Year: {selectedYear} | Path: pivot_data.*.yearly["{selectedYear}"] & pivot_data.*.monthly["{selectedYear}-MM"]
                  </div>
                  
                  {/* Yearly aggregate JSON */}
                  {/* Month folders */}
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Monthly Data Folders</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {availableMonths.map(month => (
                      <button
                        key={month}
                        onClick={() => handleMonthClick(month)}
                        className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group text-left"
                      >
                        <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <Calendar className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">{MONTH_NAMES[month - 1]}</p>
                          <p className="text-xs text-muted-foreground">{selectedYear}-{month.toString().padStart(2, '0')}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </button>
                    ))}
                    {availableMonths.length === 0 && (
                      <div className="col-span-4 text-center py-12 text-muted-foreground">
                        <Calendar className="h-8 w-8 mx-auto mb-3 opacity-50" />
                        <p>No monthly data available for {selectedYear}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Channels View - show data sources after month selection */}
              {viewLevel === 'channels' && selectedYear && selectedMonth && (
                <div className="space-y-4 p-2">
                  <div className="text-xs text-muted-foreground mb-2 font-mono bg-muted/30 p-2 rounded">
                    Month: {MONTH_NAMES[parseInt(selectedMonth) - 1]} {selectedYear} | Path: pivot_data.channels[channel].monthly["{selectedYear}-{selectedMonth.padStart(2, '0')}"]
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Report Data Sources</span>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {availableChannels.map(channel => {
                      const monthKey = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                      const channelData = pivotData?.channels?.[channel];
                      const monthlyData = channelData?.monthly?.[monthKey];
                      const channelLabel = channel.charAt(0).toUpperCase() + channel.slice(1);
                      
                      return (
                        <button
                          key={channel}
                          onClick={() => handleChannelClick(channel)}
                          className="flex flex-col gap-3 p-5 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                              <BarChart3 className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-lg">{channelLabel}</p>
                              <p className="text-xs text-muted-foreground">Data Source</p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          {monthlyData && (
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="text-muted-foreground">Revenue</p>
                                <p className="font-medium">${(monthlyData.revenue / 1000).toFixed(1)}K</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Clicks</p>
                                <p className="font-medium">{(monthlyData.clicks / 1000).toFixed(1)}K</p>
                              </div>
                </div>
                          )}
                        </button>
                      );
                    })}
                    {availableChannels.length === 0 && (
                      <div className="col-span-3 text-center py-12 text-muted-foreground">
                        <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-50" />
                        <p>No channel data available for {MONTH_NAMES[parseInt(selectedMonth) - 1]} {selectedYear}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Data Rows View - show all data rows after channel selection */}
              {viewLevel === 'data_rows' && selectedChannel && selectedYear && selectedMonth && (
                <DataRowsView
                  channel={selectedChannel}
                  selectedYear={selectedYear}
                  selectedMonth={selectedMonth}
                  reportIds={reportIds}
                />
              )}
            </>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
