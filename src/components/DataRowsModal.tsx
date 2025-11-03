import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, Download, RefreshCw, Search, Calendar, BarChart3, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";

interface DataRowsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string | null;
  reportName: string;
}

interface DataOverview {
  totalRows: number;
  dateRange: { start: string; end: string } | null;
  dimensionCount: number;
  lastSync: string | null;
}

interface MonthlyTab {
  key: string;          // "2025-11" or "all"
  label: string;        // "Nov 25" or "All Data"
  rowCount: number;     // 12847
  isActive: boolean;
  hasData: boolean;
  lastUpdated: string | null;
}

interface DimensionData {
  id: string;
  row_number: number;
  dimension_values: Record<string, any>;
  created_at: string;
}

export const DataRowsModal = ({ open, onOpenChange, reportId, reportName }: DataRowsModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [dataOverview, setDataOverview] = useState<DataOverview | null>(null);
  const [availableMonths, setAvailableMonths] = useState<MonthlyTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [currentData, setCurrentData] = useState<DimensionData[]>([]);
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const ROWS_PER_PAGE = 100;

  useEffect(() => {
    if (open && reportId) {
      loadDataOverview();
      loadAvailableMonths();
      loadDimensions();
    }
  }, [open, reportId]);

  useEffect(() => {
    if (reportId && activeTab) {
      loadTabData(activeTab);
    }
  }, [reportId, activeTab]);

  const loadDataOverview = async () => {
    if (!reportId) return;

    try {
      // Get total row count
      const { count: totalRows, error: countError } = await supabase
        .from('dimension_data')
        .select('id', { count: 'exact', head: true })
        .eq('report_id', reportId);

      if (countError) throw countError;

      // Get date range from dimension_data
      const { data: dateData, error: dateError } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true })
        .limit(1000); // Sample to find date range

      if (dateError) throw dateError;

      // Find date dimension and extract date range
      let dateRange = null;
      if (dateData && dateData.length > 0) {
        // Find the date dimension by looking for date-like values
        const sampleRow = dateData[0].dimension_values as Record<string, any>;
        const dateKeys = Object.keys(sampleRow).filter(key => {
          const value = sampleRow[key];
          return value && (
            value.includes('-') || 
            value.includes('/') || 
            !isNaN(Date.parse(value))
          );
        });

        if (dateKeys.length > 0) {
          const dates = dateData
            .map(row => {
              const values = row.dimension_values as Record<string, any>;
              return values[dateKeys[0]];
            })
            .filter(date => date && !isNaN(Date.parse(date)))
            .map(date => new Date(date))
            .sort((a, b) => a.getTime() - b.getTime());

          if (dates.length > 0) {
            dateRange = {
              start: dates[0].toISOString().split('T')[0],
              end: dates[dates.length - 1].toISOString().split('T')[0]
            };
          }
        }
      }

      // Get dimension count
      const { count: dimensionCount, error: dimCountError } = await supabase
        .from('dimensions')
        .select('id', { count: 'exact', head: true })
        .or(`report_id.eq.${reportId},report_id.is.null`);

      if (dimCountError) throw dimCountError;

      // Get last sync time
      const { data: syncData, error: syncError } = await supabase
        .from('data_sources')
        .select('updated_at')
        .eq('report_id', reportId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (syncError) throw syncError;

      setDataOverview({
        totalRows: totalRows || 0,
        dateRange,
        dimensionCount: dimensionCount || 0,
        lastSync: syncData?.updated_at || null
      });

    } catch (error) {
      console.error('Error loading data overview:', error);
      toast({
        title: "Error",
        description: "Failed to load data overview",
        variant: "destructive",
      });
    }
  };

  const loadAvailableMonths = async () => {
    if (!reportId) return;

    try {
      // Get all dimension_data to analyze monthly distribution
      const { data, error } = await supabase
        .from('dimension_data')
        .select('dimension_values, created_at')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true })
        .limit(5000); // Sample to identify months

      if (error) throw error;

      // Analyze data to find available months
      const monthCounts: Record<string, number> = {};
      const monthLastUpdated: Record<string, string> = {};

      if (data) {
        data.forEach(row => {
          const values = row.dimension_values as Record<string, any>;
          
          // Find date field
          const dateValue = Object.values(values).find(value => 
            value && typeof value === 'string' && !isNaN(Date.parse(value))
          );

          if (dateValue) {
            try {
              const date = new Date(dateValue);
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
              
              if (!monthLastUpdated[monthKey] || row.created_at > monthLastUpdated[monthKey]) {
                monthLastUpdated[monthKey] = row.created_at;
              }
            } catch (e) {
              // Skip invalid dates
            }
          }
        });
      }

      // Create month tabs
      const months: MonthlyTab[] = [
        {
          key: 'all',
          label: 'All Data',
          rowCount: dataOverview?.totalRows || 0,
          isActive: activeTab === 'all',
          hasData: (dataOverview?.totalRows || 0) > 0,
          lastUpdated: dataOverview?.lastSync || null
        }
      ];

      // Add monthly tabs
      Object.entries(monthCounts)
        .sort(([a], [b]) => b.localeCompare(a)) // Sort by date descending
        .forEach(([monthKey, count]) => {
          const [year, month] = monthKey.split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1);
          const label = format(date, 'MMM yy');
          
          months.push({
            key: monthKey,
            label,
            rowCount: count,
            isActive: activeTab === monthKey,
            hasData: count > 0,
            lastUpdated: monthLastUpdated[monthKey] || null
          });
        });

      setAvailableMonths(months);

    } catch (error) {
      console.error('Error loading available months:', error);
      // Fallback to just "All Data" tab
      setAvailableMonths([{
        key: 'all',
        label: 'All Data',
        rowCount: dataOverview?.totalRows || 0,
        isActive: true,
        hasData: (dataOverview?.totalRows || 0) > 0,
        lastUpdated: dataOverview?.lastSync || null
      }]);
    }
  };

  const loadDimensions = async () => {
    if (!reportId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load all dimensions for this report (same logic as other components)
      const { data: globalData } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global");

      const { data: customData } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .eq("scope", "custom")
        .or(`report_id.is.null,report_id.eq.${reportId}`);

      const allDimensions = [
        ...(globalData || []),
        ...(customData || [])
      ];

      // Deduplicate by name
      const seenNames = new Set<string>();
      const uniqueDimensions = allDimensions.filter(dim => {
        if (seenNames.has(dim.name)) return false;
        seenNames.add(dim.name);
        return true;
      });

      setDimensions(uniqueDimensions);
    } catch (error) {
      console.error('Error loading dimensions:', error);
    }
  };

  const loadTabData = async (tabKey: string) => {
    if (!reportId) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('dimension_data')
        .select('*')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true });

      // Apply month filter if not "all"
      if (tabKey !== 'all') {
        const [year, month] = tabKey.split('-');
        const startDate = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
        const endDate = endOfMonth(startDate);
        
        // This is a simplified filter - in production, we'd need to identify the date dimension
        // For now, we'll load all data and filter client-side
        console.log(`[DataRows] Loading data for ${tabKey} (${format(startDate, 'MMM yyyy')})`);
      }

      // Limit data for performance
      const { data, error } = await query.limit(tabKey === 'all' ? 1000 : 5000);

      if (error) throw error;

      // Filter by month client-side if needed
      let filteredData = data || [];
      if (tabKey !== 'all' && data) {
        const [year, month] = tabKey.split('-');
        filteredData = data.filter(row => {
          const values = row.dimension_values as Record<string, any>;
          const dateValue = Object.values(values).find(value => 
            value && typeof value === 'string' && !isNaN(Date.parse(value))
          );
          
          if (dateValue) {
            try {
              const date = new Date(dateValue);
              return date.getFullYear() === parseInt(year) && 
                     date.getMonth() === parseInt(month) - 1;
            } catch (e) {
              return false;
            }
          }
          return false;
        });
      }

      setCurrentData(filteredData);
      setCurrentPage(1); // Reset to first page when switching tabs

    } catch (error) {
      console.error('Error loading tab data:', error);
      toast({
        title: "Error",
        description: `Failed to load data for ${tabKey}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (!currentData.length || !dimensions.length) return;

    setIsExporting(true);
    try {
      // Create CSV content
      const headers = ['Row Number', 'Date', ...dimensions.map(d => d.name)];
      const csvContent = [
        headers.join(','),
        ...currentData.map(row => {
          const values = row.dimension_values as Record<string, any>;
          const rowData = [
            row.row_number,
            // Find date value
            Object.values(values).find(value => 
              value && typeof value === 'string' && !isNaN(Date.parse(value))
            ) || '',
            // Map dimension values
            ...dimensions.map(dim => {
              const value = values[dim.id] || '';
              // Escape commas and quotes for CSV
              return typeof value === 'string' && value.includes(',') 
                ? `"${value.replace(/"/g, '""')}"` 
                : value;
            })
          ];
          return rowData.join(',');
        })
      ].join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportName}-${activeTab}-data.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export complete",
        description: `Downloaded ${currentData.length} rows as CSV`,
      });

    } catch (error) {
      console.error('Error exporting data:', error);
      toast({
        title: "Export failed",
        description: "Failed to export data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formatLastSync = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const formatRowCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // Filter and paginate data
  const filteredData = currentData.filter(row => {
    if (!searchTerm) return true;
    const values = row.dimension_values as Record<string, any>;
    return Object.values(values).some(value => 
      value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalPages = Math.ceil(filteredData.length / ROWS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Data Rows - {reportName}
          </DialogTitle>
          <DialogDescription>
            View and analyze raw data organized by month for better performance
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col h-[calc(90vh-120px)]">
          {/* Data Overview */}
          {dataOverview && (
            <Card className="mb-4 bg-muted/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Data Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {formatRowCount(dataOverview.totalRows)}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Rows</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">
                      {dataOverview.dateRange 
                        ? `${format(parseISO(dataOverview.dateRange.start), 'MMM')} - ${format(parseISO(dataOverview.dateRange.end), 'MMM yy')}`
                        : 'No dates'
                      }
                    </div>
                    <div className="text-xs text-muted-foreground">Date Range</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{dataOverview.dimensionCount}</div>
                    <div className="text-xs text-muted-foreground">Dimensions</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{formatLastSync(dataOverview.lastSync)}</div>
                    <div className="text-xs text-muted-foreground">Last Sync</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="grid-cols-auto">
                {availableMonths.map((month) => (
                  <TabsTrigger 
                    key={month.key} 
                    value={month.key}
                    className="flex items-center gap-2"
                    disabled={!month.hasData}
                  >
                    {month.key === 'all' ? (
                      <>
                        <Calendar className="h-3 w-3" />
                        {month.label}
                      </>
                    ) : (
                      month.label
                    )}
                    <Badge variant={month.key === activeTab ? "default" : "outline"} className="text-xs">
                      {formatRowCount(month.rowCount)}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Search and Actions */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search data..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 w-64"
                  />
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExport}
                  disabled={!currentData.length || isExporting}
                  className="gap-2"
                >
                  {isExporting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export
                </Button>
              </div>
            </div>

            {/* Tab Content */}
            {availableMonths.map((month) => (
              <TabsContent key={month.key} value={month.key} className="flex-1 mt-0">
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {month.label} Data
                        {filteredData.length !== currentData.length && (
                          <span className="text-sm font-normal text-muted-foreground ml-2">
                            ({filteredData.length} of {currentData.length} rows)
                          </span>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatLastSync(month.lastUpdated)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 h-[calc(100%-80px)]">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Loading {month.label} data...
                        </div>
                      </div>
                    ) : paginatedData.length > 0 ? (
                      <div className="h-full flex flex-col">
                        <ScrollArea className="flex-1">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-20">Row #</TableHead>
                                {dimensions.slice(0, 8).map((dim) => (
                                  <TableHead key={dim.id} className="min-w-32">
                                    {dim.name}
                                  </TableHead>
                                ))}
                                {dimensions.length > 8 && (
                                  <TableHead>+{dimensions.length - 8} more...</TableHead>
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paginatedData.map((row) => {
                                const values = row.dimension_values as Record<string, any>;
                                return (
                                  <TableRow key={row.id}>
                                    <TableCell className="font-mono text-xs">
                                      {row.row_number}
                                    </TableCell>
                                    {dimensions.slice(0, 8).map((dim) => (
                                      <TableCell key={dim.id} className="max-w-48 truncate">
                                        {values[dim.id] || '-'}
                                      </TableCell>
                                    ))}
                                    {dimensions.length > 8 && (
                                      <TableCell className="text-muted-foreground">
                                        ...
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </ScrollArea>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between pt-4 border-t">
                            <div className="text-sm text-muted-foreground">
                              Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1} to {Math.min(currentPage * ROWS_PER_PAGE, filteredData.length)} of {filteredData.length} rows
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                              >
                                Previous
                              </Button>
                              <span className="text-sm">
                                Page {currentPage} of {totalPages}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-64 text-muted-foreground">
                        <div className="text-center">
                          <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No data available for {month.label}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
