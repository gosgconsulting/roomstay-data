/**
 * Canonical Breakdown Table Section Component
 *
 * Displays a unified breakdown analysis table with group by / breakdown by functionality.
 * Supports:
 * - Dynamic dimension selection for grouping and breakdown
 * - Expandable rows for drill-down analysis
 * - Filtering by date range and channel-specific filters
 * - Real-time totals calculation and synchronization with KPI cards
 * - Comparison totals display
 *
 * Data source: rawDataRows from dimension_data (canonical path).
 * Legacy pivot_data blobs used only as last-resort fallback when rawDataRows is empty.
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
import { calculateDerivedMetrics, formatNumber, filterRawDataRows, hasActiveFiltersForChannel } from '@/lib/slideViewHelpers';
import { parseSelectedMonths, buildMultiMonthDateRange } from '@/lib/monthUtils';
import type { SlideReportPivotData } from '@/types/slideReports';

const GROSS_PROFIT_RATE = 0.15;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _calculateGrossProfit = (revenue: number, cost: number) => revenue * GROSS_PROFIT_RATE - cost;

interface Dimension {
  id: string;
  name: string;
  type: string;
}

export interface UnifiedBreakdownTableProps {
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
  /** Exact date range override — when set, filtering uses precise from/to dates instead of month boundaries. */
  customDateRange?: import('react-day-picker').DateRange | undefined;
  filterValues?: Record<string, Record<string, string[]>>;
  filterDimensionValues?: Record<string, Record<string, string[]>>;
  onTotalsChange?: (totals: {
    impressions: number;
    clicks: number;
    cost: number;
    revenue: number;
    bookings: number;
  }) => void;
  /** Display currency for formatting (AUD/USD). */
  displayCurrency?: 'AUD' | 'USD';
  /** Comparison totals per channel for showing % change on total row */
  comparisonChannelTotals?: Record<string, any> | null;
  comparisonType?: string;
}

/**
 * Canonical Unified Breakdown Table Component
 *
 * Renders a breakdown analysis table with group by and breakdown by dimensions.
 * Supports expandable rows for detailed drill-down analysis and automatically
 * synchronizes totals with parent KPI cards.
 *
 * Primary data path: rawDataRows from dimension_data (via pivotData.channels[ch].rawDataRows).
 * Fallback: pre-computed monthlyBreakdowns / breakdowns blobs (legacy pivot_data).
 */
