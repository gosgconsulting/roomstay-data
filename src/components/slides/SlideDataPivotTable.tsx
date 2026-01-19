import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Database, Calendar, BarChart3, TrendingUp, Layers, RefreshCw, Clock } from "lucide-react";
import { SlideReportPivotData, ChannelMetrics } from "@/types/slideReports";
import { calculateDerivedMetrics as calculateDerivedMetricsBase } from "@/lib/slideViewHelpers";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface SlideDataPivotTableProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedValueDimensionIds: string[];
  availableDimensions: Record<string, Dimension[]>;
  selectedChannels: ('metasearch' | 'sem' | 'social')[];
  slideReportId?: string | null;
  pivotData?: SlideReportPivotData | null;
  lastRefreshedAt?: string | null;
}

// Format values based on metric type
const formatMetricValue = (value: number | undefined, metricName: string): string => {
  if (value === undefined || value === null) return '-';
  
  const normalized = metricName.toLowerCase().replace(/\s+/g, '');
  
  if (normalized.includes('cost') && !normalized.includes('costofsale') || normalized.includes('revenue') || normalized.includes('cpc')) {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  if (normalized.includes('ctr') || normalized.includes('conversion') || normalized.includes('costofsale')) {
    return `${value.toFixed(2)}%`;
  }
  
  if (normalized.includes('roas')) {
    return `${value.toFixed(2)}x`;
  }
  
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

// Format large numbers
const formatNumber = (value: number): string => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

// Use centralized calculateDerivedMetrics from slideViewHelpers
// Convert DerivedMetrics to ChannelMetrics (same structure, different type name)
const calculateDerivedMetrics = (data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }): ChannelMetrics => {
  return calculateDerivedMetricsBase(data) as ChannelMetrics;
};

// Month names for display
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Metrics to display in tables
const METRICS = ['impressions', 'clicks', 'ctr', 'bookings', 'conversionRate', 'cpc', 'cost', 'revenue', 'roas', 'costOfSale'];
const METRIC_LABELS: Record<string, string> = {
  impressions: 'Impressions',
  clicks: 'Clicks',
  ctr: 'CTR',
  bookings: 'Bookings',
  conversionRate: 'Conv. Rate',
  cpc: 'CPC',
  cost: 'Cost',
  revenue: 'Revenue',
  roas: 'ROAS',
  costOfSale: 'Cost of Sale',
};

export function SlideDataPivotTable({
  open,
  onOpenChange,
  selectedValueDimensionIds,
  availableDimensions,
  selectedChannels,
  slideReportId,
  pivotData,
  lastRefreshedAt,
}: SlideDataPivotTableProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "channels" | "monthly" | "yearly">("overview");
  const [selectedChannel, setSelectedChannel] = useState<'metasearch' | 'sem' | 'social' | null>(
    selectedChannels.length > 0 ? selectedChannels[0] : null
  );

  // Update selectedChannel when selectedChannels changes
  useEffect(() => {
    if (selectedChannels.length > 0) {
      if (!selectedChannel || !selectedChannels.includes(selectedChannel)) {
        setSelectedChannel(selectedChannels[0]);
      }
    } else {
      setSelectedChannel(null);
    }
  }, [selectedChannels, selectedChannel]);

  // Check if we have pivot data
  const hasData = pivotData && (
    Object.keys(pivotData.channels || {}).length > 0 || 
    Object.keys(pivotData.overview?.monthly || {}).length > 0
  );

  // Get overview metrics
  const overviewMetrics = useMemo(() => {
    if (!pivotData?.overview) return null;
    return {
      current: pivotData.overview.current,
      previousPeriod: pivotData.overview.previous_period,
      previousYear: pivotData.overview.previous_year,
    };
  }, [pivotData]);

  // Get channel metrics  
  const channelMetrics = useMemo(() => {
    if (!pivotData?.channels) return {};
    return pivotData.channels;
  }, [pivotData]);

  // Get monthly data sorted by date
  const monthlyData = useMemo(() => {
    const data: Array<{
      key: string;
      year: number;
      month: string;
      monthNum: number;
      overview: ChannelMetrics | null;
      channels: Record<string, ChannelMetrics>;
    }> = [];

    // Collect all month keys from overview and channels
    const monthKeys = new Set<string>();
    
    if (pivotData?.overview?.monthly) {
      Object.keys(pivotData.overview.monthly).forEach(key => monthKeys.add(key));
    }
    
    if (pivotData?.channels) {
      Object.values(pivotData.channels).forEach(channelData => {
        if (channelData.monthly) {
          Object.keys(channelData.monthly).forEach(key => monthKeys.add(key));
        }
      });
    }

    // Sort and build data array
    const sortedKeys = Array.from(monthKeys).sort();
    
    sortedKeys.forEach(key => {
      const [yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr);
      const monthNum = parseInt(monthStr);
      const month = MONTH_NAMES[monthNum - 1] || monthStr;

      const channels: Record<string, ChannelMetrics> = {};
      
      if (pivotData?.channels) {
        Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
          if (channelData.monthly?.[key]) {
            channels[channel] = channelData.monthly[key];
          }
        });
      }

      data.push({
        key,
        year,
        month,
        monthNum,
        overview: pivotData?.overview?.monthly?.[key] || null,
        channels,
      });
    });

    return data;
  }, [pivotData]);

  // Get yearly totals
  const yearlyData = useMemo(() => {
    const data: Array<{
      year: string;
      overview: ChannelMetrics | null;
      channels: Record<string, ChannelMetrics>;
    }> = [];

    const years = ['2024', '2025', '2026'];
    
    years.forEach(year => {
      const channels: Record<string, ChannelMetrics> = {};
      
      if (pivotData?.channels) {
        Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
          if (channelData.yearly?.[year]) {
            channels[channel] = channelData.yearly[year];
          }
        });
      }

      // Only add if we have data for this year
      const hasYearData = Object.keys(channels).length > 0 || pivotData?.overview?.yearly?.[year];
      
      if (hasYearData) {
        data.push({
          year,
          overview: pivotData?.overview?.yearly?.[year] || null,
          channels,
        });
      }
    });

    return data;
  }, [pivotData]);

  // Format timestamp
  const formattedRefreshTime = useMemo(() => {
    if (!lastRefreshedAt) return null;
    try {
      const date = new Date(lastRefreshedAt);
      return date.toLocaleString('en-US', { 
        dateStyle: 'medium', 
        timeStyle: 'short' 
      });
    } catch {
      return null;
    }
  }, [lastRefreshedAt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">Stored Pivot Data</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Pre-computed data stored in the database for fast loading
                </DialogDescription>
              </div>
            </div>
            {formattedRefreshTime && (
              <Badge variant="outline" className="gap-1.5">
                <Clock className="h-3 w-3" />
                Last updated: {formattedRefreshTime}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {!hasData ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Database className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No Pivot Data Available</p>
            <p className="text-sm text-center max-w-md">
              Click "Refresh Data" to fetch data from your sources and generate pivot tables.
              This data will be stored for fast access.
            </p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col min-h-0 pt-4">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="overview" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="channels" className="gap-2">
                <Layers className="h-4 w-4" />
                Channels
              </TabsTrigger>
              <TabsTrigger value="monthly" className="gap-2">
                <Calendar className="h-4 w-4" />
                Monthly
              </TabsTrigger>
              <TabsTrigger value="yearly" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Yearly
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab - Current totals */}
            <TabsContent value="overview" className="flex-1 flex flex-col min-h-0">
              <div className="space-y-6">
                {/* Overview summary */}
                {overviewMetrics?.current && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      All Channels Combined
                    </h3>
                    <div className="grid grid-cols-5 gap-3">
                      {['impressions', 'clicks', 'cost', 'revenue', 'bookings'].map(metric => (
                        <div key={metric} className="p-3 rounded-lg border bg-card">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                            {METRIC_LABELS[metric]}
                          </p>
                          <p className="text-lg font-semibold">
                            {formatMetricValue((overviewMetrics.current as any)[metric], metric)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-3 mt-3">
                      {['ctr', 'conversionRate', 'cpc', 'roas', 'costOfSale'].map(metric => (
                        <div key={metric} className="p-3 rounded-lg border bg-card">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                            {METRIC_LABELS[metric]}
                          </p>
                          <p className="text-lg font-semibold">
                            {formatMetricValue((overviewMetrics.current as any)[metric], metric)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-channel summary */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    By Channel
                  </h3>
                  <ScrollArea className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Channel</TableHead>
                          {METRICS.map(m => (
                            <TableHead key={m} className="text-right font-semibold">{METRIC_LABELS[m]}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(channelMetrics).map(([channel, data]) => (
                          <TableRow key={channel}>
                            <TableCell className="font-medium capitalize">{channel}</TableCell>
                            {METRICS.map(metric => (
                              <TableCell key={metric} className="text-right">
                                {formatMetricValue((data.current as any)?.[metric], metric)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            {/* Channels Tab - Per-channel details */}
            <TabsContent value="channels" className="flex-1 flex flex-col min-h-0">
              <div className="flex gap-4 h-full">
                {/* Channel selector */}
                <div className="w-40 shrink-0">
                  <div className="space-y-1">
                    {selectedChannels.map(channel => (
                      <button
                        key={channel}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                          selectedChannel === channel 
                            ? 'bg-primary text-primary-foreground' 
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => setSelectedChannel(channel)}
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Channel data */}
                <div className="flex-1 min-h-0">
                  {selectedChannel && channelMetrics[selectedChannel] && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold capitalize">{selectedChannel} - Current Totals</h3>
                      <div className="grid grid-cols-5 gap-3">
                        {METRICS.slice(0, 5).map(metric => (
                          <div key={metric} className="p-3 rounded-lg border bg-card">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                              {METRIC_LABELS[metric]}
                            </p>
                            <p className="text-lg font-semibold">
                              {formatMetricValue((channelMetrics[selectedChannel].current as any)?.[metric], metric)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-5 gap-3">
                        {METRICS.slice(5).map(metric => (
                          <div key={metric} className="p-3 rounded-lg border bg-card">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                              {METRIC_LABELS[metric]}
                            </p>
                            <p className="text-lg font-semibold">
                              {formatMetricValue((channelMetrics[selectedChannel].current as any)?.[metric], metric)}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Yearly breakdown for this channel */}
                      {channelMetrics[selectedChannel].yearly && (
                        <div className="mt-6">
                          <h4 className="text-sm font-medium mb-3">Yearly Totals</h4>
                          <ScrollArea className="border rounded-lg max-h-[300px]">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="font-semibold">Year</TableHead>
                                  {METRICS.map(m => (
                                    <TableHead key={m} className="text-right font-semibold">{METRIC_LABELS[m]}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {Object.entries(channelMetrics[selectedChannel].yearly || {})
                                  .sort(([a], [b]) => a.localeCompare(b))
                                  .map(([year, metrics]) => (
                                    <TableRow key={year}>
                                      <TableCell className="font-medium">{year}</TableCell>
                                      {METRICS.map(metric => (
                                        <TableCell key={metric} className="text-right">
                                          {formatMetricValue((metrics as any)?.[metric], metric)}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Monthly Tab - Full monthly breakdown */}
            <TabsContent value="monthly" className="flex-1 flex flex-col min-h-0">
              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Period</TableHead>
                      <TableHead className="font-semibold">Channel</TableHead>
                      {METRICS.map(m => (
                        <TableHead key={m} className="text-right font-semibold">{METRIC_LABELS[m]}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={METRICS.length + 2} className="text-center py-8 text-muted-foreground">
                          No monthly data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      monthlyData.flatMap(row => {
                        const rows = [];
                        
                        // Show overview row if available
                        if (row.overview) {
                          rows.push(
                            <TableRow key={`${row.key}-overview`} className="bg-primary/5">
                              <TableCell className="font-medium">{row.month} {row.year}</TableCell>
                              <TableCell className="font-medium text-primary">All Channels</TableCell>
                              {METRICS.map(metric => (
                                <TableCell key={metric} className="text-right">
                                  {formatMetricValue((row.overview as any)?.[metric], metric)}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        }
                        
                        // Show channel rows
                        Object.entries(row.channels).forEach(([channel, metrics]) => {
                          rows.push(
                            <TableRow key={`${row.key}-${channel}`}>
                              <TableCell className="text-muted-foreground">{row.month} {row.year}</TableCell>
                              <TableCell className="capitalize">{channel}</TableCell>
                              {METRICS.map(metric => (
                                <TableCell key={metric} className="text-right">
                                  {formatMetricValue((metrics as any)?.[metric], metric)}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        });
                        
                        return rows;
                      })
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

            {/* Yearly Tab - Yearly totals */}
            <TabsContent value="yearly" className="flex-1 flex flex-col min-h-0">
              <div className="space-y-6">
                {/* Overview yearly totals */}
                {yearlyData.some(y => y.overview) && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3">All Channels - Yearly Totals</h3>
                    <ScrollArea className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Year</TableHead>
                            {METRICS.map(m => (
                              <TableHead key={m} className="text-right font-semibold">{METRIC_LABELS[m]}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {yearlyData.map(row => row.overview && (
                            <TableRow key={row.year}>
                              <TableCell className="font-medium">{row.year}</TableCell>
                              {METRICS.map(metric => (
                                <TableCell key={metric} className="text-right">
                                  {formatMetricValue((row.overview as any)?.[metric], metric)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}

                {/* Per-channel yearly totals */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">By Channel - Yearly Totals</h3>
                  <ScrollArea className="border rounded-lg max-h-[400px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Year</TableHead>
                          <TableHead className="font-semibold">Channel</TableHead>
                          {METRICS.map(m => (
                            <TableHead key={m} className="text-right font-semibold">{METRIC_LABELS[m]}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {yearlyData.flatMap(row => 
                          Object.entries(row.channels).map(([channel, metrics]) => (
                            <TableRow key={`${row.year}-${channel}`}>
                              <TableCell className="font-medium">{row.year}</TableCell>
                              <TableCell className="capitalize">{channel}</TableCell>
                              {METRICS.map(metric => (
                                <TableCell key={metric} className="text-right">
                                  {formatMetricValue((metrics as any)?.[metric], metric)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
