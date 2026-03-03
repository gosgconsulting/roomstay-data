import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SlideReport, SlideReportPivotData } from "@/types/slideReports";
import { JAN_2026_BREAKDOWN_DIMENSIONS } from "@/hooks/useMetasearchJan2026RawRows";
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
  /** Pivot data to use for breakdown table (e.g. effectivePivotData so view/dimension filters apply) */
  pivotData?: SlideReportPivotData | null;
  isLoadingData: boolean;
  breakdownTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  currentTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  channelChartData: Record<string, Array<{ month: string; revenue: number }>>;
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
  onAISummaryClick?: () => void;
  isAISummaryDisabled?: boolean;
  summaryText?: string | null;
  /** When true, breakdown table uses apiBreakdowns instead of computing from raw rows. */
  displayDataFromApi?: boolean;
  apiBreakdowns?: { groupBy: string; rows: Array<{ name: string; impressions: number; clicks: number; cost: number; revenue: number; bookings: number; cpc?: number; roas?: number; costOfSale?: number }>; expanded?: Record<string, Array<{ name: string; impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>> };
  /** When true, do not show expanded sub-rows in the breakdown table (e.g. Metasearch Jan 2026). */
  suppressExpandedBreakdown?: boolean;
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
  onAISummaryClick,
  isAISummaryDisabled,
  summaryText,
  displayDataFromApi,
  apiBreakdowns,
  suppressExpandedBreakdown,
}: ChannelTabProps) {
  const gradientId = `${channel}Gradient`;
  
  return (
    <TabsContent value={channel} className="space-y-6">
      {isSlideReportsLoading || (slideReportId && (!slideReport?.pivot_data || isLoadingData)) ? (
        renderKPICardsSkeleton()
      ) : (
        <>
          {renderKPICards(
            getReportKPICards(
              currentTotals[channel] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }
            ),
            getChannelComparisonMetrics(channel)
          )}
        
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
                  <AreaChart data={channelChartData[channel]}>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}`} />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} fill={`url(#${gradientId})`} />
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
                // Use effective pivot data (e.g. from parent) so view/dimension filters apply to the table
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
                    availableDimensions={availableDimensionsList}
                  />
                );
              })()}
            </CardContent>
          </Card>

          {/* AI Summary Display - After last report component */}
          {summaryText && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                {`AI Summary - ${channel.charAt(0).toUpperCase() + channel.slice(1)}`}
              </h4>
              <AISummaryDisplay value={summaryText} />
            </div>
          )}

          {/* AI Summary Button - After last report component */}
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