export const UnifiedBreakdownTable = React.memo<UnifiedBreakdownTableProps>(
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
    customDateRange,
    filterValues,
    filterDimensionValues,
    onTotalsChange,
    displayCurrency,
    comparisonChannelTotals,
    comparisonType,
  }) => {
    // Auto-select defaults when dimensions are available
    useEffect(() => {
      if (availableDimensions.length > 0) {
        if (!availableDimensions.find((d) => d.id === groupBy)) {
          onGroupByChange(availableDimensions[0].id);
        }
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

    const parsedMonths = useMemo(() => {
      if (!selectedYear || selectedYear === 'all' || !selectedMonth || selectedMonth === 'all') {
        return null;
      }
      return parseSelectedMonths(selectedMonth);
    }, [selectedYear, selectedMonth]);

    const monthKey = useMemo(() => {
      if (!parsedMonths || parsedMonths.length !== 1) return null;
      return `${selectedYear}-${parsedMonths[0].toString().padStart(2, '0')}`;
    }, [selectedYear, parsedMonths]);

    // Build date range: prefer customDateRange, then month/year boundaries
    const breakdownDateRange = useMemo(() => {
      if (customDateRange?.from) {
        const from = customDateRange.from;
        const to = customDateRange.to ?? customDateRange.from;
        return {
          start: from,
          end: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999),
        };
      }
      return buildMultiMonthDateRange(selectedYear || 'all', selectedMonth || 'all');
    }, [customDateRange, selectedYear, selectedMonth]);

    const groupedData = useMemo(() => {
      if (!pivotData?.channels) return [];

      const groupByDim = availableDimensions.find((d) => d.id === groupBy);
      const groupByName = groupByDim?.name || groupBy;
      const groupByDimId = groupByDim?.id || groupBy;

      const hasFilters =
        selectedChannel &&
        selectedChannel !== 'overview' &&
        filterValues?.[selectedChannel]
          ? hasActiveFiltersForChannel(
              filterValues[selectedChannel],
              filterDimensionValues?.[selectedChannel]
            )
          : false;

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

        if (rawDataRows.length > 0) {
          const channelFilterValues =
            hasFilters && channel === selectedChannel
              ? filterValues?.[channel] || {}
              : {};

          const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, breakdownDateRange ?? undefined);

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

          const dimensionMap = (channelData as any).dimensionMap || {};
          const metricNameToIdMap: Record<string, string> = {};
          Object.entries(dimensionMap as Record<string, string>).forEach(
            ([dimensionId, dimensionName]) => {
              if (dimensionName && typeof dimensionName === 'string') {
                metricNameToIdMap[dimensionName] = dimensionId;
              }
            }
          );

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

              allBreakdowns[groupValue].impressions +=
                parseFloat(
                  rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0
                ) || 0;
              allBreakdowns[groupValue].clicks +=
                parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
              allBreakdowns[groupValue].cost +=
                parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
              allBreakdowns[groupValue].revenue +=
                parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
              allBreakdowns[groupValue].bookings +=
                parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) ||
                0;
            });
          });
        } else {
          // Fallback: no rawDataRows — use pre-computed breakdown blobs (legacy pivot_data)
          let breakdownData: any[] = [];

          if (monthKey && (channelData as any).monthlyBreakdowns?.[monthKey]) {
            breakdownData = (channelData as any).monthlyBreakdowns[monthKey][groupByName] || [];
          } else if ((channelData as any).breakdowns) {
            breakdownData = (channelData as any).breakdowns[groupByName] || [];
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

      return Object.entries(allBreakdowns)
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

          return {
            groupValue,
            metrics: calculateDerivedMetrics(cleanData),
            rawData: cleanData,
          };
        });
    }, [
      pivotData,
      groupBy,
      availableDimensions,
      selectedChannel,
      parsedMonths,
      monthKey,
      filterValues,
      filterDimensionValues,
      selectedYear,
      breakdownDateRange,
    ]);

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

      const hasFilters =
        selectedChannel &&
        selectedChannel !== 'overview' &&
        filterValues?.[selectedChannel]
          ? hasActiveFiltersForChannel(
              filterValues[selectedChannel],
              filterDimensionValues?.[selectedChannel]
            )
          : false;

      const allBreakdowns: Record<
        string,
        { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }
      > = {};

      for (const channel of channelsToCheck) {
        const channelData = pivotData.channels[channel];
        if (!channelData) continue;

        const rawDataRows = (channelData as any).rawDataRows || [];

        let filteredRows = rawDataRows;
        if (hasFilters && channel === selectedChannel) {
          filteredRows = filterRawDataRows(rawDataRows, filterValues?.[channel] || {}, breakdownDateRange ?? undefined);
        } else if (breakdownDateRange) {
          filteredRows = filterRawDataRows(rawDataRows, {}, breakdownDateRange);
        }

        const rowsForExpandedRow = filteredRows.filter((row: any) => {
          const rowData = row.dimension_values || row;
          const rowGroupValue = rowData[groupByDimId] || rowData[groupByName];
          return String(rowGroupValue || '').trim() === String(expandedRow).trim();
        });

        const groupedRows: Record<string, any[]> = {};
        rowsForExpandedRow.forEach((row: any) => {
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

        const dimensionMap = (channelData as any).dimensionMap || {};
        const metricNameToIdMap: Record<string, string> = {};
        Object.entries(dimensionMap as Record<string, string>).forEach(
          ([dimensionId, dimensionName]) => {
            if (dimensionName && typeof dimensionName === 'string') {
              metricNameToIdMap[dimensionName] = dimensionId;
            }
          }
        );

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

          groupRows.forEach((row: any) => {
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
      parsedMonths,
      monthKey,
      filterValues,
      filterDimensionValues,
      selectedYear,
      groupBy,
      breakdownDateRange,
    ]);

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

    // Expose totals to parent for KPI cards synchronization
    useEffect(() => {
      if (onTotalsChange && selectedChannel) {
        onTotalsChange(totals);
      }
    }, [totals, onTotalsChange, selectedChannel]);

    const groupByDim = availableDimensions.find((d) => d.id === groupBy);
    const breakdownByDim = availableDimensions.find((d) => d.id === breakdownBy);
    const groupByOptions = availableDimensions;
    const breakdownByOptions = availableDimensions.filter((d) => d.id !== groupBy);

    // Comparison totals for the active channel
    const compTotals = selectedChannel && selectedChannel !== 'overview'
      ? comparisonChannelTotals?.[selectedChannel]
      : null;

    const renderPercentChange = (current: number, comparison: number | undefined) => {
      if (comparison == null || comparison === 0) return null;
      const pct = ((current - comparison) / Math.abs(comparison)) * 100;
      const isPositive = pct >= 0;
      return (
        <span className={cn('ml-1 text-xs', isPositive ? 'text-green-600' : 'text-red-500')}>
          {isPositive ? '+' : ''}{pct.toFixed(1)}%
        </span>
      );
    };

    if (groupedData.length === 0) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Group by:</Label>
              <Select value={groupBy} onValueChange={(value) => { onGroupByChange(value); onRowClick(null); }}>
                <SelectTrigger className="w-40 bg-background border border-input">
                  <SelectValue placeholder="Select dimension" />
                </SelectTrigger>
                <SelectContent>
                  {groupByOptions.map((dim) => (
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
                  {breakdownByOptions.map((dim) => (
                    <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
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
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Group by:</Label>
            <Select value={groupBy} onValueChange={(value) => { onGroupByChange(value); onRowClick(null); }}>
              <SelectTrigger className="w-40 bg-background border border-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groupByOptions.map((dim) => (
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
                {breakdownByOptions.map((dim) => (
                  <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <Table className="min-w-max">
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
                    <TableCell className="text-right">{formatNumber(group.metrics.impressions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(group.metrics.clicks)}</TableCell>
                    <TableCell className="text-right">{group.metrics.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">{group.metrics.bookings.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{group.metrics.conversionRate.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(group.metrics.cpc, 'currency', displayCurrency, group.metrics.cpc < 0.01 ? 4 : 2)}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(group.metrics.cost, 'currency', displayCurrency)}</TableCell>
                    <TableCell className="text-right">{formatNumber(group.metrics.revenue, 'currency', displayCurrency)}</TableCell>
                    <TableCell className="text-right">{group.metrics.roas.toFixed(1)}x</TableCell>
                    <TableCell className="text-right">
                      {group.metrics.costOfSale < 0.01
                        ? group.metrics.costOfSale.toFixed(4)
                        : group.metrics.costOfSale.toFixed(2)}%
                    </TableCell>
                  </TableRow>
                  {expandedRow === group.groupValue && getExpandedBreakdownData.length > 0 && (
                    <>
                      {getExpandedBreakdownData.map((item) => (
                        <TableRow key={`${group.groupValue}-${item.value}`} className="bg-muted/30">
                          <TableCell></TableCell>
                          <TableCell className="pl-8 text-muted-foreground">
                            <span className="text-xs uppercase mr-2">{breakdownByDim?.name}:</span>
                            {item.value}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.impressions)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.clicks)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.metrics.ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.metrics.bookings.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.metrics.conversionRate.toFixed(2)}%</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatNumber(item.metrics.cpc, 'currency', displayCurrency, item.metrics.cpc < 0.01 ? 4 : 2)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.cost, 'currency', displayCurrency)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.revenue, 'currency', displayCurrency)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.metrics.roas.toFixed(1)}x</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.metrics.costOfSale < 0.01
                              ? item.metrics.costOfSale.toFixed(4)
                              : item.metrics.costOfSale.toFixed(2)}%
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
                <TableCell className="font-bold">
                  Total
                  {compType !== 'none' && compTotals && renderPercentChange(totals.revenue, compTotals.revenue)}
                </TableCell>
                <TableCell className="text-right">{formatNumber(totalMetrics.impressions)}</TableCell>
                <TableCell className="text-right">{formatNumber(totalMetrics.clicks)}</TableCell>
                <TableCell className="text-right">{totalMetrics.ctr.toFixed(2)}%</TableCell>
                <TableCell className="text-right">{totalMetrics.bookings.toFixed(2)}</TableCell>
                <TableCell className="text-right">{totalMetrics.conversionRate.toFixed(2)}%</TableCell>
                <TableCell className="text-right">
                  {formatNumber(totalMetrics.cpc, 'currency', displayCurrency, totalMetrics.cpc < 0.01 ? 4 : 2)}
                </TableCell>
                <TableCell className="text-right">{formatNumber(totalMetrics.cost, 'currency', displayCurrency)}</TableCell>
                <TableCell className="text-right">{formatNumber(totalMetrics.revenue, 'currency', displayCurrency)}</TableCell>
                <TableCell className="text-right">{totalMetrics.roas.toFixed(1)}x</TableCell>
                <TableCell className="text-right">
                  {totalMetrics.costOfSale < 0.01
                    ? totalMetrics.costOfSale.toFixed(4)
                    : totalMetrics.costOfSale.toFixed(2)}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }
);

UnifiedBreakdownTable.displayName = 'UnifiedBreakdownTable';

/**
 * Breakdown Table Section Card Wrapper
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

// Re-export compType for use in parent
export type { Dimension as BreakdownDimension };
