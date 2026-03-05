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
import { useSlideReportPage } from "@/hooks/useSlideReportPage";
import { isMetasearchJan2026, getJan2026BreakdownRowsForTable } from "@/hooks/useMetasearchJan2026RawRows";
import { useChannelMetrics } from "@/hooks/useChannelMetrics";
import { useEditSourceModal } from "@/hooks/useEditSourceModal";
import { useDataLoadingCache } from "@/hooks/useDataLoadingCache";
import { useOverviewMetrics } from "@/hooks/useOverviewMetrics";
import { useComparisonMetrics, useChannelComparisonMetrics } from "@/hooks/useComparisonMetrics";
import { useKPICards, useReportKPICards } from "@/hooks/useKPICards";
import { useOverviewChartData, useAllChannelChartData } from "@/hooks/useChartData";
import { useChannelChartDataFromTable } from "@/hooks/useChannelChartDataFromTable";
import { buildOverviewChartDataFromMonthlyData, buildOverviewChartDataFromChannelChartData, buildChannelChartDataFromMonthlyData } from "@/lib/chartDataCalculations";
import { useBudgetData, useBudgetMonthlyData } from "@/hooks/useBudgetData";
import { calculateReportBreakdown, calculateReportTotal } from "@/lib/metricsCalculations";
import { normalizeBudgetValue, type ChannelBudgets } from "@/lib/budgetCalculations";
import { useQueryClient, useQuery } from "@tanstack/react-query";
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
import { useGetSummaryForTab, type SlideReportSummary } from "@/hooks/useSlideReportSummaries";
import { extractMinimalAIData } from "@/lib/extractMinimalAIData";
import { isWithinInterval } from "date-fns";
import { aggregateMetrics } from "@/components/AISummaryPivotTable";
import { BASE_METRICS, CHANNEL_REPORT_IDS, MONTH_NAMES } from "@/constants/slideViewConstants";
import { getChartAnchorDate } from "@/lib/monthUtils";
import type { AccountReportIds } from "@/lib/accountReportIds";
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

