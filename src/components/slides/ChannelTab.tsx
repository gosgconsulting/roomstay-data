import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { SlideReport, SlideReportPivotData } from "@/types/slideReports";
import { JAN_2026_BREAKDOWN_DIMENSIONS } from "@/hooks/useMetasearchJan2026RawRows";
import { calculateDerivedMetrics, calculatePercentChange, formatNumber } from "@/lib/slideViewHelpers";
import { AISummaryButton } from "./AISummaryButton";
import { AISummaryDisplay } from "./AISummaryDisplay";

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
  chartTimeRange: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months';
  setChartTimeRange: (range: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months') => void;
  groupByDimension: string;
  breakdownByDimension: string;
  expandedRow: string | null;
  setExpandedRow: (row: string | null) => void;
  setGroupByDimension: (dim: string) => void;
  setBreakdownByDimension: (dim: string) => void;
  selectedYear: string;
  selectedMonth: string;
  filterValues: Record<string, Record<string, string[]>>;
  filterDimensionValues: Record<string, Record<string, string[]>>;
  breakdownDimensions: Record<string, Dimension[]>;
  breakdownConfigs: Record<string, BreakdownConfig>;
  renderKPICards: (cards: any[], comparisonMetrics?: any) => JSX.Element;
  renderKPICardsSkeleton: () => JSX.Element;
  getReportKPICards: (data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => any[];
  getChannelComparisonMetrics: (channel: 'metasearch' | 'sem' | 'social') => any;
  setBreakdownTotals: (updater: (prev: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>) => Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>) => void;
  UnifiedBreakdownTable: React.ComponentType<any>;
  comparisonTotals?: Record<string, any> | null;
  comparisonType?: string;
  onAISummaryClick?: () => void;
  isAISummaryDisabled?: boolean;
  summaryText?: string | null;
  displayDataFromApi?: boolean;
  apiBreakdowns?: { groupBy: string; rows: Array<{ name: string; impressions: number; clicks: number; cost: number; revenue: number; bookings: number; cpc?: number; roas?: number; costOfSale?: number }>; expanded?: Record<string, Array<{ name: string; impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>> };
  suppressExpandedBreakdown?: boolean;
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
  filterValues,
  filterDimensionValues,
  breakdownDimensions,
  breakdownConfigs,
  renderKPICards,
  renderKPICardsSkeleton,
  getReportKPICards,
  getChannelComparisonMetrics,
  setBreakdownTotals,
  UnifiedBreakdownTable,
  comparisonTotals,
  comparisonType,
  onAISummaryClick,
  isAISummaryDisabled,
  summaryText,
  displayDataFromApi,
  apiBreakdowns,
  suppressExpandedBreakdown,
  displayCurrency,
}: ChannelTabProps) {
  const gradientId = `${channel}Gradient`;
  const compGradientId = `${channel}CompGradient`;
  
  // Merge comparison data into channel chart data
  const currentData = channelChartData[channel] || [];
  const compData = comparisonChannelChartData?.[channel];
  const mergedData = currentData.map((point, i) => ({
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
            // Use breakdownTotals as fallback when currentTotals has no cost data (mapping mismatch)
            const ct = currentTotals[channel] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            const bt = breakdownTotals[channel];
            const effectiveTotals = (ct.cost === 0 && bt && bt.cost > 0)
              ? { ...ct, cost: bt.cost, revenue: bt.revenue || ct.revenue, bookings: bt.bookings || ct.bookings, impressions: bt.impressions || ct.impressions, clicks: bt.clicks || ct.clicks }
              : ct;
            return renderKPICards(
              getReportKPICards(effectiveTotals),
              getChannelComparisonMetrics(channel)
            );
          })()}
        
          {/* Monthly Revenue Chart */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Revenue</CardTitle>
              <Select value={chartTimeRange} onValueChange={(v) => setChartTimeRange(v as typeof chartTimeRange)}>
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
                  <AreaChart data={mergedData}>
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
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}`} />
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

          {/* Channel Summary Table with Comparison */}
          {(() => {
            const showComp = comparisonType && comparisonType !== 'none';
            const ct = currentTotals[channel] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            const bt = breakdownTotals[channel];
            const effectiveTotals = (ct.cost === 0 && bt && bt.cost > 0)
              ? { ...ct, cost: bt.cost, revenue: bt.revenue || ct.revenue, bookings: bt.bookings || ct.bookings, impressions: bt.impressions || ct.impressions, clicks: bt.clicks || ct.clicks }
              : ct;
            const derived = calculateDerivedMetrics(effectiveTotals);
            const compData = showComp && comparisonTotals?.[channel];
            const compDerived = compData ? calculateDerivedMetrics(compData) : null;

            const PctBadge = ({ current, previous, isCost = false }: { current: number; previous: number; isCost?: boolean }) => {
              const pct = calculatePercentChange(current, previous);
              if (pct === null) return null;
              const isPositive = pct >= 0;
              const isGood = isCost ? !isPositive : isPositive;
              return (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${isGood ? 'text-green-600' : 'text-red-600'}`}>
                  {isPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                  {Math.abs(pct).toFixed(1)}%
                </span>
              );
            };

            const MetricCell = ({ current, comp, format, isCost = false }: { current: number; comp?: number; format?: string; isCost?: boolean }) => {
              const formatted = format === 'currency_cpc'
                ? formatNumber(current, 'currency', displayCurrency, 2)
                : format === 'currency'
                  ? formatNumber(current, 'currency', displayCurrency)
                  : format === 'percent'
                    ? `${current.toFixed(2)}%`
                    : format === 'roas'
                      ? `${current.toFixed(1)}x`
                      : formatNumber(current);
              return (
                <TableCell className="text-right">
                  <div>{formatted}</div>
                  {comp !== undefined && showComp && <PctBadge current={current} previous={comp} isCost={isCost} />}
                </TableCell>
              );
            };

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    {channel.charAt(0).toUpperCase() + channel.slice(1)} Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-max">
                      <TableHeader>
                        <TableRow>
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
                        <TableRow className="font-medium">
                          <MetricCell current={derived.impressions} comp={compDerived?.impressions} />
                          <MetricCell current={derived.clicks} comp={compDerived?.clicks} />
                          <MetricCell current={derived.ctr} comp={compDerived?.ctr} format="percent" />
                          <MetricCell current={derived.bookings} comp={compDerived?.bookings} />
                          <MetricCell current={derived.conversionRate} comp={compDerived?.conversionRate} format="percent" />
                          <MetricCell current={derived.cpc} comp={compDerived?.cpc} format="currency_cpc" isCost />
                          <MetricCell current={derived.cost} comp={compDerived?.cost} format="currency" isCost />
                          <MetricCell current={derived.revenue} comp={compDerived?.revenue} format="currency" />
                          <MetricCell current={derived.roas} comp={compDerived?.roas} format="roas" />
                          <MetricCell current={derived.costOfSale} comp={compDerived?.costOfSale} format="percent" isCost />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Unified Breakdown Table */}
          <Card>
            <CardHeader><CardTitle className="text-base font-medium">Breakdown Analysis</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const pivotData = pivotDataProp ?? (slideReport?.pivot_data as SlideReportPivotData | null);
                const channelData = pivotData?.channels?.[channel];
                const savedBreakdownConfigs = slideReport?.configuration?.breakdownConfigs?.[channel];
                const configuredBreakdowns = savedBreakdownConfigs?.breakdownDimensionIds || breakdownConfigs[channel]?.breakdownDimensionIds || [];
                const hasJan2026Override = channel === 'metasearch' && !!displayDataFromApi && !!apiBreakdowns?.rows?.length;
                const useJan2026FallbackDimensions = configuredBreakdowns.length === 0 && hasJan2026Override;

                if (configuredBreakdowns.length === 0 && !hasJan2026Override) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No breakdown dimensions configured.</p>
                      <p className="text-sm mt-2">Configure breakdown dimensions in Edit Source → Breakdown Dimensions step.</p>
                    </div>
                  );
                }

                const availableDimensionsList = useJan2026FallbackDimensions
                  ? JAN_2026_BREAKDOWN_DIMENSIONS
                  : [
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
                    filterValues={filterValues}
                    filterDimensionValues={filterDimensionValues}
                    onTotalsChange={(totals) => setBreakdownTotals(prev => ({ ...prev, [channel]: totals }))}
                    displayDataFromApi={displayDataFromApi}
                    apiBreakdowns={apiBreakdowns}
                    suppressExpandedBreakdown={suppressExpandedBreakdown}
                    displayCurrency={displayCurrency}
                    availableDimensions={availableDimensionsList}
                  />
                );
              })()}
            </CardContent>
          </Card>

          {/* AI Summary Display */}
          {summaryText && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                {`AI Summary - ${channel.charAt(0).toUpperCase() + channel.slice(1)}`}
              </h4>
              <AISummaryDisplay value={summaryText} />
            </div>
          )}

          {/* AI Summary Button */}
          {onAISummaryClick && (
            <div className="flex justify-end">
              <AISummaryButton
                onClick={onAISummaryClick}
                disabled={isAISummaryDisabled}
              />
            </div>
          )}
        </>
      )}
    </TabsContent>
  );
}