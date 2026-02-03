/**
 * Breakdown Table Section Component
 * 
 * Displays a unified breakdown analysis table with group by / breakdown by functionality.
 * Supports:
 * - Dynamic dimension selection for grouping and breakdown
 * - Expandable rows for drill-down analysis
 * - Filtering by date range and channel-specific filters
 * - Real-time totals calculation and synchronization with KPI cards
 * 
 * Uses data from pivot_data for optimal performance, falling back to raw data
 * processing when filters are applied.
 * 
 * @module BreakdownTableSection
 */

import React, { useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateDerivedMetrics, formatNumber, filterRawDataRows } from '@/lib/slideViewHelpers';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import type { SlideReportPivotData } from '@/types/slideReports';

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface BreakdownTableSectionProps {
  groupBy: string;
  breakdownBy: string;
  expandedRow: string | null;
  onRowClick: (rowValue: string | null) => void;
  onGroupByChange: (value: string) => void;
  onBreakdownByChange: (value: string) => void;
  availableDimensions: Dimension[];
  pivotData?: SlideReportPivotData | null;
  selectedChannel?: 'metasearch' | 'sem' | 'social' | 'overview';
  selectedYear?: string;
  selectedMonth?: string;
  filterValues?: Record<string, Record<string, string[]>>;
  filterDimensionValues?: Record<string, Record<string, string[]>>;
  onTotalsChange?: (totals: {
    impressions: number;
    clicks: number;
    cost: number;
    revenue: number;
    bookings: number;
  }) => void;
}

/**
 * Unified Breakdown Table Component
 * 
 * Renders a breakdown analysis table with group by and breakdown by dimensions.
 * Supports expandable rows for detailed drill-down analysis and automatically
 * synchronizes totals with parent KPI cards.
 * 
 * Uses data from pivot_data.channels[channel].monthlyBreakdowns for month-specific data
 * and falls back to raw data processing when filters are applied.
 * 
 * The component is memoized for performance optimization.
 * 
 * @param props - Component props
 * @returns UnifiedBreakdownTable component
 */
