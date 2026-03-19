/**
 * Monthly Chart Section Component
 * 
 * Displays monthly revenue charts with time range filtering. Supports both
 * overview charts (aggregating all channels) and channel-specific charts.
 * Automatically ensures at least 6 months of data for meaningful visualization.
 * 
 * @module MonthlyChartSection
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { ensureMinimumChartData } from '@/lib/slideViewHelpers';
import type { SlideReportPivotData } from '@/types/slideReports';

/**
 * Available chart time range options
 */
export type ChartTimeRange =
  | 'this_month'
  | 'this_year'
  | 'last_12_months'
  | 'last_6_months'
  | 'last_3_months';

/**
 * Props for MonthlyChartSection component
 */
interface MonthlyChartSectionProps {
  /** Chart title (default: 'Revenue') */
  title?: string;
  /** Currently selected time range */
  chartTimeRange: ChartTimeRange;
  /** Callback when time range changes */
  onTimeRangeChange: (range: ChartTimeRange) => void;
  /** Pivot data containing monthly metrics */
  pivotData: SlideReportPivotData | null;
  /** Optional channel filter for single-channel charts */
  channel?: 'metasearch' | 'sem' | 'social';
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** CSS gradient ID for chart fill (default: 'revenueGradient') */
  gradientId?: string;
  /** Stroke color for chart line (default: '#8b5cf6') */
  strokeColor?: string;
  /** Chart height in pixels (default: 200) */
  height?: number;
}

/**
 * Skeleton loader for chart
 * 
 * Displays a loading placeholder while chart data is being fetched.
 * 
 * @param props - Component props
 * @param props.height - Height of the skeleton in pixels
 * @returns Skeleton component
 */
export const ChartSkeleton = ({ height = 250 }: { height?: number }) => (
  <Card>
    <CardHeader className="pb-2 flex flex-row items-center justify-between">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-[150px]" />
    </CardHeader>
    <CardContent>
      <div style={{ height: `${height}px` }}>
        <Skeleton className="h-full w-full" />
      </div>
    </CardContent>
  </Card>
);

/**
 * Monthly Chart Section Component
 * 
 * Displays an area chart showing monthly revenue trends. Supports:
 * - Overview mode: Aggregates revenue from all channels
 * - Channel mode: Shows revenue for a specific channel
 * - Time range filtering: This Year, Last 12/6/3 Months
 * - Automatic data expansion: Ensures at least 6 months of data for meaningful visualization
 * 
 * The component is memoized for performance optimization.
 * 
 * @param props - Component props
 * @returns MonthlyChartSection component
 */
export const MonthlyChartSection = React.memo<MonthlyChartSectionProps>(
  ({
    title = 'Revenue',
    chartTimeRange,
    onTimeRangeChange,
    pivotData,
    channel,
    isLoading = false,
    gradientId = 'revenueGradient',
    strokeColor = '#8b5cf6',
    height = 200,
  }) => {
    const chartData = useMemo(() => {
      if (!pivotData?.channels) {
        return [];
      }

      // Build complete monthly data from pivot_data
      let allMonthlyData: Array<{
        year: number;
        month: string;
        revenue?: number;
        metasearch?: number;
        sem?: number;
        social?: number;
        total?: number;
      }> = [];

      if (channel) {
        // Single channel chart
        const channelData = pivotData.channels[channel];
        if (channelData?.monthly) {
          Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
            const [year, monthNum] = monthKey.split('-').map(Number);
            const month = MONTH_NAMES[monthNum - 1];
            allMonthlyData.push({
              year,
              month,
              revenue: (metrics as any).revenue || 0,
            });
          });
          allMonthlyData.sort(
            (a, b) =>
              a.year !== b.year
                ? a.year - b.year
                : MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month)
          );
        }
      } else {
        // Overview chart - aggregate all channels
        const monthlyMap = new Map<
          string,
          { year: number; month: string; metasearch: number; sem: number; social: number }
        >();

        Object.entries(pivotData.channels).forEach(([ch, channelData]) => {
          if (channelData.monthly) {
            Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
              const [year, monthNum] = monthKey.split('-').map(Number);
              const month = MONTH_NAMES[monthNum - 1];
              const key = `${year}-${month}`;

              if (!monthlyMap.has(key)) {
                monthlyMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
              }

              const entry = monthlyMap.get(key)!;
              entry[ch as 'metasearch' | 'sem' | 'social'] = (metrics as any).revenue || 0;
            });
          }
        });

        allMonthlyData = Array.from(monthlyMap.values()).sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
        });
      }

      // Apply time range filter
      const now = new Date();
      let filteredData = allMonthlyData;

      if (chartTimeRange === 'this_month') {
        const currentYear = now.getFullYear();
        const currentMonth = MONTH_NAMES[now.getMonth()];
        filteredData = allMonthlyData.filter(
          (m) => m.year === currentYear && m.month === currentMonth
        );
      } else if (chartTimeRange === 'this_year') {
        const currentYear = now.getFullYear();
        filteredData = allMonthlyData.filter((m) => m.year === currentYear);
      } else if (chartTimeRange === 'last_12_months') {
        const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        filteredData = allMonthlyData.filter((m) => {
          const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
          return monthDate >= cutoffDate;
        });
      } else if (chartTimeRange === 'last_6_months') {
        const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        filteredData = allMonthlyData.filter((m) => {
          const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
          return monthDate >= cutoffDate;
        });
      } else if (chartTimeRange === 'last_3_months') {
        const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        filteredData = allMonthlyData.filter((m) => {
          const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
          return monthDate >= cutoffDate;
        });
      }

      // Ensure at least 6 months of data for meaningful chart display
      filteredData = ensureMinimumChartData(filteredData, allMonthlyData, 6);

      // Format data for chart
      if (channel) {
        return filteredData.map((m) => ({
          month: `${m.month.slice(0, 3)} ${m.year.toString().slice(-2)}`,
          revenue: m.revenue || 0,
        }));
      } else {
        return filteredData.map((m) => ({
          label: `${m.month.slice(0, 3)} ${m.year.toString().slice(-2)}`,
          month: m.month,
          year: m.year,
          total: (m.metasearch || 0) + (m.social || 0) + (m.sem || 0),
        }));
      }
    }, [pivotData, chartTimeRange, channel]);

    if (isLoading) {
      return <ChartSkeleton height={height} />;
    }

    const dataKey = channel ? 'revenue' : 'total';
    const xAxisKey = channel ? 'month' : 'label';

    return (
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <Select value={chartTimeRange} onValueChange={onTimeRangeChange}>
            <SelectTrigger className="w-[150px] h-8 text-sm bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
              <SelectItem value="last_12_months">Last 12 Months</SelectItem>
              <SelectItem value="last_6_months">Last 6 Months</SelectItem>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div style={{ height: `${height}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey={xAxisKey}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  interval={0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}`}
                />
                <Tooltip
                  formatter={(value: number) => [
                    `$${value.toLocaleString()}`,
                    channel ? 'Revenue' : 'Revenue',
                  ]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={strokeColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    );
  }
);

MonthlyChartSection.displayName = 'MonthlyChartSection';
