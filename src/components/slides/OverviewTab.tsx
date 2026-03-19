import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Settings2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { SlideReport } from "@/types/slideReports";
import { calculateDerivedMetrics, calculatePercentChange, formatNumber } from "@/lib/slideViewHelpers";
import type { ChartGranularity, ChartMetric } from "@/types/slideView";
import { CHART_METRIC_OPTIONS, formatChartMetricValue, getChartMetricLabel } from "@/lib/chartMetric";

interface OverviewTabProps {
  slideReportId: string | null;
  isSlideReportsLoading: boolean;
  slideReport?: SlideReport | null;
  isLoadingData: boolean;
  isLoadingMonthlyData: boolean;
  currentTotals: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
  overviewChartData: Array<{ label: string; value: number }>;
  comparisonChartData?: Array<{ label: string; value: number }> | null;
  chartGranularity: ChartGranularity;
  setChartGranularity: (value: ChartGranularity) => void;
  chartMetric: ChartMetric;
  setChartMetric: (metric: ChartMetric) => void;
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
}

function PercentChangeBadge({ current, previous, isCostMetric = false }: { current: number; previous: number; isCostMetric?: boolean }) {
  const pct = calculatePercentChange(current, previous);
  if (pct === null) return null;
  const isPositive = pct >= 0;
  const isGood = isCostMetric ? !isPositive : isPositive;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${isGood ? 'text-success' : 'text-destructive'}`}>
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
  overviewChartData,
  comparisonChartData,
  chartGranularity,
  setChartGranularity,
  chartMetric,
  setChartMetric,
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
}: OverviewTabProps) {
  // Merge comparison data into chart data
  const mergedChartData = overviewChartData.map((point, i) => ({
    ...point,
    comparisonValue: comparisonChartData?.[i]?.value ?? undefined,
  }));

  const showComparison = comparisonType && comparisonType !== 'none';
  const compLabel = comparisonType === 'previous_period' ? 'Previous Period' : 'Previous Year';

  // Show skeletons whenever any loading is in flight — no blur/stale-dim.
  const isLoading = isSlideReportsLoading || isLoadingData;

  return (
    <div className="space-y-6">
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
      {isLoading ? (
        renderKPICardsSkeleton()
      ) : slideReportId ? (
        renderKPICards(KPI_CARDS, getOverviewComparisonMetrics())
      ) : null}

      {/* Monthly Results Chart */}
      {(isLoading || isLoadingMonthlyData) ? (
        renderChartSkeleton()
      ) : (
        <div>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">{getChartMetricLabel(chartMetric)}</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as ChartMetric)} disabled={isReadOnlyMode}>
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
              <Select value={chartGranularity} onValueChange={(v) => setChartGranularity(v as ChartGranularity)} disabled={isReadOnlyMode}>
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
                  <YAxis axisLine={false} tickLine={false} className="text-xs fill-muted-foreground" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    formatter={(value: any, name: string) => [
                      formatChartMetricValue(value as number, chartMetric),
                      name === 'comparisonValue' ? compLabel : getChartMetricLabel(chartMetric)
                    ]}
                  />
                  {showComparison && comparisonChartData && (
                    <Area 
                      type="monotone" 
                      dataKey="comparisonValue" 
                      stroke="#94a3b8" 
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      fill="url(#comparisonGradient)"
                      name={compLabel}
                    />
                  )}
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                    name={getChartMetricLabel(chartMetric)}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Channel Performance Table */}
      {isLoading ? (
        renderTableSkeleton()
      ) : (
        <div>
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
                      const data = filteredData.channelTotals[channelKey] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
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
        </div>
      )}

    </div>
  );
}
