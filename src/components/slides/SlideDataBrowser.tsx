import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  FolderOpen, 
  Folder, 
  ChevronRight,
  ChevronLeft,
  BarChart3,
  TrendingUp,
  Table2,
  Loader2,
  Database
} from "lucide-react";
import { SlideReportPivotData, SlideReportConfiguration, BreakdownRow, ChannelMetrics } from "@/types/slideReports";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber as formatValue } from "@/lib/slideViewHelpers";

interface SlideDataBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pivotData?: SlideReportPivotData | null;
  lastRefreshedAt?: string | null;
  configuration?: SlideReportConfiguration | null;
  reportIds?: Record<string, string> | null;
  slideReportId?: string | null; // New prop to fetch from monthly_data table
}

// Type for monthly data from database
interface MonthlyDataRecord {
  id: string;
  slide_report_id: string;
  year: number;
  month: number;
  channel: string;
  metrics: ChannelMetrics;
  breakdowns: Record<string, BreakdownRow[]>;
  row_count: number;
  computed_at: string;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type ViewLevel = 'years' | 'months' | 'channels' | 'breakdowns' | 'data';

// Channel metrics table component
function ChannelMetricsTable({ 
  metrics, 
  title 
}: { 
  metrics: ChannelMetrics; 
  title: string;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted/50 px-4 py-2 border-b">
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Impressions</TableCell>
            <TableCell className="text-right">{formatValue(metrics.impressions)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Clicks</TableCell>
            <TableCell className="text-right">{formatValue(metrics.clicks)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Cost</TableCell>
            <TableCell className="text-right">{formatValue(metrics.cost, 'currency')}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Revenue</TableCell>
            <TableCell className="text-right">{formatValue(metrics.revenue, 'currency')}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Bookings</TableCell>
            <TableCell className="text-right">{formatValue(metrics.bookings)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>CTR</TableCell>
            <TableCell className="text-right">{formatValue(metrics.ctr, 'percentage')}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Conversion Rate</TableCell>
            <TableCell className="text-right">{formatValue(metrics.conversionRate, 'percentage')}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>CPC</TableCell>
            <TableCell className="text-right">{formatValue(metrics.cpc, 'currency')}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>ROAS</TableCell>
            <TableCell className="text-right">{formatValue(metrics.roas)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Cost of Sale</TableCell>
            <TableCell className="text-right">{formatValue(metrics.costOfSale, 'percentage')}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

// Breakdown data table component
function BreakdownTable({ 
  data, 
  title,
  breakdownName 
}: { 
  data: BreakdownRow[]; 
  title: string;
  breakdownName: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="border rounded-lg p-4 text-center text-muted-foreground">
        No breakdown data available
      </div>
    );
  }

  // Find the dimension key (usually 'name' or the breakdown dimension name)
  const dimensionKeys = Object.keys(data[0]).filter(
    key => !['impressions', 'clicks', 'cost', 'revenue', 'bookings', 'ctr', 'conversionRate', 'cpc', 'roas', 'costOfSale'].includes(key)
  );
  const dimensionKey = dimensionKeys[0] || 'name';

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted/50 px-4 py-2 border-b">
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground">{data.length} rows</p>
      </div>
      <ScrollArea className="h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold sticky top-0 bg-background">{breakdownName}</TableHead>
              <TableHead className="text-right sticky top-0 bg-background">Impressions</TableHead>
              <TableHead className="text-right sticky top-0 bg-background">Clicks</TableHead>
              <TableHead className="text-right sticky top-0 bg-background">Cost</TableHead>
              <TableHead className="text-right sticky top-0 bg-background">Revenue</TableHead>
              <TableHead className="text-right sticky top-0 bg-background">Bookings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{(row as any)[dimensionKey] || `Row ${idx + 1}`}</TableCell>
                <TableCell className="text-right">{formatValue(row.impressions)}</TableCell>
                <TableCell className="text-right">{formatValue(row.clicks)}</TableCell>
                <TableCell className="text-right">{formatValue(row.cost, 'currency')}</TableCell>
                <TableCell className="text-right">{formatValue(row.revenue, 'currency')}</TableCell>
                <TableCell className="text-right">{formatValue(row.bookings)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

export function SlideDataBrowser({
  open,
  onOpenChange,
  pivotData,
  lastRefreshedAt,
  configuration,
  reportIds,
  slideReportId,
}: SlideDataBrowserProps) {
  const [viewLevel, setViewLevel] = useState<ViewLevel>('years');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedBreakdown, setSelectedBreakdown] = useState<string | null>(null);
  const [monthlyDataRecords, setMonthlyDataRecords] = useState<MonthlyDataRecord[]>([]);
  const [isLoadingMonthlyData, setIsLoadingMonthlyData] = useState(false);

  // Fetch monthly data from database when modal opens
  useEffect(() => {
    if (open && slideReportId) {
      const fetchMonthlyData = async () => {
        setIsLoadingMonthlyData(true);
        try {
          const { data, error } = await supabase
            .from('slide_report_monthly_data')
            .select('*')
            .eq('slide_report_id', slideReportId)
            .order('year', { ascending: false })
            .order('month', { ascending: true });

          if (error) {
            console.error('Error fetching monthly data:', error);
          } else {
            setMonthlyDataRecords((data as unknown as MonthlyDataRecord[]) || []);
          }
        } catch (err) {
          console.error('Error:', err);
        } finally {
          setIsLoadingMonthlyData(false);
        }
      };
      fetchMonthlyData();
    }
  }, [open, slideReportId]);

  // Extract available years from pivot_data
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    
    // Check overview.monthly keys like "2024-01"
    if (pivotData?.overview?.monthly) {
      Object.keys(pivotData.overview.monthly).forEach(key => {
        const year = key.split('-')[0];
        if (year) years.add(year);
      });
    }
    
    // Check channels.*.monthly keys
    if (pivotData?.channels) {
      Object.values(pivotData.channels).forEach((channelData: any) => {
        if (channelData?.monthly) {
          Object.keys(channelData.monthly).forEach(key => {
            const year = key.split('-')[0];
            if (year) years.add(year);
          });
        }
      });
    }
    
    return Array.from(years).sort().reverse();
  }, [pivotData]);

  // Extract available months for selected year
  const availableMonths = useMemo(() => {
    if (!selectedYear) return [];
    const months = new Set<number>();
    
    // Check overview.monthly
    if (pivotData?.overview?.monthly) {
      Object.keys(pivotData.overview.monthly).forEach(key => {
        const [year, month] = key.split('-');
        if (year === selectedYear && month) {
          months.add(parseInt(month));
        }
      });
    }
    
    // Check channels.*.monthly
    if (pivotData?.channels) {
      Object.values(pivotData.channels).forEach((channelData: any) => {
        if (channelData?.monthly) {
          Object.keys(channelData.monthly).forEach(key => {
            const [year, month] = key.split('-');
            if (year === selectedYear && month) {
              months.add(parseInt(month));
            }
          });
        }
      });
    }
    
    return Array.from(months).sort((a, b) => a - b);
  }, [selectedYear, pivotData]);

  // Get available channels
  const availableChannels = useMemo(() => {
    if (!pivotData?.channels) return [];
    return Object.keys(pivotData.channels);
  }, [pivotData]);

  // Get available breakdowns for selected channel (considering monthly breakdowns)
  const availableBreakdowns = useMemo(() => {
    if (!selectedChannel || !pivotData?.channels?.[selectedChannel]) return [];
    
    // If a month is selected, check for monthly breakdowns first
    if (selectedMonth && selectedYear) {
      const monthKey = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
      const monthlyBreakdowns = pivotData.channels[selectedChannel].monthlyBreakdowns?.[monthKey];
      if (monthlyBreakdowns) {
        return Object.keys(monthlyBreakdowns);
      }
    }
    
    // Fall back to all-time breakdowns
    if (pivotData.channels[selectedChannel].breakdowns) {
      return Object.keys(pivotData.channels[selectedChannel].breakdowns);
    }
    return [];
  }, [selectedChannel, selectedMonth, selectedYear, pivotData]);

  // Get monthly metrics for selected year/month/channel
  const getMonthlyMetrics = (channel: string): ChannelMetrics | null => {
    if (!selectedYear || !selectedMonth || !pivotData?.channels?.[channel]?.monthly) return null;
    const monthKey = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
    return pivotData.channels[channel].monthly[monthKey] || null;
  };

  // Get breakdown data for selected channel/breakdown (monthly or all-time)
  const getBreakdownData = (): BreakdownRow[] | null => {
    if (!selectedChannel || !selectedBreakdown || !pivotData?.channels?.[selectedChannel]) return null;
    
    // Try monthly breakdowns first if month is selected
    if (selectedMonth && selectedYear) {
      const monthKey = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
      const monthlyBreakdowns = pivotData.channels[selectedChannel].monthlyBreakdowns?.[monthKey];
      if (monthlyBreakdowns?.[selectedBreakdown]) {
        return monthlyBreakdowns[selectedBreakdown];
      }
    }
    
    // Fall back to all-time breakdowns
    return pivotData.channels[selectedChannel].breakdowns?.[selectedBreakdown] || null;
  };

  // Navigation handlers
  const handleYearClick = (year: string) => {
    setSelectedYear(year);
    setViewLevel('months');
  };

  const handleMonthClick = (month: number) => {
    setSelectedMonth(month.toString());
    setViewLevel('channels');
  };

  const handleChannelClick = (channel: string) => {
    setSelectedChannel(channel);
    
    // Check for breakdowns (monthly first, then all-time)
    let hasBreakdowns = false;
    if (selectedMonth && selectedYear) {
      const monthKey = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
      const monthlyBreakdowns = pivotData?.channels?.[channel]?.monthlyBreakdowns?.[monthKey];
      hasBreakdowns = monthlyBreakdowns && Object.keys(monthlyBreakdowns).length > 0;
    }
    if (!hasBreakdowns) {
      const channelBreakdowns = pivotData?.channels?.[channel]?.breakdowns;
      hasBreakdowns = channelBreakdowns && Object.keys(channelBreakdowns).length > 0;
    }
    
    if (hasBreakdowns) {
      setViewLevel('breakdowns');
    } else {
      setViewLevel('data');
    }
  };

  const handleBreakdownClick = (breakdown: string) => {
    setSelectedBreakdown(breakdown);
    setViewLevel('data');
  };

  const handleBack = () => {
    switch (viewLevel) {
      case 'months':
        setSelectedYear(null);
        setViewLevel('years');
        break;
      case 'channels':
        setSelectedMonth(null);
        setViewLevel('months');
        break;
      case 'breakdowns':
        setSelectedChannel(null);
        setViewLevel('channels');
        break;
      case 'data':
        if (selectedBreakdown) {
          setSelectedBreakdown(null);
          setViewLevel('breakdowns');
        } else {
          setSelectedChannel(null);
          setViewLevel('channels');
        }
        break;
    }
  };

  // Build breadcrumb
  const breadcrumb = useMemo(() => {
    const parts: string[] = ['Data Browser'];
    if (selectedYear) parts.push(selectedYear);
    if (selectedMonth) parts.push(MONTH_NAMES[parseInt(selectedMonth) - 1]);
    if (selectedChannel) parts.push(selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1));
    if (selectedBreakdown) parts.push(selectedBreakdown);
    return parts;
  }, [selectedYear, selectedMonth, selectedChannel, selectedBreakdown]);

  // Render years view
  const renderYearsView = () => {
    if (availableYears.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Data Available</h3>
          <p className="text-sm">Click "Refresh Data" to compute and store data for browsing.</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-4">
        {availableYears.map(year => (
          <button
            key={year}
            onClick={() => handleYearClick(year)}
            className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group"
          >
            <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20">
              <Folder className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-lg">{year}</p>
              <p className="text-xs text-muted-foreground">Year</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          </button>
        ))}
      </div>
    );
  };

  // Render months view
  const renderMonthsView = () => {
    if (availableMonths.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>No monthly data available for {selectedYear}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-4 gap-4">
        {availableMonths.map(month => (
          <button
            key={month}
            onClick={() => handleMonthClick(month)}
            className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group"
          >
            <div className="p-2 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20">
              <Calendar className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold">{MONTH_NAMES[month - 1]}</p>
              <p className="text-xs text-muted-foreground">Month {month}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          </button>
        ))}
      </div>
    );
  };

  // Render channels view
  const renderChannelsView = () => {
    if (availableChannels.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>No channel data available</p>
        </div>
      );
    }

    const channelColors: Record<string, string> = {
      metasearch: 'bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20',
      sem: 'bg-green-500/10 text-green-500 group-hover:bg-green-500/20',
      social: 'bg-pink-500/10 text-pink-500 group-hover:bg-pink-500/20',
    };

    return (
      <div className="grid grid-cols-3 gap-4">
        {availableChannels.map(channel => {
          const metrics = getMonthlyMetrics(channel);
          const hasBreakdowns = pivotData?.channels?.[channel]?.breakdowns && 
            Object.keys(pivotData.channels[channel].breakdowns).length > 0;
          const rawRowCount = pivotData?.channels?.[channel]?.rawDataRows?.length || 0;
          
          return (
            <button
              key={channel}
              onClick={() => handleChannelClick(channel)}
              className="flex flex-col gap-3 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${channelColors[channel] || 'bg-primary/10 text-primary group-hover:bg-primary/20'}`}>
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold capitalize">{channel}</p>
                  {metrics && (
                    <p className="text-xs text-muted-foreground">
                      {formatValue(metrics.revenue, 'currency')} revenue
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="flex gap-2 flex-wrap">
                {rawRowCount > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {rawRowCount.toLocaleString()} rows
                  </Badge>
                )}
                {hasBreakdowns && (
                  <Badge variant="secondary" className="text-xs">
                    {Object.keys(pivotData!.channels![channel].breakdowns).length} breakdowns
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  // Render breakdowns view
  const renderBreakdownsView = () => {
    if (availableBreakdowns.length === 0) {
      // No breakdowns, show channel metrics directly
      const metrics = getMonthlyMetrics(selectedChannel!);
      if (metrics) {
        return (
          <ChannelMetricsTable 
            metrics={metrics} 
            title={`${selectedChannel?.charAt(0).toUpperCase()}${selectedChannel?.slice(1)} - ${MONTH_NAMES[parseInt(selectedMonth!) - 1]} ${selectedYear}`}
          />
        );
      }
      return (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>No breakdown dimensions configured for {selectedChannel}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Show channel summary metrics */}
        {getMonthlyMetrics(selectedChannel!) && (
          <div className="bg-muted/30 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium mb-2">Channel Summary</h4>
            <div className="grid grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Revenue</p>
                <p className="font-semibold">{formatValue(getMonthlyMetrics(selectedChannel!)?.revenue, 'currency')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cost</p>
                <p className="font-semibold">{formatValue(getMonthlyMetrics(selectedChannel!)?.cost, 'currency')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Bookings</p>
                <p className="font-semibold">{formatValue(getMonthlyMetrics(selectedChannel!)?.bookings)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">ROAS</p>
                <p className="font-semibold">{formatValue(getMonthlyMetrics(selectedChannel!)?.roas)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cost of Sale</p>
                <p className="font-semibold">{formatValue(getMonthlyMetrics(selectedChannel!)?.costOfSale, 'percentage')}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Breakdown dimension folders */}
        <div className="grid grid-cols-3 gap-4">
          {availableBreakdowns.map(breakdown => {
            const breakdownData = pivotData?.channels?.[selectedChannel!]?.breakdowns?.[breakdown];
            const rowCount = breakdownData?.length || 0;
            
            return (
              <button
                key={breakdown}
                onClick={() => handleBreakdownClick(breakdown)}
                className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group"
              >
                <div className="p-2 rounded-lg bg-orange-500/10 group-hover:bg-orange-500/20">
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold">{breakdown}</p>
                  <p className="text-xs text-muted-foreground">{rowCount} rows</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Render data view
  const renderDataView = () => {
    if (selectedBreakdown) {
      const breakdownData = getBreakdownData();
      return (
        <BreakdownTable 
          data={breakdownData || []} 
          title={`${selectedBreakdown} - ${selectedChannel?.charAt(0).toUpperCase()}${selectedChannel?.slice(1)} - ${MONTH_NAMES[parseInt(selectedMonth!) - 1]} ${selectedYear}`}
          breakdownName={selectedBreakdown}
        />
      );
    }
    
    const metrics = getMonthlyMetrics(selectedChannel!);
    if (metrics) {
      return (
        <ChannelMetricsTable 
          metrics={metrics} 
          title={`${selectedChannel?.charAt(0).toUpperCase()}${selectedChannel?.slice(1)} - ${MONTH_NAMES[parseInt(selectedMonth!) - 1]} ${selectedYear}`}
        />
      );
    }
    
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Table2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p>No data available</p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Data Browser
          </DialogTitle>
          <DialogDescription>
            Browse stored pivot data by Year → Month → Channel → Breakdown
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm border-b pb-3">
          {viewLevel !== 'years' && (
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <div className="flex items-center gap-1 text-muted-foreground">
            {breadcrumb.map((part, idx) => (
              <span key={idx} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="h-3 w-3" />}
                <span className={idx === breadcrumb.length - 1 ? 'text-foreground font-medium' : ''}>
                  {part}
                </span>
              </span>
            ))}
          </div>
          {lastRefreshedAt && (
            <Badge variant="outline" className="ml-auto text-xs">
              Last refreshed: {new Date(lastRefreshedAt).toLocaleString()}
            </Badge>
          )}
        </div>

        {/* Content */}
        <ScrollArea className="h-[500px] pr-4">
          <div className="py-4">
            {viewLevel === 'years' && renderYearsView()}
            {viewLevel === 'months' && renderMonthsView()}
            {viewLevel === 'channels' && renderChannelsView()}
            {viewLevel === 'breakdowns' && renderBreakdownsView()}
            {viewLevel === 'data' && renderDataView()}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}