import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, Download, RefreshCw, Search, Calendar, BarChart3, Clock, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

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

interface MonthlyDataSummary {
  monthKey: string;        // "2025-06"
  displayName: string;     // "Jun 2025"
  rowCount: number;        // 1800
  lastUpdate: string;      // "2025-11-03T05:39:18.092324+00:00"
  dateRange: { start: string; end: string }; // First and last date in month
}

interface DetailedData {
  id: string;
  row_number: number;
  dimension_values: Record<string, any>;
  created_at: string;
}

export const DataRowsModal = ({ open, onOpenChange, reportId, reportName }: DataRowsModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [dataOverview, setDataOverview] = useState<DataOverview | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyDataSummary[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [detailedData, setDetailedData] = useState<DetailedData[]>([]);
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const { toast } = useToast();

  const ROWS_PER_PAGE = 100;

  useEffect(() => {
    if (open && reportId) {
      loadDataOverview();
      loadMonthlyDataSummary();
      loadDimensions();
    }
  }, [open, reportId]);

  const loadDataOverview = async () => {
    if (!reportId) return;

    try {
      // Get total row count
      const { count: totalRows, error: countError } = await supabase
        .from('dimension_data')
        .select('id', { count: 'exact', head: true })
        .eq('report_id', reportId);

      if (countError) throw countError;

      // Get overall date range
      const { data: dateRangeData, error: dateError } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true })
        .limit(1);

      if (dateError) throw dateError;

      const { data: dateRangeDataEnd, error: dateErrorEnd } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .order('row_number', { ascending: false })
        .limit(1);

      if (dateErrorEnd) throw dateErrorEnd;

      let dateRange = null;
      if (dateRangeData && dateRangeData.length > 0 && dateRangeDataEnd && dateRangeDataEnd.length > 0) {
        // Find date dimension
        const startValues = dateRangeData[0].dimension_values as Record<string, any>;
        const endValues = dateRangeDataEnd[0].dimension_values as Record<string, any>;
        
        const dateKey = Object.keys(startValues).find(key => {
          const value = startValues[key];
          return value && typeof value === 'string' && !isNaN(Date.parse(value));
        });

        if (dateKey) {
          const startDate = startValues[dateKey];
          const endDate = endValues[dateKey];
          
          if (startDate && endDate) {
            dateRange = { start: startDate, end: endDate };
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

  const loadMonthlyDataSummary = async () => {
    if (!reportId) return;

    try {
      console.log('[DataRows] Loading monthly data summary...');
      
      // Get all data to analyze monthly distribution
      const { data, error } = await supabase
        .from('dimension_data')
        .select('dimension_values, created_at')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true });

      if (error) throw error;

      // Analyze data to create monthly summaries
      const monthlyStats: Record<string, {
        count: number;
        lastUpdate: string;
        firstDate: string;
        lastDate: string;
      }> = {};

      if (data) {
        data.forEach(row => {
          const values = row.dimension_values as Record<string, any>;
          
          // Find date field - look for the date dimension
          const dateValue = Object.values(values).find(value => 
            value && typeof value === 'string' && !isNaN(Date.parse(value))
          );

          if (dateValue) {
            try {
              const date = new Date(dateValue);
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              
              if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = {
                  count: 0,
                  lastUpdate: row.created_at,
                  firstDate: dateValue,
                  lastDate: dateValue
                };
              }
              
              monthlyStats[monthKey].count++;
              
              // Update last update time
              if (row.created_at > monthlyStats[monthKey].lastUpdate) {
                monthlyStats[monthKey].lastUpdate = row.created_at;
              }
              
              // Update date range for this month
              if (dateValue < monthlyStats[monthKey].firstDate) {
                monthlyStats[monthKey].firstDate = dateValue;
              }
              if (dateValue > monthlyStats[monthKey].lastDate) {
                monthlyStats[monthKey].lastDate = dateValue;
              }
              
            } catch (e) {
              console.warn('[DataRows] Invalid date value:', dateValue);
            }
          }
        });
      }

      // Convert to array and sort by date (most recent first)
      const monthlySummaries: MonthlyDataSummary[] = Object.entries(monthlyStats)
        .map(([monthKey, stats]) => {
          const [year, month] = monthKey.split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1);
          
          return {
            monthKey,
            displayName: format(date, 'MMM yyyy'),
            rowCount: stats.count,
            lastUpdate: stats.lastUpdate,
            dateRange: {
              start: stats.firstDate,
              end: stats.lastDate
            }
          };
        })
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey)); // Sort by date descending

      console.log('[DataRows] Monthly data summary loaded:', monthlySummaries.length, 'months');
      setMonthlyData(monthlySummaries);

    } catch (error) {
      console.error('Error loading monthly data summary:', error);
      toast({
        title: "Error",
        description: "Failed to load monthly data summary",
        variant: "destructive",
      });
    }
  };

  const loadDimensions = async () => {
    if (!reportId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load all dimensions for this report
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

  const loadMonthDetails = async (monthKey: string) => {
    if (!reportId) return;

    setIsLoadingDetails(true);
    setSelectedMonth(monthKey);
    
    try {
      console.log('[DataRows] Loading details for month:', monthKey);
      
      const [year, month] = monthKey.split('-');
      
      // Load data for this specific month
      const { data, error } = await supabase
        .from('dimension_data')
        .select('*')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true })
        .limit(5000); // Reasonable limit for month details

      if (error) throw error;

      // Filter by month
      const filteredData = (data || []).filter(row => {
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

      setDetailedData(filteredData);
      setCurrentPage(1);

    } catch (error) {
      console.error('Error loading month details:', error);
      toast({
        title: "Error",
        description: `Failed to load details for ${monthKey}`,
        variant: "destructive",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const formatRowCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toLocaleString();
  };

  const formatLastUpdate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MMM dd, yyyy');
    } catch (e) {
      return 'Unknown';
    }
  };

  // Filter and paginate detailed data
  const filteredDetailedData = detailedData.filter(row => {
    if (!searchTerm) return true;
    const values = row.dimension_values as Record<string, any>;
    return Object.values(values).some(value => 
      value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalPages = Math.ceil(filteredDetailedData.length / ROWS_PER_PAGE);
  const paginatedData = filteredDetailedData.slice(
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
                        ? `${format(parseISO(dataOverview.dateRange.start), 'MMM yyyy')} - ${format(parseISO(dataOverview.dateRange.end), 'MMM yyyy')}`
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
                    <div className="text-lg font-bold">
                      {dataOverview.lastSync ? formatLastUpdate(dataOverview.lastSync) : 'Never'}
                    </div>
                    <div className="text-xs text-muted-foreground">Last Sync</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Data Table */}
          {!selectedMonth ? (
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Monthly Data Organization
                </CardTitle>
                <CardDescription>
                  Data organized by month for efficient analysis and export
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Rows</TableHead>
                        <TableHead>Last Update</TableHead>
                        <TableHead>Date Range</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyData.length > 0 ? (
                        monthlyData.map((month) => (
                          <TableRow key={month.monthKey}>
                            <TableCell className="font-medium">
                              {month.displayName}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline">
                                {formatRowCount(month.rowCount)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatLastUpdate(month.lastUpdate)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(parseISO(month.dateRange.start), 'MMM d')} - {format(parseISO(month.dateRange.end), 'MMM d')}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => loadMonthDetails(month.monthKey)}
                                className="gap-1"
                              >
                                <Eye className="h-3 w-3" />
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            {isLoading ? (
                              <div className="flex items-center justify-center gap-2">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Loading monthly data...
                              </div>
                            ) : (
                              "No monthly data available"
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : (
            /* Detailed Month View */
            <Card className="flex-1">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {monthlyData.find(m => m.monthKey === selectedMonth)?.displayName || selectedMonth} Data
                    </CardTitle>
                    <CardDescription>
                      {formatRowCount(detailedData.length)} rows
                      {filteredDetailedData.length !== detailedData.length && (
                        <span> ({formatRowCount(filteredDetailedData.length)} filtered)</span>
                      )}
                    </CardDescription>
                  </div>
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
                      onClick={() => setSelectedMonth(null)}
                    >
                      Back to Overview
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingDetails ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Loading month details...
                    </div>
                  </div>
                ) : (
                  <div className="h-[400px] flex flex-col">
                    <ScrollArea className="flex-1">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20">Row #</TableHead>
                            {dimensions.slice(0, 6).map((dim) => (
                              <TableHead key={dim.id} className="min-w-32">
                                {dim.name}
                              </TableHead>
                            ))}
                            {dimensions.length > 6 && (
                              <TableHead>+{dimensions.length - 6} more...</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.length > 0 ? (
                            paginatedData.map((row) => {
                              const values = row.dimension_values as Record<string, any>;
                              return (
                                <TableRow key={row.id}>
                                  <TableCell className="font-mono text-xs">
                                    {row.row_number}
                                  </TableCell>
                                  {dimensions.slice(0, 6).map((dim) => (
                                    <TableCell key={dim.id} className="max-w-48 truncate">
                                      {values[dim.id] || '-'}
                                    </TableCell>
                                  ))}
                                  {dimensions.length > 6 && (
                                    <TableCell className="text-muted-foreground">
                                      ...
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={dimensions.length + 1} className="text-center py-8 text-muted-foreground">
                                No data found for this month
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="text-sm text-muted-foreground">
                          Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1} to {Math.min(currentPage * ROWS_PER_PAGE, filteredDetailedData.length)} of {filteredDetailedData.length} rows
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
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
