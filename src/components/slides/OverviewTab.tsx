import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Settings2, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart } from "lucide-react";
import { SlideReport } from "@/types/slideReports";
import { calculateDerivedMetrics, formatNumber } from "@/lib/slideViewHelpers";
import { AISummaryButton } from "./AISummaryButton";
import { AISummaryDisplay } from "./AISummaryDisplay";

interface OverviewTabProps {
  slideReportId: string | null;
  isSlideReportsLoading: boolean;
  slideReport?: SlideReport | null;
  isLoadingData: boolean;
  isLoadingMonthlyData: boolean;
  currentTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  breakdownTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  overviewChartData: Array<{ label: string; total: number }>;
  chartTimeRange: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months';
  setChartTimeRange: (range: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months') => void;
  selectedYear: string;
  selectedMonth: string;
  isReadOnlyMode: boolean;
  setIsEditSourceOpen: (open: boolean) => void;
  renderKPICards: (cards: any[], comparisonMetrics?: any) => JSX.Element;
  renderKPICardsSkeleton: () => JSX.Element;
  renderChartSkeleton: () => JSX.Element;
  renderTableSkeleton: () => JSX.Element;
  getOverviewComparisonMetrics: () => any;
  filteredData: {
    channelTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  };
  slideType: string;
  KPI_CARDS: Array<{
    label: string;
    key: string;
    value: number;
    icon: any;
    color: string;
    format?: string;
  }>;
  onAISummaryClick?: () => void;
  isAISummaryDisabled?: boolean;
  summaryText?: string | null;
}

const hasAnyData = (totals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>): boolean => {
  return Object.values(totals).some(channel => 
    channel.impressions > 0 || 
    channel.clicks > 0 || 
    channel.cost > 0 || 
    channel.revenue > 0 || 
    channel.bookings > 0
  );
};

export function OverviewTab({
  slideReportId,
  isSlideReportsLoading,
  slideReport,
  isLoadingData,
  isLoadingMonthlyData,
  currentTotals,
  breakdownTotals,
  overviewChartData,
  chartTimeRange,
  setChartTimeRange,
  selectedYear,
  selectedMonth,
  isReadOnlyMode,
  setIsEditSourceOpen,
  renderKPICards,
  renderKPICardsSkeleton,
  renderChartSkeleton,
  renderTableSkeleton,
  getOverviewComparisonMetrics,
  filteredData,
  slideType,
  KPI_CARDS,
  onAISummaryClick,
  isAISummaryDisabled,
  summaryText,
}: OverviewTabProps) {
  return (
    <TabsContent value="overview" className="space-y-6">
      {/* Show setup prompt when no report exists yet */}
      {!slideReportId && !isSlideReportsLoading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="bg-primary/10 rounded-full p-4">
            <Settings2 className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Configure Your Report</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Set up your report by selecting channels, dimensions, and date range in the Edit Source wizard.
          </p>
          <Button onClick={() => setIsEditSourceOpen(true)} className="mt-2">
            <Settings2 className="h-4 w-4 mr-2" />
            Configure Report
          </Button>
        </div>
      )}

      {/* Show skeletons when loading - only show if we don't have pivot_data yet or actively loading */}
      {(isSlideReportsLoading || (slideReportId && (!slideReport?.pivot_data || isLoadingData))) ? (
        renderKPICardsSkeleton()
      ) : slideReportId && slideReport?.pivot_data && hasAnyData(currentTotals) && renderKPICards(
        slideType === 'master-report' && Object.keys(currentTotals).length > 0
          ? (() => {
              // Prefer breakdownTotals if available (from UnifiedBreakdownTable) for consistency with channel tabs
              // This ensures KPI cards match the breakdown table when filters are applied
              const metasearchData = breakdownTotals.metasearch || currentTotals.metasearch || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
              const semData = breakdownTotals.sem || currentTotals.sem || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
              const socialData = breakdownTotals.social || currentTotals.social || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
              const totals = {
                impressions: (metasearchData.impressions || 0) + (semData.impressions || 0) + (socialData.impressions || 0),
                clicks: (metasearchData.clicks || 0) + (semData.clicks || 0) + (socialData.clicks || 0),
                cost: (metasearchData.cost || 0) + (semData.cost || 0) + (socialData.cost || 0),
                revenue: (metasearchData.revenue || 0) + (semData.revenue || 0) + (socialData.revenue || 0),
                bookings: (metasearchData.bookings || 0) + (semData.bookings || 0) + (socialData.bookings || 0),
              };
              const derived = calculateDerivedMetrics(totals);
              
              // Get comparison metrics from pivot_data overview
              const overviewCompMetrics = getOverviewComparisonMetrics();
              
              return [
                { label: "IMPRESSIONS", key: "impressions", value: derived.impressions, icon: Eye, color: "text-pink-600", comparison: overviewCompMetrics?.impressions },
                { label: "CLICKS", key: "clicks", value: derived.clicks, icon: MousePointer, color: "text-purple-600", comparison: overviewCompMetrics?.clicks },
                { label: "CTR", key: "ctr", value: derived.ctr, icon: Percent, color: "text-purple-600", format: "percent", comparison: overviewCompMetrics?.ctr },
                { label: "BOOKINGS", key: "bookings", value: derived.bookings, icon: ShoppingCart, color: "text-orange-600", comparison: overviewCompMetrics?.bookings },
                { label: "CONVERSION RATE", key: "conversionRate", value: derived.conversionRate, icon: Percent, color: "text-purple-600", format: "percent", comparison: overviewCompMetrics?.conversionRate },
                { label: "CPC", key: "cpc", value: derived.cpc, icon: DollarSign, color: "text-blue-600", format: "currency", comparison: overviewCompMetrics?.cpc },
                { label: "COST", key: "cost", value: derived.cost, icon: DollarSign, color: "text-blue-600", format: "currency", comparison: overviewCompMetrics?.cost },
                { label: "REVENUE", key: "revenue", value: derived.revenue, icon: DollarSign, color: "text-cyan-600", format: "currency", comparison: overviewCompMetrics?.revenue },
                { label: "ROAS", key: "roas", value: derived.roas, icon: TrendingUp, color: "text-green-600", format: "roas", comparison: overviewCompMetrics?.roas },
                { label: "COST OF SALE", key: "costOfSale", value: derived.costOfSale, icon: Percent, color: "text-purple-600", format: "percent", comparison: overviewCompMetrics?.costOfSale },
              ];
            })()
          : KPI_CARDS,
        getOverviewComparisonMetrics()
      )}

      {/* Monthly Results Chart */}
      {(isSlideReportsLoading || (slideReportId && (isLoadingData || (!slideReport?.pivot_data && isLoadingMonthlyData)))) ? (
        renderChartSkeleton()
      ) : (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Revenue</CardTitle>
            <Select value={chartTimeRange} onValueChange={(v) => setChartTimeRange(v as typeof chartTimeRange)} disabled={isReadOnlyMode}>
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
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overviewChartData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}`} />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="total" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    fill="url(#revenueGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Breakdown Table */}
      {(isSlideReportsLoading || (slideReportId && (isLoadingData || (!slideReport?.pivot_data && isLoadingMonthlyData)))) ? (
        renderTableSkeleton()
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              <span className="font-semibold">Period:</span> {selectedYear === 'all' ? 'All Years (2024-2026)' : selectedYear}
              {selectedMonth !== 'all' ? ` - ${selectedMonth}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
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
                {(() => {
                  // Use filtered channel totals (respects dimension filters)
                  // Prefer breakdownTotals if available (from UnifiedBreakdownTable) for consistency with channel tabs
                  const channels = ['metasearch', 'sem', 'social'];
                  const rows = channels.map(channel => {
                    // Use breakdownTotals if available (more accurate when filters are applied via breakdown table)
                    // Otherwise fall back to filteredData.channelTotals
                    const channelKey = channel as 'metasearch' | 'sem' | 'social';
                    const data = breakdownTotals[channelKey] || filteredData.channelTotals[channelKey] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
                    const derived = calculateDerivedMetrics(data);
                    return {
                      report: channel.charAt(0).toUpperCase() + channel.slice(1),
                      ...derived,
                    };
                  });
                  // Filter out rows where all metrics are zero
                  const rowsWithData = rows.filter(row => 
                    row.impressions > 0 || 
                    row.clicks > 0 || 
                    row.cost > 0 || 
                    row.revenue > 0 || 
                    row.bookings > 0
                  );

                  // Calculate totals only from rows with data
                  const totals = rowsWithData.reduce((acc, row) => ({
                    impressions: acc.impressions + row.impressions,
                    clicks: acc.clicks + row.clicks,
                    cost: acc.cost + row.cost,
                    revenue: acc.revenue + row.revenue,
                    bookings: acc.bookings + row.bookings,
                  }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });
                  const totalDerived = calculateDerivedMetrics(totals);

                  return (
                    <>
                      {rowsWithData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                            No data available for the selected period
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {rowsWithData.map((row) => (
                            <TableRow key={row.report}>
                              <TableCell className="font-medium">{row.report}</TableCell>
                              <TableCell className="text-right">{formatNumber(row.impressions)}</TableCell>
                              <TableCell className="text-right">{formatNumber(row.clicks)}</TableCell>
                              <TableCell className="text-right">{row.ctr.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">{row.bookings.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{row.conversionRate.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">${row.cpc.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{formatNumber(row.cost, 'currency')}</TableCell>
                              <TableCell className="text-right">{formatNumber(row.revenue, 'currency')}</TableCell>
                              <TableCell className="text-right">{row.roas.toFixed(1)}x</TableCell>
                              <TableCell className="text-right">{row.costOfSale.toFixed(2)}%</TableCell>
                            </TableRow>
                          ))}
                          {/* Total Row - only show if there's at least one data row */}
                          {rowsWithData.length > 0 && (
                            <TableRow className="bg-muted/50 font-semibold border-t-2">
                              <TableCell className="font-bold">Total</TableCell>
                              <TableCell className="text-right">{formatNumber(totalDerived.impressions)}</TableCell>
                              <TableCell className="text-right">{formatNumber(totalDerived.clicks)}</TableCell>
                              <TableCell className="text-right">{totalDerived.ctr.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">{totalDerived.bookings.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{totalDerived.conversionRate.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">${totalDerived.cpc.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{formatNumber(totalDerived.cost, 'currency')}</TableCell>
                              <TableCell className="text-right">{formatNumber(totalDerived.revenue, 'currency')}</TableCell>
                              <TableCell className="text-right">{totalDerived.roas.toFixed(1)}x</TableCell>
                              <TableCell className="text-right">{totalDerived.costOfSale.toFixed(2)}%</TableCell>
                            </TableRow>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* AI Summary Display - After last report component */}
      {summaryText && (
        <AISummaryDisplay summary={summaryText} title="AI Summary" />
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
    </TabsContent>
  );
}
