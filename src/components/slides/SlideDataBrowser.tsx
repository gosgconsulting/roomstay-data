import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Database, 
  Calendar, 
  Clock, 
  FolderOpen, 
  Folder, 
  ChevronRight,
  ChevronLeft,
  FileJson,
  TrendingUp,
  Layers
} from "lucide-react";
import { SlideReportPivotData, ChannelMetrics } from "@/types/slideReports";

interface SlideDataBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pivotData?: SlideReportPivotData | null;
  lastRefreshedAt?: string | null;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Format metric values for display
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

type ViewLevel = 'years' | 'months' | 'data';

export function SlideDataBrowser({
  open,
  onOpenChange,
  pivotData,
  lastRefreshedAt,
}: SlideDataBrowserProps) {
  const [viewLevel, setViewLevel] = useState<ViewLevel>('years');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setViewLevel('years');
      setSelectedYear(null);
      setSelectedMonth(null);
    }
    onOpenChange(isOpen);
  };

  // Extract available years from pivot data
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    
    if (pivotData?.overview?.yearly) {
      Object.keys(pivotData.overview.yearly).forEach(y => years.add(y));
    }
    
    if (pivotData?.channels) {
      Object.values(pivotData.channels).forEach(channelData => {
        if (channelData.yearly) {
          Object.keys(channelData.yearly).forEach(y => years.add(y));
        }
      });
    }

    return Array.from(years).sort().reverse();
  }, [pivotData]);

  // Extract available months for selected year
  const availableMonths = useMemo(() => {
    if (!selectedYear) return [];
    
    const months = new Set<number>();
    
    if (pivotData?.overview?.monthly) {
      Object.keys(pivotData.overview.monthly).forEach(key => {
        const [year, month] = key.split('-');
        if (year === selectedYear) {
          months.add(parseInt(month));
        }
      });
    }
    
    if (pivotData?.channels) {
      Object.values(pivotData.channels).forEach(channelData => {
        if (channelData.monthly) {
          Object.keys(channelData.monthly).forEach(key => {
            const [year, month] = key.split('-');
            if (year === selectedYear) {
              months.add(parseInt(month));
            }
          });
        }
      });
    }

    return Array.from(months).sort((a, b) => a - b);
  }, [pivotData, selectedYear]);

  // Get data for selected month
  const monthData = useMemo(() => {
    if (!selectedYear || !selectedMonth) return null;
    
    const monthKey = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
    
    const overview = pivotData?.overview?.monthly?.[monthKey] || null;
    const channels: Record<string, ChannelMetrics> = {};
    
    if (pivotData?.channels) {
      Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
        if (channelData.monthly?.[monthKey]) {
          channels[channel] = channelData.monthly[monthKey];
        }
      });
    }
    
    return { overview, channels, monthKey };
  }, [pivotData, selectedYear, selectedMonth]);

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

  // Handle year click
  const handleYearClick = (year: string) => {
    setSelectedYear(year);
    setViewLevel('months');
  };

  // Handle month click
  const handleMonthClick = (month: number) => {
    setSelectedMonth(month.toString());
    setViewLevel('data');
  };

  // Handle back navigation
  const handleBack = () => {
    if (viewLevel === 'data') {
      setSelectedMonth(null);
      setViewLevel('months');
    } else if (viewLevel === 'months') {
      setSelectedYear(null);
      setViewLevel('years');
    }
  };

  // Get breadcrumb path
  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'Years', level: 'years' as ViewLevel }];
    if (selectedYear) {
      crumbs.push({ label: selectedYear, level: 'months' as ViewLevel });
    }
    if (selectedMonth) {
      const monthName = MONTH_NAMES[parseInt(selectedMonth) - 1];
      crumbs.push({ label: monthName, level: 'data' as ViewLevel });
    }
    return crumbs;
  }, [selectedYear, selectedMonth]);

  const hasData = availableYears.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">Data Browser</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Browse stored pivot data by year and month
                </DialogDescription>
              </div>
            </div>
            {formattedRefreshTime && (
              <Badge variant="outline" className="gap-1.5">
                <Clock className="h-3 w-3" />
                {formattedRefreshTime}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Breadcrumb navigation */}
        {viewLevel !== 'years' && (
          <div className="flex items-center gap-2 pt-4 pb-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBack}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {breadcrumbs.map((crumb, i) => (
                <div key={crumb.level} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <span 
                    className={`${
                      i === breadcrumbs.length - 1 
                        ? 'text-foreground font-medium' 
                        : 'hover:text-foreground cursor-pointer'
                    }`}
                    onClick={() => {
                      if (crumb.level === 'years') {
                        setSelectedYear(null);
                        setSelectedMonth(null);
                        setViewLevel('years');
                      } else if (crumb.level === 'months') {
                        setSelectedMonth(null);
                        setViewLevel('months');
                      }
                    }}
                  >
                    {crumb.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 pt-2">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Database className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No Data Available</p>
              <p className="text-sm text-center max-w-md">
                Click "Refresh Data" to fetch and cache data from your sources.
              </p>
            </div>
          ) : (
            <>
              {/* Years View */}
              {viewLevel === 'years' && (
                <div className="grid grid-cols-3 gap-4 p-2">
                  {availableYears.map(year => (
                    <button
                      key={year}
                      onClick={() => handleYearClick(year)}
                      className="flex items-center gap-4 p-5 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group text-left"
                    >
                      <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Folder className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xl font-semibold">{year}</p>
                        <p className="text-sm text-muted-foreground">
                          {availableYears.indexOf(year) === 0 ? 'Latest' : 'Historical'}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              )}

              {/* Months View */}
              {viewLevel === 'months' && selectedYear && (
                <div className="grid grid-cols-4 gap-3 p-2">
                  {availableMonths.map(month => (
                    <button
                      key={month}
                      onClick={() => handleMonthClick(month)}
                      className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group text-left"
                    >
                      <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{MONTH_NAMES[month - 1]}</p>
                        <p className="text-xs text-muted-foreground">{selectedYear}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                  {availableMonths.length === 0 && (
                    <div className="col-span-4 text-center py-12 text-muted-foreground">
                      <Calendar className="h-8 w-8 mx-auto mb-3 opacity-50" />
                      <p>No monthly data available for {selectedYear}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Data View */}
              {viewLevel === 'data' && monthData && (
                <div className="space-y-6 p-2">
                  <div className="flex items-center gap-2 mb-4">
                    <FileJson className="h-5 w-5 text-primary" />
                    <span className="font-semibold">
                      {MONTH_NAMES[parseInt(selectedMonth!) - 1]} {selectedYear} Data
                    </span>
                    <Badge variant="secondary" className="ml-auto">
                      Month Key: {monthData.monthKey}
                    </Badge>
                  </div>

                  {/* Overview Metrics */}
                  {monthData.overview && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Overview (All Channels)</span>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 border">
                        <div className="grid grid-cols-5 gap-4">
                          {['impressions', 'clicks', 'cost', 'revenue', 'bookings'].map(metric => (
                            <div key={metric} className="text-center">
                              <p className="text-xs text-muted-foreground uppercase mb-1">{metric}</p>
                              <p className="font-semibold">
                                {formatMetricValue((monthData.overview as any)[metric], metric)}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-5 gap-4 mt-4 pt-4 border-t border-border/50">
                          {['ctr', 'conversionRate', 'cpc', 'roas', 'costOfSale'].map(metric => (
                            <div key={metric} className="text-center">
                              <p className="text-xs text-muted-foreground uppercase mb-1">
                                {metric === 'conversionRate' ? 'Conv Rate' : metric === 'costOfSale' ? 'CoS' : metric.toUpperCase()}
                              </p>
                              <p className="font-semibold">
                                {formatMetricValue((monthData.overview as any)[metric], metric)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Channel Data */}
                  {Object.keys(monthData.channels).length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">By Channel</span>
                      </div>
                      <div className="space-y-3">
                        {Object.entries(monthData.channels).map(([channel, metrics]) => (
                          <div key={channel} className="bg-muted/30 rounded-lg p-4 border">
                            <p className="font-medium capitalize mb-3">{channel}</p>
                            <div className="grid grid-cols-5 gap-4">
                              {['impressions', 'clicks', 'cost', 'revenue', 'bookings'].map(metric => (
                                <div key={metric} className="text-center">
                                  <p className="text-xs text-muted-foreground uppercase mb-1">{metric}</p>
                                  <p className="font-semibold text-sm">
                                    {formatMetricValue((metrics as any)[metric], metric)}
                                  </p>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-5 gap-4 mt-3 pt-3 border-t border-border/50">
                              {['ctr', 'conversionRate', 'cpc', 'roas', 'costOfSale'].map(metric => (
                                <div key={metric} className="text-center">
                                  <p className="text-xs text-muted-foreground uppercase mb-1">
                                    {metric === 'conversionRate' ? 'Conv' : metric === 'costOfSale' ? 'CoS' : metric.toUpperCase()}
                                  </p>
                                  <p className="font-semibold text-sm">
                                    {formatMetricValue((metrics as any)[metric], metric)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw JSON Preview */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FileJson className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">Raw JSON</span>
                    </div>
                    <ScrollArea className="h-[200px] rounded-lg border bg-muted/20">
                      <pre className="p-4 text-xs font-mono">
                        {JSON.stringify({
                          monthKey: monthData.monthKey,
                          overview: monthData.overview,
                          channels: monthData.channels
                        }, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              )}
            </>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