export const UnifiedBreakdownTable = React.memo<BreakdownTableSectionProps>(
  ({
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
  }) => {
    // Auto-select defaults when dimensions are available
    useEffect(() => {
      if (availableDimensions.length > 0) {
        // If current groupBy is not in available dimensions, select the first
        if (!availableDimensions.find((d) => d.id === groupBy)) {
          onGroupByChange(availableDimensions[0].id);
        }
        // If current breakdownBy is not in available dimensions or same as groupBy, select a different one
        if (
          !availableDimensions.find((d) => d.id === breakdownBy) ||
          breakdownBy === groupBy
        ) {
          const differentDim = availableDimensions.find((d) => d.id !== groupBy);
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
      const monthNum = MONTH_NAMES.indexOf(selectedMonth) + 1;
      return `${selectedYear}-${monthNum.toString().padStart(2, '0')}`;
    }, [selectedYear, selectedMonth]);

    // Get breakdown data from pivotData based on selected dimension and month
    // Applies filterValues if they are set
    const groupedData = useMemo(() => {
      if (!pivotData?.channels) return [];

      const groupByDim = availableDimensions.find((d) => d.id === groupBy);
      const groupByName = groupByDim?.name || groupBy;
      const groupByDimId = groupByDim?.id || groupBy;

      // Check if filters are actually applied for the selected channel (not "All" selected)
      const hasFilters =
        selectedChannel &&
        selectedChannel !== 'overview' &&
        filterValues?.[selectedChannel]
          ? Object.entries(filterValues[selectedChannel]).some(([dimensionId, selectedValues]) => {
              if (!selectedValues || selectedValues.length === 0) {
                return false; // Empty = "All" selected = no filter
              }
              // Check if all available values are selected (also means "All" = no filter)
              const availableValues =
                filterDimensionValues?.[selectedChannel]?.[dimensionId] || [];
              if (availableValues.length > 0 && selectedValues.length === availableValues.length) {
                // Check if they're the same set
                const selectedSet = new Set(selectedValues);
                const availableSet = new Set(availableValues);
                if (
                  selectedSet.size === availableSet.size &&
                  [...selectedSet].every((v) => availableSet.has(v))
                ) {
                  return false; // All values selected = "All" = no filter
                }
              }
              return true; // Subset selected = filter is applied
            })
          : false;

      // Collect breakdown data from all channels (or specific channel if selected)
      const allBreakdowns: Record<
        string,
        { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }
      > = {};

      const channelsToCheck =
        selectedChannel && selectedChannel !== 'overview'
          ? [selectedChannel]
          : Object.keys(pivotData.channels);

      for (const channel of channelsToCheck) {
        const channelData = pivotData.channels[channel];
        if (!channelData) continue;

        const rawDataRows = (channelData as any).rawDataRows || [];

        // Always use rawDataRows when available for consistency and completeness
        if (rawDataRows.length > 0) {
          const channelFilterValues =
            hasFilters && channel === selectedChannel
              ? filterValues?.[channel] || {}
              : {};

          // Build date range if month/year is selected
          let dateRange: { start: Date; end: Date } | undefined;
          if (monthKey) {
            const [year, monthNum] = monthKey.split('-').map(Number);
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
          const dimensionMap = (channelData as any).dimensionMap || {};
          const metricNameToIdMap: Record<string, string> = {};
          Object.entries(dimensionMap as Record<string, string>).forEach(
            ([dimensionId, dimensionName]) => {
              if (dimensionName && typeof dimensionName === 'string') {
                metricNameToIdMap[dimensionName] = dimensionId;
              }
            }
          );

          // Aggregate metrics for each group
          Object.entries(groupedRows).forEach(([groupValue, groupRows]) => {
            if (!allBreakdowns[groupValue]) {
              allBreakdowns[groupValue] = {
                impressions: 0,
                clicks: 0,
                cost: 0,
                revenue: 0,
                bookings: 0,
              };
            }

            groupRows.forEach((row) => {
              const rowData = row.dimension_values || row;

              // Use EXACT same extraction logic as computeBreakdownAllTime/computeBreakdownForMonth
              const impressionsValue =
                parseFloat(
                  rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0
                ) || 0;
              const clicksValue =
                parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
              const costValue =
                parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
              const revenueValue =
                parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
              const bookingsValue =
                parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) ||
                0;

              allBreakdowns[groupValue].impressions += impressionsValue;
              allBreakdowns[groupValue].clicks += clicksValue;
              allBreakdowns[groupValue].cost += costValue;
              allBreakdowns[groupValue].revenue += revenueValue;
              allBreakdowns[groupValue].bookings += bookingsValue;
            });
          });
        } else {
          // Fallback: No rawDataRows available - use pre-computed breakdown data
          let breakdownData: any[] = [];

          if (monthKey && channelData.monthlyBreakdowns?.[monthKey]) {
            breakdownData = channelData.monthlyBreakdowns[monthKey][groupByName] || [];
          } else if (channelData.breakdowns) {
            breakdownData = channelData.breakdowns[groupByName] || [];
          }

          breakdownData.forEach((row: any) => {
            const groupValue =
              row.name || row[groupByName.toLowerCase().replace(/\s+/g, '_')] || 'Unknown';
            if (!allBreakdowns[groupValue]) {
              allBreakdowns[groupValue] = {
                impressions: 0,
                clicks: 0,
                cost: 0,
                revenue: 0,
                bookings: 0,
              };
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
    }, [
      pivotData,
      groupBy,
      availableDimensions,
      selectedChannel,
      monthKey,
      filterValues,
      filterDimensionValues,
      selectedYear,
    ]);

    // Get breakdown data for expanded row
    const getExpandedBreakdownData = useMemo(() => {
      if (!expandedRow || !pivotData?.channels || !breakdownBy) return [];

      const groupByDim = availableDimensions.find((d) => d.id === groupBy);
      const groupByDimId = groupByDim?.id || groupBy;
      const groupByName = groupByDim?.name || groupBy;

      const breakdownByDim = availableDimensions.find((d) => d.id === breakdownBy);
      const breakdownByName = breakdownByDim?.name || breakdownBy;
      const breakdownByDimId = breakdownByDim?.id || breakdownBy;

      const channelsToCheck =
        selectedChannel && selectedChannel !== 'overview'
          ? [selectedChannel]
          : Object.keys(pivotData.channels);

      // Check if filters are actually applied
      const hasFilters =
        selectedChannel &&
        selectedChannel !== 'overview' &&
        filterValues?.[selectedChannel]
          ? Object.entries(filterValues[selectedChannel]).some(([dimensionId, selectedValues]) => {
              if (!selectedValues || selectedValues.length === 0) {
                return false;
              }
              const availableValues =
                filterDimensionValues?.[selectedChannel]?.[dimensionId] || [];
              if (availableValues.length > 0 && selectedValues.length === availableValues.length) {
                const selectedSet = new Set(selectedValues);
                const availableSet = new Set(availableValues);
                if (
                  selectedSet.size === availableSet.size &&
                  [...selectedSet].every((v) => availableSet.has(v))
                ) {
                  return false;
                }
              }
              return true;
            })
          : false;

      const allBreakdowns: Record<
        string,
        { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }
      > = {};

      for (const channel of channelsToCheck) {
        const channelData = pivotData.channels[channel];
        if (!channelData) continue;

        // Build date range if month is selected
        let dateRange: { start: Date; end: Date } | undefined;
        if (monthKey) {
          const [year, monthNum] = monthKey.split('-').map(Number);
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

        const rawDataRows = (channelData as any).rawDataRows || [];

        // Apply filters if they exist
        let filteredRows = rawDataRows;
        if (hasFilters && channel === selectedChannel) {
          const channelFilterValues = filterValues?.[channel] || {};
          filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange);
        } else if (dateRange) {
          filteredRows = filterRawDataRows(rawDataRows, {}, dateRange);
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
          const breakdownValue =
            rowData[breakdownByDimId] || rowData[breakdownByName] || 'Unknown';
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
            allBreakdowns[breakdownValue] = {
              impressions: 0,
              clicks: 0,
              cost: 0,
              revenue: 0,
              bookings: 0,
            };
          }

          const dimensionMap = (channelData as any).dimensionMap || {};
          const metricNameToIdMap: Record<string, string> = {};
          Object.entries(dimensionMap as Record<string, string>).forEach(
            ([dimensionId, dimensionName]) => {
              if (dimensionName && typeof dimensionName === 'string') {
                metricNameToIdMap[dimensionName] = dimensionId;
              }
            }
          );

          groupRows.forEach((row) => {
            const rowData = row.dimension_values || row;

            allBreakdowns[breakdownValue].impressions +=
              parseFloat(
                rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0
              ) || 0;
            allBreakdowns[breakdownValue].clicks +=
              parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
            allBreakdowns[breakdownValue].cost +=
              parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
            allBreakdowns[breakdownValue].revenue +=
              parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
            allBreakdowns[breakdownValue].bookings +=
              parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) || 0;
          });
        });
      }

      return Object.entries(allBreakdowns)
        .filter(([value]) => value && value !== 'Unknown')
        .sort(([, a], [, b]) => b.revenue - a.revenue)
        .map(([value, data]) => ({
          value,
          metrics: calculateDerivedMetrics(data),
        }));
    }, [
      expandedRow,
      pivotData,
      breakdownBy,
      availableDimensions,
      selectedChannel,
      monthKey,
      filterValues,
      filterDimensionValues,
      selectedYear,
      groupBy,
    ]);

    // Calculate totals
    const totals = groupedData.reduce(
      (acc, group) => ({
        impressions: acc.impressions + (group.rawData?.impressions || group.metrics.impressions || 0),
        clicks: acc.clicks + (group.rawData?.clicks || group.metrics.clicks || 0),
        cost: acc.cost + (group.rawData?.cost || group.metrics.cost || 0),
        revenue: acc.revenue + (group.rawData?.revenue || group.metrics.revenue || 0),
        bookings: acc.bookings + (group.rawData?.bookings || group.metrics.bookings || 0),
      }),
      { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }
    );
    const totalMetrics = calculateDerivedMetrics(totals);

    // Expose totals to parent component for KPI cards synchronization
    useEffect(() => {
      if (onTotalsChange && selectedChannel) {
        onTotalsChange(totals);
      }
    }, [totals, onTotalsChange, selectedChannel]);

    const groupByDim = availableDimensions.find((d) => d.id === groupBy);
    const breakdownByDim = availableDimensions.find((d) => d.id === breakdownBy);

    // Filter available dimensions to exclude currently selected for each dropdown
    const groupByOptions = availableDimensions;
    const breakdownByOptions = availableDimensions.filter((d) => d.id !== groupBy);

    // Show message if no data
    if (groupedData.length === 0) {
      return (
        <div className="space-y-4">
          {/* Dropdowns */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Group by:</Label>
              <Select
                value={groupBy}
                onValueChange={(value) => {
                  onGroupByChange(value);
                  onRowClick(null);
                }}
              >
                <SelectTrigger className="w-40 bg-background border border-input">
                  <SelectValue placeholder="Select dimension" />
                </SelectTrigger>
                <SelectContent>
                  {groupByOptions.map((dim) => (
                    <SelectItem key={dim.id} value={dim.id}>
                      {dim.name}
                    </SelectItem>
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
                  {breakdownByOptions.map((dim) => (
                    <SelectItem key={dim.id} value={dim.id}>
                      {dim.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-center py-8 text-muted-foreground">
            <p>No breakdown data available.</p>
            <p className="text-sm mt-2">
              Configure breakdown dimensions in the Data Source modal and click "Refresh Data" to
              compute breakdown tables.
            </p>
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
            <Select
              value={groupBy}
              onValueChange={(value) => {
                onGroupByChange(value);
                onRowClick(null);
              }}
            >
              <SelectTrigger className="w-40 bg-background border border-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groupByOptions.map((dim) => (
                  <SelectItem key={dim.id} value={dim.id}>
                    {dim.name}
                  </SelectItem>
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
                {breakdownByOptions.map((dim) => (
                  <SelectItem key={dim.id} value={dim.id}>
                    {dim.name}
                  </SelectItem>
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
              <TableHead className="text-right">Net GP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedData.map((group) => {
              const netGp = group.metrics.revenue * 0.15 - group.metrics.cost;

              return (
                <React.Fragment key={group.groupValue}>
                  <TableRow
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() =>
                      onRowClick(expandedRow === group.groupValue ? null : group.groupValue)
                    }
                  >
                    <TableCell className="w-8">
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 transition-transform',
                          expandedRow === group.groupValue && 'rotate-90'
                        )}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{group.groupValue}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(group.metrics.impressions)}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(group.metrics.clicks)}</TableCell>
                    <TableCell className="text-right">{group.metrics.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">{group.metrics.bookings.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {group.metrics.conversionRate.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right">
                      $
                      {group.metrics.cpc < 0.01
                        ? group.metrics.cpc.toFixed(4)
                        : group.metrics.cpc.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(group.metrics.cost, 'currency')}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(group.metrics.revenue, 'currency')}
                    </TableCell>
                    <TableCell className="text-right">{group.metrics.roas.toFixed(1)}x</TableCell>
                    <TableCell className="text-right">
                      {group.metrics.costOfSale < 0.01
                        ? group.metrics.costOfSale.toFixed(4)
                        : group.metrics.costOfSale.toFixed(2)}
                      %
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(netGp, 'currency')}</TableCell>
                  </TableRow>
                  {/* Expanded breakdown rows */}
                  {expandedRow === group.groupValue && getExpandedBreakdownData.length > 0 && (
                    <>
                      {getExpandedBreakdownData.map((item) => {
                        const netGpExpanded = item.metrics.revenue * 0.15 - item.metrics.cost;

                        return (
                          <TableRow key={`${group.groupValue}-${item.value}`} className="bg-muted/30">
                            <TableCell></TableCell>
                            <TableCell className="pl-8 text-muted-foreground">
                              <span className="text-xs uppercase mr-2">{breakdownByDim?.name}:</span>
                              {item.value}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatNumber(item.metrics.impressions)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatNumber(item.metrics.clicks)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {item.metrics.ctr.toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {item.metrics.bookings.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {item.metrics.conversionRate.toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              $
                              {item.metrics.cpc < 0.01
                                ? item.metrics.cpc.toFixed(4)
                                : item.metrics.cpc.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatNumber(item.metrics.cost, 'currency')}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatNumber(item.metrics.revenue, 'currency')}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {item.metrics.roas.toFixed(1)}x
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {item.metrics.costOfSale < 0.01
                                ? item.metrics.costOfSale.toFixed(4)
                                : item.metrics.costOfSale.toFixed(2)}
                              %
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatNumber(netGpExpanded, 'currency')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </>
                  )}
                </React.Fragment>
              );
            })}
            {/* Totals Row */}
            <TableRow className="bg-muted/50 font-semibold border-t-2">
              <TableCell></TableCell>
              <TableCell className="font-bold">Total</TableCell>
              <TableCell className="text-right">{formatNumber(totalMetrics.impressions)}</TableCell>
              <TableCell className="text-right">{formatNumber(totalMetrics.clicks)}</TableCell>
              <TableCell className="text-right">{totalMetrics.ctr.toFixed(2)}%</TableCell>
              <TableCell className="text-right">{totalMetrics.bookings.toFixed(2)}</TableCell>
              <TableCell className="text-right">
                {totalMetrics.conversionRate.toFixed(2)}%
              </TableCell>
              <TableCell className="text-right">
                ${totalMetrics.cpc < 0.01 ? totalMetrics.cpc.toFixed(4) : totalMetrics.cpc.toFixed(2)}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(totalMetrics.cost, 'currency')}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(totalMetrics.revenue, 'currency')}
              </TableCell>
              <TableCell className="text-right">{totalMetrics.roas.toFixed(1)}x</TableCell>
              <TableCell className="text-right">
                {totalMetrics.costOfSale < 0.01
                  ? totalMetrics.costOfSale.toFixed(4)
                  : totalMetrics.costOfSale.toFixed(2)}
                %
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(totalMetrics.revenue * 0.15 - totalMetrics.cost, 'currency')}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }
);

UnifiedBreakdownTable.displayName = 'UnifiedBreakdownTable';

/**
 * Breakdown Table Section Component
 * Wrapper component that includes the card and title
 */
export const BreakdownTableSection = React.memo<{
  title?: string;
  children: React.ReactNode;
}>(({ title = 'Breakdown Analysis', children }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
});

BreakdownTableSection.displayName = 'BreakdownTableSection';