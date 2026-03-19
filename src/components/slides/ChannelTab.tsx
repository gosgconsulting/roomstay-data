import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SlideReport, SlideReportPivotData } from "@/types/slideReports";
import { UnifiedBreakdownTable } from "@/components/slides/BreakdownTableSection";
import { MoreHorizontal } from "lucide-react";
import type { ChartGranularity, ChartMetric } from "@/types/slideView";
import { CHART_METRIC_OPTIONS, formatChartMetricValue, getChartMetricLabel } from "@/lib/chartMetric";

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
  currentTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  channelChartData: Record<string, Array<{ label: string; value: number }>>;
  comparisonChannelChartData?: Record<string, Array<{ label: string; value: number }>> | null;
  chartGranularity: ChartGranularity;
  setChartGranularity: (value: ChartGranularity) => void;
  chartMetric: ChartMetric;
  setChartMetric: (metric: ChartMetric) => void;
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
  comparisonTotals?: Record<string, any> | null;
  comparisonType?: string;
  displayCurrency?: 'AUD' | 'USD';
  onOpenBreakdownDimensionSettings?: (channel: 'metasearch' | 'sem' | 'social') => void;
  configuredDimensionNames?: Record<string, string>;
}

export function ChannelTab({
  channel,
  isSlideReportsLoading,
  slideReportId,
  slideReport,
  pivotData: pivotDataProp,
  isLoadingData,
  currentTotals,
  channelChartData,
  comparisonChannelChartData,
  chartGranularity,
  setChartGranularity,
  chartMetric,
  setChartMetric,
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
  comparisonTotals,
  comparisonType,
  displayCurrency,
  onOpenBreakdownDimensionSettings,
  configuredDimensionNames,
}: ChannelTabProps) {
  const gradientId = `${channel}Gradient`;
  const compGradientId = `${channel}CompGradient`;

  // Merge comparison data into channel chart data
  const currentData = channelChartData[channel] || [];
  const compData = comparisonChannelChartData?.[channel];
  const mergedChartData = currentData.map((point, i) => ({
    ...point,
    comparisonValue: compData?.[i]?.value ?? undefined,
  }));
  const hasComparison = !!compData && compData.length > 0;

  return (
    <div className="space-y-6">
      {/* Show content when report is loaded; data comes from dimension_data (pivotData prop), not slide_report.pivot_data */}
      {isSlideReportsLoading || (slideReportId && isLoadingData) ? (
        renderKPICardsSkeleton()
      ) : (
        <>
          {(() => {
            const effectiveTotals = currentTotals[channel] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            return renderKPICards(
              getReportKPICards(effectiveTotals),
              getChannelComparisonMetrics(channel)
            );
          })()}

          {/* Monthly Revenue Chart */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">{getChartMetricLabel(chartMetric)}</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as ChartMetric)}>
                  <SelectTrigger className="w-[180px] h-8 text-sm bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {CHART_METRIC_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={chartGranularity} onValueChange={(v) => setChartGranularity(v as ChartGranularity)}>
                  <SelectTrigger className="w-[120px] h-8 text-sm bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatChartMetricValue(value, chartMetric, displayCurrency),
                        name === 'comparisonValue' ? 'Previous Period' : getChartMetricLabel(chartMetric)
                      ]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                    {hasComparison && (
                      <Area
                        type="monotone"
                        dataKey="comparisonValue"
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                        fill={`url(#${compGradientId})`}
                        name="Previous Period"
                      />
                    )}
                    <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} fill={`url(#${gradientId})`} name={getChartMetricLabel(chartMetric)} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Unified Breakdown Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Breakdown Analysis</CardTitle>
              {onOpenBreakdownDimensionSettings && (
                <button
                  type="button"
                  onClick={() => onOpenBreakdownDimensionSettings(channel)}
                  className="h-8 w-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
                  title="Breakdown settings"
                  aria-label="Breakdown settings"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              )}
            </CardHeader>
            <CardContent>
              {(() => {
                const pivotData = pivotDataProp ?? (slideReport?.pivot_data as SlideReportPivotData | null);
                // Use local breakdownConfigs (already synced from DB) as the source of configured IDs.
                // breakdownDimensions[channel] is pre-filtered to channel-valid dims only, so the
                // intersection below can never produce cross-channel dimensions.
                const configuredBreakdowns = breakdownConfigs[channel]?.breakdownDimensionIds || [];

                // Build the available list: only dims that are both channel-valid (breakdownDimensions)
                // and explicitly configured by the user (configuredBreakdowns).
                // When no IDs are configured yet, fall back to showing all channel-valid dims so the
                // table is never blank on first load.
                const channelDims = breakdownDimensions[channel] || [];
                const availableDimensionsList = configuredBreakdowns.length > 0
                  ? [...new Map(
                      channelDims
                        .filter(dim => configuredBreakdowns.includes(dim.id))
                        .map(dim => [dim.id, dim])
                    ).values()]
                  : [...new Map(channelDims.map(dim => [dim.id, dim])).values()];

                if (availableDimensionsList.length === 0 && configuredBreakdowns.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No breakdown dimensions configured.</p>
                      <p className="text-sm mt-2">Use the ⋯ menu above to choose which dimensions are available for Group by / Breakdown by.</p>
                    </div>
                  );
                }

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
                    displayCurrency={displayCurrency}
                    availableDimensions={availableDimensionsList}
                    comparisonChannelTotals={comparisonTotals}
                    comparisonType={comparisonType}
                    configuredDimensionNames={configuredDimensionNames}
                  />
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
