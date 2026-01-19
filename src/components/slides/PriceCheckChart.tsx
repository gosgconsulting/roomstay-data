/**
 * Price Check Chart Component
 * 
 * Displays price parity percentage over time with time range filtering.
 * Similar structure to MonthlyChartSection but for price difference data.
 * 
 * @module PriceCheckChart
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getAllPriceCheckData,
  filterByHotel,
  getDateRangeForTimeRange,
  filterByDateRange,
  groupByMonth,
} from '@/lib/priceCheckData';

/**
 * Available chart time range options
 */
export type ChartTimeRange = 'last_6_months' | 'last_12_months' | 'last_3_months' | 'this_year';

/**
 * Props for PriceCheckChart component
 */
interface PriceCheckChartProps {
  /** Chart title (default: 'Price Parity') */
  title?: string;
  /** Currently selected time range */
  chartTimeRange: ChartTimeRange;
  /** Callback when time range changes */
  onTimeRangeChange: (range: ChartTimeRange) => void;
  /** Selected hotel filter(s) - array of hotel names, or empty array for all hotels */
  selectedHotels: string[];
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Chart height in pixels (default: 200) */
  height?: number;
}

/**
 * Skeleton loader for chart
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
 * Price Check Chart Component
 * 
 * Displays an area chart showing price parity percentage trends over time.
 * Supports:
 * - Time range filtering: Last 6/12/3 Months, This Year
 * - Hotel filtering: Filter by specific hotel or show all hotels
 * - Automatic monthly aggregation for chart display
 * 
 * @param props - Component props
 * @returns PriceCheckChart component
 */
export const PriceCheckChart = React.memo<PriceCheckChartProps>(
  ({
    title = 'Price Parity',
    chartTimeRange,
    onTimeRangeChange,
    selectedHotels,
    isLoading = false,
    height = 200,
  }) => {
    const chartData = useMemo(() => {
      // Get all data
      let data = getAllPriceCheckData();

      // Filter by hotel(s)
      data = filterByHotel(selectedHotels);

      // Filter by date range
      const dateRange = getDateRangeForTimeRange(chartTimeRange);
      if (dateRange) {
        data = filterByDateRange(data, dateRange.startDate, dateRange.endDate);
      }

      // Group by month for charting
      const monthlyData = groupByMonth(data);

      // Format data for chart
      return monthlyData.map(m => ({
        month: m.month,
        priceDiff: m.avgPriceDiff,
      }));
    }, [chartTimeRange, selectedHotels]);

    if (isLoading) {
      return <ChartSkeleton height={height} />;
    }

    return (
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <Select value={chartTimeRange} onValueChange={onTimeRangeChange}>
            <SelectTrigger className="w-[150px] h-8 text-sm bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="last_6_months">Last 6 Months</SelectItem>
              <SelectItem value="last_12_months">Last 12 Months</SelectItem>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div style={{ height: `${height}px` }}>
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No data available for the selected filters
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="priceParityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    interval={0}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value) => `${value.toFixed(1)}%`}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `${value.toFixed(2)}%`,
                      'Price Diff %',
                    ]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="priceDiff"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#priceParityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

PriceCheckChart.displayName = 'PriceCheckChart';
