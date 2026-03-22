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
import { calculateDerivedMetrics, formatNumber, filterRawDataRows, hasActiveFiltersForChannel, aggregateRowsToMetrics, buildMetricNameToIdsMap, getMetricValueFromRow } from '@/lib/slideViewHelpers';
import { parseSelectedMonths, buildMultiMonthDateRange } from '@/lib/monthUtils';
import type { SlideReportPivotData } from '@/types/slideReports';

/** Get value from row by dimension ID or by matching dimension name in dimensionMap (row keys are dimension IDs) */
function getDimensionValueFromRow(
  rowData: Record<string, unknown>,
  dimensionMap: Record<string, string>,
  dimensionId: string,
  dimensionName: string
): string | undefined {
  const byId = rowData[dimensionId];
  if (byId !== undefined && byId !== null && String(byId).trim() !== '') return String(byId);
  const nameLower = String(dimensionName).toLowerCase().trim();
  const entry = Object.entries(dimensionMap).find(
    ([, name]) => name && String(name).toLowerCase().trim() === nameLower
  );
  if (!entry) return undefined;
  const val = rowData[entry[0]];
  return val !== undefined && val !== null ? String(val) : undefined;
}

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
  /** Display currency for formatting (AUD/USD). */
  displayCurrency?: 'AUD' | 'USD';
  /** Comparison totals per channel for showing % change on total row */
  comparisonChannelTotals?: Record<string, any> | null;
  comparisonType?: string;
  /**
   * Global dimension-ID → human-name map (from breakdownDimensions).
   * Merged with per-channel dimensionMap so filterRawDataRows can resolve
   * global/configured filter UUIDs to report-specific row keys.
   */
  configuredDimensionNames?: Record<string, string>;
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
    filterDimensionValues: _filterDimensionValues,
    displayCurrency,
    comparisonChannelTotals,
    comparisonType,
    configuredDimensionNames,
  }) => {
    // Auto-select defaults when dimensions are available.
    // groupBy / breakdownBy may be a dimension ID (UUID) or a lowercase name hint (e.g. 'hotel', 'account').
    // Resolution order: exact ID match → case-insensitive name match → first available dimension.
    useEffect(() => {
      if (availableDimensions.length === 0) return;

      const resolveId = (hint: string, exclude?: string): string => {
        // Exact UUID match
        const exact = availableDimensions.find((d) => d.id === hint);
        if (exact && exact.id !== exclude) return exact.id;
        // Name match (case-insensitive)
        const byName = availableDimensions.find(
          (d) => d.name.toLowerCase() === hint.toLowerCase() && d.id !== exclude
        );
        if (byName) return byName.id;
        // Fallback: first dim that isn't excluded
        const fallback = availableDimensions.find((d) => d.id !== exclude);
        return fallback?.id ?? availableDimensions[0].id;
      };

      const resolvedGroupBy = resolveId(groupBy);
      if (resolvedGroupBy !== groupBy) {
        onGroupByChange(resolvedGroupBy);
      }

      const resolvedBreakdownBy = resolveId(breakdownBy, resolvedGroupBy);
      if (resolvedBreakdownBy !== breakdownBy || breakdownBy === resolvedGroupBy) {
        onBreakdownByChange(resolvedBreakdownBy);
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

      const groupByDim =
        availableDimensions.find((d) => d.id === groupBy) ??
        availableDimensions.find((d) => d.name.toLowerCase() === String(groupBy).toLowerCase());
      const groupByName = groupByDim?.name || groupBy;
      const groupByDimId = groupByDim?.id || groupBy;

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
        const dimensionMap = (channelData as any).dimensionMap || {};
        const combinedDimNames = configuredDimensionNames
          ? { ...dimensionMap, ...configuredDimensionNames }
          : dimensionMap;

        if (rawDataRows.length > 0) {
          const channelFilterValues = filterValues?.[channel] || {};
          const hasChannelFilters = hasActiveFiltersForChannel(channelFilterValues);
          const effectiveFilterValues = hasChannelFilters ? channelFilterValues : {};

          const filteredRows = filterRawDataRows(rawDataRows, effectiveFilterValues, breakdownDateRange ?? undefined, combinedDimNames);

          const groupedRows: Record<string, any[]> = {};
          filteredRows.forEach((row) => {
            const rowData = (row.dimension_values || row) as Record<string, unknown>;
            const groupValue =
              getDimensionValueFromRow(rowData, dimensionMap, groupByDimId, groupByName) ?? 'Unknown';
            const normalizedGroupValue = String(groupValue).trim();

            if (normalizedGroupValue && normalizedGroupValue !== 'Unknown') {
              if (!groupedRows[normalizedGroupValue]) {
                groupedRows[normalizedGroupValue] = [];
              }
              groupedRows[normalizedGroupValue].push(row);
            }
          });

          Object.entries(groupedRows).forEach(([groupValue, groupRows]) => {
            if (!allBreakdowns[groupValue]) {
              allBreakdowns[groupValue] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            }
            const agg = aggregateRowsToMetrics(groupRows, dimensionMap);
            allBreakdowns[groupValue].impressions += agg.impressions;
            allBreakdowns[groupValue].clicks += agg.clicks;
            allBreakdowns[groupValue].cost += agg.cost;
            allBreakdowns[groupValue].revenue += agg.revenue;
            allBreakdowns[groupValue].bookings += agg.bookings;
          });
        } else {
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
      breakdownDateRange,
      configuredDimensionNames,
    ]);


    const getExpandedBreakdownData = useMemo(() => {
      if (!expandedRow || !pivotData?.channels || !breakdownBy) return [];

      const groupByDim =
        availableDimensions.find((d) => d.id === groupBy) ??
        availableDimensions.find((d) => d.name.toLowerCase() === String(groupBy).toLowerCase());
      const groupByDimId = groupByDim?.id || groupBy;
      const groupByName = groupByDim?.name || groupBy;

      const breakdownByDim =
        availableDimensions.find((d) => d.id === breakdownBy) ??
        availableDimensions.find((d) => d.name.toLowerCase() === String(breakdownBy).toLowerCase());
      const breakdownByName = breakdownByDim?.name || breakdownBy;
      const breakdownByDimId = breakdownByDim?.id || breakdownBy;

      const channelsToCheck =
        selectedChannel && selectedChannel !== 'overview'
          ? [selectedChannel]
          : Object.keys(pivotData.channels);

      const allBreakdowns: Record<
        string,
        { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }
      > = {};

      for (const channel of channelsToCheck) {
        const channelData = pivotData.channels[channel];
        if (!channelData) continue;

        const rawDataRows = (channelData as any).rawDataRows || [];
        const dimensionMap = (channelData as any).dimensionMap || {};
        const combinedDimNames = configuredDimensionNames
          ? { ...dimensionMap, ...configuredDimensionNames }
          : dimensionMap;

        const channelFilterValues = filterValues?.[channel] || {};
        const hasChannelFilters = hasActiveFiltersForChannel(channelFilterValues);

        let filteredRows: any[];
        if (hasChannelFilters) {
          filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, breakdownDateRange ?? undefined, combinedDimNames);
        } else if (breakdownDateRange) {
          filteredRows = filterRawDataRows(rawDataRows, {}, breakdownDateRange);
        } else {
          filteredRows = rawDataRows;
        }

        const rowsForExpandedRow = filteredRows.filter((row: any) => {
          const rowData = (row.dimension_values || row) as Record<string, unknown>;
          const rowGroupValue =
            getDimensionValueFromRow(rowData, dimensionMap, groupByDimId, groupByName) ?? '';
          return String(rowGroupValue).trim() === String(expandedRow).trim();
        });

        const groupedRows: Record<string, any[]> = {};
        rowsForExpandedRow.forEach((row: any) => {
          const rowData = (row.dimension_values || row) as Record<string, unknown>;
          const breakdownValue =
            getDimensionValueFromRow(rowData, dimensionMap, breakdownByDimId, breakdownByName) ?? 'Unknown';
          const normalizedBreakdownValue = String(breakdownValue).trim();

          if (normalizedBreakdownValue && normalizedBreakdownValue !== 'Unknown') {
            if (!groupedRows[normalizedBreakdownValue]) {
              groupedRows[normalizedBreakdownValue] = [];
            }
            groupedRows[normalizedBreakdownValue].push(row);
          }
        });

        const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap as Record<string, string>);

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
            const rowData = (row.dimension_values || row) as Record<string, unknown>;

            allBreakdowns[breakdownValue].impressions += getMetricValueFromRow(rowData, 'impressions', nameToIdsMap);
            allBreakdowns[breakdownValue].clicks += getMetricValueFromRow(rowData, 'clicks', nameToIdsMap);
            allBreakdowns[breakdownValue].cost += getMetricValueFromRow(rowData, 'cost', nameToIdsMap);
            allBreakdowns[breakdownValue].revenue += getMetricValueFromRow(rowData, 'revenue', nameToIdsMap);
            allBreakdowns[breakdownValue].bookings += getMetricValueFromRow(rowData, 'bookings', nameToIdsMap);
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
      groupBy,
      breakdownDateRange,
      configuredDimensionNames,
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

    const groupByDim = availableDimensions.find((d) => d.id === groupBy);
    const breakdownByDim = availableDimensions.find((d) => d.id === breakdownBy);
    const groupByOptions = availableDimensions;
    const breakdownByOptions = availableDimensions.filter((d) => d.id !== groupBy);

    const renderMetricCell = (currentDisplay: string) => (
      <span>{currentDisplay}</span>
    );

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
                <TableHead className="text-right">AOV</TableHead>
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
                    <TableCell className="text-right">{renderMetricCell(formatNumber(group.metrics.impressions))}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(formatNumber(group.metrics.clicks))}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(`${group.metrics.ctr.toFixed(2)}%`)}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(group.metrics.bookings.toFixed(2))}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(`${group.metrics.conversionRate.toFixed(2)}%`)}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(formatNumber(group.metrics.cpc, 'currency', displayCurrency, group.metrics.cpc < 0.01 ? 4 : 2))}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(formatNumber(group.metrics.cost, 'currency', displayCurrency))}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(formatNumber(group.metrics.aov, 'currency', displayCurrency, group.metrics.aov < 1 ? 4 : 2))}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(formatNumber(group.metrics.revenue, 'currency', displayCurrency))}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(`${group.metrics.roas.toFixed(1)}x`)}</TableCell>
                    <TableCell className="text-right">{renderMetricCell(`${group.metrics.costOfSale < 0.01 ? group.metrics.costOfSale.toFixed(4) : group.metrics.costOfSale.toFixed(2)}%`)}</TableCell>
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
                          <TableCell className="text-right text-muted-foreground">
                            {formatNumber(item.metrics.aov, 'currency', displayCurrency, item.metrics.aov < 1 ? 4 : 2)}
                          </TableCell>
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
                <TableCell className="font-bold">Total</TableCell>
                <TableCell className="text-right">{renderMetricCell(formatNumber(totalMetrics.impressions))}</TableCell>
                <TableCell className="text-right">{renderMetricCell(formatNumber(totalMetrics.clicks))}</TableCell>
                <TableCell className="text-right">{renderMetricCell(`${totalMetrics.ctr.toFixed(2)}%`)}</TableCell>
                <TableCell className="text-right">{renderMetricCell(totalMetrics.bookings.toFixed(2))}</TableCell>
                <TableCell className="text-right">{renderMetricCell(`${totalMetrics.conversionRate.toFixed(2)}%`)}</TableCell>
                <TableCell className="text-right">{renderMetricCell(formatNumber(totalMetrics.cpc, 'currency', displayCurrency, totalMetrics.cpc < 0.01 ? 4 : 2))}</TableCell>
                <TableCell className="text-right">{renderMetricCell(formatNumber(totalMetrics.cost, 'currency', displayCurrency))}</TableCell>
                <TableCell className="text-right">{renderMetricCell(formatNumber(totalMetrics.aov, 'currency', displayCurrency, totalMetrics.aov < 1 ? 4 : 2))}</TableCell>
                <TableCell className="text-right">{renderMetricCell(formatNumber(totalMetrics.revenue, 'currency', displayCurrency))}</TableCell>
                <TableCell className="text-right">{renderMetricCell(`${totalMetrics.roas.toFixed(1)}x`)}</TableCell>
                <TableCell className="text-right">{renderMetricCell(`${totalMetrics.costOfSale < 0.01 ? totalMetrics.costOfSale.toFixed(4) : totalMetrics.costOfSale.toFixed(2)}%`)}</TableCell>
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
const BreakdownTableSection = React.memo<{
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
