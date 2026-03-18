import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SlideReport, SlideReportPivotData } from "@/types/slideReports";
import { UnifiedBreakdownTable } from "@/components/slides/BreakdownTableSection";
import type { ChartTimeRange } from "@/components/slides/MonthlyChartSection";
import { formatNumber } from "@/lib/slideViewHelpers";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface BreakdownConfig {
  breakdownDimensionIds: string[];
}

interface ChannelTabProps {
  channel: 'metasearch' | 'sem' | 'social';
  isSlideReportsLoading: boolean;
  slideReportId: string | null;
  slideReport?: SlideReport | null;
  pivotData?: SlideReportPivotData | null;
  isLoadingData: boolean;
  breakdownTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  currentTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  channelChartData: Record<string, Array<{ month: string; revenue: number }>>;
  comparisonChannelChartData?: Record<string, Array<{ month: string; revenue: number }>> | null;
  chartTimeRange: ChartTimeRange;
  setChartTimeRange: (range: ChartTimeRange) => void;
  groupByDimension: string;
  breakdownByDimension: string;
  expandedRow: string | null;
  setExpandedRow: (row: string | null) => void;
  setGroupByDimension: (dim: string) => void;
  setBreakdownByDimension: (dim: string) => void;
  selectedYear: string;
  selectedMonth: string;
  customDateRange?: import("react-day-picker").DateRange | undefined;
  filterValues: Record<string, Record<string, string[]>>;
  filterDimensionValues: Record<string, Record<string, string[]>>;
  breakdownDimensions: Record<string, Dimension[]>;
  breakdownConfigs: Record<string, BreakdownConfig>;
  renderKPICards: (cards: any[], comparisonMetrics?: any) => JSX.Element;
  renderKPICardsSkeleton: () => JSX.Element;
  getReportKPICards: (data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => any[];
  getChannelComparisonMetrics: (channel: 'metasearch' | 'sem' | 'social') => any;
  setBreakdownTotals: (updater: (prev: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>) => Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>) => void;
  comparisonTotals?: Record<string, any> | null;
  comparisonType?: string;
  displayCurrency?: 'AUD' | 'USD';
}

export function ChannelTab({
  channel,
  isSlideReportsLoading,
  slideReportId,
  slideReport,
  pivotData: pivotDataProp,
  isLoadingData,
  breakdownTotals,
  currentTotals,
  channelChartData,
  comparisonChannelChartData,
  chartTimeRange,
  setChartTimeRange,
  groupByDimension,
  breakdownByDimension,
  expandedRow,
  setExpandedRow,
  setGroupByDimension,
  setBreakdownByDimension,
  selectedYear,
  selectedMonth,
  customDateRange,
  filterValues,
  filterDimensionValues,
  breakdownDimensions,
  breakdownConfigs,
  renderKPICards,
  renderKPICardsSkeleton,
  getReportKPICards,
  getChannelComparisonMetrics,
  setBreakdownTotals,
  comparisonTotals,
  comparisonType,
  displayCurrency,
}: ChannelTabProps) {
  const gradientId = `${channel}Gradient`;
  const compGradientId = `${channel}CompGradient`;

  // Merge comparison data into channel chart data
  const currentData = channelChartData[channel] || [];
  const compData = comparisonChannelChartData?.[channel];
  const mergedChartData = currentData.map((point, i) => ({
    ...point,
    comparisonRevenue: compData?.[i]?.revenue ?? undefined,
  }));
  const hasComparison = !!compData && compData.length > 0;

  return (
    <TabsContent value={channel} className="space-y-6">
      {isSlideReportsLoading || (slideReportId && (!slideReport?.pivot_data || isLoadingData)) ? (
        renderKPICardsSkeleton()
      ) : (
        <>
          {(() => {
            // Primary source: currentTotals from useFilteredSlideData (canonical, computed from rawDataRows).
            // Secondary: breakdownTotals from the breakdown table (only when currentTotals is empty).
            const ct = currentTotals[channel] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            const bt = breakdownTotals[channel];
            const ctHasData = ct.impressions > 0 || ct.clicks > 0 || ct.cost > 0 || ct.revenue > 0 || ct.bookings > 0;
            const btHasData = bt && (bt.impressions > 0 || bt.clicks > 0 || bt.cost > 0 || bt.revenue > 0 || bt.bookings > 0);
            const effectiveTotals = ctHasData ? ct : (btHasData ? bt : ct);
            return renderKPICards(
              getReportKPICards(effectiveTotals),
              getChannelComparisonMetrics(channel)
            );
          })()}

          {/* Monthly Revenue Chart */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Revenue</CardTitle>
              <Select value={chartTimeRange} onValueChange={(v) => setChartTimeRange(v as ChartTimeRange)}>
                <SelectTrigger className="w-[150px] h-8 text-sm bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="this_year">This Year</SelectItem>
                  <SelectItem value="last_12_months">Last 12 Months</SelectItem>
                  <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                  <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mergedChartData}>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                      </linearGradient>
                      <linearGradient id={compGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value: number) => `${(value / 1000).toFixed(0)}`} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatNumber(value, 'currency', displayCurrency),
                        name === 'comparisonRevenue' ? 'Previous Period' : 'Revenue'
                      ]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                    {hasComparison && (
                      <Area
                        type="monotone"
                        dataKey="comparisonRevenue"
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                        fill={`url(#${compGradientId})`}
                        name="Previous Period"
                      />
                    )}
                    <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} fill={`url(#${gradientId})`} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Unified Breakdown Table */}
          <Card>
            <CardHeader><CardTitle className="text-base font-medium">Breakdown Analysis</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const pivotData = pivotDataProp ?? (slideReport?.pivot_data as SlideReportPivotData | null);
                const savedBreakdownConfigs = slideReport?.configuration?.breakdownConfigs?.[channel];
                const configuredBreakdowns = savedBreakdownConfigs?.breakdownDimensionIds || breakdownConfigs[channel]?.breakdownDimensionIds || [];

                if (configuredBreakdowns.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No breakdown dimensions configured.</p>
                      <p className="text-sm mt-2">Configure breakdown dimensions in Edit Source → Breakdown Dimensions step.</p>
                    </div>
                  );
                }

                const availableDimensionsList = [
                  ...new Map([
                    ...(breakdownDimensions[channel] || []).filter(dim =>
                      configuredBreakdowns.includes(dim.id)
                    ),
                  ].map(dim => [dim.id, dim])).values()
                ];

                return (
                  <UnifiedBreakdownTable
                    groupBy={groupByDimension}
                    breakdownBy={breakdownByDimension}
                    expandedRow={expandedRow}
                    onRowClick={setExpandedRow}
                    onGroupByChange={setGroupByDimension}
                    onBreakdownByChange={setBreakdownByDimension}
                    pivotData={pivotData}
                    selectedChannel={channel}
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    customDateRange={customDateRange}
                    filterValues={filterValues}
                    filterDimensionValues={filterDimensionValues}
                    onTotalsChange={(totals) => setBreakdownTotals(prev => ({ ...prev, [channel]: totals }))}
                    displayCurrency={displayCurrency}
                    availableDimensions={availableDimensionsList}
                    comparisonChannelTotals={comparisonTotals}
                    comparisonType={comparisonType}
                  />
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </TabsContent>
  );
}
