import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart, ArrowUpRight, ArrowDownRight, Settings2, ChevronLeft, ChevronRight, X, Sparkles, Search, Loader2, Database, Check, Share2, BookmarkPlus, Trash2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SaveViewDialog } from "@/components/slides/SaveViewDialog";
import { SaveOrUpdateViewDialog } from "@/components/slides/SaveOrUpdateViewDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useSlideReports, useSlideReport, useCreateSlideReport, useUpdateSlideReport, useRefreshSlideReportData } from "@/hooks/useSlideReports";
import { useSlideReportViews, useCreateSlideReportView, useUpdateSlideReportView, useDeleteSlideReportView } from "@/hooks/useSlideReportViews";
import { useChannelMetrics } from "@/hooks/useChannelMetrics";
import { useSlideReportDisplayData } from "@/hooks/useSlideReportDisplayData";
import { useEditSourceModal } from "@/hooks/useEditSourceModal";
import { useDataLoadingCache } from "@/hooks/useDataLoadingCache";
import { useOverviewMetrics } from "@/hooks/useOverviewMetrics";
import { useComparisonMetrics, useChannelComparisonMetrics } from "@/hooks/useComparisonMetrics";
import { useKPICards, useReportKPICards } from "@/hooks/useKPICards";
import { useOverviewChartData, useAllChannelChartData } from "@/hooks/useChartData";
import { buildOverviewChartDataFromMonthlyData, buildChannelChartDataFromMonthlyData } from "@/lib/chartDataCalculations";
import { useBudgetData, useBudgetMonthlyData } from "@/hooks/useBudgetData";
import { calculateReportBreakdown, calculateReportTotal } from "@/lib/metricsCalculations";
import { normalizeBudgetValue, type ChannelBudgets } from "@/lib/budgetCalculations";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { SlideReport, SlideReportConfiguration, SlideReportPivotData, SlideReportDateRange, BreakdownRow, ChannelMetrics } from "@/types/slideReports";
import { useUser } from "@/lib/auth";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { SlideDataBrowser } from "@/components/slides/SlideDataBrowser";
import { RefreshStepIndicator, ChannelTabsList, DimensionValuesList } from "@/components/slides/EditSourceModal";
import { EditSourceModal } from "@/components/slides/EditSourceModal/EditSourceModal";
import { ShareModal } from "@/components/ShareModal";
import { SlideViewHeader } from "@/components/slides/SlideViewHeader";
import { FiltersRow } from "@/components/slides/FiltersRow";
import { ComparisonBanner } from "@/components/slides/ComparisonBanner";
import { OverviewTab } from "@/components/slides/OverviewTab";
import { ChannelTab } from "@/components/slides/ChannelTab";
import { BudgetTab } from "@/components/slides/BudgetTab";
import { BookingTab } from "@/components/slides/BookingTab";
import { PriceCheckTab } from "@/components/slides/PriceCheckTab";
import { RefreshDataModal } from "@/components/slides/RefreshDataModal";
import { AISummaryButton } from "@/components/slides/AISummaryButton";
import { SlideViewAISummaryModal } from "@/components/slides/SlideViewAISummaryModal";
import { useSlideReportSummaries, useGetSummaryForTab } from "@/hooks/useSlideReportSummaries";
import { useSlideReportChannelData } from "@/hooks/useSlideReportChannelData";
import { extractMinimalAIData } from "@/lib/extractMinimalAIData";
import { isWithinInterval } from "date-fns";
import { aggregateMetrics } from "@/components/AISummaryPivotTable";
import { BASE_METRICS, CHANNEL_REPORT_IDS, MONTH_NAMES } from "@/constants/slideViewConstants";
import { getAccountReportIds, type AccountReportIds } from "@/lib/accountReportIds";
import {
  calculateDerivedMetrics,
  hasActiveFilters,
  hasActiveFiltersForChannel,
  filterRawDataRows,
  aggregateMetricsFromRows,
  calculatePercentChange,
  formatNumber,
  buildMetricNameToIdsMap,
  getMetricKeys,
  ensureMinimumChartData,
} from "@/lib/slideViewHelpers";
import {
  prepareMonthlyRecords,
  insertMonthlyRecordsBatched,
  extractFilterDimensionValues,
  calculateConfigCounts,
  normalizeErrorMessage,
} from "@/lib/slideRefreshHelpers";
import type { RawDataRow, MetricData } from "@/types/slideView";