const GROSS_PROFIT_RATE = 0.15;
/** Gross profit for Metasearch + Link Type = Google Organic: Revenue * 3% */
const GROSS_PROFIT_RATE_GOOGLE_ORGANIC = 0.03;

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
  suppressExpandedBreakdown,
  displayCurrency,
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
  /** When true, do not show expanded sub-rows (e.g. to avoid wrong API expanded data for Metasearch Jan 2026). */
  suppressExpandedBreakdown?: boolean;
  /** Display currency for formatting (AUD/USD). */
  displayCurrency?: 'AUD' | 'USD';
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

  // Build monthKey for filtering by selected year/month (supports multi-month)
  const monthKey = useMemo(() => {
    if (!selectedYear || selectedYear === 'all' || !selectedMonth || selectedMonth === 'all') {
      return null; // Use aggregated data
    }
    // Only return a single monthKey if exactly one month is selected
    const months = selectedMonth.split(',').map(m => m.trim());
    if (months.length !== 1) return null;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNum = monthNames.indexOf(months[0]) + 1;
    return `${selectedYear}-${monthNum.toString().padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  // Get breakdown data from pivotData based on selected dimension and month
  // Applies filterValues if they are set. When displayDataFromApi and apiBreakdowns are set, use API data (no heavy calc).
  // When group-by is e.g. Link Type and breakdown-by is Hotel, row totals must respect the Hotel filter: recompute from filtered expanded rows.
  const groupedData = useMemo(() => {
    if (displayDataFromApi && apiBreakdowns?.rows?.length) {
      const groupByDimId = availableDimensions.find(d => d.id === groupBy)?.id;
      const groupByFilterValues = groupByDimId && selectedChannel && selectedChannel !== 'overview'
        ? filterValues?.[selectedChannel]?.[groupByDimId]
        : undefined;
      const allowedSet = groupByFilterValues?.length
        ? new Set(groupByFilterValues.map((v: string) => String(v).trim()))
        : null;
      const rows = apiBreakdowns.rows.filter((row) => {
        if (row.name == null || String(row.name).trim() === '' || String(row.name).trim().toLowerCase() === 'unknown') return false;
        if (allowedSet && !allowedSet.has(String(row.name).trim())) return false;
        return true;
      });

      // When a breakdown-by filter is active (e.g. Hotel), recompute each group row from filtered expanded data
      // so that row totals and table total match the selected hotels (e.g. Metasearch Jan 2026, group by Link Type, 4 hotels).
      const breakdownByDimId = availableDimensions.find(d => d.id === breakdownBy)?.id;
      const breakdownFilterValues = breakdownByDimId && selectedChannel && selectedChannel !== 'overview'
        ? filterValues?.[selectedChannel]?.[breakdownByDimId]
        : undefined;
      const breakdownAllowedSet = breakdownFilterValues?.length
        ? new Set(breakdownFilterValues.map((v: string) => String(v).trim()))
        : null;
      const useFilteredExpandedForTotals = Boolean(
        breakdownAllowedSet && apiBreakdowns.expanded && Object.keys(apiBreakdowns.expanded).length > 0
      );

      return rows.map((row) => {
        let cleanData: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number };
        if (useFilteredExpandedForTotals && apiBreakdowns.expanded?.[row.name]) {
          const expandedRows = apiBreakdowns.expanded[row.name].filter(
            (r: { name: string; impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) =>
              r.name != null && breakdownAllowedSet!.has(String(r.name).trim())
          );
          cleanData = expandedRows.reduce(
            (acc, r) => ({
              impressions: acc.impressions + (Number(r.impressions) || 0),
              clicks: acc.clicks + (Number(r.clicks) || 0),
              cost: acc.cost + (Number(r.cost) || 0),
              revenue: acc.revenue + (Number(r.revenue) || 0),
              bookings: acc.bookings + (Number(r.bookings) || 0),
            }),
            { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }
          );
        } else {
          cleanData = {
            impressions: Number(row.impressions) || 0,
            clicks: Number(row.clicks) || 0,
            cost: Number(row.cost) || 0,
            revenue: Number(row.revenue) || 0,
            bookings: Number(row.bookings) || 0,
          };
        }
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
  }, [displayDataFromApi, apiBreakdowns, pivotData, groupBy, breakdownBy, availableDimensions, selectedChannel, monthKey, filterValues, filterDimensionValues, selectedYear]);

  // Get breakdown data for expanded row (also uses month-specific data)
  // This should show breakdown data ONLY for the expanded parent row value
  const getExpandedBreakdownData = useMemo(() => {
    if (!expandedRow || !breakdownBy) return [];
    if (suppressExpandedBreakdown) return [];

    if (displayDataFromApi && apiBreakdowns?.expanded) {
      let expandedRows = apiBreakdowns.expanded[expandedRow];
      const breakdownByDimId = availableDimensions.find(d => d.id === breakdownBy)?.id;
      const breakdownFilterValues = breakdownByDimId && selectedChannel && selectedChannel !== 'overview'
        ? filterValues?.[selectedChannel]?.[breakdownByDimId]
        : undefined;
      const breakdownAllowedSet = breakdownFilterValues?.length
        ? new Set(breakdownFilterValues.map((v: string) => String(v).trim()))
        : null;
      if (expandedRows?.length && breakdownAllowedSet) {
        expandedRows = expandedRows.filter((row) => row.name != null && breakdownAllowedSet.has(String(row.name).trim()));
      }
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
    let hadRawDataRows = false;

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
      if (rawDataRows.length > 0) hadRawDataRows = true;
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

    // Only use pre-computed breakdown when there were NO rawDataRows (e.g. data from channel month table only).
    // If we had rawDataRows but they don't have the breakdown dimension for this expanded group (e.g. Jan 2026
    // override has hotel-only rows), do NOT show report-level breakdown under each hotel — that would show
    // wrong totals (same Paid/Google Organic for every hotel).
    if (Object.keys(allBreakdowns).length === 0 && pivotData?.channels && !hadRawDataRows) {
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
  }, [expandedRow, breakdownBy, suppressExpandedBreakdown, displayDataFromApi, apiBreakdowns, pivotData, availableDimensions, selectedChannel, monthKey, filterValues, filterDimensionValues, selectedYear, groupBy]);

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
            <TableHead className="text-right">Gross Profit</TableHead>
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
                <TableCell className="text-right">{formatNumber(group.metrics.cpc, 'currency', displayCurrency, 2)}</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.cost, 'currency', displayCurrency)}</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.revenue, 'currency', displayCurrency)}</TableCell>
                <TableCell className="text-right">{group.metrics.roas.toFixed(1)}x</TableCell>
                <TableCell className="text-right">{group.metrics.costOfSale < 0.01 ? group.metrics.costOfSale.toFixed(4) : group.metrics.costOfSale.toFixed(2)}%</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.revenue * GROSS_PROFIT_RATE - group.metrics.cost, 'currency', displayCurrency)}</TableCell>
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
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.cpc, 'currency', displayCurrency, 2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.cost, 'currency', displayCurrency)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.revenue, 'currency', displayCurrency)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.roas.toFixed(1)}x</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.costOfSale < 0.01 ? item.metrics.costOfSale.toFixed(4) : item.metrics.costOfSale.toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatNumber(
                          (selectedChannel === 'metasearch' &&
                            (breakdownByDim?.name ?? '').trim().toLowerCase() === 'link type' &&
                            (item.value ?? '').trim().toLowerCase() === 'google organic')
                            ? item.metrics.revenue * GROSS_PROFIT_RATE_GOOGLE_ORGANIC
                            : item.metrics.revenue * GROSS_PROFIT_RATE - item.metrics.cost,
                          'currency',
                          displayCurrency
                        )}
                      </TableCell>
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
            <TableCell className="text-right">{formatNumber(totalMetrics.cpc, 'currency', displayCurrency, 2)}</TableCell>
            <TableCell className="text-right">{formatNumber(totalMetrics.cost, 'currency', displayCurrency)}</TableCell>
            <TableCell className="text-right">{formatNumber(totalMetrics.revenue, 'currency', displayCurrency)}</TableCell>
            <TableCell className="text-right">{totalMetrics.roas.toFixed(1)}x</TableCell>
            <TableCell className="text-right">{totalMetrics.costOfSale < 0.01 ? totalMetrics.costOfSale.toFixed(4) : totalMetrics.costOfSale.toFixed(2)}%</TableCell>
            <TableCell className="text-right">{formatNumber(totalMetrics.revenue * GROSS_PROFIT_RATE - totalMetrics.cost, 'currency', displayCurrency)}</TableCell>
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
  // Filter state (declared early for useSlideReportPage)
  const [filterValues, setFilterValues] = useState({
    metasearch: {},
    sem: {},
    social: {},
    'price-check': {},
    'booking': {},
  } as Record<string, Record<string, string[]>>);
  const [filterDimensionValues, setFilterDimensionValues] = useState({
    metasearch: {},
    sem: {},
    social: {},
  } as Record<string, Record<string, string[]>>);
  const [filterValuesLoading, setFilterValuesLoading] = useState({
    metasearch: {},
    sem: {},
    social: {},
  } as Record<string, Record<string, boolean>>);
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
    location.pathname.includes('/brady') ? 'brady' :
    location.pathname.includes('/data-studio') ? 'default' : 'default';
  const isDataStudioRoute = location.pathname.includes('/data-studio');

  // Master Report currency settings
  const [displayCurrency, setDisplayCurrency] = useState<'AUD' | 'USD'>('AUD');

  useEffect(() => {
    if (slideType !== 'master-report') return;
    const stored = localStorage.getItem('master_report_currency');
    if (stored === 'AUD' || stored === 'USD') {
      setDisplayCurrency(stored);
    } else {
      localStorage.setItem('master_report_currency', 'AUD');
      setDisplayCurrency('AUD');
    }
  }, [slideType]);

  const handleDisplayCurrencyChange = useCallback((currency: 'AUD' | 'USD') => {
    localStorage.setItem('master_report_currency', currency);
    setDisplayCurrency(currency);
  }, []);

  const { data: fxRateData, isFetching: isFxLoading, refetch: refetchFxRate } = useQuery({
    queryKey: ['fx-rate-usd-aud'],
    queryFn: async (): Promise<{ audPerUsd: number; usdPerAud: number; fetchedAt: string }> => {
      const { data, error } = await supabase.functions.invoke('get-fx-rate');
      if (error) throw error;
      return data as { audPerUsd: number; usdPerAud: number; fetchedAt: string };
    },
    enabled: slideType === 'master-report',
    staleTime: 60 * 60 * 1000,
  });

  const audPerUsd = fxRateData?.audPerUsd ?? 1;

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

  // Single hook for report page: report data, display data, views, summaries, mutations, account IDs, budgets, monthly data
  const reportPage = useSlideReportPage({
    accountId,
    user,
    slideType,
    searchParams,
    filterValues,
    filterDimensionValues,
    selectedYear,
    selectedMonth,
    selectedTab,
    comparisonType,
    chartTimeRange,
    groupByDimensionId: groupByDimension,
    breakdownByDimensionId: breakdownByDimension,
    selectedViewId,
    dynamicChannelTotals,
    displayCurrency: slideType === 'master-report' ? displayCurrency : undefined,
    audPerUsd: slideType === 'master-report' ? audPerUsd : undefined,
  });
  const {
    slideReportId,
    setSlideReportId,
    slideReport,
    effectivePivotData,
    filteredData,
    views,
    summaries,
    monthlyDataRecords,
    viewBudgets,
    accountReportIds,
    getReportIdForChannel,
    availableChannels,
    isSlideReportsLoading,
    isLoadingViews,
    isLoadingViewBudgets,
    isLoadingMonthlyData,
    needEditSourceForMasterReport,
    createSlideReport,
    updateSlideReport,
    refreshSlideReportData,
    createView,
    updateView,
    deleteView,
  } = reportPage;
  const queryClient = useQueryClient();

  // Data Studio: fetch directly from all sources on each load (resync + refresh)
  const isDataStudio = isDataStudioRoute || slideReport?.name === 'Data Studio';
  const [isDataStudioLoading, setIsDataStudioLoading] = useState(false);
  const dataStudioLoadDoneRef = useRef(false);
  useEffect(() => {
    if (!isDataStudio || !slideReportId || !slideReport || dataStudioLoadDoneRef.current) return;

    dataStudioLoadDoneRef.current = true;
    setIsDataStudioLoading(true);

    const reportIds = (slideReport.report_ids || {}) as Record<string, string>;
    const channelReportIds = [reportIds.metasearch, reportIds.sem, reportIds.social].filter(Boolean) as string[];

    (async () => {
      try {
        const { data: allSources, error: sourcesError } = await supabase
          .from('data_sources')
          .select('id, report_id')
          .in('report_id', channelReportIds);
        if (sourcesError) throw sourcesError;

        for (const ds of allSources || []) {
          const { data: resyncResult, error: resyncError } = await supabase.functions.invoke(
            'resync-data-source',
            { body: { dataSourceId: ds.id } }
          );
          if (resyncError) throw resyncError;
          if (!resyncResult?.success) throw new Error((resyncResult as any)?.error || 'Resync failed');
        }

        const { data: refreshResult, error: refreshErr } = await supabase.functions.invoke(
          'refresh-slide-report',
          { body: { slideReportId, years: [2024, 2025, 2026] } }
        );
        if (refreshErr) throw refreshErr;
        if (!refreshResult?.success) throw new Error((refreshResult as any)?.error || 'Refresh failed');

        queryClient.invalidateQueries({ queryKey: ['cached-dimension-data'] });
        queryClient.invalidateQueries({ queryKey: ['channel_chart_data_from_table', slideReportId] });
        queryClient.invalidateQueries({ queryKey: ['slide_reports', 'detail', slideReportId] });
        queryClient.invalidateQueries({ queryKey: ['slide_reports'] });
      } catch (e: any) {
        console.error('[Data Studio]', e);
        toast({
          title: 'Data Studio load failed',
          description: e?.message || 'Failed to fetch from sources',
          variant: 'destructive',
        });
      } finally {
        setIsDataStudioLoading(false);
      }
    })();
  }, [isDataStudio, slideReportId, slideReport, queryClient]);

  // Open Edit Source when master-report and no Master Report exists (once)
  const hasOpenedEditSourceForMasterRef = useRef(false);
  useEffect(() => {
    if (needEditSourceForMasterReport && !hasOpenedEditSourceForMasterRef.current) {
      setIsEditSourceOpen(true);
      hasOpenedEditSourceForMasterRef.current = true;
    }
  }, [needEditSourceForMasterReport]);

  // Sync selectedDimensions from accountReportIds when no saved config yet
  useEffect(() => {
    if (!accountId) {
      setSelectedDimensions({ metasearch: false, sem: false, social: false });
      return;
    }
    const hasSavedConfig = slideReport?.configuration?.selectedChannels;
    if (hasSavedConfig) return;
    setSelectedDimensions({
      metasearch: !!accountReportIds.metasearch,
      sem: !!accountReportIds.sem,
      social: !!accountReportIds.social,
    });
  }, [accountId, accountReportIds.metasearch, accountReportIds.sem, accountReportIds.social, slideReport?.configuration?.selectedChannels]);

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

    if (viewIdToUse && views.length > 0) {
      // Check if viewId exists in views
      const view = views.find(v => v.id === viewIdToUse);
      if (view) {
        // Apply the view (do NOT enable read-only mode for regular views)
        if (isReadOnlyMode) setIsReadOnlyMode(false);
        setSelectedViewId(viewIdToUse);
        if (selectedViewId !== viewIdToUse) {
          handleApplyView(viewIdToUse);
        }

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
  }, [searchParams, views.length, isReadOnlyMode, slideReportId, selectedViewId]);

  // monthlyDataRecords, isLoadingMonthlyData from reportPage

  // filteredData comes from reportPage (useSlideReportPage)

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


  // Compute anchor date from selected year/month for chart time range
  const chartAnchorDate = useMemo(() => getChartAnchorDate(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  // Chart data helpers - using hooks
  const overviewChartData = useOverviewChartData(
    effectivePivotData,
    filterValues,
    filteredData.channelsWithFilters,
    chartTimeRange as 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months',
    chartAnchorDate
  );

  // Channel-specific chart data (for individual channel tabs) - using hook
  const channelChartData = useAllChannelChartData(
    effectivePivotData,
    filterValues,
    filteredData.channelsWithFilters,
    chartTimeRange as 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months',
    chartAnchorDate
  );

  // Channel Revenue chart: prefer data from slide_report_channel_month_data (no edge function); applies filterValues via monthlyBreakdowns.
  const chartTimeRangeTyped = chartTimeRange as 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months';
  const { data: channelChartDataFromTable } = useChannelChartDataFromTable(slideReportId, chartTimeRangeTyped, filterValues, chartAnchorDate);

  // Overview Revenue chart: prefer slide_report_channel_month_data (filterValues applied when View changes)
  const effectiveOverviewChartData = useMemo(() => {
    if (channelChartDataFromTable && (channelChartDataFromTable.metasearch?.length > 0 || channelChartDataFromTable.sem?.length > 0 || channelChartDataFromTable.social?.length > 0)) {
      return buildOverviewChartDataFromChannelChartData(channelChartDataFromTable);
    }
    if (filteredData.monthlyData?.length > 0) {
      return buildOverviewChartDataFromMonthlyData(filteredData.monthlyData, chartTimeRangeTyped, chartAnchorDate);
    }
    return overviewChartData;
  }, [channelChartDataFromTable, filteredData.monthlyData, chartTimeRangeTyped, overviewChartData, chartAnchorDate]);

  const effectiveChannelChartData = useMemo(() => {
    if (channelChartDataFromTable && (channelChartDataFromTable.metasearch?.length > 0 || channelChartDataFromTable.sem?.length > 0 || channelChartDataFromTable.social?.length > 0)) {
      return channelChartDataFromTable;
    }
    if (filteredData.monthlyData?.length > 0) {
      return buildChannelChartDataFromMonthlyData(filteredData.monthlyData, chartTimeRangeTyped, chartAnchorDate);
    }
    return channelChartData;
  }, [channelChartDataFromTable, filteredData.monthlyData, chartTimeRangeTyped, channelChartData, chartAnchorDate]);

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
      const months = selectedMonth.split(',').map(m => MONTH_NAMES.indexOf(m.trim()) + 1).filter(n => n > 0);
      if (months.length > 0) {
        filteredRecords = filteredRecords.filter(r => months.includes(r.month));
      }
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

  // Keep local state in sync with slideReport.configuration (and date range when report first loads)
  const lastSyncedSlideReportIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!slideReport || !slideReportId) return;
    const config = slideReport.configuration;
    if (config) {
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
      if (config.selectedChannels) {
        const validChannels = config.selectedChannels.filter(channel => availableChannels.includes(channel));
        setSelectedDimensions({
          metasearch: validChannels.includes('metasearch'),
          sem: validChannels.includes('sem'),
          social: validChannels.includes('social'),
        });
      }
      if (config.selectedValueDimensionIds) {
        setSelectedValueDimensionIds(config.selectedValueDimensionIds);
      }
    }
    const isNewReport = lastSyncedSlideReportIdRef.current !== slideReportId;
    if (isNewReport) {
      lastSyncedSlideReportIdRef.current = slideReportId;
      const currentYear = new Date().getFullYear();
      const currentMonth = MONTH_NAMES[new Date().getMonth()];
      setSelectedYear(currentYear.toString());
      setSelectedMonth(currentMonth);
      if (slideReport.date_range) {
        setSinceMonth(slideReport.date_range.month || 'January');
        setSinceYear(slideReport.date_range.year);
      } else {
        setSinceMonth('January');
        setSinceYear(currentYear);
      }
    }
  }, [slideReport, slideReportId, availableChannels]);

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

  // Background loader for filter dimension values after saving configuration
  const loadFilterDimensionValuesAfterSave = useCallback(
    async (
      channels: ('metasearch' | 'sem' | 'social')[],
      configs: Record<string, FilterConfig>
    ) => {
      for (const channel of channels) {
        const ids = configs?.[channel]?.filterDimensionIds ?? [];
        for (const id of ids) {
          const values = await loadFilterDimensionValues(channel, id);
          setFilterDimensionValues(prev => ({
            ...prev,
            [channel]: {
              ...prev[channel],
              [id]: values
            }
          }));
        }
      }
    },
    [loadFilterDimensionValues]
  );

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
      setModalStep(1);
      setActiveChannelTab(null);
      setSearchQuery("");
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
        comparison_type: comparisonType as any,
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
  }, [slideReportId, slideReport, user, accountId, selectedYear, selectedMonth, comparisonType, chartTimeRange, priceCheckChartTimeRange, filterValues, createView, queryClient]);

  // Update an existing view with current filter configuration
  const handleUpdateView = useCallback(async (viewId: string) => {
    if (!slideReportId || !user) return;
    try {
      await updateView.mutateAsync({
        id: viewId,
        selected_year: selectedYear,
        selected_month: selectedMonth,
        comparison_type: comparisonType as any,
        chart_time_range: chartTimeRange,
        price_check_chart_time_range: priceCheckChartTimeRange,
        filter_values: { ...filterValues },
      });
      queryClient.invalidateQueries({ queryKey: ['slide_report_views', 'list', slideReportId] });
    } catch (error) {
      console.error('Error updating view:', error);
    }
  }, [slideReportId, user, selectedYear, selectedMonth, comparisonType, chartTimeRange, priceCheckChartTimeRange, filterValues, updateView, queryClient]);

  // Apply a saved view (or reset to Master when viewId is null)
  const handleApplyView = useCallback((viewId: string | null) => {
    if (!slideReportId) return;

    const emptyFilters: Record<string, Record<string, string[]>> = {
      metasearch: {},
      sem: {},
      social: {},
      'price-check': {},
      booking: {},
    };

    isApplyingViewRef.current = true;

    // Reset to Master (no saved view)
    if (viewId === null) {
      setSelectedViewId(null);
      setFilterValues(emptyFilters);
      setPendingFilterValues({ metasearch: {}, sem: {}, social: {} });
      setComparisonType('none');

      // Remove viewId from URL if present
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('viewId');
      setSearchParams(newParams, { replace: true });

      setTimeout(() => {
        isApplyingViewRef.current = false;
      }, 0);
      return;
    }

    // Apply a saved view
    const view = views.find(v => v.id === viewId);
    if (!view) {
      console.warn('[handleApplyView] View not found:', viewId);
      isApplyingViewRef.current = false;
      return;
    }

    setSelectedViewId(viewId);

    // Apply filter values from the saved view
    const viewFilters = view.filter_values || {};
    setFilterValues({
      metasearch: viewFilters.metasearch || {},
      sem: viewFilters.sem || {},
      social: viewFilters.social || {},
      'price-check': viewFilters['price-check'] || {},
      booking: viewFilters.booking || {},
    });
    setPendingFilterValues({
      metasearch: viewFilters.metasearch || {},
      sem: viewFilters.sem || {},
      social: viewFilters.social || {},
    });

    // Apply year/month/comparison settings
    if (view.selected_year) setSelectedYear(view.selected_year);
    if (view.selected_month) setSelectedMonth(view.selected_month);
    if (view.comparison_type) setComparisonType(view.comparison_type);
    if (view.chart_time_range) setChartTimeRange(view.chart_time_range);
    if (view.price_check_chart_time_range) setPriceCheckChartTimeRange(view.price_check_chart_time_range);
    if (view.tab) setSelectedTab(view.tab);

    // Update URL with viewId
    const newParams = new URLSearchParams(searchParams);
    newParams.set('viewId', viewId);
    setSearchParams(newParams, { replace: true });

    setTimeout(() => {
      isApplyingViewRef.current = false;
    }, 0);
  }, [slideReportId, searchParams, views]);

  // ========== Refresh Data Modal handler ==========
  const handleRefreshDataWithModal = useCallback(() => {
    if (!slideReportId) {
      toast({ title: "No report", description: "Please configure your report first.", variant: "destructive" });
      return;
    }
    setRefreshStep(0);
    setRefreshStepStatus({ 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending' });
    setRefreshError(null);
    setIsRefreshModalOpen(true);
  }, [slideReportId]);

  // Invoke edge function with retries to handle transient "Failed to send request" errors
  const invokeWithRetry = useCallback(
    async (name: string, body: object, retries = 2): Promise<{ data: any; error: any }> => {
      let lastError: any = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        const result = await supabase.functions.invoke(name, { body });
        if (!result.error) return result;
        lastError = result.error;
        const isFetchError = lastError?.message?.includes('Failed to send') || lastError?.message?.includes('fetch');
        if (attempt < retries && isFetchError) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return result;
      }
      return { data: null, error: lastError };
    },
    []
  );

   // When Refresh Data modal is open and step is 0: resync all data sources, then run refresh-slide-report.
  useEffect(() => {
    if (!isRefreshModalOpen || refreshStep !== 0 || !slideReportId || !slideReport) return;

    setRefreshStep(1);
    setRefreshStepStatus((prev) => ({ ...prev, 1: 'loading' }));

    (async () => {
      const reportIds = (slideReport.report_ids || {}) as Record<string, string>;
      const channelReportIds = [
        reportIds.metasearch,
        reportIds.sem,
        reportIds.social,
      ].filter(Boolean) as string[];

      try {
        // Step 1: Resync data sources — skip sources synced within last hour, run in parallel, tolerate timeouts
        const { data: allSources, error: sourcesError } = await supabase
          .from('data_sources')
          .select('id, report_id, last_synced_at')
          .in('report_id', channelReportIds);

        if (sourcesError) throw sourcesError;

        const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const sourcesToResync = (allSources || []).filter((ds: any) => {
          // Skip if synced within the last hour
          if (ds.last_synced_at && ds.last_synced_at > ONE_HOUR_AGO) {
            console.log(`[RefreshData] Skipping resync for ${ds.id} — synced recently at ${ds.last_synced_at}`);
            return false;
          }
          return true;
        });

        if (sourcesToResync.length > 0) {
          console.log(`[RefreshData] Resyncing ${sourcesToResync.length} data sources in parallel (skipped ${(allSources || []).length - sourcesToResync.length} recently synced)`);
          
          // Run all resyncs in parallel with individual timeout handling
          const resyncResults = await Promise.allSettled(
            sourcesToResync.map(async (ds: any) => {
              const { data: resyncResult, error: resyncError } = await invokeWithRetry('resync-data-source', { dataSourceId: ds.id }, 3);
              if (resyncError) {
                console.warn(`[RefreshData] Resync failed for ${ds.id}:`, resyncError?.message);
                return { id: ds.id, success: false, error: resyncError?.message };
              }
              if (!resyncResult?.success) {
                console.warn(`[RefreshData] Resync returned failure for ${ds.id}:`, resyncResult?.error);
                return { id: ds.id, success: false, error: resyncResult?.error };
              }
              return { id: ds.id, success: true };
            })
          );

          // Log results but don't fail the whole process — proceed with refresh even if some resyncs failed
          const failures = resyncResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success));
          if (failures.length > 0) {
            console.warn(`[RefreshData] ${failures.length}/${sourcesToResync.length} resyncs failed, continuing with refresh anyway`);
          }
        } else {
          console.log('[RefreshData] All data sources recently synced, skipping resync step');
        }

        setRefreshStepStatus((prev) => ({ ...prev, 1: 'complete' }));
        setRefreshStep(2);
        setRefreshStepStatus((prev) => ({ ...prev, 2: 'loading', 3: 'loading', 4: 'loading', 5: 'loading' }));

        // Steps 2–5: Refresh slide report (compute pivot, store monthly, breakdowns, update report)
        const { data: refreshResult, error: refreshErr } = await invokeWithRetry('refresh-slide-report', {
          slideReportId,
          years: [2024, 2025, 2026],
        }, 3);

        if (refreshErr) {
          const msg = refreshErr?.message || 'Unknown error';
          const hint = msg.includes('Failed to send') ? ' Check your connection and try again.' : '';
          throw new Error(`Refreshing report: ${msg}.${hint}`);
        }
        if (!refreshResult?.success) {
          throw new Error((refreshResult as any)?.error || 'Refresh failed');
        }

        setRefreshStepStatus((prev) => ({
          ...prev,
          2: 'complete',
          3: 'complete',
          4: 'complete',
          5: 'complete',
        }));

        queryClient.invalidateQueries({ queryKey: ['cached-dimension-data'] });
        queryClient.invalidateQueries({ queryKey: ['channel_chart_data_from_table', slideReportId] });
        queryClient.invalidateQueries({ queryKey: ['slide_reports', 'detail', slideReportId] });
        queryClient.invalidateQueries({ queryKey: ['slide_reports'] });
        queryClient.invalidateQueries({ queryKey: ['slide_report_monthly_data', slideReportId] });
      } catch (e: any) {
        console.error('[RefreshData]', e);
        setRefreshError(e?.message || 'Refresh failed');
        setRefreshStepStatus((prev) => ({ ...prev, 1: prev[1] === 'loading' ? 'error' : prev[1], 2: 'error', 3: 'error', 4: 'error', 5: 'error' }));
      }
    })();
  }, [isRefreshModalOpen, refreshStep, slideReportId, slideReport, queryClient, invokeWithRetry]);

  // ========== Budget edit handlers ==========
  const handleStartEditBudget = useCallback((month: string, channel: string | null, currentBudget: number) => {
    setEditingBudget({ month, channel });
    setEditBudgetValue(String(currentBudget || 0));
  }, []);

  const handleSaveBudget = useCallback(async () => {
    if (!editingBudget || !slideReportId) return;
    // Budget save logic would go here
    setEditingBudget(null);
    setEditBudgetValue("");
  }, [editingBudget, slideReportId]);

  const handleCancelEditBudget = useCallback(() => {
    setEditingBudget(null);
    setEditBudgetValue("");
  }, []);

  // ========== PnL edit handlers ==========
  const handleStartEditPnl = useCallback((month: string, channel: string | null, field: 'spender' | 'recurrentFee' | 'percentCost' | 'percentRevenue', currentValue: string | number) => {
    setEditingPnl({ month, channel, field });
    setEditPnlValue(String(currentValue));
  }, []);

  const handleSavePnl = useCallback(() => {
    if (!editingPnl) return;
    if (editingPnl.channel && editingPnl.field !== 'spender') {
      setPnlConfig(prev => ({
        ...prev,
        [editingPnl.channel!]: {
          ...prev[editingPnl.channel!],
          [editingPnl.field]: parseFloat(editPnlValue) || 0,
        },
      }));
    }
    setEditingPnl(null);
    setEditPnlValue("");
  }, [editingPnl, editPnlValue]);

  const handleCancelEditPnl = useCallback(() => {
    setEditingPnl(null);
    setEditPnlValue("");
  }, []);

  // ========== View delete handler ==========
  const handleDeleteView = useCallback(async (viewId: string) => {
    try {
      await deleteView.mutateAsync(viewId);
      if (selectedViewId === viewId) {
        setSelectedViewId(null);
      }
      toast({ title: "View deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete view", variant: "destructive" });
    }
  }, [deleteView, selectedViewId]);

  // ========== KPI Cards & Render Helpers ==========
  const overviewMetrics = useOverviewMetrics(currentTotals);
  const KPI_CARDS = useKPICards(overviewMetrics);
  const getReportKPICards = useReportKPICards();

  const getOverviewComparisonMetrics = useCallback(() => {
    if (!comparisonTotals || comparisonType === 'none') return null;
    const totals = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
    Object.values(comparisonTotals).forEach((ch: any) => {
      totals.impressions += ch.impressions || 0;
      totals.clicks += ch.clicks || 0;
      totals.cost += ch.cost || 0;
      totals.revenue += ch.revenue || 0;
      totals.bookings += ch.bookings || 0;
    });
    const derived = calculateDerivedMetrics(totals);
    return { ...derived, label: comparisonType === 'previous_period' ? 'vs prev period' : 'vs prev year' };
  }, [comparisonTotals, comparisonType]);

  const getChannelComparisonMetrics = useCallback((channel: 'metasearch' | 'sem' | 'social') => {
    if (!comparisonTotals || comparisonType === 'none') return null;
    const ch = comparisonTotals[channel];
    if (!ch) return null;
    const derived = calculateDerivedMetrics(ch);
    return { ...derived, label: comparisonType === 'previous_period' ? 'vs prev period' : 'vs prev year' };
  }, [comparisonTotals, comparisonType]);

  const renderKPICards = useCallback((cards: any[], comparisonMetrics?: any) => {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {cards.map((kpi: any) => {
          const compValue = comparisonMetrics ? comparisonMetrics[kpi.key] : null;
          const percentChange = compValue != null ? calculatePercentChange(kpi.value, compValue as number) : null;
          const isPositive = percentChange !== null && percentChange >= 0;
          const isCostMetric = ['cpc', 'cost', 'costOfSale'].includes(kpi.key);
          const isGood = isCostMetric ? !isPositive : isPositive;
          const compLabel = comparisonMetrics?.label;
          const formattedValue = (() => {
            if (kpi.format === 'currency') return formatNumber(kpi.value, 'currency');
            if (kpi.format === 'percent') return `${kpi.value.toFixed(2)}%`;
            if (kpi.format === 'roas') return `${kpi.value.toFixed(1)}x`;
            return formatNumber(kpi.value);
          })();
          const IconComponent = kpi.icon;
          return (
            <Card key={kpi.label} className="shadow-sm border-l-4 border-l-primary/60 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <IconComponent className={`h-4 w-4 ${kpi.color}`} />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                </div>
                <div className="text-2xl font-bold text-foreground">{formattedValue}</div>
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
    );
  }, []);

  const renderKPICardsSkeleton = useCallback(() => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <Card key={i} className="shadow-sm border-l-4 border-l-primary/60 bg-card">
          <CardContent className="p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  ), []);

  const renderChartSkeleton = useCallback(() => (
    <Card><CardContent className="p-6"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
  ), []);

  const renderTableSkeleton = useCallback(() => (
    <Card><CardContent className="p-6"><Skeleton className="h-[400px] w-full" /></CardContent></Card>
  ), []);

  // ========== Revenue Type state ==========
  const [revenueType, setRevenueType] = useState<'booking_date' | 'checkin_date'>('booking_date');

  // ========== Budget monthly data ==========
  const budgetMonthlyData = useBudgetMonthlyData(
    effectivePivotData,
    selectedViewId,
    viewBudgets,
    selectedYear,
    false,
    () => []
  );

  // ========== AI Summary ==========
  const overviewSummary = useGetSummaryForTab(slideReportId, 'overview', selectedYear, selectedMonth, selectedViewId);
  const metasearchSummary = useGetSummaryForTab(slideReportId, 'metasearch', selectedYear, selectedMonth, selectedViewId);
  const semSummary = useGetSummaryForTab(slideReportId, 'sem', selectedYear, selectedMonth, selectedViewId);
  const socialSummary = useGetSummaryForTab(slideReportId, 'social', selectedYear, selectedMonth, selectedViewId);

  // ========== Unified Breakdown Table ==========
  // Uses the top-level UnifiedBreakdownTable component (defined above the component)
  // which supports displayDataFromApi, apiBreakdowns, displayCurrency, etc.

  // ========== JSX Return ==========
  return (
    <div className="min-h-screen bg-background">
      {/* Data Studio: full-page loading while fetching from all sources */}
      {isDataStudioLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg font-medium">Fetching latest data from all sources…</p>
          <p className="text-sm text-muted-foreground">This may take a minute.</p>
        </div>
      )}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        {/* Header */}
        <SlideViewHeader
          selectedTab={selectedTab}
          setSelectedTab={setSelectedTab}
          navigate={navigate}
          accountId={accountId || ''}
          setIsShareModalOpen={setIsShareModalOpen}
          handleRefreshDataWithModal={handleRefreshDataWithModal}
          isRefreshModalOpen={isRefreshModalOpen}
          slideReport={slideReport}
          displayCurrency={slideType === 'master-report' ? displayCurrency : undefined}
          onDisplayCurrencyChange={slideType === 'master-report' ? handleDisplayCurrencyChange : undefined}
        />

        {/* Filters Row */}
        <div className="px-6 py-2 border-b">
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
            filterDimensionNames={filterDimensionNames}
            setFilterDimensionNames={setFilterDimensionNames}
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
        </div>

        {/* Comparison Banner */}
        {comparisonType !== 'none' && (
          <ComparisonBanner comparisonType={comparisonType} selectedTab={selectedTab} selectedYear={selectedYear} selectedMonth={selectedMonth} />
        )}

        {/* Tab Content */}
        <div className="px-6 py-4">
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0">
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
              onAISummaryClick={slideType !== 'master-report' ? () => setIsAISummaryModalOpen(true) : undefined}
              isAISummaryDisabled={!slideReportId}
              summaryText={slideType !== 'master-report' ? (overviewSummary?.summary_text || null) : null}
            />
          </TabsContent>

          {/* Channel Tabs */}
          {(['metasearch', 'sem', 'social'] as const).map(channel => (
            <TabsContent key={channel} value={channel} className="mt-0">
              <ChannelTab
                channel={channel}
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
                onAISummaryClick={slideType !== 'master-report' ? () => setIsAISummaryModalOpen(true) : undefined}
                isAISummaryDisabled={!slideReportId}
                summaryText={slideType !== 'master-report' ? (channel === 'metasearch' ? metasearchSummary?.summary_text : channel === 'sem' ? semSummary?.summary_text : socialSummary?.summary_text) : null}
                displayCurrency={slideType === 'master-report' ? displayCurrency : undefined}
              />
            </TabsContent>
          ))}

          {/* Budget Tab */}
          <TabsContent value="budget" className="mt-0">
            <BudgetTab
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              selectedViewId={selectedViewId}
              setSelectedViewId={setSelectedViewId}
              isReadOnlyMode={isReadOnlyMode}
              views={views.map(v => ({ id: v.id, name: v.name }))}
              handleApplyView={handleApplyView}
              isLoadingViewBudgets={isLoadingViewBudgets}
              isLoadingDisplayData={filteredData.isLoadingDisplayData}
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
          </TabsContent>

          {/* Booking Tab */}
          <TabsContent value="booking" className="mt-0">
            <BookingTab accountId={accountId} />
          </TabsContent>

          {/* Price Check Tab */}
          <TabsContent value="price-check" className="mt-0">
            <PriceCheckTab
              accountId={accountId}
              chartTimeRange={priceCheckChartTimeRange}
              onChartTimeRangeChange={setPriceCheckChartTimeRange}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Modals */}
      <EditSourceModal
        isOpen={isEditSourceOpen}
        onOpenChange={setIsEditSourceOpen}
        handleModalClose={setIsEditSourceOpen}
        modalStep={modalStep}
        handleNext={handleNext}
        handleBack={handleBack}
        sinceMonth={sinceMonth}
        setSinceMonth={setSinceMonth}
        sinceYear={sinceYear}
        setSinceYear={setSinceYear}
        selectedDimensions={selectedDimensions}
        handleDimensionToggle={handleDimensionToggle}
        selectedChannels={selectedChannels}
        activeChannelTab={activeChannelTab}
        setActiveChannelTab={setActiveChannelTab}
        dimensions={dimensions}
        dimensionValues={dimensionValues}
        loadingDimensions={loadingDimensions}
        loadingValues={loadingValues}
        channelConfigs={channelConfigs}
        handleDimensionChange={handleDimensionChange}
        handleValueToggle={handleValueToggle}
        handleSelectAllValues={handleSelectAllValues}
        handleDeselectAllValues={handleDeselectAllValues}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        breakdownDimensions={breakdownDimensions}
        breakdownConfigs={breakdownConfigs}
        handleBreakdownToggle={handleBreakdownToggle}
        loadingBreakdownDimensions={loadingBreakdownDimensions}
        filterConfigs={filterConfigs}
        handleFilterDimensionToggle={handleFilterDimensionToggle}
        availableDimensions={availableDimensions}
        selectedValueDimensionIds={selectedValueDimensionIds}
        handleValueDimensionToggle={handleValueDimensionToggle}
        handleSelectAllDimensions={handleSelectAllDimensions}
        handleDeselectAllDimensions={handleDeselectAllDimensions}
        loadingAvailableDimensions={loadingAvailableDimensions}
      />

      <RefreshDataModal
        open={isRefreshModalOpen}
        onOpenChange={setIsRefreshModalOpen}
        slideReportId={slideReportId}
        slideReport={slideReport}
        refreshStep={refreshStep}
        setRefreshStep={setRefreshStep}
        refreshStepStatus={refreshStepStatus}
        setRefreshStepStatus={setRefreshStepStatus}
        refreshError={refreshError}
        setRefreshError={setRefreshError}
      />

      {isDataModalOpen && slideReportId && (
        <SlideDataBrowser
          slideReportId={slideReportId}
          configuration={slideReport?.configuration as any}
          lastRefreshedAt={slideReport?.last_refreshed_at}
          reportIds={slideReport?.report_ids as any}
          pivotData={effectivePivotData}
          open={isDataModalOpen}
          onOpenChange={setIsDataModalOpen}
        />
      )}

      {isShareModalOpen && (
        <ShareModal
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
          reportId={slideReportId}
          reportName={slideReport?.name || 'Report'}
          slideReportId={slideReportId}
          accountId={accountId}
          currentFilterValues={filterValues}
        />
      )}

      {isAISummaryModalOpen && (
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

      <SaveViewDialog
        open={isSaveViewDialogOpen}
        onOpenChange={setIsSaveViewDialogOpen}
        onSave={handleSaveView}
      />

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
    </div>
  );
}