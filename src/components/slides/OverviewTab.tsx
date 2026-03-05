import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Settings2, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { SlideReport } from "@/types/slideReports";
import { calculateDerivedMetrics, calculatePercentChange, formatNumber } from "@/lib/slideViewHelpers";
import { AISummaryButton } from "./AISummaryButton";
import { AISummaryDisplay } from "./AISummaryDisplay";

const GROSS_PROFIT_RATE = 0.15;

interface OverviewTabProps {
  slideReportId: string | null;
  isSlideReportsLoading: boolean;
  slideReport?: SlideReport | null;
  isLoadingData: boolean;
  isLoadingMonthlyData: boolean;
  currentTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  breakdownTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  overviewChartData: Array<{ label: string; total: number }>;
  comparisonChartData?: Array<{ label: string; total: number }> | null;
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
  comparisonTotals?: Record<string, any> | null;
  comparisonType?: string;
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

function PercentChangeBadge({ current, previous, isCostMetric = false }: { current: number; previous: number; isCostMetric?: boolean }) {
  const pct = calculatePercentChange(current, previous);
  if (pct === null) return null;
  const isPositive = pct >= 0;
  const isGood = isCostMetric ? !isPositive : isPositive;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${isGood ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function OverviewTab({
  slideReportId,
  isSlideReportsLoading,
  slideReport,
  isLoadingData,
  isLoadingMonthlyData,
  currentTotals,
  breakdownTotals,
  overviewChartData,
  comparisonChartData,
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
  comparisonTotals,
  comparisonType,
  onAISummaryClick,
  isAISummaryDisabled,
  summaryText,
}: OverviewTabProps) {
  // Merge comparison data into chart data
  const mergedChartData = overviewChartData.map((point, i) => ({
    ...point,
    comparisonTotal: comparisonChartData?.[i]?.total ?? undefined,
  }));

  const showComparison = comparisonType && comparisonType !== 'none';
  const compLabel = comparisonType === 'previous_period' ? 'Previous Period' : 'Previous Year';

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

      {/* KPI Cards */}
      {(isSlideReportsLoading || (slideReportId && (!slideReport?.pivot_data || isLoadingData))) ? (
        renderKPICardsSkeleton()
      ) : slideReportId && slideReport?.pivot_data && hasAnyData(currentTotals) && renderKPICards(
        Object.keys(currentTotals).length > 0
          ? (() => {
              // Prefer breakdownTotals (from table rows) over currentTotals (from pivot cache)
              const getEffective = (ch: string) => {
                const bt = breakdownTotals[ch];
                const ct = currentTotals[ch] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
                return (bt && (bt.impressions > 0 || bt.clicks > 0 || bt.cost > 0 || bt.revenue > 0 || bt.bookings > 0)) ? bt : ct;
              };
              const metasearchData = getEffective('metasearch');
              const semData = getEffective('sem');
              const socialData = getEffective('social');
              const totals = {
                impressions: (metasearchData.impressions || 0) + (semData.impressions || 0) + (socialData.impressions || 0),
                clicks: (metasearchData.clicks || 0) + (semData.clicks || 0) + (socialData.clicks || 0),
                cost: (metasearchData.cost || 0) + (semData.cost || 0) + (socialData.cost || 0),
                revenue: (metasearchData.revenue || 0) + (semData.revenue || 0) + (socialData.revenue || 0),
                bookings: (metasearchData.bookings || 0) + (semData.bookings || 0) + (socialData.bookings || 0),
              };
              const derived = calculateDerivedMetrics(totals);
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
                <AreaChart data={mergedChartData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="comparisonGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} className="text-xs fill-muted-foreground" />
                  <YAxis axisLine={false} tickLine={false} className="text-xs fill-muted-foreground" tickFormatter={(v) => `${v}`} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    formatter={(value: any, name: string) => [
                      formatNumber(value as number, 'currency'),
                      name === 'comparisonTotal' ? compLabel : 'Revenue'
                    ]}
                  />
                  {showComparison && comparisonChartData && (
                    <Area 
                      type="monotone" 
                      dataKey="comparisonTotal" 
                      stroke="#94a3b8" 
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      fill="url(#comparisonGradient)"
                      name={compLabel}
                    />
                  )}
                  <Area 
                    type="monotone" 
                    dataKey="total" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                    name="Revenue"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channel Performance Table */}
      {(isSlideReportsLoading || (slideReportId && isLoadingData)) ? (
        renderTableSkeleton()
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Channel Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <Table className="min-w-max">
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
                    const channels = ['metasearch', 'sem', 'social'];
                    const rows = channels.map(channel => {
                      const channelKey = channel as 'metasearch' | 'sem' | 'social';
                      const ct = filteredData.channelTotals[channelKey] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
                      const bt = breakdownTotals[channelKey];
                      // Prefer breakdownTotals (aggregated from table rows) — same pattern as ChannelTab
                      const data = (bt && (bt.impressions > 0 || bt.clicks > 0 || bt.cost > 0 || bt.revenue > 0 || bt.bookings > 0))
                        ? bt
                        : ct;
                      const derived = calculateDerivedMetrics(data);
                      const compData = showComparison && comparisonTotals?.[channelKey];
                      const hasCompData = compData && ((compData.impressions || 0) > 0 || (compData.clicks || 0) > 0 || (compData.cost || 0) > 0 || (compData.revenue || 0) > 0 || (compData.bookings || 0) > 0);
                      const compDerived = hasCompData ? calculateDerivedMetrics(compData) : null;
                      return {
                        report: channel.charAt(0).toUpperCase() + channel.slice(1),
                        ...derived,
                        compDerived,
                      };
                    });
                    const rowsWithData = rows.filter(row => 
                      row.impressions > 0 || row.clicks > 0 || row.cost > 0 || row.revenue > 0 || row.bookings > 0
                    );

                    const totals = rowsWithData.reduce((acc, row) => ({
                      impressions: acc.impressions + row.impressions,
                      clicks: acc.clicks + row.clicks,
                      cost: acc.cost + row.cost,
                      revenue: acc.revenue + row.revenue,
                      bookings: acc.bookings + row.bookings,
                    }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });
                    const totalDerived = calculateDerivedMetrics(totals);

                    // Aggregate comparison totals for the total row
                    const totalCompDerived = showComparison && comparisonTotals ? (() => {
                      const compTotals = channels.reduce((acc, ch) => {
                        const c = comparisonTotals[ch];
                        if (!c) return acc;
                        return {
                          impressions: acc.impressions + (c.impressions || 0),
                          clicks: acc.clicks + (c.clicks || 0),
                          cost: acc.cost + (c.cost || 0),
                          revenue: acc.revenue + (c.revenue || 0),
                          bookings: acc.bookings + (c.bookings || 0),
                        };
                      }, { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });
                      const hasData = compTotals.impressions > 0 || compTotals.clicks > 0 || compTotals.cost > 0 || compTotals.revenue > 0 || compTotals.bookings > 0;
                      return hasData ? calculateDerivedMetrics(compTotals) : null;
                    })() : null;

                    const renderMetricCell = (current: number, comparison: number | undefined, format: 'number' | 'currency' | 'currency_cpc' | 'percent' | 'roas' = 'number', isCostMetric = false) => {
                      const formatted = format === 'currency_cpc'
                        ? formatNumber(current, 'currency', undefined, 2)
                        : format === 'currency' 
                          ? formatNumber(current, 'currency') 
                          : format === 'percent' 
                            ? `${current.toFixed(2)}%` 
                            : format === 'roas' 
                              ? `${current.toFixed(1)}x`
                              : formatNumber(current);
                      return (
                        <TableCell className="text-right">
                          <div>{formatted}</div>
                          {comparison !== undefined && showComparison && (
                            <PercentChangeBadge current={current} previous={comparison} isCostMetric={isCostMetric} />
                          )}
                        </TableCell>
                      );
                    };

                    return (
                      <>
                        {rowsWithData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                              No data available for the selected period
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {rowsWithData.map((row) => (
                              <TableRow key={row.report}>
                                <TableCell className="font-medium">{row.report}</TableCell>
                                {renderMetricCell(row.impressions, row.compDerived?.impressions)}
                                {renderMetricCell(row.clicks, row.compDerived?.clicks)}
                                {renderMetricCell(row.ctr, row.compDerived?.ctr, 'percent')}
                                {renderMetricCell(row.bookings, row.compDerived?.bookings)}
                                {renderMetricCell(row.conversionRate, row.compDerived?.conversionRate, 'percent')}
                                {renderMetricCell(row.cpc, row.compDerived?.cpc, 'currency_cpc', true)}
                                {renderMetricCell(row.cost, row.compDerived?.cost, 'currency', true)}
                                {renderMetricCell(row.revenue, row.compDerived?.revenue, 'currency')}
                                {renderMetricCell(row.roas, row.compDerived?.roas, 'roas')}
                                {renderMetricCell(row.costOfSale, row.compDerived?.costOfSale, 'percent', true)}
                              </TableRow>
                            ))}
                            {rowsWithData.length > 0 && (
                              <TableRow className="bg-muted/50 font-semibold border-t-2">
                                <TableCell className="font-bold">Total</TableCell>
                                {renderMetricCell(totalDerived.impressions, totalCompDerived?.impressions)}
                                {renderMetricCell(totalDerived.clicks, totalCompDerived?.clicks)}
                                {renderMetricCell(totalDerived.ctr, totalCompDerived?.ctr, 'percent')}
                                {renderMetricCell(totalDerived.bookings, totalCompDerived?.bookings)}
                                {renderMetricCell(totalDerived.conversionRate, totalCompDerived?.conversionRate, 'percent')}
                                {renderMetricCell(totalDerived.cpc, totalCompDerived?.cpc, 'currency_cpc', true)}
                                {renderMetricCell(totalDerived.cost, totalCompDerived?.cost, 'currency', true)}
                                {renderMetricCell(totalDerived.revenue, totalCompDerived?.revenue, 'currency')}
                                {renderMetricCell(totalDerived.roas, totalCompDerived?.roas, 'roas')}
                                {renderMetricCell(totalDerived.costOfSale, totalCompDerived?.costOfSale, 'percent', true)}
                              </TableRow>
                            )}
                          </>
                        )}
                      </>
                    );
                  })()}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

    </TabsContent>
  );
}