// Unified breakdown table component with Group by / Breakdown by dropdowns
// Uses data from pivot_data.channels[channel].monthlyBreakdowns for month-specific data
const UnifiedBreakdownTable = ({ 
  groupBy,
  breakdownBy,
  expandedRow,
  onRowClick,
  onGroupByChange,
  onBreakdownByChange,
  availableDimensions,
  pivotData,
  selectedChannel,
  selectedYear,
  selectedMonth,
  filterValues,
  filterDimensionValues,
  onTotalsChange,
  displayDataFromApi,
  apiBreakdowns,
}: {
  groupBy: string;
  breakdownBy: string;
  expandedRow: string | null;
  onRowClick: (rowValue: string | null) => void;
  onGroupByChange: (value: string) => void;
  onBreakdownByChange: (value: string) => void;
  availableDimensions: { id: string; name: string; type: string }[];
  pivotData?: any;
  selectedChannel?: 'metasearch' | 'sem' | 'social' | 'overview';
  selectedYear?: string;
  selectedMonth?: string;
  filterValues?: Record<string, Record<string, string[]>>;
  filterDimensionValues?: Record<string, Record<string, string[]>>;
  onTotalsChange?: (totals: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => void;
  /** When set, use pre-computed breakdowns from display-data API instead of computing from raw rows. */
  displayDataFromApi?: boolean;
  apiBreakdowns?: { groupBy: string; rows: Array<{ name: string; impressions: number; clicks: number; cost: number; revenue: number; bookings: number; cpc?: number; roas?: number; costOfSale?: number }>; expanded?: Record<string, Array<{ name: string; impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>> };
}) => {
  // Auto-select defaults when dimensions are available
  useEffect(() => {
    if (availableDimensions.length > 0) {
      // If current groupBy is not in available dimensions, select the first
      if (!availableDimensions.find(d => d.id === groupBy)) {
        onGroupByChange(availableDimensions[0].id);
      }
      // If current breakdownBy is not in available dimensions or same as groupBy, select a different one
      if (!availableDimensions.find(d => d.id === breakdownBy) || breakdownBy === groupBy) {
        const differentDim = availableDimensions.find(d => d.id !== groupBy);
        if (differentDim) {
          onBreakdownByChange(differentDim.id);
        }
      }
    }
  }, [availableDimensions, groupBy, breakdownBy, onGroupByChange, onBreakdownByChange]);

  // Build monthKey for filtering by selected year/month
  const monthKey = useMemo(() => {
    if (!selectedYear || selectedYear === 'all' || !selectedMonth || selectedMonth === 'all') {
      return null; // Use aggregated data
    }
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNum = monthNames.indexOf(selectedMonth) + 1;
    return `${selectedYear}-${monthNum.toString().padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  // Get breakdown data from pivotData based on selected dimension and month
  // Applies filterValues if they are set. When displayDataFromApi and apiBreakdowns are set, use API data (no heavy calc).
  const groupedData = useMemo(() => {
    if (displayDataFromApi && apiBreakdowns?.rows?.length) {
      const groupByDimId = availableDimensions.find(d => d.id === groupBy)?.id;
      const groupByHasFilter = groupByDimId && selectedChannel && selectedChannel !== 'overview'
        ? (filterValues?.[selectedChannel]?.[groupByDimId]?.length ?? 0) > 0
        : false;
      const rows = groupByHasFilter
        ? apiBreakdowns.rows.filter((row) => row.name != null && String(row.name).trim() !== '' && String(row.name).trim().toLowerCase() !== 'unknown')
        : apiBreakdowns.rows;
      return rows.map((row) => {
        const cleanData = {
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          cost: Number(row.cost) || 0,
          revenue: Number(row.revenue) || 0,
          bookings: Number(row.bookings) || 0,
        };
        const metrics = calculateDerivedMetrics(cleanData);
        return { groupValue: row.name, metrics, rawData: cleanData };
      });
    }
    if (!pivotData?.channels) return [];
    
    const groupByDim = availableDimensions.find(d => d.id === groupBy);
    const groupByName = groupByDim?.name || groupBy;
    const groupByDimId = groupByDim?.id || groupBy;
    
    // Check if filters are actually applied for the selected channel using centralized function
    const hasFilters = selectedChannel && selectedChannel !== 'overview' && filterValues?.[selectedChannel]
      ? hasActiveFiltersForChannel(
          filterValues[selectedChannel],
          filterDimensionValues?.[selectedChannel]
        )
      : false;
    
    // Collect breakdown data from all channels (or specific channel if selected)
    const allBreakdowns: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
    
    const channelsToCheck = selectedChannel && selectedChannel !== 'overview' 
      ? [selectedChannel] 
      : Object.keys(pivotData.channels);
    
    for (const channel of channelsToCheck) {
      const channelData = pivotData.channels[channel];
      if (!channelData) continue;
      
      const rawDataRows = (channelData as any).rawDataRows || [];
      
      // Always use rawDataRows when available for consistency and completeness
      // This ensures we use the dynamic dimension resolution and get all data
      if (rawDataRows.length > 0) {
        const channelFilterValues = hasFilters && channel === selectedChannel 
          ? (filterValues?.[channel] || {})
          : {};
        
        // Build date range if month/year is selected
        let dateRange: { start: Date; end: Date } | undefined;
        if (monthKey) {
          const [year, monthNum] = monthKey.split('-').map(Number);
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          dateRange = {
            start: new Date(year, monthNum - 1, 1),
            end: new Date(year, monthNum, 0, 23, 59, 59),
          };
        } else if (selectedYear && selectedYear !== 'all') {
          const yearNum = parseInt(selectedYear);
          dateRange = {
            start: new Date(yearNum, 0, 1),
            end: new Date(yearNum, 11, 31, 23, 59, 59),
          };
        }
        
        // Filter rows (applies date range and any filters)
        const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange);
        
        // Group by breakdown dimension and aggregate metrics
        const groupedRows: Record<string, any[]> = {};
        filteredRows.forEach((row) => {
          const rowData = row.dimension_values || row;
          const groupValue = rowData[groupByDimId] || rowData[groupByName] || 'Unknown';
          const normalizedGroupValue = String(groupValue).trim();
          
          if (normalizedGroupValue && normalizedGroupValue !== 'Unknown') {
            if (!groupedRows[normalizedGroupValue]) {
              groupedRows[normalizedGroupValue] = [];
            }
            groupedRows[normalizedGroupValue].push(row);
          }
        });
        
        // Build metricNameToIdMap from dimensionMap (reverse mapping: name -> id)
        // This matches the exact structure used in slideReportPivotComputation.ts
        const dimensionMap = (channelData as any).dimensionMap || {};
        const metricNameToIdMap: Record<string, string> = {};
        Object.entries(dimensionMap as Record<string, string>).forEach(([dimensionId, dimensionName]) => {
          if (dimensionName && typeof dimensionName === 'string') {
            metricNameToIdMap[dimensionName] = dimensionId;
          }
        });
        
        // Aggregate metrics for each group
        Object.entries(groupedRows).forEach(([groupValue, groupRows]) => {
          if (!allBreakdowns[groupValue]) {
            allBreakdowns[groupValue] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
          }
          
          groupRows.forEach((row) => {
            const rowData = row.dimension_values || row;
            
            // Use EXACT same extraction logic as computeBreakdownAllTime/computeBreakdownForMonth
            // This ensures we get the same values as the pre-computed breakdowns
            const impressionsValue = parseFloat(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0) || 0;
            const clicksValue = parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
            const costValue = parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
            const revenueValue = parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
            const bookingsValue = parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) || 0;
            
            allBreakdowns[groupValue].impressions += impressionsValue;
            allBreakdowns[groupValue].clicks += clicksValue;
            allBreakdowns[groupValue].cost += costValue;
            allBreakdowns[groupValue].revenue += revenueValue;
            allBreakdowns[groupValue].bookings += bookingsValue;
          });
        });
      } else {
        // Fallback: No rawDataRows available - use pre-computed breakdown data
        // Use monthlyBreakdowns if a specific month is selected, otherwise use aggregated breakdowns
        let breakdownData: any[] = [];
        
        if (monthKey && channelData.monthlyBreakdowns?.[monthKey]) {
          // Use month-specific breakdown data
          breakdownData = channelData.monthlyBreakdowns[monthKey][groupByName] || [];
        } else if (channelData.breakdowns) {
          // Fall back to aggregated breakdowns
          breakdownData = channelData.breakdowns[groupByName] || [];
        }
        
        // When filters are active, filter breakdown rows by groupBy dimension so view/dimension filter applies
        const groupByFilterValues = hasFilters && channel === selectedChannel && (filterValues?.[channel] || {})[groupByDimId];
        if (groupByFilterValues && Array.isArray(groupByFilterValues) && groupByFilterValues.length > 0) {
          const allowedSet = new Set(groupByFilterValues.map((v: string) => String(v).trim()));
          breakdownData = breakdownData.filter((row: any) => {
            const groupValue = row.name ?? row[groupByName] ?? row[groupByName.toLowerCase().replace(/\s+/g, '_')];
            return groupValue != null && allowedSet.has(String(groupValue).trim());
          });
        }
        
        breakdownData.forEach((row: any) => {
          const groupValue = row.name || row[groupByName.toLowerCase().replace(/\s+/g, '_')] || 'Unknown';
          if (!allBreakdowns[groupValue]) {
            allBreakdowns[groupValue] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
          }
          allBreakdowns[groupValue].impressions += row.impressions || 0;
          allBreakdowns[groupValue].clicks += row.clicks || 0;
          allBreakdowns[groupValue].cost += row.cost || 0;
          allBreakdowns[groupValue].revenue += row.revenue || 0;
          allBreakdowns[groupValue].bookings += row.bookings || 0;
        });
      }
    }

    // Convert to array and calculate derived metrics
    const result = Object.entries(allBreakdowns)
      .filter(([groupValue]) => groupValue && groupValue !== 'Unknown')
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([groupValue, data]) => {
        // Ensure data has all required fields with proper types
        const cleanData = {
          impressions: Number(data.impressions) || 0,
          clicks: Number(data.clicks) || 0,
          cost: Number(data.cost) || 0,
          revenue: Number(data.revenue) || 0,
          bookings: Number(data.bookings) || 0,
        };
        
        const metrics = calculateDerivedMetrics(cleanData);
        
        return {
          groupValue,
          metrics,
          rawData: cleanData,
        };
      });
    
    return result;
  }, [displayDataFromApi, apiBreakdowns, pivotData, groupBy, availableDimensions, selectedChannel, monthKey, filterValues, filterDimensionValues, selectedYear]);

  // Get breakdown data for expanded row (also uses month-specific data)
  // This should show breakdown data ONLY for the expanded parent row value
  const getExpandedBreakdownData = useMemo(() => {
    if (!expandedRow || !breakdownBy) return [];

    if (displayDataFromApi && apiBreakdowns?.expanded) {
      const expandedRows = apiBreakdowns.expanded[expandedRow];
      if (expandedRows?.length) {
        return expandedRows.map((row) => {
          const cleanData = {
            impressions: Number(row.impressions) || 0,
            clicks: Number(row.clicks) || 0,
            cost: Number(row.cost) || 0,
            revenue: Number(row.revenue) || 0,
            bookings: Number(row.bookings) || 0,
          };
          return { value: row.name, metrics: calculateDerivedMetrics(cleanData) };
        });
      }
      return [];
    }

    if (!pivotData?.channels) return [];
    const groupByDim = availableDimensions.find(d => d.id === groupBy);
    const groupByDimId = groupByDim?.id || groupBy;
    const groupByName = groupByDim?.name || groupBy;
    
    const breakdownByDim = availableDimensions.find(d => d.id === breakdownBy);
    const breakdownByName = breakdownByDim?.name || breakdownBy;
    const breakdownByDimId = breakdownByDim?.id || breakdownBy;
    
    const channelsToCheck = selectedChannel && selectedChannel !== 'overview' 
      ? [selectedChannel] 
      : Object.keys(pivotData.channels);
    
    // Check if filters are actually applied using centralized function
    const hasFilters = selectedChannel && selectedChannel !== 'overview' && filterValues?.[selectedChannel]
      ? hasActiveFiltersForChannel(
          filterValues[selectedChannel],
          filterDimensionValues?.[selectedChannel]
        )
      : false;
    
    const allBreakdowns: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
    
    for (const channel of channelsToCheck) {
      const channelData = pivotData.channels[channel];
      if (!channelData) continue;
      
      // Build date range if month is selected
      let dateRange: { start: Date; end: Date } | undefined;
      if (monthKey) {
        const [year, monthNum] = monthKey.split('-').map(Number);
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        dateRange = {
          start: new Date(year, monthNum - 1, 1),
          end: new Date(year, monthNum, 0, 23, 59, 59),
        };
      } else if (selectedYear && selectedYear !== 'all') {
        const yearNum = parseInt(selectedYear);
        dateRange = {
          start: new Date(yearNum, 0, 1),
          end: new Date(yearNum, 11, 31, 23, 59, 59),
        };
      }
      
      // Get raw data rows
      const rawDataRows = (channelData as any).rawDataRows || [];
      const expandedDimensionMap = (channelData as any).dimensionMap || {};
      
      // Apply filters if they exist (pass dimensionMap so name-keyed data e.g. "Link Type" is matched)
      let filteredRows = rawDataRows;
      if (hasFilters && channel === selectedChannel) {
        const channelFilterValues = filterValues?.[channel] || {};
        filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange, expandedDimensionMap);
      } else if (dateRange) {
        filteredRows = filterRawDataRows(rawDataRows, {}, dateRange, expandedDimensionMap);
      }
      
      // Filter to only rows where groupBy dimension matches expandedRow
      const rowsForExpandedRow = filteredRows.filter((row) => {
        const rowData = row.dimension_values || row;
        const rowGroupValue = rowData[groupByDimId] || rowData[groupByName];
        const normalizedRowGroupValue = String(rowGroupValue || '').trim();
        const normalizedExpandedRow = String(expandedRow).trim();
        return normalizedRowGroupValue === normalizedExpandedRow;
      });
      
      // Group by breakdownBy dimension
      const groupedRows: Record<string, any[]> = {};
      rowsForExpandedRow.forEach((row) => {
        const rowData = row.dimension_values || row;
        const breakdownValue = rowData[breakdownByDimId] || rowData[breakdownByName] || 'Unknown';
        const normalizedBreakdownValue = String(breakdownValue).trim();
        
        if (normalizedBreakdownValue && normalizedBreakdownValue !== 'Unknown') {
          if (!groupedRows[normalizedBreakdownValue]) {
            groupedRows[normalizedBreakdownValue] = [];
          }
          groupedRows[normalizedBreakdownValue].push(row);
        }
      });
      
      // Aggregate metrics for each breakdown value
      Object.entries(groupedRows).forEach(([breakdownValue, groupRows]) => {
        if (!allBreakdowns[breakdownValue]) {
          allBreakdowns[breakdownValue] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
        }
        
        // Build metricNameToIdMap from dimensionMap (reverse mapping: name -> id)
        // This matches the exact structure used in slideReportPivotComputation.ts
        const dimensionMap = (channelData as any).dimensionMap || {};
        const metricNameToIdMap: Record<string, string> = {};
        Object.entries(dimensionMap as Record<string, string>).forEach(([dimensionId, dimensionName]) => {
          if (dimensionName && typeof dimensionName === 'string') {
            metricNameToIdMap[dimensionName] = dimensionId;
          }
        });
        
        groupRows.forEach((row) => {
          const rowData = row.dimension_values || row;
          
          // Use EXACT same extraction logic as computeBreakdownAllTime/computeBreakdownForMonth
          // This ensures we get the same values as the pre-computed breakdowns
          allBreakdowns[breakdownValue].impressions += parseFloat(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0) || 0;
          allBreakdowns[breakdownValue].clicks += parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
          allBreakdowns[breakdownValue].cost += parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
          allBreakdowns[breakdownValue].revenue += parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
          allBreakdowns[breakdownValue].bookings += parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) || 0;
        });
      });
    }

    // When no raw data (e.g. data from channel tables), use pre-computed breakdown for breakdownBy dimension so expanded rows show "Breakdown by" rows
    if (Object.keys(allBreakdowns).length === 0 && pivotData?.channels) {
      for (const channel of channelsToCheck) {
        const channelData = pivotData.channels[channel];
        if (!channelData) continue;
        let breakdownData: any[] = [];
        if (monthKey && (channelData as any).monthlyBreakdowns?.[monthKey]) {
          breakdownData = (channelData as any).monthlyBreakdowns[monthKey][breakdownByName] || [];
        } else if ((channelData as any).breakdowns) {
          breakdownData = (channelData as any).breakdowns[breakdownByName] || [];
        }
        // Apply filter when the breakdownBy dimension has selected values (so expanded list respects view/dimension filter)
        const breakdownFilterValues = selectedChannel && channel === selectedChannel ? (filterValues?.[channel]?.[breakdownByDimId] || null) : null;
        if (breakdownFilterValues && Array.isArray(breakdownFilterValues) && breakdownFilterValues.length > 0) {
          const allowedSet = new Set(breakdownFilterValues.map((v: string) => String(v).trim()));
          breakdownData = breakdownData.filter((row: any) => {
            const name = row.name ?? row[breakdownByName] ?? row[breakdownByName.toLowerCase().replace(/\s+/g, '_')];
            return name != null && allowedSet.has(String(name).trim());
          });
        }
        breakdownData.forEach((row: any) => {
          const name = row.name ?? row[breakdownByName] ?? row[breakdownByName.toLowerCase().replace(/\s+/g, '_')] ?? 'Unknown';
          if (!name || name === 'Unknown') return;
          if (!allBreakdowns[name]) allBreakdowns[name] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
          allBreakdowns[name].impressions += row.impressions ?? 0;
          allBreakdowns[name].clicks += row.clicks ?? 0;
          allBreakdowns[name].cost += row.cost ?? 0;
          allBreakdowns[name].revenue += row.revenue ?? 0;
          allBreakdowns[name].bookings += row.bookings ?? 0;
        });
      }
    }
    
    return Object.entries(allBreakdowns)
      .filter(([value]) => value && value !== 'Unknown')
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([value, data]) => ({
        value,
        metrics: calculateDerivedMetrics(data),
      }));
  }, [expandedRow, breakdownBy, displayDataFromApi, apiBreakdowns, pivotData, availableDimensions, selectedChannel, monthKey, filterValues, filterDimensionValues, selectedYear, groupBy]);

  // Calculate totals - use rawData to ensure we're summing base metrics only
  // Then recalculate derived metrics (CPC, ROAS, Cost of Sale) from the aggregated totals
  const totals = groupedData.reduce((acc, group) => ({
    impressions: acc.impressions + (group.rawData?.impressions || group.metrics.impressions || 0),
    clicks: acc.clicks + (group.rawData?.clicks || group.metrics.clicks || 0),
    cost: acc.cost + (group.rawData?.cost || group.metrics.cost || 0),
    revenue: acc.revenue + (group.rawData?.revenue || group.metrics.revenue || 0),
    bookings: acc.bookings + (group.rawData?.bookings || group.metrics.bookings || 0),
  }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });
  const totalMetrics = calculateDerivedMetrics(totals);
  
  // Expose totals to parent component for KPI cards synchronization
  useEffect(() => {
    if (onTotalsChange && selectedChannel) {
      onTotalsChange(totals);
    }
  }, [totals, onTotalsChange, selectedChannel]);
  
  const groupByDim = availableDimensions.find(d => d.id === groupBy);
  const breakdownByDim = availableDimensions.find(d => d.id === breakdownBy);

  // Filter available dimensions to exclude currently selected for each dropdown
  const groupByOptions = availableDimensions;
  const breakdownByOptions = availableDimensions.filter(d => d.id !== groupBy);

  // Show message if no data
  if (groupedData.length === 0) {
    return (
      <div className="space-y-4">
        {/* Dropdowns */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Group by:</Label>
            <Select value={groupBy} onValueChange={(value) => { onGroupByChange(value); onRowClick(null); }}>
              <SelectTrigger className="w-40 bg-background border border-input">
                <SelectValue placeholder="Select dimension" />
              </SelectTrigger>
              <SelectContent>
                {groupByOptions.map(dim => (
                  <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Breakdown by:</Label>
            <Select value={breakdownBy} onValueChange={onBreakdownByChange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select dimension" />
              </SelectTrigger>
              <SelectContent>
                {breakdownByOptions.map(dim => (
                  <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p>No breakdown data available.</p>
          <p className="text-sm mt-2">Configure breakdown dimensions in the Data Source modal and click "Refresh Data" to compute breakdown tables.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Dropdowns */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Group by:</Label>
          <Select value={groupBy} onValueChange={(value) => { onGroupByChange(value); onRowClick(null); }}>
            <SelectTrigger className="w-40 bg-background border border-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupByOptions.map(dim => (
                <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Breakdown by:</Label>
          <Select value={breakdownBy} onValueChange={onBreakdownByChange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {breakdownByOptions.map(dim => (
                <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>{groupByDim?.name || 'Group'}</TableHead>
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
          {groupedData.map((group) => (
            <React.Fragment key={group.groupValue}>
              <TableRow 
                className="hover:bg-muted/50 cursor-pointer"
                onClick={() => onRowClick(expandedRow === group.groupValue ? null : group.groupValue)}
              >
                <TableCell className="w-8">
                  <ChevronRight className={cn(
                    "h-4 w-4 transition-transform",
                    expandedRow === group.groupValue && "rotate-90"
                  )} />
                </TableCell>
                <TableCell className="font-medium">{group.groupValue}</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.impressions)}</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.clicks)}</TableCell>
                <TableCell className="text-right">{group.metrics.ctr.toFixed(2)}%</TableCell>
                <TableCell className="text-right">{group.metrics.bookings.toFixed(2)}</TableCell>
                <TableCell className="text-right">{group.metrics.conversionRate.toFixed(2)}%</TableCell>
                <TableCell className="text-right">${group.metrics.cpc < 0.01 ? group.metrics.cpc.toFixed(4) : group.metrics.cpc.toFixed(2)}</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.cost, 'currency')}</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.revenue, 'currency')}</TableCell>
                <TableCell className="text-right">{group.metrics.roas.toFixed(1)}x</TableCell>
                <TableCell className="text-right">{group.metrics.costOfSale < 0.01 ? group.metrics.costOfSale.toFixed(4) : group.metrics.costOfSale.toFixed(2)}%</TableCell>
              </TableRow>
              {/* Expanded breakdown rows */}
              {expandedRow === group.groupValue && getExpandedBreakdownData.length > 0 && (
                <>
                  {getExpandedBreakdownData.map((item) => (
                    <TableRow key={`${group.groupValue}-${item.value}`} className="bg-muted/30">
                      <TableCell></TableCell>
                      <TableCell className="pl-8 text-muted-foreground">
                        <span className="text-xs uppercase mr-2">{breakdownByDim?.name}:</span>
                        {item.value}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.metrics.impressions < group.metrics.impressions || item.metrics.impressions === 0 ?
                          formatNumber(item.metrics.impressions) :
                          formatNumber(group.metrics.impressions)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.clicks)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.ctr.toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.bookings.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.conversionRate.toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">${item.metrics.cpc < 0.01 ? item.metrics.cpc.toFixed(4) : item.metrics.cpc.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.cost, 'currency')}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.revenue, 'currency')}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.roas.toFixed(1)}x</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.costOfSale < 0.01 ? item.metrics.costOfSale.toFixed(4) : item.metrics.costOfSale.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </React.Fragment>
          ))}
          {/* Totals Row */}
          <TableRow className="bg-muted/50 font-semibold border-t-2">
            <TableCell></TableCell>
            <TableCell className="font-bold">Total</TableCell>
            <TableCell className="text-right">{formatNumber(totalMetrics.impressions)}</TableCell>
            <TableCell className="text-right">{formatNumber(totalMetrics.clicks)}</TableCell>
            <TableCell className="text-right">{totalMetrics.ctr.toFixed(2)}%</TableCell>
            <TableCell className="text-right">{totalMetrics.bookings.toFixed(2)}</TableCell>
            <TableCell className="text-right">{totalMetrics.conversionRate.toFixed(2)}%</TableCell>
            <TableCell className="text-right">${totalMetrics.cpc < 0.01 ? totalMetrics.cpc.toFixed(4) : totalMetrics.cpc.toFixed(2)}</TableCell>
            <TableCell className="text-right">{formatNumber(totalMetrics.cost, 'currency')}</TableCell>
            <TableCell className="text-right">{formatNumber(totalMetrics.revenue, 'currency')}</TableCell>
            <TableCell className="text-right">{totalMetrics.roas.toFixed(1)}x</TableCell>
            <TableCell className="text-right">{totalMetrics.costOfSale < 0.01 ? totalMetrics.costOfSale.toFixed(4) : totalMetrics.costOfSale.toFixed(2)}%</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

export default function SlideViewPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { data: userData } = useUser();
  const user = userData?.user || null;
  // Get current month name for default
  const currentDate = new Date();
  const currentMonthName = MONTH_NAMES[currentDate.getMonth()];
  const currentYearStr = currentDate.getFullYear().toString();
  
  const [selectedYear, setSelectedYear] = useState(currentYearStr); // Default to current year
  const [selectedMonth, setSelectedMonth] = useState(currentMonthName); // Default to current month
  const [selectedTab, setSelectedTab] = useState("overview");
  const [comparisonType, setComparisonType] = useState("none");
  const [chartTimeRange, setChartTimeRange] = useState<'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months'>('last_6_months');
  const [priceCheckChartTimeRange, setPriceCheckChartTimeRange] = useState<'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months'>('last_6_months');
  // Breakdown table dimensions (declared early so useFilteredSlideData can prefer groupBy for KPI = table total)
  const [groupByDimension, setGroupByDimension] = useState<string>('hotel');
  const [breakdownByDimension, setBreakdownByDimension] = useState<string>('link_type');
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null); // Selected view ID (null = Master, 'unsaved' = Unsaved)
  const [isSaveViewDialogOpen, setIsSaveViewDialogOpen] = useState(false);
  const [isSaveOrUpdateViewDialogOpen, setIsSaveOrUpdateViewDialogOpen] = useState(false);
  const isApplyingViewRef = useRef(false); // Track when we're applying a view to avoid triggering "Unsaved"
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(false); // Read-only mode when viewing shared view
  const [isEditSourceOpen, setIsEditSourceOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isAISummaryModalOpen, setIsAISummaryModalOpen] = useState(false);
  const [forecastEnabled, setForecastEnabled] = useState(false); // Forecast mode for budget table
  const [pnlModeEnabled, setPnlModeEnabled] = useState(false); // PnL mode for budget table
  const [editingBudget, setEditingBudget] = useState<{ month: string; channel: string | null } | null>(null); // { month: "November 2025", channel: "metasearch" | "sem" | "social" | null for overview }
  const [editBudgetValue, setEditBudgetValue] = useState("");
  
  // PnL configuration state - editable per channel
  const [pnlConfig, setPnlConfig] = useState<Record<string, { 
    recurrentFee: number; 
    percentCost: number; 
    percentRevenue: number; 
    spender: 'client' | 'agency' 
  }>>({
    metasearch: { recurrentFee: 1600, percentCost: 0, percentRevenue: 0, spender: 'client' },
    sem: { recurrentFee: 2000, percentCost: 0, percentRevenue: 5, spender: 'client' },
    social: { recurrentFee: 1800, percentCost: 0, percentRevenue: 0, spender: 'client' },
  });
  
  // Editing state for PnL fields
  const [editingPnl, setEditingPnl] = useState<{ 
    month: string; 
    channel: string | null; 
    field: 'spender' | 'recurrentFee' | 'percentCost' | 'percentRevenue' 
  } | null>(null);
  const [editPnlValue, setEditPnlValue] = useState("");
  // Initialize selectedDimensions based on available channels
  // This will be updated when accountReportIds loads
  const [selectedDimensions, setSelectedDimensions] = useState({
    metasearch: false,
    sem: false,
    social: false,
  });

  // Determine slide type from URL
  const slideType = location.pathname.includes('/master-report') ? 'master-report' : 
                    location.pathname.includes('/brady') ? 'brady' : 'default';

  // Dynamic data state (fetched from database)
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dynamicMonthlyData, setDynamicMonthlyData] = useState<any[]>([]);
  const [dynamicChannelTotals, setDynamicChannelTotals] = useState<Record<string, any>>({});
  const [dynamicYearlyTotals, setDynamicYearlyTotals] = useState<Record<number, Record<string, any>>>({});

  // Fetch real data from edge function for master-report - memoized with useCallback
  const fetchSlideReportData = useCallback(async () => {
    // TODO: Uncomment this when we have the edge function working
    // if (slideType !== 'master-report') return;
    
    // setIsLoadingData(true);
    // try {
    //   const { data, error } = await supabase.functions.invoke('get-slide-report-data', {
    //     body: {
    //       accountId,
    //       years: [2024, 2025, 2026],
    //       hotelFilter: true, // Only Brady hotels for metasearch
    //     },
    //   });

    //   if (error) {
    //     console.error('Error fetching slide report data:', error);
    //     return;
    //   }

    //   setDynamicMonthlyData(data.monthlyRevenue || []);
    //   setDynamicChannelTotals(data.channelTotals || {});
    //   setDynamicYearlyTotals(data.yearlyTotals || {});
    // } catch (err) {
    //   console.error('Error calling edge function:', err);
    // } finally {
    //   setIsLoadingData(false);
    // }
  }, [accountId, slideType]);

  // Fetch data on mount for master-report
  useEffect(() => {
    if (slideType === 'master-report' && accountId) {
      fetchSlideReportData();
    }
  }, [slideType, accountId, fetchSlideReportData]);

  // Check for share authentication when user is not authenticated
  const [isSharedAccess, setIsSharedAccess] = useState(false);

  // Slide report state - moved before filteredMonthlyData so it's available
  const [slideReportId, setSlideReportId] = useState<string | null>(null);
  const { data: slideReport } = useSlideReport(slideReportId);
  const { data: channelDataFromTables } = useSlideReportChannelData(
    slideReportId,
    slideReport?.date_range ?? null
  );
  const { data: slideReports, isLoading: isSlideReportsLoading } = useSlideReports(accountId || null);
  const queryClient = useQueryClient();

  // Prefer channel data from slide_report_channel_month_data / year_data when available (e.g. after incremental refresh).
  // Preserve rawDataRows (and dimensionMap/filterUniqueValues) from base so View/dimension filters still work.
  const effectivePivotData = useMemo((): SlideReportPivotData | null => {
    const base = slideReport?.pivot_data as SlideReportPivotData | null;
    if (!base) return null;
    const fromTables = channelDataFromTables ?? null;
    if (!fromTables || Object.keys(fromTables).length === 0) return base;
    const channels: SlideReportPivotData['channels'] = { ...base.channels };
    for (const [ch, tableChannel] of Object.entries(fromTables)) {
      const baseChannel = base.channels?.[ch];
      channels[ch] = {
        ...tableChannel,
        rawDataRows: baseChannel?.rawDataRows ?? tableChannel.rawDataRows ?? [],
        dimensionMap: (baseChannel?.dimensionMap && Object.keys(baseChannel.dimensionMap).length > 0)
          ? baseChannel.dimensionMap
          : (tableChannel.dimensionMap || {}),
        filterUniqueValues: (baseChannel?.filterUniqueValues && Object.keys(baseChannel.filterUniqueValues).length > 0)
          ? baseChannel.filterUniqueValues
          : (tableChannel.filterUniqueValues || {}),
      };
    }
    return { ...base, channels };
  }, [slideReport?.pivot_data, channelDataFromTables]);
  const createSlideReport = useCreateSlideReport();
  const updateSlideReport = useUpdateSlideReport();
  const refreshSlideReportData = useRefreshSlideReportData();
  
  // Views management
  const { data: views = [], isLoading: isLoadingViews } = useSlideReportViews(slideReportId);
  const createView = useCreateSlideReportView();
  const updateView = useUpdateSlideReportView();
  const deleteView = useDeleteSlideReportView();
  
  // Load summaries
  const { data: summaries = [] } = useSlideReportSummaries(slideReportId);

  // Account-specific report IDs state
  const [accountReportIds, setAccountReportIds] = useState<AccountReportIds>({
    metasearch: null,
    sem: null,
    social: null,
  });

  // Load account-specific report IDs when accountId changes
  useEffect(() => {
    const loadAccountReportIds = async () => {
      if (!accountId) {
        setAccountReportIds({ metasearch: null, sem: null, social: null });
        // Reset selected dimensions when account changes
        setSelectedDimensions({ metasearch: false, sem: false, social: false });
        return;
      }

      try {
        // Clear cache to ensure fresh lookup
        const { clearAccountReportIdsCache } = await import("@/lib/accountReportIds");
        clearAccountReportIdsCache(accountId);
        
        const reportIds = await getAccountReportIds(accountId, false); // Don't use cache for fresh lookup
        setAccountReportIds(reportIds);
        console.log('[SlideViewPage] Loaded account-specific report IDs for account:', accountId, reportIds);
        
        // Log warning if any channel is missing
        const missingChannels = Object.entries(reportIds)
          .filter(([_, id]) => !id)
          .map(([channel]) => channel);
        if (missingChannels.length > 0) {
          console.warn(`[SlideViewPage] Missing report IDs for channels: ${missingChannels.join(', ')}. Please ensure reports are created for these channels.`);
        }
        
        // Initialize selectedDimensions based on available channels
        // Only select channels that have report IDs
        setSelectedDimensions(prev => {
          // Only update if we haven't loaded from saved configuration yet
          // This prevents overwriting saved selections
          const hasSavedConfig = slideReport?.configuration?.selectedChannels;
          if (hasSavedConfig) {
            return prev; // Keep existing selection (will be filtered in loadOrCreateSlideReport)
          }
          
          return {
            metasearch: !!reportIds.metasearch,
            sem: !!reportIds.sem,
            social: !!reportIds.social,
          };
        });
      } catch (error) {
        console.error('[SlideViewPage] Error loading account report IDs:', error);
        // Fallback to null if lookup fails
        setAccountReportIds({ metasearch: null, sem: null, social: null });
        setSelectedDimensions({ metasearch: false, sem: false, social: false });
      }
    };

    loadAccountReportIds();
  }, [accountId, slideReport?.configuration?.selectedChannels]);

  // Helper function to get report ID for a channel (with fallback to stored report_ids)
  const getReportIdForChannel = useCallback((channel: 'metasearch' | 'sem' | 'social'): string | null => {
    // First, try to use stored report_ids from slideReport (if available)
    // But validate that the stored ID actually belongs to this account
    if (slideReport?.report_ids) {
      const storedReportIds = slideReport.report_ids as Record<string, string>;
      const storedId = storedReportIds[channel];
      if (storedId) {
        // Validate that this report ID belongs to the current account
        // If accountReportIds has a value and it doesn't match, use the account-specific one
        const accountSpecificId = accountReportIds[channel];
        if (accountSpecificId && storedId !== accountSpecificId) {
          console.warn(`[getReportIdForChannel] Stored report ID for ${channel} (${storedId}) doesn't match account-specific ID (${accountSpecificId}). Using account-specific ID.`);
          return accountSpecificId;
        }
        return storedId;
      }
    }
    
    // Fallback to account-specific report IDs
    const accountId = accountReportIds[channel];
    if (!accountId) {
      console.warn(`[getReportIdForChannel] No report ID found for channel ${channel} in account ${accountId}. Available account report IDs:`, accountReportIds);
    }
    return accountId;
  }, [slideReport?.report_ids, accountReportIds]);

  // Compute available channels based on account-specific report IDs
  const availableChannels = useMemo(() => {
    const channels: ('metasearch' | 'sem' | 'social')[] = [];
    if (accountReportIds.metasearch) channels.push('metasearch');
    if (accountReportIds.sem) channels.push('sem');
    if (accountReportIds.social) channels.push('social');
    return channels;
  }, [accountReportIds]);

  // Check for share authentication when user is not authenticated (moved after slideReportId declaration)
  useEffect(() => {
    if (!user) {
      // Check if we're accessing via a share link
      const isShared = searchParams.get('shared') === 'true';
      const slug = searchParams.get('slug');
      
      if (isShared && slug) {
        // Check if share authentication exists in sessionStorage
        const authKey = `share_auth_${slug}`;
        const shareAuth = sessionStorage.getItem(authKey);
        
        if (shareAuth === "true") {
          setIsSharedAccess(true);
          
          // Load filters from share link if available
          const filtersKey = `share_filters_${slug}`;
          const storedFilters = sessionStorage.getItem(filtersKey);
          if (storedFilters) {
            try {
              const channelFilters = JSON.parse(storedFilters);
              // Apply filters immediately
              setFilterValues(channelFilters);
              console.log('[testing] Applied filters from share link:', channelFilters);
            } catch (error) {
              console.error('[testing] Error parsing share link filters:', error);
            }
          }
          
          // Load slide_report_id and account_id from share link if available
          const storedSlideReportId = sessionStorage.getItem(`share_slide_report_id_${slug}`);
          const storedAccountId = sessionStorage.getItem(`share_account_id_${slug}`);
          
          if (storedSlideReportId && storedAccountId) {
            // Set slide report ID if not already set
            if (!slideReportId) {
              setSlideReportId(storedSlideReportId);
            }
            // Verify accountId matches
            if (accountId !== storedAccountId) {
              console.warn('[testing] Account ID mismatch:', { accountId, storedAccountId });
            }
          }
        } else {
          // No share auth found, redirect back to share link
          navigate(`/${slug}`);
        }
      }
    } else {
      setIsSharedAccess(false);
    }
  }, [user, searchParams, navigate, slideReportId, accountId]);

  // Check for viewId in URL params or share link on mount and when views load
  // Also check if we're accessing via a share link (shared=true)
  useEffect(() => {
    const isShared = searchParams.get('shared') === 'true';
    const slug = searchParams.get('slug');
    
    // If accessing via share link, enable read-only mode
    if (isShared && slug) {
      setIsReadOnlyMode(true);
      
      // Load filters from share link if not already loaded
      const filtersKey = `share_filters_${slug}`;
      const storedFilters = sessionStorage.getItem(filtersKey);
      if (storedFilters) {
        try {
          const channelFilters = JSON.parse(storedFilters);
          setFilterValues(channelFilters);
        } catch (error) {
          console.error('[testing] Error parsing share link filters:', error);
        }
      }
      
      // Legacy: Check for view_id from share link (backward compatibility)
      const shareViewId = sessionStorage.getItem(`share_view_id_${slideReportId}`);
      if (shareViewId && views.length > 0) {
        const view = views.find(v => v.id === shareViewId);
        if (view) {
          setSelectedViewId(shareViewId);
          handleApplyView(shareViewId);
          // Clear the session storage after using it
          sessionStorage.removeItem(`share_view_id_${slideReportId}`);
        }
      }
      return;
    }
    
    // Regular view handling (not from share link)
    const urlViewId = searchParams.get('viewId');
    const shareViewId = sessionStorage.getItem(`share_view_id_${slideReportId}`);
    const viewIdToUse = urlViewId || shareViewId;
    
    if (viewIdToUse && views.length > 0 && !isReadOnlyMode) {
      // Check if viewId exists in views
      const view = views.find(v => v.id === viewIdToUse);
      if (view) {
        // Enable read-only mode and apply the view
        setIsReadOnlyMode(true);
        setSelectedViewId(viewIdToUse);
        handleApplyView(viewIdToUse);
        
        // Clear the session storage after using it
        if (shareViewId) {
          sessionStorage.removeItem(`share_view_id_${slideReportId}`);
        }
      } else {
        // View not found, remove from URL and session storage
        if (urlViewId) {
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('viewId');
          setSearchParams(newParams, { replace: true });
        }
        if (shareViewId) {
          sessionStorage.removeItem(`share_view_id_${slideReportId}`);
        }
      }
    } else if (!viewIdToUse && isReadOnlyMode && !isShared) {
      // If viewId is removed from URL and not from share link, disable read-only mode
      setIsReadOnlyMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, views.length, isReadOnlyMode, slideReportId]);

  // Monthly data from database (same source as SlideDataBrowser)
  const [monthlyDataRecords, setMonthlyDataRecords] = useState<Array<{
    id: string;
    slide_report_id: string;
    year: number;
    month: number;
    channel: string;
    metrics: ChannelMetrics;
    breakdowns: Record<string, BreakdownRow[]>;
    row_count: number;
    computed_at: string;
  }>>([]);
  const [isLoadingMonthlyData, setIsLoadingMonthlyData] = useState(false);

  // Fetch monthly data from database (same as SlideDataBrowser)
  useEffect(() => {
    if (!slideReportId) return;

    let cancelled = false;
    const fetchMonthlyData = async () => {
      setIsLoadingMonthlyData(true);
      try {
        const { data, error } = await supabase
          .from('slide_report_monthly_data')
          .select('*')
          .eq('slide_report_id', slideReportId)
          .order('year', { ascending: false })
          .order('month', { ascending: true });

        if (cancelled) return;

        if (error) {
          console.error('Error fetching monthly data:', error);
        } else {
          setMonthlyDataRecords((data as any[]) || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error:', err);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMonthlyData(false);
        }
      }
    };

    fetchMonthlyData();

    return () => {
      cancelled = true;
    };
  }, [slideReportId]);

  // Filter values state for slides page (channel -> dimensionId -> selected value)
  // Moved here so it's available for useMemo hooks
  const [filterValues, setFilterValues] = useState<Record<string, Record<string, string[]>>>({
    metasearch: {},
    sem: {},
    social: {},
    'price-check': {},
    'booking': {},
  });

  // Filter dimension values state (for dropdowns) - channel -> dimensionId -> values[]
  // Moved here so it's available for useMemo hooks
  const [filterDimensionValues, setFilterDimensionValues] = useState<Record<string, Record<string, string[]>>>({
    metasearch: {},
    sem: {},
    social: {},
  });
  
  // Track loading state for filter values per dimension
  const [filterValuesLoading, setFilterValuesLoading] = useState<Record<string, Record<string, boolean>>>({
    metasearch: {},
    sem: {},
    social: {},
  });

  // Single source of truth for all filtered data. Uses display-data API for master-report when available.
  const filteredData = useSlideReportDisplayData({
    pivotData: effectivePivotData,
    filterValues,
    filterDimensionValues,
    selectedYear,
    selectedMonth,
    selectedTab,
    slideType,
    dynamicChannelTotals,
    groupByDimensionId: groupByDimension,
    breakdownByDimensionId: breakdownByDimension,
    slideReportId,
    comparisonType,
    chartTimeRange,
  });

  // Combined loading: show skeleton when slide data is loading OR display-data API is in flight (avoids glitch when data arrives late)
  const isLoadingSlideContent = isLoadingData || (filteredData.isLoadingDisplayData ?? false);

  // Extract minimal data for AI summary (only for report tabs)
  const minimalAIData = useMemo(() => {
    if (!effectivePivotData || selectedYear === 'all' || selectedMonth === 'all') {
      return null;
    }
    if (selectedTab !== 'overview' && selectedTab !== 'metasearch' && selectedTab !== 'sem' && selectedTab !== 'social') {
      return null;
    }
    return extractMinimalAIData(
      effectivePivotData,
      selectedTab as 'overview' | 'metasearch' | 'sem' | 'social',
      selectedYear,
      selectedMonth
    );
  }, [effectivePivotData, selectedTab, selectedYear, selectedMonth]);

  // Filter monthly data - now uses unified filteredData hook
  // Fallback to dynamicMonthlyData for master-report if no pivot data
  const filteredMonthlyData = useMemo(() => {
    // Use filtered data from hook (single source of truth)
    if (filteredData.monthlyData.length > 0) {
      return filteredData.monthlyData;
    }
    
    // Fallback to dynamicMonthlyData for master-report
    const sourceData = slideType === 'master-report' && dynamicMonthlyData.length > 0 
      ? dynamicMonthlyData 
      : [];
    
    if (selectedYear === 'all') {
      return sourceData;
    }
    return sourceData.filter(m => m.year === parseInt(selectedYear));
  }, [filteredData.monthlyData, slideType, dynamicMonthlyData, selectedYear]);

  // Helper function to generate all months in a time range
  const generateMonthsInTimeRange = useCallback((
    timeRange: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months'
  ): { year: number; month: string }[] => {
    const now = new Date();
    const months: { year: number; month: string }[] = [];
    
    let startDate: Date;
    let endDate = new Date(now.getFullYear(), now.getMonth(), 1);
    
    if (timeRange === 'this_year') {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else if (timeRange === 'last_12_months') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    } else if (timeRange === 'last_6_months') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    } else if (timeRange === 'last_3_months') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else {
      return [];
    }
    
    // Generate all months from startDate to endDate (inclusive)
    const current = new Date(startDate);
    while (current <= endDate) {
      months.push({
        year: current.getFullYear(),
        month: MONTH_NAMES[current.getMonth()],
      });
      // Move to next month
      current.setMonth(current.getMonth() + 1);
    }
    
    return months;
  }, []);

  // Helper function to apply chartTimeRange filter (extracted to avoid duplication)
  const applyChartTimeRangeFilter = useCallback(<T extends { year: number; month: string }>(
    data: T[],
    timeRange: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months'
  ): T[] => {
    const now = new Date();
    
    if (timeRange === 'this_year') {
      return data.filter(m => m.year === now.getFullYear());
    } else if (timeRange === 'last_12_months') {
      const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return data.filter(m => {
        const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
        return monthDate >= cutoffDate;
      });
    } else if (timeRange === 'last_6_months') {
      const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return data.filter(m => {
        const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
        return monthDate >= cutoffDate;
      });
    } else if (timeRange === 'last_3_months') {
      const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return data.filter(m => {
        const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
        return monthDate >= cutoffDate;
      });
    }
    
    return data;
  }, []);

  // Chart data helpers - using hooks
  const overviewChartData = useOverviewChartData(
    effectivePivotData,
    filterValues,
    filteredData.channelsWithFilters,
    chartTimeRange as 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months'
  );

  // Channel-specific chart data (for individual channel tabs) - using hook
  const channelChartData = useAllChannelChartData(
    effectivePivotData,
    filterValues,
    filteredData.channelsWithFilters,
    chartTimeRange as 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months'
  );

  // Use filtered monthly_data for Revenue charts when available so all tabs (Overview + Metasearch/SEM/Social) show the same filtered data (e.g. when a view is selected). Falls back to pivot-based chart when monthlyData is empty.
  const chartTimeRangeTyped = chartTimeRange as 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months';
  const effectiveOverviewChartData = useMemo(() => {
    if (filteredData.monthlyData?.length > 0) {
      return buildOverviewChartDataFromMonthlyData(filteredData.monthlyData, chartTimeRangeTyped);
    }
    return overviewChartData;
  }, [filteredData.monthlyData, chartTimeRangeTyped, overviewChartData]);

  const effectiveChannelChartData = useMemo(() => {
    if (filteredData.monthlyData?.length > 0) {
      return buildChannelChartDataFromMonthlyData(filteredData.monthlyData, chartTimeRangeTyped);
    }
    return channelChartData;
  }, [filteredData.monthlyData, chartTimeRangeTyped, channelChartData]);

  // Get channel totals from monthly_data table (same source as SlideDataBrowser)
  // This is the correct source of truth for the data
  const monthlyDataTotals = useMemo(() => {
    const channelTotals: Record<string, {
      impressions: number;
      clicks: number;
      cost: number;
      revenue: number;
      bookings: number;
    }> = {
      metasearch: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      sem: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      social: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
    };

    if (monthlyDataRecords.length === 0) {
      return channelTotals;
    }

    // Filter records based on selected year/month
    let filteredRecords = monthlyDataRecords;
    
    if (selectedYear !== 'all') {
      const yearNum = parseInt(selectedYear);
      filteredRecords = filteredRecords.filter(r => r.year === yearNum);
    }
    
    if (selectedMonth !== 'all') {
      const monthNum = MONTH_NAMES.indexOf(selectedMonth) + 1;
      filteredRecords = filteredRecords.filter(r => r.month === monthNum);
    }

    // Aggregate metrics by channel
    filteredRecords.forEach(record => {
      const channel = record.channel.toLowerCase();
      if (channelTotals[channel] && record.metrics) {
        const metrics = record.metrics;
        channelTotals[channel].impressions += metrics.impressions || 0;
        channelTotals[channel].clicks += metrics.clicks || 0;
        channelTotals[channel].cost += metrics.cost || 0;
        channelTotals[channel].revenue += metrics.revenue || 0;
        channelTotals[channel].bookings += metrics.bookings || 0;
      }
    });

    return channelTotals;
  }, [monthlyDataRecords, selectedYear, selectedMonth]);

  // Get channel metrics using hook
  // Get comparison totals from useChannelMetrics hook (handles comparison period filtering)
  const { comparisonTotals: hookComparisonTotals } = useChannelMetrics({
    pivotData: effectivePivotData,
    selectedYear,
    selectedMonth,
    filterValues,
    filterDimensionValues,
    slideType,
    dynamicChannelTotals,
    comparisonType: comparisonType as 'none' | 'previous_period' | 'previous_year',
  });

  // Get current totals - uses unified filteredData hook (single source of truth)
  const currentTotals = filteredData.channelTotals;

  // Helper function to check if any channel has non-zero data
  const hasAnyData = (totals: typeof currentTotals): boolean => {
    return Object.values(totals).some(channel => 
      channel.impressions > 0 || 
      channel.clicks > 0 || 
      channel.cost > 0 || 
      channel.revenue > 0 || 
      channel.bookings > 0
    );
  };

  // Get comparison totals based on comparison type and selected year/month
  // TODO: Migrate fully to useChannelMetrics hook
  const comparisonTotals = useMemo(() => {
    // Use hook result if available, otherwise fall back to legacy calculation
    if (hookComparisonTotals) {
      return hookComparisonTotals;
    }
    
    if (comparisonType === 'none') return null;
    
    if (!effectivePivotData?.channels) return null;
    const channelTotals: Record<string, any> = {};
    for (const [channel, channelData] of Object.entries(effectivePivotData.channels)) {
      if (comparisonType === 'previous_period' && (channelData as any).previous_period) {
        channelTotals[channel] = (channelData as any).previous_period;
      } else if (comparisonType === 'previous_year' && (channelData as any).previous_year) {
        channelTotals[channel] = (channelData as any).previous_year;
      } else {
        channelTotals[channel] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      }
    }
    return channelTotals;
  }, [comparisonType, effectivePivotData, hookComparisonTotals]);

  // Load data from stored pivot_data when slideReport changes (uses channel data from tables when available)
  useEffect(() => {
    if (effectivePivotData && slideType === 'master-report') {
      const pivotData = effectivePivotData;
      
      // Build monthly data with per-channel breakdown
      const monthlyDataMap: Record<string, any> = {};
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      
      // First, load overview monthly data as base
      if (pivotData.overview?.monthly) {
        Object.entries(pivotData.overview.monthly).forEach(([key, metrics]: [string, any]) => {
          const [year, monthNum] = key.split('-');
          const monthName = monthNames[parseInt(monthNum) - 1];
          monthlyDataMap[key] = {
            month: monthName,
            year: parseInt(year),
            revenue: metrics.revenue || 0,
            cost: metrics.cost || 0,
            impressions: metrics.impressions || 0,
            clicks: metrics.clicks || 0,
            bookings: metrics.bookings || 0,
            metasearch: 0,
            sem: 0,
            social: 0,
          };
        });
      }
      
      // Then, load channel-specific monthly data from channels[channel].monthly
      if (pivotData.channels) {
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          const channelMonthly = (channelData as any).monthly;
          if (channelMonthly) {
            Object.entries(channelMonthly).forEach(([key, metrics]: [string, any]) => {
              if (!monthlyDataMap[key]) {
                const [year, monthNum] = key.split('-');
                const monthName = monthNames[parseInt(monthNum) - 1];
                monthlyDataMap[key] = {
                  month: monthName,
                  year: parseInt(year),
                  revenue: 0,
                  cost: 0,
                  impressions: 0,
                  clicks: 0,
                  bookings: 0,
                  metasearch: 0,
                  sem: 0,
                  social: 0,
                };
              }
              // Store channel-specific revenue
              monthlyDataMap[key][channel] = (metrics as any).revenue || 0;
            });
          }
        }
      }
      
      // Convert to array and sort
      const monthlyRevenue = Object.values(monthlyDataMap).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
      });
      
      if (monthlyRevenue.length > 0) {
        setDynamicMonthlyData(monthlyRevenue);
      }
      
      // Load channel totals from current metrics
      if (pivotData.channels) {
        const channelTotals: Record<string, any> = {};
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          channelTotals[channel] = (channelData as any).current;
        }
        if (Object.keys(channelTotals).length > 0) {
          setDynamicChannelTotals(channelTotals);
        }
        
        // Load yearly totals
        const yearlyTotals: Record<number, Record<string, any>> = {};
        for (const year of [2024, 2025, 2026]) {
          yearlyTotals[year] = {};
          for (const [channel, channelData] of Object.entries(pivotData.channels)) {
            const yearly = (channelData as any).yearly;
            if (yearly?.[String(year)]) {
              yearlyTotals[year][channel] = yearly[String(year)];
            }
          }
        }
        if (Object.values(yearlyTotals).some(y => Object.keys(y).length > 0)) {
          setDynamicYearlyTotals(yearlyTotals);
        }
      }
    }
  }, [effectivePivotData, slideType]);

  useEffect(() => {
    const loadOrCreateSlideReport = async () => {
      if (!accountId || !user) return;
      
      // Wait for account report IDs to be loaded before proceeding
      if (!accountReportIds.sem && !accountReportIds.social && !accountReportIds.metasearch) {
        // Account report IDs not loaded yet, wait for them
        return;
      }
      
      // Wait for slideReports to finish loading before deciding to create
      if (isSlideReportsLoading) {
        return;
      }

      try {
        // Check if a specific reportId is passed via URL parameter
        const urlReportId = searchParams.get('reportId');
        if (urlReportId) {
          // Load the specific report from URL
          const targetReport = slideReports?.find(r => r.id === urlReportId && r.is_active);
          if (targetReport) {
            setSlideReportId(targetReport.id);
            // Load configuration from the target report
            if (targetReport.configuration) {
              const config = targetReport.configuration;
              if (config.selectedChannels) {
                // Filter selectedChannels to only include channels that have reports
                const validChannels = config.selectedChannels.filter(channel => 
                  availableChannels.includes(channel)
                );
                setSelectedDimensions({
                  metasearch: validChannels.includes('metasearch'),
                  sem: validChannels.includes('sem'),
                  social: validChannels.includes('social'),
                });
              } else {
                // Initialize based on available channels
                setSelectedDimensions({
                  metasearch: availableChannels.includes('metasearch'),
                  sem: availableChannels.includes('sem'),
                  social: availableChannels.includes('social'),
                });
              }
              if (config.selectedValueDimensionIds) {
                setSelectedValueDimensionIds(config.selectedValueDimensionIds);
              }
              if (config.channelConfigs) {
                setChannelConfigs(config.channelConfigs);
              }
              if (config.breakdownConfigs) {
                setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
              }
              if (config.filterConfigs) {
                setFilterConfigs(config.filterConfigs as any);
              }
            }
            // Load date range - always default to current year/month for the UI filter
            // The stored date_range is used for Edit Source modal, not for the active filter
            const currentYear = new Date().getFullYear();
            const currentMonth = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date().getMonth()];
            setSelectedYear(currentYear.toString());
            setSelectedMonth(currentMonth);
            
            // Load sinceMonth/sinceYear for Edit Source modal from stored settings
            if (targetReport.date_range) {
              setSinceMonth(targetReport.date_range.month || 'January');
              setSinceYear(targetReport.date_range.year);
            } else {
              setSinceMonth('January');
              setSinceYear(currentYear);
            }
            return;
          }
        }

        // For master-report, look for the FIRST (oldest) Master Report to avoid duplicates
        if (slideType === 'master-report') {
          // Find all Master Reports and use the oldest one (first created)
          const masterReports = (slideReports || [])
            .filter(r => r.name === 'Master Report' && r.is_active)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          
          const masterReport = masterReports[0]; // Use the oldest one
          
          if (masterReport) {
            setSlideReportId(masterReport.id);
            // Load configuration from existing report
            if (masterReport.configuration) {
              const config = masterReport.configuration;
              if (config.selectedChannels) {
                // Filter selectedChannels to only include channels that have reports
                const validChannels = config.selectedChannels.filter(channel => 
                  availableChannels.includes(channel)
                );
                setSelectedDimensions({
                  metasearch: validChannels.includes('metasearch'),
                  sem: validChannels.includes('sem'),
                  social: validChannels.includes('social'),
                });
              } else {
                // Initialize based on available channels
                setSelectedDimensions({
                  metasearch: availableChannels.includes('metasearch'),
                  sem: availableChannels.includes('sem'),
                  social: availableChannels.includes('social'),
                });
              }
              if (config.selectedValueDimensionIds) {
                setSelectedValueDimensionIds(config.selectedValueDimensionIds);
              }
              if (config.channelConfigs) {
                setChannelConfigs(config.channelConfigs);
              }
              if (config.breakdownConfigs) {
                setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
              }
              if (config.filterConfigs) {
                setFilterConfigs(config.filterConfigs as any);
              }
            }
            // Load date range - always default to current year/month for the UI filter
            const currentYear = new Date().getFullYear();
            const currentMonth = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date().getMonth()];
            setSelectedYear(currentYear.toString());
            setSelectedMonth(currentMonth);
            
            // Load sinceMonth/sinceYear for Edit Source modal from stored settings
            if (masterReport.date_range) {
              setSinceMonth(masterReport.date_range.month || 'January');
              setSinceYear(masterReport.date_range.year);
            } else {
              setSinceMonth('January');
              setSinceYear(currentYear);
            }
            
            // Log if there are duplicates that should be cleaned up
            if (masterReports.length > 1) {
              console.warn(`[loadOrCreateSlideReport] Found ${masterReports.length} Master Reports for this account. Using oldest one: ${masterReport.id}`);
            }
          } else {
            // No Master Report exists - instead of creating automatically,
            // open the Edit Source wizard so user can configure first
            const currentYear = new Date().getFullYear();
            setSelectedYear(currentYear.toString());
            setSelectedMonth('January');
            setSinceMonth('January');
            setSinceYear(currentYear);
            
            // Set default configuration state based on available channels
            setSelectedDimensions({
              metasearch: availableChannels.includes('metasearch'),
              sem: availableChannels.includes('sem'),
              social: availableChannels.includes('social'),
            });
            
            // Open the Edit Source modal for initial configuration
            // The report will be created when user saves the configuration
            setIsEditSourceOpen(true);
          }
          return;
        }
        
        // For brady or regular slides, use existing logic
        // Try to find existing slide report for this account
        // For now, we'll use the first active one or create a new one
        const existingReport = slideReports?.find(r => r.is_active);
        
        if (existingReport) {
          setSlideReportId(existingReport.id);
          // Load configuration from existing report
          if (existingReport.configuration) {
            const config = existingReport.configuration;
            if (config.selectedChannels) {
              // Filter selectedChannels to only include channels that have reports
              const validChannels = config.selectedChannels.filter(channel => 
                availableChannels.includes(channel)
              );
              setSelectedDimensions({
                metasearch: validChannels.includes('metasearch'),
                sem: validChannels.includes('sem'),
                social: validChannels.includes('social'),
              });
            } else {
              // Initialize based on available channels
              setSelectedDimensions({
                metasearch: availableChannels.includes('metasearch'),
                sem: availableChannels.includes('sem'),
                social: availableChannels.includes('social'),
              });
            }
            if (config.selectedValueDimensionIds) {
              setSelectedValueDimensionIds(config.selectedValueDimensionIds);
            }
            if (config.channelConfigs) {
              setChannelConfigs(config.channelConfigs);
            }
            if (config.breakdownConfigs) {
              setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
            }
            if (config.filterConfigs) {
              setFilterConfigs(config.filterConfigs);
            }
          }
          // Load date range - always default to current year/month for the UI filter
          const currentYear = new Date().getFullYear();
          const currentMonth = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date().getMonth()];
          setSelectedYear(currentYear.toString());
          setSelectedMonth(currentMonth);
          
          // Load sinceMonth/sinceYear for Edit Source modal from stored settings
          if (existingReport.date_range) {
            setSinceMonth(existingReport.date_range.month || 'January');
            setSinceYear(existingReport.date_range.year);
          } else {
            setSinceMonth('January');
            setSinceYear(currentYear);
          }
        }
      } catch (error) {
        console.error('Error loading slide report:', error);
      }
    };

    loadOrCreateSlideReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, user?.id, slideReports, slideType, isSlideReportsLoading, accountReportIds, availableChannels]);

  // Keep local state in sync with slideReport.configuration
  useEffect(() => {
    if (slideReport?.configuration) {
      const config = slideReport.configuration;
      // Filter configs to only include channels that have reports
      const filteredFilterConfigs: Record<string, FilterConfig> = {};
      const filteredBreakdownConfigs: Record<string, BreakdownConfig> = {};
      const filteredChannelConfigs: Record<string, ChannelConfig> = {};
      
      for (const channel of availableChannels) {
        if (config.filterConfigs?.[channel]) {
          filteredFilterConfigs[channel] = config.filterConfigs[channel];
        }
        if (config.breakdownConfigs?.[channel]) {
          filteredBreakdownConfigs[channel] = config.breakdownConfigs[channel];
        }
        if (config.channelConfigs?.[channel]) {
          filteredChannelConfigs[channel] = config.channelConfigs[channel];
        }
      }
      
      setFilterConfigs(filteredFilterConfigs);
      setBreakdownConfigs(filteredBreakdownConfigs);
      setChannelConfigs(filteredChannelConfigs);
    }
  }, [slideReport?.configuration, availableChannels]);

  // Load filter dimension values and names from pivot_data (pre-computed) instead of loading from database
  useEffect(() => {
    const loadFilterValuesFromPivotData = async () => {
      const pivotData = effectivePivotData;
      const config = slideReport?.configuration as SlideReportConfiguration | null;
      
      if (!pivotData?.channels || !config?.filterConfigs || availableChannels.length === 0) {
        return;
      }
      
      // Filter to only include channels that have reports
      const validChannels = (config.selectedChannels || []).filter(channel => 
        availableChannels.includes(channel)
      );
      
      const updatedFilterDimensionValues: Record<string, Record<string, string[]>> = {
        metasearch: {},
        sem: {},
        social: {},
      };
      const updatedFilterDimensionNames: Record<string, Record<string, string>> = {
        metasearch: {},
        sem: {},
        social: {},
      };
      
      let hasValues = false;
      
      for (const channel of validChannels) {
        const channelData = pivotData.channels[channel];
        const filterConfig = config.filterConfigs?.[channel];
        
        if (!channelData || !filterConfig?.filterDimensionIds?.length) continue;
        
        // Check if we have pre-computed filter values in pivot_data
        const filterUniqueValues = (channelData as any).filterUniqueValues as Record<string, { name: string; values: string[] }> | undefined;
        
        if (filterUniqueValues) {
          // Use pre-computed values from pivot_data (fast path - no DB query needed)
          for (const filterDimId of filterConfig.filterDimensionIds) {
            const filterData = filterUniqueValues[filterDimId];
            if (filterData) {
              updatedFilterDimensionValues[channel][filterDimId] = filterData.values;
              updatedFilterDimensionNames[channel][filterDimId] = filterData.name;
              hasValues = true;
            }
          }
        } else {
          // Fallback: Load from database (for old reports without pre-computed values)
          for (const filterDimId of filterConfig.filterDimensionIds) {
            const values = await loadFilterDimensionValues(channel, filterDimId);
            if (values.length > 0) {
              updatedFilterDimensionValues[channel][filterDimId] = values;
              hasValues = true;
            }
          }
          
          // Fetch dimension names for fallback path
          const uniqueIds = [...new Set(filterConfig.filterDimensionIds)];
          if (uniqueIds.length > 0) {
            const { data: dimensionInfo } = await supabase
              .from('dimensions')
              .select('id, name')
              .in('id', uniqueIds);
            
            if (dimensionInfo) {
              for (const dim of dimensionInfo) {
                updatedFilterDimensionNames[channel][dim.id] = dim.name;
              }
            }
          }
        }
      }
      
      if (hasValues) {
        setFilterDimensionValues(prev => ({ ...prev, ...updatedFilterDimensionValues }));
      }
      if (Object.values(updatedFilterDimensionNames).some(ch => Object.keys(ch).length > 0)) {
        setFilterDimensionNames(prev => ({ ...prev, ...updatedFilterDimensionNames }));
      }
    };

    loadFilterValuesFromPivotData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePivotData, slideReport?.configuration?.filterConfigs]);

  // Load filter dimension values when switching to a channel tab that has filters
  useEffect(() => {
    let cancelled = false;
    
    const loadValuesForCurrentTab = async () => {
      if (selectedTab === 'overview' || selectedTab === 'budget') return;
      if (cancelled) return;
      
      const currentChannel = selectedTab as 'metasearch' | 'sem' | 'social';
      const savedFilterConfigs = slideReport?.configuration?.filterConfigs?.[currentChannel];
      const localFilterConfig = filterConfigs?.[currentChannel];
      const filterDimIds = savedFilterConfigs?.filterDimensionIds || localFilterConfig?.filterDimensionIds || [];
      
      if (filterDimIds.length === 0) return;
      
      // Check if values are already loaded
      const hasAllValues = filterDimIds.every(id => 
        filterDimensionValues[currentChannel]?.[id]?.length > 0
      );
      
      if (hasAllValues) {
        return;
      }
      
      // First, try to get values from pivot_data (pre-computed; uses channel data from tables when available)
      const channelData = effectivePivotData?.channels?.[currentChannel];
      const filterUniqueValues = (channelData as any)?.filterUniqueValues as Record<string, { name: string; values: string[] }> | undefined;
      
      const newValues: Record<string, string[]> = {};
      const newNames: Record<string, string> = {};
      const missingDimIds: string[] = [];
      
      // Also check rawDataRows as a fast fallback (in-memory, no DB query)
      const rawDataRows = (channelData as any)?.rawDataRows as any[] | undefined;
      
      for (const filterDimId of filterDimIds) {
        if (filterDimensionValues[currentChannel]?.[filterDimId]?.length > 0) continue;
        
        // FASTEST: Check pre-computed filterUniqueValues from pivot_data first
        if (filterUniqueValues?.[filterDimId]) {
          newValues[filterDimId] = filterUniqueValues[filterDimId].values;
          newNames[filterDimId] = filterUniqueValues[filterDimId].name;
        } else if (rawDataRows && rawDataRows.length > 0) {
          // FAST: Extract from rawDataRows (already in memory)
          const uniqueValues = new Set<string>();
          for (const row of rawDataRows) {
            const rowData = row.dimension_values || row;
            const value = rowData[filterDimId];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
              uniqueValues.add(String(value).trim());
            }
          }
          const sortedValues = Array.from(uniqueValues).sort();
          if (sortedValues.length > 0) {
            newValues[filterDimId] = sortedValues;
            // Try to get dimension name from dimensionMap or dimensions list
            const dimName = (channelData as any)?.dimensionMap?.[filterDimId] 
              || dimensions[currentChannel]?.find(d => d.id === filterDimId)?.name
              || filterDimId;
            newNames[filterDimId] = dimName;
          } else {
            missingDimIds.push(filterDimId);
          }
        } else {
          missingDimIds.push(filterDimId);
        }
      }
      
      // SLOW: Fallback to database only if needed (load in parallel for speed)
      if (missingDimIds.length > 0 && !cancelled) {
        // Set loading state
        setFilterValuesLoading(prev => {
          const updated = { ...prev };
          if (!updated[currentChannel]) updated[currentChannel] = {};
          missingDimIds.forEach(id => {
            updated[currentChannel][id] = true;
          });
          return updated;
        });
        
        const loadPromises = missingDimIds.map(filterDimId =>
          loadFilterDimensionValues(currentChannel, filterDimId).then(values => {
            if (cancelled) return;
            if (values.length > 0) {
              newValues[filterDimId] = values;
            }
            // Clear loading state for this dimension
            if (!cancelled) {
              setFilterValuesLoading(prev => ({
                ...prev,
                [currentChannel]: {
                  ...prev[currentChannel],
                  [filterDimId]: false,
                },
              }));
            }
          })
        );
        
        await Promise.all(loadPromises);
      }
      
      if (cancelled) return;
      
      if (Object.keys(newValues).length > 0) {
        setFilterDimensionValues(prev => ({
          ...prev,
          [currentChannel]: {
            ...prev[currentChannel],
            ...newValues,
          },
        }));
      }
      if (Object.keys(newNames).length > 0) {
        setFilterDimensionNames(prev => ({
          ...prev,
          [currentChannel]: {
            ...prev[currentChannel],
            ...newNames,
          },
        }));
      }
    };

    loadValuesForCurrentTab();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, effectivePivotData, slideReport?.configuration?.filterConfigs]);

  // Open modal if ?edit=true in URL
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditSourceOpen(true);
      setSearchParams({}, { replace: true }); // Remove the query param
    }
  }, [searchParams, setSearchParams]);

  // Step-by-step modal state (6 steps now: Date, Channels, Value Dimensions, Data Source, Breakdown, Filters)
  type ModalStep = 1 | 2 | 3 | 4 | 5 | 6;
  const [modalStep, setModalStep] = useState<ModalStep>(1);
  const [activeChannelTab, setActiveChannelTab] = useState<'metasearch' | 'sem' | 'social' | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Date configuration for "Since" (Step 1)
  const [sinceMonth, setSinceMonth] = useState<string>("January");
  const [sinceYear, setSinceYear] = useState<number>(2024);

  // Account-specific report IDs are loaded via getAccountReportIds and stored in accountReportIds state
  // Value dimension IDs state (for step 2 - applies to all channels)
  
  // Available dimensions per channel (fetched from database) - VALUE types only
  const [availableDimensions, setAvailableDimensions] = useState<Record<string, { id: string; name: string; type: string }[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [loadingAvailableDimensions, setLoadingAvailableDimensions] = useState(false);

  // Dynamically extract all VALUE dimension IDs from availableDimensions
  // Falls back to empty array if dimensions aren't loaded yet
  const allAvailableValueDimensionIds = useMemo(() => {
    const allIds = new Set<string>();
    Object.values(availableDimensions).forEach(channelDims => {
      channelDims.forEach(dim => {
        // Only include VALUE type dimensions (number, currency, percentage)
        if (['number', 'currency', 'percentage'].includes(dim.type)) {
          allIds.add(dim.id);
        }
      });
    });
    return Array.from(allIds);
  }, [availableDimensions]);

  // Fallback hardcoded dimension IDs (only used if dimensions aren't loaded yet)
  // These are kept as a last resort fallback for Brady Hotels reports
  const FALLBACK_DIMENSION_IDS = [
    '89c229d9-8a6e-4d94-a0d2-a4b43b6f3fe1', // Impressions
    '1caad3eb-3d5e-405c-9df7-1c96971171c5', // Clicks
    'fb281b3f-c800-48f4-b34b-02d4f0244b07', // Cost
    '7f4cb2e9-52a3-4110-803a-58d2e7afacb5', // Revenue
    '79aeb7f7-a9c6-43cd-bd05-ff7df81babf1', // Bookings
    '8962dff5-bb0f-4ab1-ace7-e5dc5eb4fdcc', // CPC
    '3486d423-f75c-402e-8fb2-285b6e7e22ec', // Cost of sale
    'bfde7232-89ab-46ba-80ed-015a4d73bae5', // Impression Share
    'bbe9b05b-7485-4eb3-a3cc-d04f05823f63', // Leads
    'ff046f06-10ee-4420-a02f-d4089e5f75a6', // CTR
  ];

  // Use dynamic dimensions if available, otherwise fallback to hardcoded IDs
  const defaultValueDimensionIds = useMemo(() => {
    return allAvailableValueDimensionIds.length > 0 
      ? allAvailableValueDimensionIds 
      : FALLBACK_DIMENSION_IDS;
  }, [allAvailableValueDimensionIds]);

  const [selectedValueDimensionIds, setSelectedValueDimensionIds] = useState<string[]>([]);

  // Channel configuration state
  interface ChannelConfig {
    dimensionId: string | null;
    selectedValues: string[];
  }
  const [channelConfigs, setChannelConfigs] = useState<Record<string, ChannelConfig>>({
    metasearch: { dimensionId: null, selectedValues: [] },
    sem: { dimensionId: null, selectedValues: [] },
    social: { dimensionId: null, selectedValues: [] },
  });

  // Breakdown configuration state
  interface BreakdownConfig {
    breakdownDimensionIds: string[];
  }

  const [breakdownConfigs, setBreakdownConfigs] = useState<Record<string, BreakdownConfig>>({
    metasearch: { breakdownDimensionIds: [] },
    sem: { breakdownDimensionIds: [] },
    social: { breakdownDimensionIds: [] },
  });

  // Filter configuration state
  interface FilterConfig {
    filterDimensionIds: string[];
  }
  const [filterConfigs, setFilterConfigs] = useState<Record<string, FilterConfig>>({
    metasearch: { filterDimensionIds: [] },
    sem: { filterDimensionIds: [] },
    social: { filterDimensionIds: [] },
  });


  // Pending filter values (before Apply is clicked)
  const [pendingFilterValues, setPendingFilterValues] = useState<Record<string, Record<string, string[]>>>({
    metasearch: {},
    sem: {},
    social: {},
  });

  // Search terms for filter dropdowns
  const [filterSearchTerms, setFilterSearchTerms] = useState<Record<string, string>>({});

  // Track which filter popovers are open (channel-dimensionId -> boolean)
  const [openFilterPopovers, setOpenFilterPopovers] = useState<Record<string, boolean>>({});

  // Filter dimension names lookup (for rendering) - channel -> dimensionId -> name
  const [filterDimensionNames, setFilterDimensionNames] = useState<Record<string, Record<string, string>>>({
    metasearch: {},
    sem: {},
    social: {},
  });

  // Dimension and value loading state
  interface Dimension {
    id: string;
    name: string;
    type: string;
  }
  const [dimensions, setDimensions] = useState<Record<string, Dimension[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [loadingDimensions, setLoadingDimensions] = useState<Record<string, boolean>>({
    metasearch: false,
    sem: false,
    social: false,
  });
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({
    metasearch: false,
    sem: false,
    social: false,
  });

  // Refresh Data Modal state - 5 steps now
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [refreshStep, setRefreshStep] = useState(0); // 0 = not started, 1-5 = steps
  const [refreshStepStatus, setRefreshStepStatus] = useState<Record<number, 'pending' | 'loading' | 'complete' | 'error'>>({
    1: 'pending',
    2: 'pending',
    3: 'pending',
    4: 'pending',
    5: 'pending',
  });
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const [breakdownDimensions, setBreakdownDimensions] = useState<Record<string, Dimension[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [loadingBreakdownDimensions, setLoadingBreakdownDimensions] = useState<Record<string, boolean>>({
    metasearch: false,
    sem: false,
    social: false,
  });

  // Load breakdown dimensions from data source for a channel
  const loadBreakdownDimensionsForChannel = async (channel: 'metasearch' | 'sem' | 'social') => {
    setLoadingBreakdownDimensions(prev => ({ ...prev, [channel]: true }));
    try {
      const reportId = getReportIdForChannel(channel);
      if (!reportId) {
        console.warn(`[loadBreakdownDimensionsForChannel] No report ID for channel: ${channel}`);
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      // Fetch data source for the report
      const { data: dsData, error: dsError } = await supabase
        .from('data_sources')
        .select('column_mappings')
        .eq('report_id', reportId)
        .limit(1)
        .maybeSingle();

      if (dsError || !dsData) {
        console.error(`Error fetching data source for ${channel}:`, dsError);
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      // Extract dimension IDs from column mappings
      const columnMappings = Array.isArray(dsData.column_mappings) ? dsData.column_mappings : [];
      const dimensionIds = columnMappings
        .filter((m: any) => m.dimensionId && m.dimensionId !== 'none' && m.dimensionId !== null)
        .map((m: any) => m.dimensionId);

      if (dimensionIds.length === 0) {
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      // Fetch dimension details - only TEXT type for breakdown
      const { data: dims, error: dimError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .in('id', dimensionIds)
        .eq('type', 'text')
        .order('name');

      if (dimError) {
        console.error(`Error loading breakdown dimensions for ${channel}:`, dimError);
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      setBreakdownDimensions(prev => ({ ...prev, [channel]: dims || [] }));
    } catch (err) {
      console.error(`Error loading breakdown dimensions for ${channel}:`, err);
      setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
    } finally {
      setLoadingBreakdownDimensions(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Breakdown table state is declared earlier (groupByDimension, breakdownByDimension) so useFilteredSlideData can use it for KPI.

  // Store breakdown totals from Breakdown Analysis table for KPI synchronization
  const [breakdownTotals, setBreakdownTotals] = useState<Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleDimensionToggle = useCallback((dimension: 'metasearch' | 'sem' | 'social') => {
    setSelectedDimensions(prev => ({
      ...prev,
      [dimension]: !prev[dimension],
    }));
  }, []);

  // Get selected channels - only include channels that are both selected AND have report IDs
  const selectedChannels = useMemo(() => {
    const channels: ('metasearch' | 'sem' | 'social')[] = [];
    if (selectedDimensions.metasearch && accountReportIds.metasearch) channels.push('metasearch');
    if (selectedDimensions.sem && accountReportIds.sem) channels.push('sem');
    if (selectedDimensions.social && accountReportIds.social) channels.push('social');
    return channels;
  }, [selectedDimensions, accountReportIds]);

  // Reset modal to step 1 when opened
  useEffect(() => {
    if (isEditSourceOpen) {
      setModalStep(1);
      setActiveChannelTab(null);
      setSearchQuery("");
      // Reset dimension loading state to ensure clean reload
      setLoadingDimensions({
        metasearch: false,
        sem: false,
        social: false,
      });
      // Cancel any ongoing dimension value loading
      if (dimensionValueAbortControllerRef.current) {
        dimensionValueAbortControllerRef.current.abort();
        dimensionValueAbortControllerRef.current = null;
      }
      setLoadingValues({
        metasearch: false,
        sem: false,
        social: false,
      });
    }
  }, [isEditSourceOpen]);

  // Initialize active channel tab when entering step 4, 5, or 6 (Data Source, Breakdown, Filters)
  useEffect(() => {
    if ((modalStep === 4 || modalStep === 5 || modalStep === 6) && selectedChannels.length > 0 && !activeChannelTab) {
      setActiveChannelTab(selectedChannels[0]);
    }
  }, [modalStep, selectedChannels, activeChannelTab]);

  // Load dimension values when activeChannelTab changes on step 4 (Data Source)
  // Now only needed if user changes the dimension dropdown (not on initial load, since we preload)
  useEffect(() => {
    if (modalStep === 4 && activeChannelTab && isEditSourceOpen) {
      const config = channelConfigs[activeChannelTab];
      const dimensionId = config?.dimensionId;
      
      // Only load if we don't already have values (they should be preloaded from step 2)
      const existingValues = dimensionValues[activeChannelTab] || [];
      if (dimensionId && existingValues.length === 0 && !loadingValues[activeChannelTab]) {
        // Set loading to true IMMEDIATELY before async call to prevent race condition
        setLoadingValues(prev => ({ ...prev, [activeChannelTab]: true }));
        loadValuesForDimension(activeChannelTab, dimensionId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelTab, modalStep, isEditSourceOpen]);

  // Expected dimension names per channel (used to filter dimensions from database)
  const CHANNEL_DIMENSION_NAMES: Record<string, string[]> = {
    metasearch: ['Hotel', 'Channel', 'Device', 'Link Type', 'Market'],
    sem: ['Account', 'Campaign'],
    social: ['Account', 'Ad Group', 'Campaign'],
  };

  // Ref to store loadValuesForDimension to avoid circular dependency
  const loadValuesForDimensionRef = useRef<((channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => Promise<void>) | null>(null);
  
  // AbortController ref to cancel ongoing dimension value loading
  const dimensionValueAbortControllerRef = useRef<AbortController | null>(null);

  // Load dimensions for a channel from database (account-specific)
  const loadDimensionsForChannel = useCallback(async (channel: 'metasearch' | 'sem' | 'social') => {
    setLoadingDimensions(prev => ({ ...prev, [channel]: true }));
    try {
      // Get report ID for this channel
      const reportId = getReportIdForChannel(channel);
      if (!reportId) {
        console.warn(`[loadDimensionsForChannel] No report ID for channel: ${channel}`);
        setDimensions(prev => ({ ...prev, [channel]: [] }));
        setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
        return;
      }

      // Get account ID from report
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('account_id')
        .eq('id', reportId)
        .maybeSingle();

      if (reportError || !reportData?.account_id) {
        console.error(`[loadDimensionsForChannel] Error fetching report or account ID for ${channel}:`, reportError);
        setDimensions(prev => ({ ...prev, [channel]: [] }));
        setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
        return;
      }

      const accountId = reportData.account_id;
      const expectedNames = CHANNEL_DIMENSION_NAMES[channel] || [];

      // Load account-specific dimensions matching the expected names
      const { data: accountDims, error: dimError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .eq('scope', 'account')
        .eq('account_id', accountId)
        .eq('type', 'text')
        .in('name', expectedNames)
        .order('name');

      if (dimError) {
        console.error(`[loadDimensionsForChannel] Error loading dimensions for ${channel}:`, dimError);
        setDimensions(prev => ({ ...prev, [channel]: [] }));
        setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
        return;
      }

      // Fallback to global dimensions if no account-specific dimensions found
      let channelDims: Dimension[] = (accountDims || []) as Dimension[];
      
      if (channelDims.length === 0) {
        console.warn(`[loadDimensionsForChannel] No account-specific dimensions found for ${channel}, trying global...`);
        const { data: globalDims, error: globalError } = await supabase
          .from('dimensions')
          .select('id, name, type')
          .eq('scope', 'global')
          .eq('type', 'text')
          .in('name', expectedNames)
          .order('name');

        if (!globalError && globalDims) {
          channelDims = globalDims as Dimension[];
        }
      }

      // Sort dimensions to match expected order
      const sortedDims = expectedNames
        .map(name => channelDims.find(d => d.name === name))
        .filter((d): d is Dimension => d !== undefined);

      console.log(`[loadDimensionsForChannel] Loaded ${sortedDims.length} dimensions for ${channel} (account: ${accountId}):`, 
        sortedDims.map(d => ({ id: d.id, name: d.name })));

      setDimensions(prev => ({ ...prev, [channel]: sortedDims }));
      setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
      
      // Get the dimension ID to use
      let dimensionIdToLoad = channelConfigs[channel]?.dimensionId;
      
      // Auto-select first dimension (Hotel for metasearch, Account for others) if not already set
      if (sortedDims.length > 0 && !dimensionIdToLoad) {
        const firstDimId = sortedDims[0].id;
        dimensionIdToLoad = firstDimId;
        setChannelConfigs(prev => ({
          ...prev,
          [channel]: {
            ...prev[channel],
            dimensionId: firstDimId,
          },
        }));
      }
      
      // Load values for the dimension (use the determined ID directly, not from state)
      if (dimensionIdToLoad && loadValuesForDimensionRef.current) {
        await loadValuesForDimensionRef.current(channel, dimensionIdToLoad);
      }
    } catch (err) {
      console.error(`[loadDimensionsForChannel] Error loading dimensions for ${channel}:`, err);
      setDimensions(prev => ({ ...prev, [channel]: [] }));
      setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
    }
  }, [getReportIdForChannel, channelConfigs]);

  // Dimension values cache
  const dimensionValuesCache = useDataLoadingCache<string[]>({ ttl: 10 * 60 * 1000 }); // 10 minutes cache

  // Load values for a dimension from stored pivot_data first, fallback to dimension_data table
  // Also uses cached/saved selected values from channelConfigs for instant display
  // Now with caching, timeout, and cancellation to improve performance and prevent hanging
  const loadValuesForDimension = useCallback(async (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    // Cancel any ongoing request for this channel
    if (dimensionValueAbortControllerRef.current) {
      dimensionValueAbortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController();
    dimensionValueAbortControllerRef.current = abortController;
    
    // Check cache first
    const cacheKey = `${channel}-${dimensionId}`;
    const cached = dimensionValuesCache.get(cacheKey);
    if (cached) {
      setDimensionValues(prev => ({ ...prev, [channel]: cached }));
      setLoadingValues(prev => ({ ...prev, [channel]: false }));
      return;
    }
    // FIRST: Immediately show cached selected values from saved config (instant display)
    const savedConfig = channelConfigs[channel];
    const cachedSelectedValues = savedConfig?.selectedValues || [];
    
    // If we have cached values and the dimension matches, show them immediately
    if (cachedSelectedValues.length > 0 && savedConfig?.dimensionId === dimensionId) {
      setDimensionValues(prev => ({ ...prev, [channel]: cachedSelectedValues }));
    }
    
    // Note: loading state is already set by the caller for immediate UI feedback
    // But ensure it's true just in case
    setLoadingValues(prev => ({ ...prev, [channel]: true }));
    
    try {
      // SECOND: Check if we have raw data rows stored in pivot_data (most comprehensive - all dimension values)
      const channelData = effectivePivotData?.channels?.[channel];
      
      // Try rawDataRows first - this contains ALL rows with ALL dimension values
      if (channelData?.rawDataRows && channelData.rawDataRows.length > 0) {
        const valueSet = new Set<string>();
        cachedSelectedValues.forEach(v => valueSet.add(v));
        
        channelData.rawDataRows.forEach((row: any) => {
          const val = row[dimensionId];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            valueSet.add(String(val).trim());
          }
        });
        
        const sortedValues = Array.from(valueSet).sort();
        
        setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
        return;
      }
      
      // THIRD: Check pre-computed filterUniqueValues in pivot_data
      const storedFilterValues = channelData?.filterUniqueValues?.[dimensionId];
      
      if (storedFilterValues?.values && storedFilterValues.values.length > 0) {
        // Merge with cached selected values to ensure they're included
        const allValues = new Set([...storedFilterValues.values, ...cachedSelectedValues]);
        const sortedValues = Array.from(allValues).sort();
        
        setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
        return;
      }
      
      // FOURTH: Check breakdown dimension values
      const breakdowns = channelData?.breakdowns;
      if (breakdowns) {
        // Find the dimension name to look up in breakdowns
        const dimInfo = dimensions[channel]?.find(d => d.id === dimensionId);
        if (dimInfo && breakdowns[dimInfo.name]) {
          const breakdownRows = breakdowns[dimInfo.name] as Array<Record<string, any>>;
          if (breakdownRows && breakdownRows.length > 0) {
            // Extract dimension values from breakdown rows - the dimension value is stored as the first non-metric key
            const breakdownValues = breakdownRows
              .map(row => {
                // Look for the dimension value - it's the key that matches the dimension name (case-insensitive)
                const dimKey = Object.keys(row).find(k => 
                  k.toLowerCase() === dimInfo.name.toLowerCase() || 
                  k === 'name' ||
                  !['impressions', 'clicks', 'cost', 'revenue', 'bookings', 'ctr', 'conversionRate', 'cpc', 'roas', 'costOfSale'].includes(k)
                );
                return dimKey ? String(row[dimKey]) : null;
              })
              .filter((v): v is string => v !== null && v !== '');
            
            // Merge with cached selected values
            const allValues = new Set([...breakdownValues, ...cachedSelectedValues]);
            const sortedValues = Array.from(allValues).sort();
            
            setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
            setLoadingValues(prev => ({ ...prev, [channel]: false }));
            return;
          }
        }
      }
      
      // FALLBACK: Fetch from dimension_data table
      const reportId = getReportIdForChannel(channel);
      
      if (!reportId) {
        console.error(`[loadValuesForDimension] No report ID for channel: ${channel}`);
        if (cachedSelectedValues.length === 0) {
          setDimensionValues(prev => ({ ...prev, [channel]: [] }));
        }
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
        return;
      }

      // Fetch unique values from dimension_data table using pagination with timeout and limits
      const allDimData: any[] = [];
      const batchSize = 500; // Reduced from 1000 to prevent timeouts
      const maxRows = 50000; // Maximum rows to fetch to prevent infinite loops
      const timeoutMs = 30000; // 30 second timeout per batch
      let offset = 0;
      let hasMore = true;
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3;

      while (hasMore && allDimData.length < maxRows && !abortController.signal.aborted) {
        try {
          // Create timeout promise
          const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
          });

          // Race between query and timeout
          const queryPromise = supabase
            .from('dimension_data')
            .select('dimension_values')
            .eq('report_id', reportId)
            .range(offset, offset + batchSize - 1);

          let batchData: any[] | null = null;
          let dimError: any = null;
          
          try {
            const result = await Promise.race([
              queryPromise,
              timeoutPromise
            ]);
            batchData = result.data;
            dimError = result.error;
          } catch (timeoutErr: any) {
            if (timeoutErr.message === 'Request timeout') {
              throw timeoutErr;
            }
            throw timeoutErr;
          }

          if (abortController.signal.aborted) {
            console.log(`[loadValuesForDimension] Request cancelled for ${channel}/${dimensionId}`);
            return;
          }

          if (dimError) {
            consecutiveErrors++;
            console.error(`[loadValuesForDimension] Error fetching batch for ${channel} (attempt ${consecutiveErrors}/${maxConsecutiveErrors}):`, dimError);
            
            if (consecutiveErrors >= maxConsecutiveErrors) {
              console.error(`[loadValuesForDimension] Too many consecutive errors, stopping fetch`);
              break;
            }
            
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * consecutiveErrors));
            continue;
          }

          consecutiveErrors = 0; // Reset on success

          if (batchData && batchData.length > 0) {
            allDimData.push(...batchData);
            offset += batchSize;
            hasMore = batchData.length === batchSize;
            
            // Log progress for large datasets
            if (allDimData.length % 5000 === 0) {
              console.log(`[loadValuesForDimension] Loaded ${allDimData.length} rows for ${channel}/${dimensionId}...`);
            }
          } else {
            hasMore = false;
          }
        } catch (err: any) {
          if (abortController.signal.aborted) {
            console.log(`[loadValuesForDimension] Request cancelled for ${channel}/${dimensionId}`);
            return;
          }
          
          if (err.message === 'Request timeout') {
            console.warn(`[loadValuesForDimension] Timeout fetching batch at offset ${offset} for ${channel}`);
            consecutiveErrors++;
            
            if (consecutiveErrors >= maxConsecutiveErrors) {
              console.error(`[loadValuesForDimension] Too many timeouts, stopping fetch`);
              break;
            }
            
            // Try smaller batch size on timeout
            offset += Math.floor(batchSize / 2);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          
          console.error(`[loadValuesForDimension] Unexpected error:`, err);
          consecutiveErrors++;
          
          if (consecutiveErrors >= maxConsecutiveErrors) {
            break;
          }
        }
      }

      if (abortController.signal.aborted) {
        return;
      }

      if (allDimData.length >= maxRows) {
        console.warn(`[loadValuesForDimension] Reached maximum row limit (${maxRows}) for ${channel}/${dimensionId}. Some values may be missing.`);
      }

      const dimData = allDimData;

      if (!dimData || dimData.length === 0) {
        console.error(`[loadValuesForDimension] No dimension_data found for ${channel} (report: ${reportId})`);
        if (cachedSelectedValues.length === 0) {
          setDimensionValues(prev => ({ ...prev, [channel]: [] }));
        }
        return;
      }

      // Extract unique values for this dimension
      const valueSet = new Set<string>();
      
      // Start with cached selected values to ensure they're always included
      cachedSelectedValues.forEach(v => valueSet.add(v));
      
      dimData.forEach((row: any) => {
        const dimValues = row.dimension_values || {};
        const val = dimValues[dimensionId];
        if (val !== undefined && val !== null && val !== '') {
          const stringVal = String(val).trim();
          if (stringVal !== '') {
            valueSet.add(stringVal);
          }
        }
      });

      // Debug logging to help diagnose dimension value loading issues
      if (valueSet.size === 0 && dimData.length > 0) {
        const sampleRow = dimData[0];
        const sampleKeys = Object.keys(sampleRow.dimension_values || {});
        console.warn(`[loadValuesForDimension] No values found for dimension ${dimensionId} in ${channel}. Sample row keys:`, sampleKeys);
        console.warn(`[loadValuesForDimension] Looking for dimension ID: ${dimensionId}`);
        
        // Try to find dimension by name as fallback
        const dimInfo = dimensions[channel]?.find(d => d.id === dimensionId);
        if (dimInfo) {
          console.warn(`[loadValuesForDimension] Dimension name: ${dimInfo.name}. Checking if dimension_values uses name instead of ID...`);
        }
      }

      let values = Array.from(valueSet).sort();
      
      // For Metasearch Hotel dimension, filter to only Brady hotels (only for brady slide, not master-report)
      if (slideType === 'brady' && channel === 'metasearch' && dimensionId === '093ac487-dd90-4466-9972-ac51d110e91e') {
        values = values.filter(v => v.startsWith('Brady'));
      }

      // Cache the results
      dimensionValuesCache.set(cacheKey, values);
      
      setDimensionValues(prev => ({ ...prev, [channel]: values }));
      
      // Auto-select all Brady values for metasearch Hotel (only for brady slide, not master-report)
      if (slideType === 'brady' && channel === 'metasearch' && dimensionId === '093ac487-dd90-4466-9972-ac51d110e91e') {
        setChannelConfigs(prev => ({
          ...prev,
          [channel]: {
            ...prev[channel],
            selectedValues: values,
          },
        }));
      }
    } catch (err: any) {
      if (abortController.signal.aborted) {
        console.log(`[loadValuesForDimension] Request cancelled for ${channel}/${dimensionId}`);
        return;
      }
      
      console.error(`[loadValuesForDimension] CATCH Error for ${channel}/${dimensionId}:`, err);
      if (cachedSelectedValues.length === 0) {
        setDimensionValues(prev => ({ ...prev, [channel]: [] }));
      }
    } finally {
      // Only clear loading state if this request wasn't cancelled
      if (!abortController.signal.aborted) {
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
      }
      // Clear abort controller if this was the current request
      if (dimensionValueAbortControllerRef.current === abortController) {
        dimensionValueAbortControllerRef.current = null;
      }
    }
  }, [effectivePivotData, channelConfigs, slideType, dimensions, dimensionValuesCache, getReportIdForChannel]);

  // Update ref when loadValuesForDimension changes
  useEffect(() => {
    loadValuesForDimensionRef.current = loadValuesForDimension;
  }, [loadValuesForDimension]);

  // Load dimensions when entering step 3, 4, 5, or 6 (after Date and Channels steps)
  // Most loading is now done via preloadAllChannelData on step 2->3 transition
  // This effect is only needed as a fallback for edge cases
  useEffect(() => {
    if ((modalStep === 3 || modalStep === 4 || modalStep === 5 || modalStep === 6) && isEditSourceOpen) {
      selectedChannels.forEach(channel => {
        // Only load dimensions if not already loaded (preload should have already done this)
        if (dimensions[channel].length === 0 && !loadingDimensions[channel]) {
          loadDimensionsForChannel(channel);
        }
        
        // Only load values on step 4 if not already loaded and dimension is configured
        if (modalStep === 4 && channelConfigs[channel]?.dimensionId) {
          const existingValues = dimensionValues[channel] || [];
          if (existingValues.length === 0 && !loadingValues[channel]) {
            const dimensionId = channelConfigs[channel].dimensionId;
            setLoadingValues(prev => ({ ...prev, [channel]: true }));
            loadValuesForDimension(channel, dimensionId);
          }
        }
      });
    }
  }, [modalStep, isEditSourceOpen, selectedChannels, dimensions, loadingDimensions, channelConfigs, dimensionValues, loadingValues, loadDimensionsForChannel, loadValuesForDimension]);

  // Load breakdown dimensions when entering step 5
  useEffect(() => {
    if (modalStep === 5 && isEditSourceOpen) {
      selectedChannels.forEach(channel => {
        if (breakdownDimensions[channel].length === 0 && !loadingBreakdownDimensions[channel]) {
          loadBreakdownDimensionsForChannel(channel);
        }
      });
    }
  }, [modalStep, isEditSourceOpen, selectedChannels]);

  // Load breakdown dimensions on page load for display in the table dropdowns
  useEffect(() => {
    if (slideReportId && selectedChannels.length > 0) {
      selectedChannels.forEach(channel => {
        if (breakdownDimensions[channel].length === 0 && !loadingBreakdownDimensions[channel]) {
          loadBreakdownDimensionsForChannel(channel);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideReportId, selectedChannels]);

  // Handle dimension change
  const handleDimensionChange = (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    setChannelConfigs(prev => ({
      ...prev,
      [channel]: {
        dimensionId: dimensionId === "none" ? null : dimensionId,
        selectedValues: [],
      },
    }));
    setDimensionValues(prev => ({ ...prev, [channel]: [] }));
    if (dimensionId && dimensionId !== "none") {
      loadValuesForDimension(channel, dimensionId);
    }
  };

  // Handle value toggle
  const handleValueToggle = (channel: 'metasearch' | 'sem' | 'social', value: string) => {
    setChannelConfigs(prev => {
      const current = prev[channel];
      const isSelected = current.selectedValues.includes(value);
      return {
        ...prev,
        [channel]: {
          ...current,
          selectedValues: isSelected
            ? current.selectedValues.filter(v => v !== value)
            : [...current.selectedValues, value],
        },
      };
    });
  };

  // Handle select all values
  const handleSelectAllValues = (channel: 'metasearch' | 'sem' | 'social') => {
    const allValues = dimensionValues[channel] || [];
    setChannelConfigs(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        selectedValues: [...allValues],
      },
    }));
  };

  // Handle deselect all values
  const handleDeselectAllValues = (channel: 'metasearch' | 'sem' | 'social') => {
    setChannelConfigs(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        selectedValues: [],
      },
    }));
  };

  // Handle breakdown dimension toggle
  const handleBreakdownToggle = (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    setBreakdownConfigs(prev => {
      const current = prev[channel];
      const isSelected = current.breakdownDimensionIds.includes(dimensionId);
      return {
        ...prev,
        [channel]: {
          breakdownDimensionIds: isSelected
            ? current.breakdownDimensionIds.filter(id => id !== dimensionId)
            : [...current.breakdownDimensionIds, dimensionId],
        },
      };
    });
  };

  // Handle filter dimension toggle
  const handleFilterDimensionToggle = async (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    const currentConfig = filterConfigs?.[channel];
    const isSelected = currentConfig?.filterDimensionIds?.includes(dimensionId) || false;
    
    setFilterConfigs(prev => {
      const current = prev?.[channel] || { filterDimensionIds: [] };
      const currentIds = current.filterDimensionIds || [];
      const newFilterDimensionIds = isSelected
        ? currentIds.filter(id => id !== dimensionId)
        : [...currentIds, dimensionId];
      
      return {
        ...prev,
        [channel]: {
          filterDimensionIds: newFilterDimensionIds,
        },
      };
    });
    
    if (!isSelected) {
      // Dimension was just added, load its values using the helper function
      const values = await loadFilterDimensionValues(channel, dimensionId);
      // Store values for this specific dimension only
      setFilterDimensionValues(prev => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          [dimensionId]: values, // Only values for this dimensionId
        },
      }));
    } else {
      // Dimension was removed, clear its values and selected filter
      setFilterDimensionValues(prev => {
        const updated = { ...prev[channel] };
        delete updated[dimensionId];
        return {
          ...prev,
          [channel]: updated,
        };
      });
      setFilterValues(prev => {
        const updated = { ...prev[channel] };
        delete updated[dimensionId];
        return {
          ...prev,
          [channel]: updated,
        };
      });
    }
  };

  // Data loading cache to prevent redundant queries
  const filterValuesCache = useDataLoadingCache<string[]>({ ttl: 10 * 60 * 1000 }); // 10 minutes cache

  // Helper function to load filter dimension values for a specific dimension
  // Optimized to use fastest available data source: rawDataRows > filterUniqueValues > database
  // Now with caching to improve performance
  const loadFilterDimensionValues = useCallback(async (channel: 'metasearch' | 'sem' | 'social', filterDimId: string): Promise<string[]> => {
    // Check cache first
    const cacheKey = `${channel}-${filterDimId}`;
    const cached = filterValuesCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const reportId = getReportIdForChannel(channel);
    if (!reportId) {
      console.warn(`[loadFilterDimensionValues] No report ID for channel: ${channel}`);
      return [];
    }

    try {
      // FASTEST PATH: Use rawDataRows if available (already in memory, no DB query needed)
      const channelData = effectivePivotData?.channels?.[channel];
      const rawDataRows = (channelData as any)?.rawDataRows as any[] | undefined;
      
      if (rawDataRows && rawDataRows.length > 0) {
        const uniqueValues = new Set<string>();
        
        for (const row of rawDataRows) {
          const rowData = row.dimension_values || row;
          const value = rowData[filterDimId];
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            uniqueValues.add(String(value).trim());
          }
        }
        
        const sortedValues = Array.from(uniqueValues).sort();
        return sortedValues;
      }
      
      // FAST PATH: Use pre-computed filterUniqueValues from pivot_data
      const filterUniqueValues = (channelData as any)?.filterUniqueValues as Record<string, { name: string; values: string[] }> | undefined;
      if (filterUniqueValues?.[filterDimId]) {
        return filterUniqueValues[filterDimId].values;
      }

      // SLOW PATH: Fallback to database query (only if above methods unavailable)
      // Fetch all rows using pagination to ensure no values are missing
      const allDimData: any[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: batchData, error } = await supabase
          .from('dimension_data')
          .select('dimension_values')
          .eq('report_id', reportId)
          .range(offset, offset + batchSize - 1);
        
        if (error) {
          console.error(`[loadFilterDimensionValues] Error loading dimension_data batch for ${channel}/${filterDimId}:`, error);
          return [];
        }

        if (batchData && batchData.length > 0) {
          allDimData.push(...batchData);
          offset += batchSize;
          hasMore = batchData.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      if (allDimData.length === 0) {
        return [];
      }

      // Extract unique values only for this specific filter dimension ID
      const uniqueValues = new Set<string>();
      for (const row of allDimData) {
        const rowValues = row.dimension_values as Record<string, any>;
        // Only extract values for this specific filter dimension ID
        if (rowValues && rowValues[filterDimId] !== undefined && rowValues[filterDimId] !== null) {
          const value = String(rowValues[filterDimId]).trim();
          if (value !== '') {
            uniqueValues.add(value);
          }
        }
      }

      const sortedValues = Array.from(uniqueValues).sort();
      
      // Cache the result
      filterValuesCache.set(cacheKey, sortedValues);
      
      return sortedValues;
    } catch (error) {
      console.error(`[loadFilterDimensionValues] Error loading filter values for ${channel}/${filterDimId}:`, error);
      return [];
    }
  }, [effectivePivotData, filterValuesCache, getReportIdForChannel]);

  // Filtered values based on search query
  const filteredValues = useMemo(() => {
    if (!activeChannelTab) return [];
    const values = dimensionValues[activeChannelTab] || [];
    if (!searchQuery) return values;
    return values.filter(value =>
      value.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activeChannelTab, dimensionValues, searchQuery]);

  // KPI names used in the slide view - these should be auto-selected
  const SLIDE_KPI_NAMES = [
    'Impressions',
    'Clicks',
    'CTR',
    'Bookings',
    'Conversion Rate',
    'CPC',
    'Cost',
    'Revenue',
    'ROAS',
    'Cost of sale',
  ];

  // Load available dimensions from database for all selected channels
  // Only load VALUE dimensions (number, currency, percentage) - not text or date
  const loadAvailableDimensions = async () => {
    setLoadingAvailableDimensions(true);
    try {
      // Fetch global VALUE dimensions (number, currency, percentage) - these are the metrics
      const { data: dims, error } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .eq('scope', 'global')
        .in('type', ['number', 'currency', 'percentage'])
        .order('name');
      
      if (error) {
        console.error('Error loading dimensions:', error);
        return;
      }

      const dimensionList = dims || [];
      
      // Set same dimensions for all channels (global value dimensions)
      setAvailableDimensions({
        metasearch: dimensionList,
        sem: dimensionList,
        social: dimensionList,
      });

      // Auto-select dimensions that match the KPIs used in the slide
      // Only if no saved configuration exists (check if current selection is default/empty)
      const currentSelected = selectedValueDimensionIds;
      const currentDefaultIds = defaultValueDimensionIds;
      const isDefaultOrEmpty = currentSelected.length === 0 || 
        (currentSelected.length === currentDefaultIds.length && 
         currentSelected.every(id => currentDefaultIds.includes(id)));
      
      if (isDefaultOrEmpty) {
        // Find dimension IDs that match the KPI names
        const kpiDimensionIds = dimensionList
          .filter(dim => SLIDE_KPI_NAMES.some(kpiName => 
            dim.name.toLowerCase() === kpiName.toLowerCase() ||
            dim.name.toLowerCase() === kpiName.toLowerCase().replace(' ', '')
          ))
          .map(dim => dim.id);
        
        if (kpiDimensionIds.length > 0) {
          setSelectedValueDimensionIds(kpiDimensionIds);
        } else if (currentSelected.length === 0) {
          // If no KPI matches found and nothing is selected, use all available VALUE dimensions
          const allValueDimIds = dimensionList
            .filter(dim => ['number', 'currency', 'percentage'].includes(dim.type))
            .map(dim => dim.id);
          if (allValueDimIds.length > 0) {
            setSelectedValueDimensionIds(allValueDimIds);
          }
        }
      }
    } catch (error) {
      console.error('Error loading available dimensions:', error);
    } finally {
      setLoadingAvailableDimensions(false);
    }
  };

  // Handle dimension selection toggle (applies to all channels)
  const handleValueDimensionToggle = (dimensionId: string) => {
    setSelectedValueDimensionIds(prev => 
      prev.includes(dimensionId)
        ? prev.filter(id => id !== dimensionId)
        : [...prev, dimensionId]
    );
  };

  // Select all available dimensions
  const handleSelectAllDimensions = () => {
    const allDimIds = availableDimensions.metasearch?.map(d => d.id) || [];
    setSelectedValueDimensionIds(allDimIds);
  };

  // Deselect all dimensions
  const handleDeselectAllDimensions = () => {
    setSelectedValueDimensionIds([]);
  };

  // (Removed) Preloading all channel values on Step 2 -> Step 3.
  // We now load values lazily when the user selects a dimension in Step 4 (Data Source).

  // Navigation handlers
  const handleNext = async () => {
    if (modalStep === 1) {
      // Date step -> Channels step
      setModalStep(2);
      return;
    }

    if (modalStep === 2) {
      if (selectedChannels.length > 0) {
        // Keep Step 2 fast: only load the dimension *list* needed for Step 3.
        // Values are loaded later (Step 4) when a dimension is selected.
        await loadAvailableDimensions();
        setModalStep(3);
      }
      return;
    }

    if (modalStep === 3) {
      setModalStep(4);
      return;
    }

    if (modalStep === 4) {
      setModalStep(5);
      return;
    }

    if (modalStep === 5) {
      setModalStep(6);
      return;
    }

    if (modalStep === 6) {
      // Save and close
      handleSave();
    }
  };

  const handleBack = () => {
    if (modalStep === 2) {
      setModalStep(1);
    } else if (modalStep === 3) {
      setModalStep(2);
    } else if (modalStep === 4) {
      setModalStep(3);
    } else if (modalStep === 5) {
      setModalStep(4);
    } else if (modalStep === 6) {
      setModalStep(5);
    }
  };

  const handleSave = async () => {
    if (!accountId || !user) {
      console.error('Cannot save: missing accountId or user');
      setIsEditSourceOpen(false);
      resetModalState();
      return;
    }

    // Close modal immediately for better UX - save happens in background
    setIsEditSourceOpen(false);

    try {
      // Filter selectedChannels to only include channels that have report IDs
      const validSelectedChannels = selectedChannels.filter(channel => {
        const hasReportId = !!accountReportIds[channel];
        if (!hasReportId) {
          console.warn(`[handleSave] Filtering out channel ${channel} - no report ID found for this account`);
        }
        return hasReportId;
      });

      // Validate that at least one channel is selected
      if (validSelectedChannels.length === 0) {
        toast({
          title: "Error",
          description: "Please select at least one channel that has a report configured for this account.",
          variant: "destructive",
        });
        setIsEditSourceOpen(true); // Reopen modal so user can fix
        return;
      }

      // Filter channel configs, breakdown configs, and filter configs to only include valid channels
      const filteredChannelConfigs: Record<string, ChannelConfig> = {};
      const filteredBreakdownConfigs: Record<string, BreakdownConfig> = {};
      const filteredFilterConfigs: Record<string, FilterConfig> = {};

      for (const channel of validSelectedChannels) {
        if (channelConfigs[channel]) {
          filteredChannelConfigs[channel] = channelConfigs[channel];
        }
        if (breakdownConfigs[channel]) {
          filteredBreakdownConfigs[channel] = breakdownConfigs[channel];
        }
        if (filterConfigs[channel]) {
          filteredFilterConfigs[channel] = filterConfigs[channel];
        }
      }

      // Build configuration object with dimension mappings (only valid channels)
      const configuration: SlideReportConfiguration = {
        selectedChannels: validSelectedChannels,
        selectedValueDimensionIds: selectedValueDimensionIds,
        channelConfigs: filteredChannelConfigs,
        breakdownConfigs: filteredBreakdownConfigs,
        filterConfigs: filteredFilterConfigs,
      };

      // Use account-specific report IDs
      const reportIds: Record<string, string> = {};
      for (const channel of validSelectedChannels) {
        const reportId = accountReportIds[channel];
        if (!reportId) {
          // This shouldn't happen since we filtered above, but double-check
          console.error(`[handleSave] No report ID found for channel ${channel} in account ${accountId}`);
          toast({
            title: "Error",
            description: `No report found for ${channel} channel. Please ensure reports are set up for this account.`,
            variant: "destructive",
          });
          return;
        }
        reportIds[channel] = reportId;
      }

      // Calculate date range using sinceMonth and sinceYear
      const monthNumber = new Date(`${sinceMonth} 1, ${sinceYear}`).getMonth();
      const dateRange: SlideReportDateRange = {
        year: sinceYear,
        month: sinceMonth,
        from: new Date(sinceYear, monthNumber, 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0], // Current date
      };

      // Save or update slide report
      if (slideReportId) {
        // Update existing slide report
        await updateSlideReport.mutateAsync({
          id: slideReportId,
          configuration,
          report_ids: reportIds,
          date_range: dateRange,
        });
      } else {
        // Create new slide report
        const reportName = slideType === 'master-report' 
          ? 'Master Report' 
          : `Brady Hotels - Since ${sinceMonth} ${sinceYear}`;
        const newReport = await createSlideReport.mutateAsync({
          name: reportName,
          account_id: accountId,
          user_id: user.id,
          configuration,
          report_ids: reportIds,
          date_range: dateRange,
        });
        setSlideReportId(newReport.id);
      }

      // Update the display state to match the saved configuration
      setSelectedYear(sinceYear.toString());
      setSelectedMonth(sinceMonth);

      toast({
        title: "Configuration saved",
        description: "Your report settings have been saved. Click 'Refresh Data' to fetch updated data.",
      });

      // Load filter dimension values in background after save (don't block)
      loadFilterDimensionValuesAfterSave(selectedChannels, filterConfigs);

    } catch (error) {
      console.error('Error saving slide report configuration:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Get available views (default + saved views)
  const availableViews = useMemo(() => {
    return [
      { id: null, name: 'Master' },
      ...views.map(v => ({ id: v.id, name: v.name }))
    ];
  }, [views]);

  // Save current filter configuration as a view
  const handleSaveView = useCallback(async (viewName: string) => {
    if (!slideReportId || !slideReport || !user) {
      toast({
        title: "Error",
        description: "No report selected. Please configure your report first.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createView.mutateAsync({
        slide_report_id: slideReportId,
        account_id: accountId || null,
        user_id: user.id,
        name: viewName,
        selected_year: selectedYear,
        selected_month: selectedMonth,
        comparison_type: comparisonType as 'none' | 'previous_period' | 'previous_year',
        chart_time_range: chartTimeRange,
        price_check_chart_time_range: priceCheckChartTimeRange,
        filter_values: { ...filterValues }, // Deep copy to avoid mutations
      });

      // The view will be automatically refetched by the query
      // We'll select it after the query refetches
      queryClient.invalidateQueries({ queryKey: ['slide_report_views', 'list', slideReportId] });
      
      // Use a small delay to allow the query to refetch, then find and select the new view
      setTimeout(() => {
        const updatedViews = queryClient.getQueryData<any[]>(['slide_report_views', 'list', slideReportId]) || [];
        const newView = updatedViews.find(v => v.name === viewName);
        if (newView) {
          setSelectedViewId(newView.id);
        }
      }, 300);
    } catch (error) {
      // Error toast is handled by the mutation
      console.error('Error saving view:', error);
    }
  }, [slideReportId, slideReport, user, accountId, selectedYear, selectedMonth, comparisonType, chartTimeRange, priceCheckChartTimeRange, filterValues, createView, views, queryClient]);

  // Update an existing view
  const handleUpdateView = useCallback(async (viewId: string) => {
    if (!slideReportId || !slideReport || !user) {
      toast({
        title: "Error",
        description: "No report selected. Please configure your report first.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateView.mutateAsync({
        id: viewId,
        selected_year: selectedYear,
        selected_month: selectedMonth,
        comparison_type: comparisonType as 'none' | 'previous_period' | 'previous_year',
        chart_time_range: chartTimeRange,
        price_check_chart_time_range: priceCheckChartTimeRange,
        filter_values: { ...filterValues }, // Deep copy to avoid mutations
      });

      // The view will be automatically refetched by the query
      queryClient.invalidateQueries({ queryKey: ['slide_report_views', 'list', slideReportId] });
    } catch (error) {
      // Error toast is handled by the mutation
      console.error('Error updating view:', error);
    }
  }, [slideReportId, slideReport, user, selectedYear, selectedMonth, comparisonType, chartTimeRange, priceCheckChartTimeRange, filterValues, updateView, queryClient]);

  // Apply a saved view
  const handleApplyView = useCallback((viewId: string | null) => {
    isApplyingViewRef.current = true; // Mark that we're applying a view
    
    if (!viewId || viewId === 'unsaved') {
      // Master view - reset to defaults; keep Year and Month as-is
      setComparisonType('none');
      setChartTimeRange('last_6_months');
      setPriceCheckChartTimeRange('last_6_months');
      setFilterValues({
        metasearch: {},
        sem: {},
        social: {},
        'price-check': {},
        'booking': {},
      });
      return;
    }

    const view = views.find(v => v.id === viewId);
    if (!view) {
      toast({
        title: "Error",
        description: "View not found.",
        variant: "destructive",
      });
      isApplyingViewRef.current = false;
      return;
    }
    
    // Apply view settings; do not change Year or Month — user keeps current filters
    setComparisonType(view.comparison_type);
    if (view.chart_time_range) {
      setChartTimeRange(view.chart_time_range);
    } else {
      setChartTimeRange('last_6_months'); // Default
    }
    if (view.price_check_chart_time_range) {
      setPriceCheckChartTimeRange(view.price_check_chart_time_range);
    } else {
      setPriceCheckChartTimeRange('last_6_months'); // Default
    }
    // Apply filter values - this will filter the data on all tabs including Overview
    setFilterValues(view.filter_values || {
      metasearch: {},
      sem: {},
      social: {},
      'price-check': {},
      'booking': {},
    });

    toast({
      title: "View applied",
      description: `View "${view.name}" has been applied.`,
    });
  }, [views]);

  // Delete a saved view
  const handleDeleteView = useCallback(async (viewId: string) => {
    if (!viewId) {
      toast({
        title: "Error",
        description: "Cannot delete the default view.",
        variant: "destructive",
      });
      return;
    }

    try {
      await deleteView.mutateAsync(viewId);

      // If deleted view was selected, switch to default
      if (selectedViewId === viewId) {
        setSelectedViewId(null);
      }
    } catch (error) {
      // Error toast is handled by the mutation
      console.error('Error deleting view:', error);
    }
  }, [selectedViewId, deleteView]);

  // Apply view when selectedViewId changes (e.g., after saving a new view)
  // Note: The main application happens in handleApplyView which is called from the Select onChange
  useEffect(() => {
    if (selectedViewId && selectedViewId !== 'unsaved' && views.length > 0) {
      // Only apply if views are loaded and we have a valid view ID (not Unsaved)
      const view = views.find(v => v.id === selectedViewId);
      if (view) {
        isApplyingViewRef.current = true;
        // Apply view settings; do not change Year or Month
        setComparisonType(view.comparison_type);
        if (view.chart_time_range) {
          setChartTimeRange(view.chart_time_range);
        } else {
          setChartTimeRange('last_6_months');
        }
        if (view.price_check_chart_time_range) {
          setPriceCheckChartTimeRange(view.price_check_chart_time_range);
        } else {
          setPriceCheckChartTimeRange('last_6_months');
        }
        setFilterValues(view.filter_values || {
          metasearch: {},
          sem: {},
          social: {},
          'price-check': {},
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedViewId, views.length]);

  // Background loader for filter dimension values after save
  const loadFilterDimensionValuesAfterSave = async (
    channels: ('metasearch' | 'sem' | 'social')[],
    configs: Record<string, FilterConfig>
  ) => {
    const updatedFilterDimensionValues: Record<string, Record<string, string[]>> = {};
    
    // Load all values in parallel for faster loading
    const loadPromises: Promise<void>[] = [];
    
    for (const channel of channels) {
      const filterDimIds = configs[channel]?.filterDimensionIds || [];
      if (filterDimIds.length === 0) continue;
      
      updatedFilterDimensionValues[channel] = {};
      
      for (const filterDimId of filterDimIds) {
        loadPromises.push(
          loadFilterDimensionValues(channel, filterDimId).then(values => {
            updatedFilterDimensionValues[channel][filterDimId] = values;
          })
        );
      }
    }
    
    await Promise.all(loadPromises);
    
    if (Object.keys(updatedFilterDimensionValues).length > 0) {
      setFilterDimensionValues(prev => ({ ...prev, ...updatedFilterDimensionValues }));
    }
  };

  // Load saved configuration into modal state, including dimension values
  const loadSavedConfigurationIntoModal = async () => {
    if (!slideReport?.configuration) {
      return;
    }

    const config = slideReport.configuration;
    
    // Ensure we have available channels loaded before proceeding
    if (availableChannels.length === 0) {
      console.warn('[loadSavedConfigurationIntoModal] No available channels, skipping load');
      return;
    }

    // Filter selectedChannels to only include channels that have reports
    const validSelectedChannels = (config.selectedChannels || []).filter(channel => 
      availableChannels.includes(channel)
    );

    // Load basic configuration - filter to only include channels that have reports
    if (config.selectedChannels) {
      setSelectedDimensions({
        metasearch: validSelectedChannels.includes('metasearch'),
        sem: validSelectedChannels.includes('sem'),
        social: validSelectedChannels.includes('social'),
      });
    } else {
      // Initialize based on available channels if no saved config
      setSelectedDimensions({
        metasearch: availableChannels.includes('metasearch'),
        sem: availableChannels.includes('sem'),
        social: availableChannels.includes('social'),
      });
    }
    if (config.selectedValueDimensionIds) {
      setSelectedValueDimensionIds(config.selectedValueDimensionIds);
    }
    
    // Filter channel configs, breakdown configs, and filter configs to only include valid channels
    const filteredChannelConfigs: Record<string, ChannelConfig> = {};
    const filteredBreakdownConfigs: Record<string, BreakdownConfig> = {};
    const filteredFilterConfigs: Record<string, FilterConfig> = {};
    
    for (const channel of validSelectedChannels) {
      if (config.channelConfigs?.[channel]) {
        filteredChannelConfigs[channel] = config.channelConfigs[channel];
      }
      if (config.breakdownConfigs?.[channel]) {
        filteredBreakdownConfigs[channel] = config.breakdownConfigs[channel];
      }
      if (config.filterConfigs?.[channel]) {
        filteredFilterConfigs[channel] = config.filterConfigs[channel];
      }
    }
    
    setChannelConfigs(filteredChannelConfigs);
    setBreakdownConfigs(filteredBreakdownConfigs);
    setFilterConfigs(filteredFilterConfigs);
    
    // Reload date range
    if (slideReport.date_range) {
      setSinceMonth(slideReport.date_range.month);
      setSinceYear(slideReport.date_range.year);
    }

    // Load dimension values for each channel's selected dimension (only valid channels)
    for (const channel of validSelectedChannels) {
      const channelConfig = filteredChannelConfigs[channel];
      if (channelConfig?.dimensionId) {
        await loadValuesForDimension(channel, channelConfig.dimensionId);
      }
    }

    // Load filter dimension values for each channel using the helper function (only valid channels)
    const updatedFilterDimensionValues: Record<string, Record<string, string[]>> = {};
    for (const channel of validSelectedChannels) {
      const filterConfig = filteredFilterConfigs[channel];
      if (filterConfig?.filterDimensionIds && filterConfig.filterDimensionIds.length > 0) {
        updatedFilterDimensionValues[channel] = {};
        for (const filterDimId of filterConfig.filterDimensionIds) {
          // Load values for this filter dimension using the helper function
          const values = await loadFilterDimensionValues(channel, filterDimId);
          updatedFilterDimensionValues[channel][filterDimId] = values;
        }
      }
    }
    setFilterDimensionValues(prev => ({ ...prev, ...updatedFilterDimensionValues }));

    // Load breakdown dimensions for each channel (only valid channels)
    for (const channel of validSelectedChannels) {
      await loadBreakdownDimensionsForChannel(channel);
    }
  };

  const resetModalState = () => {
    setModalStep(1);
    setActiveChannelTab(null);
    setSearchQuery("");
    
    // Reload from saved slideReport configuration instead of resetting to defaults
    // But filter to only include channels that have reports
    if (slideReport?.configuration) {
      const config = slideReport.configuration;
      if (config.selectedChannels) {
        // Filter to only include channels that have reports
        const validChannels = config.selectedChannels.filter(channel => 
          availableChannels.includes(channel)
        );
        setSelectedDimensions({
          metasearch: validChannels.includes('metasearch'),
          sem: validChannels.includes('sem'),
          social: validChannels.includes('social'),
        });
      }
      if (config.selectedValueDimensionIds) {
        setSelectedValueDimensionIds(config.selectedValueDimensionIds);
      }
      if (config.channelConfigs) {
        setChannelConfigs(config.channelConfigs as any);
      }
      if (config.breakdownConfigs) {
        setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
      }
      if (config.filterConfigs) {
        setFilterConfigs(config.filterConfigs as any);
      }
      // Reload date range
      if (slideReport.date_range) {
        setSinceMonth(slideReport.date_range.month);
        setSinceYear(slideReport.date_range.year);
      }
    } else {
      // No saved config, reset to defaults based on available channels
      setSelectedValueDimensionIds(defaultValueDimensionIds);
      setSelectedDimensions({
        metasearch: availableChannels.includes('metasearch'),
        sem: availableChannels.includes('sem'),
        social: availableChannels.includes('social'),
      });
      
      // Initialize configs only for available channels
      const initialChannelConfigs: Record<string, ChannelConfig> = {};
      const initialBreakdownConfigs: Record<string, BreakdownConfig> = {};
      const initialFilterConfigs: Record<string, FilterConfig> = {};
      
      for (const channel of availableChannels) {
        initialChannelConfigs[channel] = { dimensionId: null, selectedValues: [] };
        initialBreakdownConfigs[channel] = { breakdownDimensionIds: [] };
        initialFilterConfigs[channel] = { filterDimensionIds: [] };
      }
      
      setChannelConfigs(initialChannelConfigs);
      setBreakdownConfigs(initialBreakdownConfigs);
      setFilterConfigs(initialFilterConfigs);
    }
  };

  const handleModalClose = async (open: boolean) => {
    setIsEditSourceOpen(open);
    // Note: onOpen/onClose callbacks in useEditSourceModal handle the rest
  };

  // Handle Refresh Data with step-by-step modal
  const handleRefreshDataWithModal = async () => {
    // Step 1: Verify Edit Source settings are saved before proceeding
    if (!slideReportId) {
      toast({
        title: "No configuration",
        description: "Please save your configuration in Edit Source first.",
        variant: "destructive",
      });
      return;
    }

    // Verify configuration exists and is valid
    if (!slideReport?.configuration) {
      toast({
        title: "Configuration missing",
        description: "Please save your configuration in Edit Source first.",
        variant: "destructive",
      });
      return;
    }

    if (!slideReport?.date_range) {
      toast({
        title: "Date range missing",
        description: "Please set a date range in Edit Source first.",
        variant: "destructive",
      });
      return;
    }

    // Open modal and reset state - now with 5 clear steps
    setIsRefreshModalOpen(true);
    setRefreshStep(1);
    setRefreshError(null);
    setRefreshStepStatus({
      1: 'loading',
      2: 'pending',
      3: 'pending',
      4: 'pending',
      5: 'pending',
    });

    const config = slideReport.configuration as SlideReportConfiguration;
    const validChannels = (config.selectedChannels || []).filter(channel =>
      availableChannels.includes(channel)
    );

    try {
      setRefreshStepStatus(prev => ({ ...prev, 1: 'loading' }));
      const { data: latestReport, error: fetchError } = await supabase
        .from("slide_reports")
        .select("*")
        .eq("id", slideReportId)
        .single();
      if (fetchError) throw fetchError;
      if (!latestReport?.configuration || !latestReport?.date_range) {
        throw new Error("Configuration or date range not found. Please save Edit Source settings first.");
      }
      if (validChannels.length === 0) {
        throw new Error("No valid channels found. Please configure at least one channel with a report in Edit Source.");
      }

      setRefreshStepStatus(prev => ({ ...prev, 1: 'complete', 2: 'loading' }));
      setRefreshStep(2);

      const now = new Date();
      // End of range: selected month/year if set, otherwise current month/year
      const useSelectedMonth = selectedMonth && selectedMonth !== 'all' && selectedYear && selectedYear !== 'all';
      const endYear = useSelectedMonth ? parseInt(selectedYear, 10) : now.getFullYear();
      const endMonth = useSelectedMonth ? MONTH_NAMES.indexOf(selectedMonth) + 1 : now.getMonth() + 1;

      // Build list of months from sinceMonth/sinceYear through end (inclusive)
      const startMonthNum = MONTH_NAMES.indexOf(sinceMonth) + 1; // 1-12
      const monthsToRefresh: { year: number; month: number }[] = [];
      for (let y = sinceYear; y <= endYear; y++) {
        const mStart = y === sinceYear ? startMonthNum : 1;
        const mEnd = y === endYear ? endMonth : 12;
        for (let m = mStart; m <= mEnd; m++) {
          monthsToRefresh.push({ year: y, month: m });
        }
      }

      if (monthsToRefresh.length === 0) {
        throw new Error('No months to refresh for the selected date range.');
      }

      const headers: Record<string, string> = {};
      const apiKey = import.meta.env.VITE_REFRESH_SLIDE_REPORT_API_KEY;
      if (apiKey) headers['x-api-key'] = apiKey;

      for (const { year: refreshYear, month: refreshMonth } of monthsToRefresh) {
        const { data: result, error: invokeError } = await supabase.functions.invoke('refresh-slide-report', {
          body: { slideReportId, year: refreshYear, month: refreshMonth },
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        });

        if (invokeError) throw invokeError;
        const response = result as { success?: boolean; error?: string; summary?: string } | null;
        if (response && response.success === false) {
          throw new Error(response.error || 'Refresh failed');
        }
      }

      setRefreshStepStatus(prev => ({ ...prev, 2: 'complete', 3: 'complete', 4: 'complete', 5: 'loading' }));
      setRefreshStep(5);

      queryClient.invalidateQueries({ queryKey: ['slide_reports', 'detail', slideReportId] });
      queryClient.invalidateQueries({ queryKey: ['slide_report_channel_data', slideReportId] });
      await queryClient.refetchQueries({
        queryKey: ['slide_reports', 'detail', slideReportId],
        type: 'active',
      });
      if (accountId) {
        queryClient.invalidateQueries({ queryKey: ['slide_reports', 'list', accountId] });
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedReport = queryClient.getQueryData<SlideReport>(['slide_reports', 'detail', slideReportId]);
      if (updatedReport?.pivot_data && updatedReport.configuration) {
        const { values: updatedFilterDimensionValues, names: updatedFilterDimensionNames } =
          extractFilterDimensionValues(
            updatedReport.pivot_data as SlideReportPivotData,
            updatedReport.configuration as SlideReportConfiguration,
            validChannels
          );
        setFilterDimensionValues(prev => ({ ...prev, ...updatedFilterDimensionValues }));
        setFilterDimensionNames(prev => ({ ...prev, ...updatedFilterDimensionNames }));
      }

      setRefreshStepStatus(prev => ({ ...prev, 5: 'complete' }));
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRefreshModalOpen(false);

      const first = monthsToRefresh[0];
      const last = monthsToRefresh[monthsToRefresh.length - 1];
      const rangeLabel =
        monthsToRefresh.length === 1
          ? `${new Date(first.year, first.month - 1).toLocaleString('default', { month: 'long' })} ${first.year}`
          : `${new Date(first.year, first.month - 1).toLocaleString('default', { month: 'long' })} ${first.year} – ${new Date(last.year, last.month - 1).toLocaleString('default', { month: 'long' })} ${last.year}`;
      toast({
        title: "Data refreshed",
        description: `Refreshed ${monthsToRefresh.length} month(s) (${rangeLabel}) for ${validChannels.length} channel(s).`,
      });
    } catch (error) {
      console.error("[refresh] Error:", error);
      const currentStep = refreshStep;
      
      // Normalize error message using optimized helper
      const errorMessage = normalizeErrorMessage(error);
      
      setRefreshStepStatus(prev => ({ ...prev, [currentStep]: 'error' }));
      setRefreshError(errorMessage);
      
      toast({
        title: "Refresh failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Get comparison data based on selection - use comparisonTotals from hook (same source of truth)
  const comparisonData = useMemo(() => {
    if (!comparisonTotals) {
      return null;
    }
    
    // Aggregate comparison totals from all channels (same source as current data)
    const overview = {
      impressions: (comparisonTotals.metasearch?.impressions || 0) + (comparisonTotals.sem?.impressions || 0) + (comparisonTotals.social?.impressions || 0),
      clicks: (comparisonTotals.metasearch?.clicks || 0) + (comparisonTotals.sem?.clicks || 0) + (comparisonTotals.social?.clicks || 0),
      cost: (comparisonTotals.metasearch?.cost || 0) + (comparisonTotals.sem?.cost || 0) + (comparisonTotals.social?.cost || 0),
      revenue: (comparisonTotals.metasearch?.revenue || 0) + (comparisonTotals.sem?.revenue || 0) + (comparisonTotals.social?.revenue || 0),
      bookings: (comparisonTotals.metasearch?.bookings || 0) + (comparisonTotals.sem?.bookings || 0) + (comparisonTotals.social?.bookings || 0),
    };
    
    // Calculate derived metrics for consistency with current data calculation
    const derived = calculateDerivedMetrics(overview);
    
    if (comparisonType === "previous_period") {
      return {
        ...overview,
        ...derived,
        label: "vs Previous Period",
      };
    } else if (comparisonType === "previous_year") {
      return {
        ...overview,
        ...derived,
        label: "vs Previous Year",
      };
    }
    return null;
  }, [comparisonTotals, comparisonType]);

  // Calculate current metrics from currentTotals using hook
  const currentMetrics = useOverviewMetrics(currentTotals as { metasearch: MetricData; sem: MetricData; social: MetricData });

  // Calculate comparison metrics using hook
  const comparisonMetricsHook = useComparisonMetrics(
    comparisonTotals as { metasearch: MetricData; sem: MetricData; social: MetricData } | null,
    comparisonType as 'none' | 'previous_period' | 'previous_year'
  );
  
  // Fallback to comparisonData if hook returns null (for backward compatibility)
  const comparisonMetrics = useMemo(() => {
    if (comparisonMetricsHook) return comparisonMetricsHook;
    if (!comparisonData) return null;
    
    // comparisonData should always have base metrics and derived metrics after our fix
    // Type assertion to ensure TypeScript knows the structure
    const data = comparisonData as {
      impressions: number;
      clicks: number;
      cost: number;
      revenue: number;
      bookings: number;
      ctr?: number;
      conversionRate?: number;
      cpc?: number;
      roas?: number;
      costOfSale?: number;
    };
    
    // If derived metrics are already calculated, use them
    if (data.ctr !== undefined && data.cpc !== undefined && data.roas !== undefined) {
      return {
        impressions: data.impressions || 0,
        clicks: data.clicks || 0,
        bookings: data.bookings || 0,
        ctr: data.ctr || 0,
        conversionRate: data.conversionRate || 0,
        cpc: data.cpc || 0,
        cost: data.cost || 0,
        revenue: data.revenue || 0,
        roas: data.roas || 0,
        costOfSale: data.costOfSale || 0,
      };
    }
    
    // Fallback: calculate derived metrics (shouldn't happen after our fix, but keep for safety)
    return {
      impressions: data.impressions || 0,
      clicks: data.clicks || 0,
      bookings: data.bookings || 0,
      ctr: (data.impressions || 0) > 0 ? ((data.clicks || 0) / (data.impressions || 1)) * 100 : 0,
      conversionRate: (data.clicks || 0) > 0 ? ((data.bookings || 0) / (data.clicks || 1)) * 100 : 0,
      cpc: (data.clicks || 0) > 0 ? (data.cost || 0) / (data.clicks || 1) : 0,
      cost: data.cost || 0,
      revenue: data.revenue || 0,
      roas: (data.cost || 0) > 0 ? (data.revenue || 0) / (data.cost || 1) : 0,
      costOfSale: (data.revenue || 0) > 0 ? ((data.cost || 0) / (data.revenue || 1)) * 100 : 0,
    };
  }, [comparisonMetricsHook, comparisonData]);

  // KPI Cards - using hook
  const KPI_CARDS = useKPICards(currentMetrics);

  // Generate KPI cards for specific report - using hook
  const getReportKPICards = useReportKPICards();

  // Get channel-specific comparison data - calculate for each channel
  const metasearchComparisonMetrics = useChannelComparisonMetrics(
    'metasearch',
    comparisonTotals as { metasearch: MetricData; sem: MetricData; social: MetricData } | null,
    comparisonType as 'none' | 'previous_period' | 'previous_year'
  );
  const semComparisonMetrics = useChannelComparisonMetrics(
    'sem',
    comparisonTotals as { metasearch: MetricData; sem: MetricData; social: MetricData } | null,
    comparisonType as 'none' | 'previous_period' | 'previous_year'
  );
  const socialComparisonMetrics = useChannelComparisonMetrics(
    'social',
    comparisonTotals as { metasearch: MetricData; sem: MetricData; social: MetricData } | null,
    comparisonType as 'none' | 'previous_period' | 'previous_year'
  );
  
  const getChannelComparisonMetrics = useCallback((channel: 'metasearch' | 'sem' | 'social') => {
    if (channel === 'metasearch') return metasearchComparisonMetrics;
    if (channel === 'sem') return semComparisonMetrics;
    if (channel === 'social') return socialComparisonMetrics;
    return null;
  }, [metasearchComparisonMetrics, semComparisonMetrics, socialComparisonMetrics]);

  // Get overview comparison metrics - using hook
  const getOverviewComparisonMetrics = useCallback(() => {
    return comparisonMetricsHook;
  }, [comparisonMetricsHook]);

  // Skeleton loader for KPI Cards - memoized
  const renderKPICardsSkeleton = useCallback(() => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {Array.from({ length: 10 }).map((_, index) => (
        <Card key={index} className="shadow-sm border-l-4 border-l-primary/60 bg-card">
          <CardContent className="p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  ), []);

  // Skeleton loader for Chart - memoized
  const renderChartSkeleton = useCallback(() => (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-[150px]" />
      </CardHeader>
      <CardContent>
        <div className="h-[250px] flex items-center justify-center">
          <Skeleton className="h-full w-full" />
        </div>
      </CardContent>
    </Card>
  ), []);

  // Skeleton loader for Table - memoized
  const renderTableSkeleton = useCallback(() => (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: 11 }).map((_, index) => (
                <TableHead key={index} className={index > 0 ? "text-right" : ""}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: 11 }).map((_, colIndex) => (
                  <TableCell key={colIndex} className={colIndex > 0 ? "text-right" : ""}>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  ), []);

  // Memoized render function for KPI Cards
  const renderKPICards = useCallback((cards: typeof KPI_CARDS, channelCompMetrics?: ReturnType<typeof getChannelComparisonMetrics>) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {cards.map((kpi) => {
        // Use channel-specific comparison if provided, otherwise fall back to global
        const effectiveCompMetrics = channelCompMetrics !== undefined ? channelCompMetrics : comparisonMetrics;
        const compValue = effectiveCompMetrics ? effectiveCompMetrics[kpi.key as keyof typeof effectiveCompMetrics] : null;
        
        // Calculate percent change - only if both values are valid numbers
        let percentChange: number | null = null;
        if (compValue !== null && compValue !== undefined && typeof compValue === 'number' && !isNaN(compValue)) {
          // Only calculate percentage if comparison value is meaningful (not 0)
          // If comparison is 0, it likely means:
          // 1. No data in comparison period (shouldn't show percentage)
          // 2. Filters don't match comparison period (shouldn't show percentage)
          if (compValue === 0) {
            // Don't show percentage when comparison is 0 - it's misleading
            // (would show 100% even though there's no meaningful comparison)
            percentChange = null;
          } else {
            // Calculate percentage change when we have a valid comparison value
            percentChange = calculatePercentChange(kpi.value, compValue);
          }
          
          // Hide percentage if both values are exactly 0 (no meaningful comparison)
          if (kpi.value === 0 && compValue === 0) {
            percentChange = null;
          }
        }
        
        const isPositive = percentChange !== null && percentChange >= 0;
        // For cost metrics, lower is better
        const isCostMetric = ['cpc', 'cost', 'costOfSale'].includes(kpi.key);
        const isGood = isCostMetric ? !isPositive : isPositive;
        const compLabel = channelCompMetrics?.label || comparisonData?.label;
        
        return (
          <Card key={kpi.label} className="shadow-sm border-l-4 border-l-primary/60 bg-card">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {kpi.label}
              </p>
              <div className="text-2xl font-bold text-foreground">
                {kpi.format === "currency" 
                  ? kpi.key === "cpc" && kpi.value < 0.01
                    ? `$${kpi.value.toFixed(4)}`
                    : `$${formatNumber(kpi.value)}`
                  : kpi.format === "percent"
                  ? kpi.key === "costOfSale" && kpi.value < 0.01
                    ? `${kpi.value.toFixed(4)}%`
                    : `${kpi.value.toFixed(2)}%`
                  : kpi.format === "roas"
                  ? `${kpi.value.toFixed(1)}x`
                  : formatNumber(kpi.value)}
              </div>
              {percentChange !== null && compLabel && (
                <div className={`flex items-center gap-1 mt-1 text-xs ${isGood ? 'text-green-600' : 'text-red-600'}`}>
                  {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  <span>{Math.abs(percentChange).toFixed(1)}%</span>
                  <span className="text-muted-foreground">{compLabel}</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  ), [comparisonMetrics, comparisonData, getChannelComparisonMetrics]);

  // Report breakdown with reordered columns - use currentTotals
  // Calculate report breakdown using utility
  const REPORT_BREAKDOWN = useMemo(() => {
    return calculateReportBreakdown(currentTotals);
  }, [currentTotals]);

  // Calculate total for all reports using utility
  const REPORT_TOTAL = useMemo(() => {
    return calculateReportTotal(currentTotals);
  }, [currentTotals]);

  // State for view-based budgets
  const [viewBudgets, setViewBudgets] = useState<Array<{
    id: string;
    dimension_name: string;
    dimension_item: string;
    budget_data: Record<string, number | ChannelBudgets>;
  }>>([]);
  const [isLoadingViewBudgets, setIsLoadingViewBudgets] = useState(false);

  // Fetch budgets filtered by view
  useEffect(() => {
    if (!selectedViewId || !accountId || !user) return;

    const fetchViewBudgets = async () => {
      setIsLoadingViewBudgets(true);
      try {
        const { data, error } = await supabase
          .from('budgets')
          .select('*')
          .eq('view_id', selectedViewId)
          .eq('account_id', accountId)
          .eq('user_id', user.id);

        if (error) {
          setViewBudgets([]);
        } else {
          const budgets = (data || []).map(b => ({
            id: b.id,
            dimension_name: b.dimension_name,
            dimension_item: b.dimension_item,
            budget_data: (b.budget_data as Record<string, number | ChannelBudgets>) || {},
          }));
          setViewBudgets(budgets);
        }
      } catch (err) {
        console.error('Error:', err);
        setViewBudgets([]);
      } finally {
        setIsLoadingViewBudgets(false);
      }
    };

    fetchViewBudgets();
  }, [selectedViewId, accountId, user]);

  // Calculate budget totals from pivot_data.budget or view budgets - using hook
  const budgetData = useBudgetData(
    effectivePivotData,
    selectedViewId,
    viewBudgets as Array<{ id: string; dimension_name: string; dimension_item: string; budget_data: Record<string, number> }>,
    selectedYear
  );

  // Budget monthly data for tables (full structure with all fields). When display data is from API, use apiMonthlyChannelMetrics.
  const budgetMonthlyData = useBudgetMonthlyData(
    effectivePivotData,
    selectedViewId,
    viewBudgets as Array<{ id: string; dimension_name: string; dimension_item: string; budget_data: Record<string, number> }>,
    selectedYear,
    filteredData.hasFilters,
    filteredData.getFilteredRowsForChannel,
    filterValues,
    filteredData.displayDataFromApi ? filteredData.apiMonthlyChannelMetrics : undefined
  );

  const totalBudget = budgetData.reduce((sum, m) => sum + m.budget, 0);
  // Use REPORT_TOTAL.cost for actual spend (already filtered by view)
  const totalActual = REPORT_TOTAL.cost;
  const totalRevenue = REPORT_TOTAL.revenue;
  const budgetVariance = totalBudget - totalActual;

  // Budget editing handlers
  const handleStartEditBudget = (month: string, channel: string | null, currentBudget: number) => {
    setEditingBudget({ month, channel });
    setEditBudgetValue(currentBudget.toString());
  };

  const handleSaveBudget = async () => {
    if (!editingBudget || !user || !accountId || !selectedViewId) {
      toast({
        title: "Error",
        description: "Cannot save budget: missing required information",
        variant: "destructive",
      });
      return;
    }

    const newBudget = parseFloat(editBudgetValue) || 0;
    const [monthName, year] = editingBudget.month.split(' ');
    const monthIndex = MONTH_NAMES.indexOf(monthName);
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

    try {
      // Get all budgets for this view
      const { data: existingBudgets, error: fetchError } = await supabase
        .from('budgets')
        .select('*')
        .eq('view_id', selectedViewId)
        .eq('account_id', accountId)
        .eq('user_id', user.id);

      if (fetchError) {
        throw fetchError;
      }

      if (!existingBudgets || existingBudgets.length === 0) {
        toast({
          title: "Error",
          description: "No budgets found for this view",
          variant: "destructive",
        });
        return;
      }

      // Get current month row data to calculate channel portions
      const currentRow = budgetMonthlyData.find(r => r.month === editingBudget.month);
      
      // Calculate total current budget for the specific channel across all hotels
      const totalCurrentChannelBudget = existingBudgets.reduce((sum, budget) => {
        const currentBudgetData = (budget.budget_data || {}) as Record<string, number | ChannelBudgets>;
        const monthData = currentBudgetData[monthKey];
        const channelBudgets = normalizeBudgetValue(monthData);
        
        if (editingBudget.channel === null) {
          // Overview: sum all channels
          return sum + channelBudgets.metasearch + channelBudgets.sem + channelBudgets.social;
        } else {
          // Specific channel: sum only that channel
          return sum + channelBudgets[editingBudget.channel as keyof ChannelBudgets];
        }
      }, 0);
      
      // Update all hotel budgets for this view
      const updates = existingBudgets.map(budget => {
        const currentBudgetData = (budget.budget_data || {}) as Record<string, number | ChannelBudgets>;
        const monthData = currentBudgetData[monthKey];
        const currentChannelBudgets = normalizeBudgetValue(monthData);
        
        let newChannelBudgets: ChannelBudgets;
        
        if (editingBudget.channel === null) {
          // Overview: distribute new total budget across all channels proportionally
          const currentTotal = currentChannelBudgets.metasearch + currentChannelBudgets.sem + currentChannelBudgets.social;
          
          if (totalCurrentChannelBudget > 0) {
            // Distribute proportionally based on this hotel's current share
            const hotelProportion = currentTotal / totalCurrentChannelBudget;
            const hotelBudget = newBudget * hotelProportion;
            
            // Distribute hotel budget evenly across three channels
            const perChannel = hotelBudget / 3;
            newChannelBudgets = {
              metasearch: perChannel,
              sem: perChannel,
              social: perChannel,
            };
          } else {
            // If no current budget, distribute evenly across hotels and channels
            const hotelBudget = newBudget / existingBudgets.length;
            const perChannel = hotelBudget / 3;
            newChannelBudgets = {
              metasearch: perChannel,
              sem: perChannel,
              social: perChannel,
            };
          }
        } else {
          // Channel-specific: update only the specific channel, preserve others
          const currentChannelValue = currentChannelBudgets[editingBudget.channel as keyof ChannelBudgets];
          
          if (totalCurrentChannelBudget > 0) {
            // Distribute proportionally based on this hotel's current share of this channel
            const hotelProportion = currentChannelValue / totalCurrentChannelBudget;
            const hotelChannelBudget = newBudget * hotelProportion;
            
            // Update only the specific channel
            newChannelBudgets = {
              ...currentChannelBudgets,
              [editingBudget.channel]: hotelChannelBudget,
            };
          } else {
            // If no current budget for this channel, distribute evenly across hotels
            const hotelChannelBudget = newBudget / existingBudgets.length;
            
            newChannelBudgets = {
              ...currentChannelBudgets,
              [editingBudget.channel]: hotelChannelBudget,
            };
          }
        }

        return {
          id: budget.id,
          budget_data: {
            ...currentBudgetData,
            [monthKey]: newChannelBudgets,
          },
        };
      });

      // Update all budgets
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('budgets')
          .update({ budget_data: update.budget_data })
          .eq('id', update.id);

        if (updateError) {
          throw updateError;
        }
      }

      // Refresh view budgets
      if (selectedViewId) {
        const { data: refreshedBudgets } = await supabase
          .from('budgets')
          .select('*')
          .eq('view_id', selectedViewId)
          .eq('account_id', accountId)
          .eq('user_id', user.id);

        if (refreshedBudgets) {
          setViewBudgets(refreshedBudgets.map(b => ({
            id: b.id,
            dimension_name: b.dimension_name,
            dimension_item: b.dimension_item,
            budget_data: b.budget_data as Record<string, number | ChannelBudgets>,
          })));
        }
      }

      toast({
        title: "Success",
        description: "Budget updated successfully",
      });

      setEditingBudget(null);
      setEditBudgetValue("");
    } catch (error) {
      console.error('Error saving budget:', error);
      toast({
        title: "Error",
        description: "Failed to save budget",
        variant: "destructive",
      });
    }
  };

  const handleCancelEditBudget = () => {
    setEditingBudget(null);
    setEditBudgetValue("");
  };

  // PnL editing handlers
  const handleStartEditPnl = (month: string, channel: string | null, field: 'spender' | 'recurrentFee' | 'percentCost' | 'percentRevenue', currentValue: string | number) => {
    setEditingPnl({ month, channel, field });
    setEditPnlValue(String(currentValue));
  };

  const handleSavePnl = () => {
    if (!editingPnl) return;
    
    const channelKey = editingPnl.channel || 'overview';
    const newValue = editingPnl.field === 'spender' 
      ? editPnlValue as 'client' | 'agency'
      : parseFloat(editPnlValue) || 0;
    
    if (channelKey === 'overview') {
      // For overview, update all channels proportionally
      setPnlConfig(prev => ({
        ...prev,
        metasearch: { ...prev.metasearch, [editingPnl.field]: newValue },
        sem: { ...prev.sem, [editingPnl.field]: newValue },
        social: { ...prev.social, [editingPnl.field]: newValue },
      }));
    } else {
      // For specific channel, update only that channel
      setPnlConfig(prev => ({
        ...prev,
        [channelKey]: { ...prev[channelKey], [editingPnl.field]: newValue },
      }));
    }
    
    setEditingPnl(null);
    setEditPnlValue("");
  };

  const handleCancelEditPnl = () => {
    setEditingPnl(null);
    setEditPnlValue("");
  };

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab} className="min-h-screen bg-background">
      <SlideViewHeader
        selectedTab={selectedTab}
        setSelectedTab={setSelectedTab}
        navigate={navigate}
        accountId={accountId}
        setIsShareModalOpen={setIsShareModalOpen}
        setIsDataModalOpen={setIsDataModalOpen}
        setIsEditSourceOpen={setIsEditSourceOpen}
        handleRefreshDataWithModal={handleRefreshDataWithModal}
        isRefreshModalOpen={isRefreshModalOpen}
        slideReport={slideReport}
      />

      <EditSourceModal
        isOpen={isEditSourceOpen}
        onOpenChange={handleModalClose}
        modalStep={modalStep}
        sinceMonth={sinceMonth}
        setSinceMonth={setSinceMonth}
        sinceYear={sinceYear}
        setSinceYear={setSinceYear}
        selectedDimensions={selectedDimensions}
        handleDimensionToggle={handleDimensionToggle}
        selectedChannels={selectedChannels}
        availableChannels={availableChannels}
        selectedValueDimensionIds={selectedValueDimensionIds}
        handleValueDimensionToggle={handleValueDimensionToggle}
        handleSelectAllDimensions={handleSelectAllDimensions}
        handleDeselectAllDimensions={handleDeselectAllDimensions}
        availableDimensions={availableDimensions}
        loadingAvailableDimensions={loadingAvailableDimensions}
        activeChannelTab={activeChannelTab}
        setActiveChannelTab={setActiveChannelTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        channelConfigs={channelConfigs}
        dimensions={dimensions}
        dimensionValues={dimensionValues}
        loadingDimensions={loadingDimensions}
        loadingValues={loadingValues}
        handleDimensionChange={handleDimensionChange}
        handleValueToggle={handleValueToggle}
        handleSelectAllValues={handleSelectAllValues}
        handleDeselectAllValues={handleDeselectAllValues}
        breakdownDimensions={breakdownDimensions}
        breakdownConfigs={breakdownConfigs}
        loadingBreakdownDimensions={loadingBreakdownDimensions}
        handleBreakdownToggle={handleBreakdownToggle}
        filterConfigs={filterConfigs}
        handleFilterDimensionToggle={handleFilterDimensionToggle}
        handleNext={handleNext}
        handleBack={handleBack}
        handleModalClose={handleModalClose}
      />

      {/* Data Browser Modal */}
      <SlideDataBrowser
        open={isDataModalOpen}
        onOpenChange={setIsDataModalOpen}
        pivotData={useMemo(() => {
          const rawPivotData = effectivePivotData;
          if (!rawPivotData || !rawPivotData.channels) return rawPivotData;

          // Create a deep copy to avoid mutating the original
          const transformedPivotData: SlideReportPivotData = {
            ...rawPivotData,
            channels: { ...rawPivotData.channels },
          };

          // Transform each channel's breakdowns
          Object.keys(transformedPivotData.channels).forEach((channel) => {
            const channelData = transformedPivotData.channels[channel];
            if (!channelData.breakdowns) return;

            const breakdowns = { ...channelData.breakdowns };
            const accountBreakdown = breakdowns['Account'];
            const campaignBreakdown = breakdowns['Campaign'];

            // If both Account and Campaign exist, combine them
            if (accountBreakdown && campaignBreakdown) {
              const combinedMap = new Map<string, BreakdownRow>();

              // Extract account and campaign values
              accountBreakdown.forEach((accountRow) => {
                const accountValue = accountRow.account || accountRow.name || accountRow['Account'] || 'Unknown Account';
                
                // If there's only one account, combine it with all campaigns
                // Otherwise, use the campaign breakdown as the primary (more granular)
                if (accountBreakdown.length === 1) {
                  // Single account: combine with all campaigns
                  campaignBreakdown.forEach((campaignRow) => {
                    const campaignValue = campaignRow.campaign || campaignRow.name || campaignRow['Campaign'] || 'Unknown Campaign';
                    const combinedKey = `${accountValue} > ${campaignValue}`;
                    
                    // Use campaign metrics (more accurate) with account prefix
                    combinedMap.set(combinedKey, {
                      name: combinedKey,
                      account: accountValue,
                      campaign: campaignValue,
                      impressions: campaignRow.impressions || 0,
                      clicks: campaignRow.clicks || 0,
                      cost: campaignRow.cost || 0,
                      revenue: campaignRow.revenue || 0,
                      bookings: campaignRow.bookings || 0,
                    });
                  });
                } else {
                  // Multiple accounts: combine each account with all campaigns
                  // (This creates a cartesian product but is necessary without raw data)
                  campaignBreakdown.forEach((campaignRow) => {
                    const campaignValue = campaignRow.campaign || campaignRow.name || campaignRow['Campaign'] || 'Unknown Campaign';
                    const combinedKey = `${accountValue} > ${campaignValue}`;
                    
                    // Distribute account metrics proportionally to campaigns
                    // Simple approach: use campaign metrics with account label
                    combinedMap.set(combinedKey, {
                      name: combinedKey,
                      account: accountValue,
                      campaign: campaignValue,
                      impressions: campaignRow.impressions || 0,
                      clicks: campaignRow.clicks || 0,
                      cost: campaignRow.cost || 0,
                      revenue: campaignRow.revenue || 0,
                      bookings: campaignRow.bookings || 0,
                    });
                  });
                }
              });

              // Convert map to array and sort by revenue
              const combinedArray = Array.from(combinedMap.values()).sort((a, b) => (b.revenue || 0) - (a.revenue || 0));

              // Remove Account and Campaign, add combined
              delete breakdowns['Account'];
              delete breakdowns['Campaign'];
              breakdowns['Campaign'] = combinedArray;

              // Update channel data
              transformedPivotData.channels[channel] = {
                ...channelData,
                breakdowns,
              };

              // Also transform monthlyBreakdowns if they exist
              if (channelData.monthlyBreakdowns) {
                const monthlyBreakdowns = { ...channelData.monthlyBreakdowns };
                Object.keys(monthlyBreakdowns).forEach((monthKey) => {
                  const monthBreakdowns = { ...monthlyBreakdowns[monthKey] };
                  const monthAccount = monthBreakdowns['Account'];
                  const monthCampaign = monthBreakdowns['Campaign'];

                  if (monthAccount && monthCampaign) {
                    // Combine monthly breakdowns using same logic
                    const combinedMonthlyMap = new Map<string, BreakdownRow>();
                    
                    monthAccount.forEach((accountRow) => {
                      const accountValue = accountRow.account || accountRow.name || accountRow['Account'] || 'Unknown Account';
                      
                      // Use campaign metrics (more granular and accurate)
                      monthCampaign.forEach((campaignRow) => {
                        const campaignValue = campaignRow.campaign || campaignRow.name || campaignRow['Campaign'] || 'Unknown Campaign';
                        const combinedKey = `${accountValue} > ${campaignValue}`;
                        
                        combinedMonthlyMap.set(combinedKey, {
                          name: combinedKey,
                          account: accountValue,
                          campaign: campaignValue,
                          impressions: campaignRow.impressions || 0,
                          clicks: campaignRow.clicks || 0,
                          cost: campaignRow.cost || 0,
                          revenue: campaignRow.revenue || 0,
                          bookings: campaignRow.bookings || 0,
                        });
                      });
                    });

                    delete monthBreakdowns['Account'];
                    delete monthBreakdowns['Campaign'];
                    monthBreakdowns['Campaign'] = Array.from(combinedMonthlyMap.values()).sort(
                      (a, b) => (b.revenue || 0) - (a.revenue || 0)
                    );

                    monthlyBreakdowns[monthKey] = monthBreakdowns;
                  }
                });

                transformedPivotData.channels[channel] = {
                  ...transformedPivotData.channels[channel],
                  monthlyBreakdowns,
                };
              }
            }
          });

          return transformedPivotData;
        }, [effectivePivotData])}
        lastRefreshedAt={slideReport?.last_refreshed_at}
        configuration={slideReport?.configuration as SlideReportConfiguration | null}
        reportIds={slideReport?.report_ids as Record<string, string> | null}
        slideReportId={slideReportId}
      />

      {/* Share Modal */}
      <ShareModal
        reportId={slideReportId || ""}
        reportName="Master Report"
        open={isShareModalOpen}
        onOpenChange={setIsShareModalOpen}
        accountId={accountId}
        slideReportId={slideReportId}
        availableViews={availableViews}
        currentFilterValues={filterValues}
      />

      {/* Save View Dialog */}
      <SaveViewDialog
        open={isSaveViewDialogOpen}
        onOpenChange={setIsSaveViewDialogOpen}
        onSave={handleSaveView}
        existingViewNames={availableViews.filter(v => v.id !== null).map(v => v.name)}
      />

      {/* Save or Update View Dialog */}
      <SaveOrUpdateViewDialog
        open={isSaveOrUpdateViewDialogOpen}
        onOpenChange={setIsSaveOrUpdateViewDialogOpen}
        onSaveNew={() => {
          setIsSaveOrUpdateViewDialogOpen(false);
          setIsSaveViewDialogOpen(true);
        }}
        onUpdate={handleUpdateView}
        availableViews={availableViews}
        currentViewId={selectedViewId}
      />

      <div className="p-6 space-y-6">
        {/* Read-only mode banner */}
        {isReadOnlyMode && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-blue-700 dark:text-blue-300 font-medium">
                🔒 Viewing shared view - Filters are locked
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Remove viewId from URL to exit read-only mode
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('viewId');
                setSearchParams(newParams, { replace: true });
                setIsReadOnlyMode(false);
                setSelectedViewId(null);
              }}
              className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
            >
              Exit View
            </Button>
          </div>
        )}

        {selectedTab !== 'booking' && selectedTab !== 'price-check' && (
          <FiltersRow
            selectedTab={selectedTab}
            selectedViewId={selectedViewId}
            setSelectedViewId={setSelectedViewId}
            isReadOnlyMode={isReadOnlyMode}
            availableViews={availableViews}
            handleApplyView={handleApplyView}
            handleDeleteView={handleDeleteView}
            setIsSaveViewDialogOpen={setIsSaveViewDialogOpen}
            setIsSaveOrUpdateViewDialogOpen={setIsSaveOrUpdateViewDialogOpen}
            filterValues={filterValues}
            setFilterValues={setFilterValues}
            filterDimensionValues={filterDimensionValues}
            setFilterDimensionValues={setFilterDimensionValues}
            setFilterDimensionNames={setFilterDimensionNames}
            filterDimensionNames={filterDimensionNames}
            dimensions={dimensions}
            filterConfigs={filterConfigs}
            slideReport={slideReport}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            comparisonType={comparisonType}
            setComparisonType={setComparisonType}
            pendingFilterValues={pendingFilterValues}
            setPendingFilterValues={setPendingFilterValues}
            filterSearchTerms={filterSearchTerms}
            setFilterSearchTerms={setFilterSearchTerms}
            openFilterPopovers={openFilterPopovers}
            setOpenFilterPopovers={setOpenFilterPopovers}
            filterValuesLoading={filterValuesLoading}
            setFilterValuesLoading={setFilterValuesLoading}
            loadFilterDimensionValues={loadFilterDimensionValues}
          />
        )}

        <ComparisonBanner
          selectedTab={selectedTab}
          comparisonType={comparisonType}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
        />

            <OverviewTab
              slideReportId={slideReportId}
              isSlideReportsLoading={isSlideReportsLoading}
              slideReport={slideReport}
              isLoadingData={isLoadingSlideContent}
              isLoadingMonthlyData={isLoadingMonthlyData}
              currentTotals={currentTotals}
              breakdownTotals={breakdownTotals}
              overviewChartData={effectiveOverviewChartData}
              chartTimeRange={chartTimeRange}
              setChartTimeRange={setChartTimeRange}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              isReadOnlyMode={isReadOnlyMode}
              setIsEditSourceOpen={setIsEditSourceOpen}
              renderKPICards={renderKPICards}
              renderKPICardsSkeleton={renderKPICardsSkeleton}
              renderChartSkeleton={renderChartSkeleton}
              renderTableSkeleton={renderTableSkeleton}
              getOverviewComparisonMetrics={getOverviewComparisonMetrics}
              filteredData={filteredData}
              slideType={slideType}
              KPI_CARDS={KPI_CARDS}
              onAISummaryClick={() => setIsAISummaryModalOpen(true)}
              isAISummaryDisabled={!effectivePivotData || selectedYear === 'all' || selectedMonth === 'all'}
              summaryText={summaries.find(s => s.tab === 'overview' && s.selected_year === selectedYear && s.selected_month === selectedMonth && (!selectedViewId ? !s.view_id : s.view_id === selectedViewId))?.summary_text}
            />

            <ChannelTab
              channel="metasearch"
              isSlideReportsLoading={isSlideReportsLoading}
              slideReportId={slideReportId}
              slideReport={slideReport}
              pivotData={effectivePivotData}
              isLoadingData={isLoadingSlideContent}
              breakdownTotals={breakdownTotals}
              currentTotals={currentTotals}
              channelChartData={effectiveChannelChartData}
              chartTimeRange={chartTimeRange}
              setChartTimeRange={setChartTimeRange}
              groupByDimension={groupByDimension}
              breakdownByDimension={breakdownByDimension}
              expandedRow={expandedRow}
              setExpandedRow={setExpandedRow}
              setGroupByDimension={setGroupByDimension}
              setBreakdownByDimension={setBreakdownByDimension}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              filterValues={filterValues}
              filterDimensionValues={filterDimensionValues}
              summaryText={summaries.find(s => s.tab === 'metasearch' && s.selected_year === selectedYear && s.selected_month === selectedMonth && (!selectedViewId ? !s.view_id : s.view_id === selectedViewId))?.summary_text}
              breakdownDimensions={breakdownDimensions}
              breakdownConfigs={breakdownConfigs}
              renderKPICards={renderKPICards}
              renderKPICardsSkeleton={renderKPICardsSkeleton}
              getReportKPICards={getReportKPICards}
              getChannelComparisonMetrics={getChannelComparisonMetrics}
              setBreakdownTotals={setBreakdownTotals}
              UnifiedBreakdownTable={UnifiedBreakdownTable}
              onAISummaryClick={() => setIsAISummaryModalOpen(true)}
              isAISummaryDisabled={!effectivePivotData || selectedYear === 'all' || selectedMonth === 'all'}
              displayDataFromApi={filteredData.displayDataFromApi}
              apiBreakdowns={filteredData.apiBreakdowns}
            />

            <ChannelTab
              channel="sem"
              isSlideReportsLoading={isSlideReportsLoading}
              slideReportId={slideReportId}
              slideReport={slideReport}
              pivotData={effectivePivotData}
              isLoadingData={isLoadingSlideContent}
              breakdownTotals={breakdownTotals}
              currentTotals={currentTotals}
              channelChartData={effectiveChannelChartData}
              chartTimeRange={chartTimeRange}
              setChartTimeRange={setChartTimeRange}
              groupByDimension={groupByDimension}
              breakdownByDimension={breakdownByDimension}
              expandedRow={expandedRow}
              setExpandedRow={setExpandedRow}
              setGroupByDimension={setGroupByDimension}
              setBreakdownByDimension={setBreakdownByDimension}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              filterValues={filterValues}
              filterDimensionValues={filterDimensionValues}
              breakdownDimensions={breakdownDimensions}
              breakdownConfigs={breakdownConfigs}
              renderKPICards={renderKPICards}
              renderKPICardsSkeleton={renderKPICardsSkeleton}
              getReportKPICards={getReportKPICards}
              getChannelComparisonMetrics={getChannelComparisonMetrics}
              setBreakdownTotals={setBreakdownTotals}
              UnifiedBreakdownTable={UnifiedBreakdownTable}
              onAISummaryClick={() => setIsAISummaryModalOpen(true)}
              isAISummaryDisabled={!effectivePivotData || selectedYear === 'all' || selectedMonth === 'all'}
              summaryText={summaries.find(s => s.tab === 'sem' && s.selected_year === selectedYear && s.selected_month === selectedMonth && (!selectedViewId ? !s.view_id : s.view_id === selectedViewId))?.summary_text}
              displayDataFromApi={filteredData.displayDataFromApi}
              apiBreakdowns={filteredData.apiBreakdowns}
            />

            <ChannelTab
              channel="social"
              isSlideReportsLoading={isSlideReportsLoading}
              slideReportId={slideReportId}
              slideReport={slideReport}
              pivotData={effectivePivotData}
              isLoadingData={isLoadingSlideContent}
              breakdownTotals={breakdownTotals}
              currentTotals={currentTotals}
              channelChartData={effectiveChannelChartData}
              chartTimeRange={chartTimeRange}
              setChartTimeRange={setChartTimeRange}
              groupByDimension={groupByDimension}
              breakdownByDimension={breakdownByDimension}
              expandedRow={expandedRow}
              setExpandedRow={setExpandedRow}
              setGroupByDimension={setGroupByDimension}
              setBreakdownByDimension={setBreakdownByDimension}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              filterValues={filterValues}
              filterDimensionValues={filterDimensionValues}
              breakdownDimensions={breakdownDimensions}
              breakdownConfigs={breakdownConfigs}
              renderKPICards={renderKPICards}
              renderKPICardsSkeleton={renderKPICardsSkeleton}
              getReportKPICards={getReportKPICards}
              getChannelComparisonMetrics={getChannelComparisonMetrics}
              setBreakdownTotals={setBreakdownTotals}
              UnifiedBreakdownTable={UnifiedBreakdownTable}
              onAISummaryClick={() => setIsAISummaryModalOpen(true)}
              isAISummaryDisabled={!effectivePivotData || selectedYear === 'all' || selectedMonth === 'all'}
              summaryText={summaries.find(s => s.tab === 'social' && s.selected_year === selectedYear && s.selected_month === selectedMonth && (!selectedViewId ? !s.view_id : s.view_id === selectedViewId))?.summary_text}
              displayDataFromApi={filteredData.displayDataFromApi}
              apiBreakdowns={filteredData.apiBreakdowns}
            />

            <BudgetTab
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              selectedViewId={selectedViewId}
              setSelectedViewId={setSelectedViewId}
              isReadOnlyMode={isReadOnlyMode}
              views={views}
              handleApplyView={handleApplyView}
              isLoadingViewBudgets={isLoadingViewBudgets}
              isLoadingDisplayData={filteredData.isLoadingDisplayData ?? false}
              budgetMonthlyData={budgetMonthlyData}
              slideReport={slideReport}
              pivotData={effectivePivotData}
              forecastEnabled={forecastEnabled}
              setForecastEnabled={setForecastEnabled}
              pnlModeEnabled={pnlModeEnabled}
              setPnlModeEnabled={setPnlModeEnabled}
              editingBudget={editingBudget}
              editBudgetValue={editBudgetValue}
              handleStartEditBudget={handleStartEditBudget}
              handleSaveBudget={handleSaveBudget}
              handleCancelEditBudget={handleCancelEditBudget}
              setEditBudgetValue={setEditBudgetValue}
              editingPnl={editingPnl}
              editPnlValue={editPnlValue}
              handleStartEditPnl={handleStartEditPnl}
              handleSavePnl={handleSavePnl}
              handleCancelEditPnl={handleCancelEditPnl}
              setEditPnlValue={setEditPnlValue}
              pnlConfig={pnlConfig}
              setPnlConfig={setPnlConfig}
            />

            <BookingTab 
              accountId={accountId}
              selectedHotels={filterValues['booking']?.['hotel'] || []}
              onHotelsChange={(hotels) => {
                setFilterValues(prev => ({
                  ...prev,
                  'booking': {
                    ...prev['booking'],
                    hotel: hotels,
                  },
                }));
              }}
            />

            <PriceCheckTab 
              accountId={accountId}
              selectedHotels={filterValues['price-check']?.['hotel'] || []}
              onHotelsChange={(hotels) => {
                setFilterValues(prev => ({
                  ...prev,
                  'price-check': {
                    ...prev['price-check'],
                    hotel: hotels,
                  },
                }));
              }}
              chartTimeRange={priceCheckChartTimeRange}
              onChartTimeRangeChange={setPriceCheckChartTimeRange}
            />

        </div>

      <RefreshDataModal
        isRefreshModalOpen={isRefreshModalOpen}
        setIsRefreshModalOpen={setIsRefreshModalOpen}
        refreshStep={refreshStep}
        refreshStepStatus={refreshStepStatus}
        refreshError={refreshError}
      />

      {/* AI Summary Modal */}
      {(selectedTab === 'overview' || selectedTab === 'metasearch' || selectedTab === 'sem' || selectedTab === 'social') && (
        <SlideViewAISummaryModal
          open={isAISummaryModalOpen}
          onOpenChange={setIsAISummaryModalOpen}
          minimalData={minimalAIData}
          selectedTab={selectedTab as 'overview' | 'metasearch' | 'sem' | 'social'}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          pivotData={effectivePivotData}
          availableViews={availableViews}
          views={views}
          slideReportId={slideReportId}
          activeViewId={selectedViewId}
          onApplyView={handleApplyView}
          onApplyComparisonType={(type) => setComparisonType(type)}
        />
      )}
    </Tabs>
  );
}