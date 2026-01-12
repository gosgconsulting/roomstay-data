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
  FileJson
} from "lucide-react";
import { SlideReportPivotData } from "@/types/slideReports";

interface SlideDataBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pivotData?: SlideReportPivotData | null;
  lastRefreshedAt?: string | null;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

  // Get RAW JSON data for selected month
  const monthRawData = useMemo(() => {
    if (!selectedYear || !selectedMonth) return null;
    
    const monthKey = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
    
    // Extract raw data exactly as stored in pivot_data JSON
    const rawData: Record<string, any> = {
      monthKey,
      source: 'slide_reports.pivot_data (JSON column)',
    };

    // Overview monthly data
    if (pivotData?.overview?.monthly?.[monthKey]) {
      rawData['overview.monthly'] = pivotData.overview.monthly[monthKey];
    }

    // Channel monthly data
    if (pivotData?.channels) {
      Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
        if (channelData.monthly?.[monthKey]) {
          rawData[`channels.${channel}.monthly`] = channelData.monthly[monthKey];
        }
      });
    }
    
    return rawData;
  }, [pivotData, selectedYear, selectedMonth]);

  // Get RAW JSON data for selected year
  const yearRawData = useMemo(() => {
    if (!selectedYear) return null;
    
    const rawData: Record<string, any> = {
      year: selectedYear,
      source: 'slide_reports.pivot_data (JSON column)',
    };

    // Overview yearly data
    if (pivotData?.overview?.yearly?.[selectedYear]) {
      rawData['overview.yearly'] = pivotData.overview.yearly[selectedYear];
    }

    // Channel yearly data
    if (pivotData?.channels) {
      Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
        if (channelData.yearly?.[selectedYear]) {
          rawData[`channels.${channel}.yearly`] = channelData.yearly[selectedYear];
        }
      });
    }
    
    return rawData;
  }, [pivotData, selectedYear]);

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
                  Raw JSON from slide_reports.pivot_data column
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
                <div className="space-y-4 p-2">
                  <div className="text-xs text-muted-foreground mb-4 font-mono bg-muted/30 p-2 rounded">
                    Source: Supabase → slide_reports.pivot_data (JSONB column)
                  </div>
                  <div className="grid grid-cols-3 gap-4">
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
                  
                  {/* Show full raw pivot_data structure */}
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <FileJson className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Full pivot_data JSON structure</span>
                    </div>
                    <ScrollArea className="h-[300px] rounded-lg border bg-muted/20">
                      <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
                        {JSON.stringify(pivotData, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              )}

              {/* Months View - show year summary + month folders */}
              {viewLevel === 'months' && selectedYear && (
                <div className="space-y-4 p-2">
                  <div className="text-xs text-muted-foreground mb-2 font-mono bg-muted/30 p-2 rounded">
                    Year: {selectedYear} | Path: pivot_data.*.yearly["{selectedYear}"] & pivot_data.*.monthly["{selectedYear}-MM"]
                  </div>
                  
                  {/* Yearly aggregate JSON */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileJson className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{selectedYear} Yearly Aggregates (JSON)</span>
                    </div>
                    <ScrollArea className="h-[200px] rounded-lg border bg-muted/20">
                      <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
                        {JSON.stringify(yearRawData, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>

                  {/* Month folders */}
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Monthly Data Folders</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
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
                          <p className="text-xs text-muted-foreground">{selectedYear}-{month.toString().padStart(2, '0')}</p>
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
                </div>
              )}

              {/* Data View - Raw JSON only */}
              {viewLevel === 'data' && monthRawData && (
                <div className="space-y-4 p-2">
                  <div className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded">
                    Month Key: {monthRawData.monthKey} | Path: pivot_data.*.monthly["{monthRawData.monthKey}"]
                  </div>

                  <div className="flex items-center gap-2">
                    <FileJson className="h-5 w-5 text-primary" />
                    <span className="font-semibold">
                      {MONTH_NAMES[parseInt(selectedMonth!) - 1]} {selectedYear} - Raw JSON
                    </span>
                  </div>

                  {/* Raw JSON */}
                  <ScrollArea className="h-[400px] rounded-lg border bg-muted/20">
                    <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify(monthRawData, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}
            </>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
