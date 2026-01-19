import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Loader2, ChevronRight, Search } from "lucide-react";
import { useEffect, useState, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { useUser } from "@/lib/auth";
import { MONTH_NAMES } from "@/constants/slideViewConstants";
import { isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface BookingTabProps {
  accountId: string | undefined;
}

interface BookingDataRow {
  [key: string]: any;
}

export function BookingTab({ accountId }: BookingTabProps) {
  const { data: userData } = useUser();
  const [allBookingData, setAllBookingData] = useState<BookingDataRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Set default to current year and month
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = MONTH_NAMES[currentDate.getMonth()];
  
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [selectedHotels, setSelectedHotels] = useState<string[]>([]); // Empty array = all hotels
  const [hotelOptions, setHotelOptions] = useState<string[]>([]);
  const [hotelFilterOpen, setHotelFilterOpen] = useState(false);
  const [pendingHotels, setPendingHotels] = useState<string[]>([]);
  const [hotelSearchTerm, setHotelSearchTerm] = useState('');
  const [dimensionNameToIdMap, setDimensionNameToIdMap] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [bookingStatuses, setBookingStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadBookingData = async () => {
      if (!accountId || !userData?.user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Find the Booking report for this account
        const { data: bookingReport, error: reportError } = await supabase
          .from('reports')
          .select('id')
          .eq('account_id', accountId)
          .eq('name', 'Booking')
          .maybeSingle();

        if (reportError) throw reportError;

        if (!bookingReport) {
          setError("No Booking report found. Please create a Booking report first.");
          setIsLoading(false);
          return;
        }

        // Get data sources for the Booking report
        const { data: dataSources, error: dsError } = await supabase
          .from('data_sources')
          .select('*')
          .eq('report_id', bookingReport.id)
          .order('created_at', { ascending: false });

        if (dsError) throw dsError;

        if (!dataSources || dataSources.length === 0) {
          setError("No data sources found for the Booking report. Please add a data source first.");
          setIsLoading(false);
          return;
        }

        // Load data from all data sources and build dimension name mapping
        const allRows: BookingDataRow[] = [];
        const dimensionIdSet = new Set<string>();
        const dimensionIdToNameMap: Record<string, string> = {};

        // First pass: collect all dimension IDs from transformed rows and column mappings
        for (const dataSource of dataSources) {
          try {
            const result = await fetchSourceData(
              dataSource as any,
              userData.user.id,
              accountId
            );

            if (result.transformedRows && result.transformedRows.length > 0) {
              // Extract dimension IDs from dimension_values in each row
              result.transformedRows.forEach((row: any) => {
                if (row.dimension_values) {
                  Object.keys(row.dimension_values).forEach(dimId => {
                    dimensionIdSet.add(dimId);
                  });
                }
              });
              
              allRows.push(...result.transformedRows);
            }

            // Also check column mappings for dimension names
            const columnMappings = (dataSource.column_mappings || []) as any[];
            columnMappings.forEach((mapping: any) => {
              if (mapping.dimensionId && mapping.dimensionId !== 'none' && mapping.dimensionId !== 'create_new') {
                dimensionIdSet.add(mapping.dimensionId);
                // If dimensionName is available in mapping, use it
                if (mapping.dimensionName) {
                  dimensionIdToNameMap[mapping.dimensionId] = mapping.dimensionName;
                }
              }
            });
          } catch (err) {
            console.error(`Error loading data from source ${dataSource.name}:`, err);
            // Continue with other sources even if one fails
          }
        }

        // Fetch dimension names from database for IDs not found in mappings
        const dimensionIdsToFetch = Array.from(dimensionIdSet).filter(
          id => !dimensionIdToNameMap[id]
        );

        if (dimensionIdsToFetch.length > 0) {
          const { data: dimensions, error: dimError } = await supabase
            .from('dimensions')
            .select('id, name')
            .in('id', dimensionIdsToFetch);

          if (!dimError && dimensions) {
            dimensions.forEach((dim: any) => {
              dimensionIdToNameMap[dim.id] = dim.name;
            });
          }
        }

        // Build column list from dimension names with Hotel first, then Booking Number
        const allColumnNames = Array.from(dimensionIdSet)
          .map(dimId => dimensionIdToNameMap[dimId] || dimId)
          .filter(colName => !colName.toLowerCase().includes('channel')); // Hide Channel column
        
        // Sort columns: Hotel first, then Booking Number, then rest alphabetically
        const columnNames = allColumnNames.sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          
          // Hotel comes first
          if (aLower === 'hotel') return -1;
          if (bLower === 'hotel') return 1;
          
          // Booking Number comes second (check for variations like "Booking Number", "Booking #", "Booking ID", etc.)
          const aIsBooking = aLower.includes('booking') && (aLower.includes('number') || aLower.includes('#') || aLower.includes('id') || aLower.includes('no'));
          const bIsBooking = bLower.includes('booking') && (bLower.includes('number') || bLower.includes('#') || bLower.includes('id') || bLower.includes('no'));
          if (aIsBooking && !bIsBooking) return -1;
          if (!aIsBooking && bIsBooking) return 1;
          
          // Rest sorted alphabetically
          return a.localeCompare(b);
        });

        // Transform rows to use dimension names as keys instead of IDs
        const transformedRows = allRows.map((row: any) => {
          const transformedRow: BookingDataRow = {};
          if (row.dimension_values) {
            Object.entries(row.dimension_values).forEach(([dimId, value]) => {
              const dimName = dimensionIdToNameMap[dimId] || dimId;
              transformedRow[dimName] = value;
            });
          }
          return transformedRow;
        });

        // Build reverse mapping (name to ID) for filtering
        const nameToIdMap: Record<string, string> = {};
        Object.entries(dimensionIdToNameMap).forEach(([id, name]) => {
          nameToIdMap[name] = id;
        });
        setDimensionNameToIdMap(nameToIdMap);

        // Extract hotel options for filter
        const hotelDimensionId = nameToIdMap['Hotel'] || Object.entries(dimensionIdToNameMap).find(([_, name]) => name.toLowerCase() === 'hotel')?.[0];
        if (hotelDimensionId) {
          const hotels = new Set<string>();
          transformedRows.forEach(row => {
            const hotelValue = row['Hotel'];
            if (hotelValue !== undefined && hotelValue !== null && String(hotelValue).trim() !== '') {
              hotels.add(String(hotelValue).trim());
            }
          });
          setHotelOptions(Array.from(hotels).sort());
        }

        setColumns(columnNames);
        setAllBookingData(transformedRows);
      } catch (err) {
        console.error("Error loading booking data:", err);
        setError(err instanceof Error ? err.message : "Failed to load booking data");
      } finally {
        setIsLoading(false);
      }
    };

    loadBookingData();
  }, [accountId, userData?.user]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedYear, selectedMonth, selectedHotels]);

  // Initialize pending hotels when popover opens
  useEffect(() => {
    if (hotelFilterOpen) {
      const isFilterSet = selectedHotels.length > 0;
      setPendingHotels(isFilterSet ? [...selectedHotels] : [...hotelOptions]);
    }
  }, [hotelFilterOpen, selectedHotels, hotelOptions]);

  // Check if all hotels are selected
  const isAllHotelsSelected = useMemo(() => {
    if (selectedHotels.length === 0) return true; // No filter = all selected
    return selectedHotels.length === hotelOptions.length;
  }, [selectedHotels, hotelOptions]);

  // Get display text for selected hotels
  const hotelDisplayText = useMemo(() => {
    if (isAllHotelsSelected) return 'All';
    if (selectedHotels.length === 0) return '0 selected';
    if (selectedHotels.length === 1) return selectedHotels[0];
    return `${selectedHotels.length} selected`;
  }, [selectedHotels, isAllHotelsSelected]);

  // Filter hotels by search term
  const filteredHotels = useMemo(() => {
    if (!hotelSearchTerm) return hotelOptions;
    return hotelOptions.filter(hotel => 
      hotel.toLowerCase().includes(hotelSearchTerm.toLowerCase())
    );
  }, [hotelOptions, hotelSearchTerm]);

  const handleApplyHotelFilter = () => {
    setSelectedHotels(pendingHotels.length === hotelOptions.length ? [] : pendingHotels);
    setHotelFilterOpen(false);
    setHotelSearchTerm('');
  };

  // Helper function to find checkout date column
  const getCheckoutDateColumn = useMemo(() => {
    return columns.find(col => {
      const colLower = col.toLowerCase();
      return colLower.includes('checkout');
    });
  }, [columns]);

  // Helper function to find booking number column
  const getBookingNumberColumn = useMemo(() => {
    return columns.find(col => {
      const colLower = col.toLowerCase();
      return colLower.includes('booking') && (colLower.includes('number') || colLower.includes('#') || colLower.includes('id') || colLower.includes('no'));
    });
  }, [columns]);

  // Generate key from individual fields (used for loading statuses from DB)
  const getBookingKeyFromFields = (hotel: string, bookingNumber: string, checkoutDate: string | Date): string => {
    let checkoutDateStr = '';
    if (checkoutDate) {
      try {
        const date = checkoutDate instanceof Date ? checkoutDate : new Date(checkoutDate);
        if (!isNaN(date.getTime())) {
          checkoutDateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      } catch {
        // Invalid date, use empty string
      }
    }
    return `${String(hotel).trim()}|||${String(bookingNumber).trim()}|||${checkoutDateStr}`;
  };

  // Generate unique key for a booking row
  const getBookingKey = (row: BookingDataRow): string => {
    const hotel = String(row['Hotel'] || '').trim();
    const bookingNumber = getBookingNumberColumn 
      ? String(row[getBookingNumberColumn] || '').trim()
      : '';
    const checkoutDate = getCheckoutDateColumn
      ? row[getCheckoutDateColumn]
      : null;
    
    let checkoutDateStr = '';
    if (checkoutDate) {
      try {
        const date = new Date(checkoutDate);
        if (!isNaN(date.getTime())) {
          checkoutDateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      } catch {
        // Invalid date, use empty string
      }
    }
    
    return `${hotel}|||${bookingNumber}|||${checkoutDateStr}`;
  };

  // Load booking statuses from database
  useEffect(() => {
    const loadBookingStatuses = async () => {
      if (!accountId) return;

      try {
        const { data, error } = await supabase
          .from('booking_statuses')
          .select('hotel, booking_number, checkout_date, status')
          .eq('account_id', accountId);

        if (error) {
          // If table doesn't exist yet (migration not run), just log and continue
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn("Booking statuses table not found. Migration may need to be run.");
            return;
          }
          throw error;
        }

        if (data) {
          const statusMap: Record<string, string> = {};
          data.forEach((status) => {
            const key = getBookingKeyFromFields(
              status.hotel,
              status.booking_number,
              status.checkout_date
            );
            statusMap[key] = status.status || '';
          });
          setBookingStatuses(statusMap);
        }
      } catch (err) {
        console.error("Error loading booking statuses:", err);
        // Don't block the component from rendering if status loading fails
      }
    };

    loadBookingStatuses();
  }, [accountId]);

  // Get initial status based on checkout date
  const getInitialStatus = (row: BookingDataRow): string => {
    const checkoutDate = getCheckoutDateColumn ? row[getCheckoutDateColumn] : null;
    if (!checkoutDate) return '';

    try {
      const date = new Date(checkoutDate);
      if (isNaN(date.getTime())) return '';

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      date.setHours(0, 0, 0, 0);

      // If checkout date is past today, default to "Confirmed"
      if (date <= today) {
        return 'Confirmed';
      }
      // Future bookings default to empty
      return '';
    } catch {
      return '';
    }
  };

  // Get status for a row (from DB or computed initial)
  const getStatusForRow = (row: BookingDataRow): string => {
    const key = getBookingKey(row);
    if (key in bookingStatuses) {
      const status = bookingStatuses[key];
      return status || 'none'; // Return 'none' instead of empty string for Select component
    }
    const initialStatus = getInitialStatus(row);
    return initialStatus || 'none'; // Return 'none' instead of empty string for Select component
  };

  // Handle status change
  const handleStatusChange = async (row: BookingDataRow, newStatus: string) => {
    if (!accountId) return;

    const hotel = String(row['Hotel'] || '').trim();
    const bookingNumber = getBookingNumberColumn 
      ? String(row[getBookingNumberColumn] || '').trim()
      : '';
    const checkoutDate = getCheckoutDateColumn
      ? row[getCheckoutDateColumn]
      : null;

    if (!hotel || !bookingNumber || !checkoutDate) {
      toast({
        title: "Error",
        description: "Missing required fields (Hotel, Booking Number, or Checkout Date)",
        variant: "destructive",
      });
      return;
    }

    let checkoutDateObj: Date;
    try {
      checkoutDateObj = new Date(checkoutDate);
      if (isNaN(checkoutDateObj.getTime())) {
        throw new Error("Invalid checkout date");
      }
    } catch {
      toast({
        title: "Error",
        description: "Invalid checkout date format",
        variant: "destructive",
      });
      return;
    }

    const checkoutDateStr = checkoutDateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
    const key = getBookingKey(row);

    try {
      // Upsert status to database
      const { error } = await supabase
        .from('booking_statuses')
        .upsert({
          account_id: accountId,
          hotel,
          booking_number: bookingNumber,
          checkout_date: checkoutDateStr,
          status: newStatus || '',
        }, {
          onConflict: 'account_id,hotel,booking_number,checkout_date'
        });

      if (error) {
        // If table doesn't exist yet, show helpful message
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          toast({
            title: "Database migration required",
            description: "Please run the booking_statuses migration to enable status tracking.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      // Update local state
      setBookingStatuses(prev => ({
        ...prev,
        [key]: newStatus || '',
      }));

      toast({
        title: "Status updated",
        description: "Booking status has been saved",
      });
    } catch (err) {
      console.error("Error saving booking status:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save booking status",
        variant: "destructive",
      });
    }
  };

  // Apply filters to booking data
  const filteredBookingData = useMemo(() => {
    let filtered = [...allBookingData];

    // Filter by Hotels (multi-select)
    if (selectedHotels.length > 0) {
      filtered = filtered.filter(row => {
        const hotelValue = row['Hotel'];
        if (hotelValue === undefined || hotelValue === null) return false;
        return selectedHotels.includes(String(hotelValue).trim());
      });
    }

    // Filter by Checkout Date (Year/Month) - always filter by selected year and month
    const checkoutDateColumn = getCheckoutDateColumn;
    
    if (checkoutDateColumn && selectedYear && selectedMonth) {
      const monthNum = MONTH_NAMES.indexOf(selectedMonth);
      const yearNum = parseInt(selectedYear);
      const dateRange = {
        start: new Date(yearNum, monthNum, 1),
        end: new Date(yearNum, monthNum + 1, 0, 23, 59, 59),
      };

      filtered = filtered.filter(row => {
        const dateValue = row[checkoutDateColumn];
        if (!dateValue) return false;
        
        try {
          const rowDate = new Date(dateValue);
          if (isNaN(rowDate.getTime())) return false;
          return isWithinInterval(rowDate, dateRange);
        } catch {
          return false;
        }
      });
    }

    return filtered;
  }, [allBookingData, selectedYear, selectedMonth, selectedHotels, columns, getCheckoutDateColumn]);

  // Paginate filtered data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredBookingData.slice(startIndex, endIndex);
  }, [filteredBookingData, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredBookingData.length / itemsPerPage);

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      // Format numbers with commas
      return value.toLocaleString();
    }
    if (typeof value === 'string' && value.includes('T') && value.includes('Z')) {
      // Try to format as date
      try {
        const date = new Date(value);
        return date.toLocaleDateString();
      } catch {
        return value;
      }
    }
    return String(value);
  };

  // Get available years from checkout date data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const checkoutDateColumn = getCheckoutDateColumn;

    // Always include current year to ensure it's always available
    years.add(currentYear);

    if (checkoutDateColumn && allBookingData.length > 0) {
      allBookingData.forEach(row => {
        const dateValue = row[checkoutDateColumn];
        if (dateValue) {
          try {
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
              years.add(date.getFullYear());
            }
          } catch {
            // Ignore invalid dates
          }
        }
      });
    }

    const yearsArray = Array.from(years).sort((a, b) => b - a); // Descending order
    
    // If no years found in data, at least return current year
    return yearsArray.length > 0 ? yearsArray : [currentYear];
  }, [allBookingData, getCheckoutDateColumn, currentYear]);

  // Ensure selectedYear is valid when availableYears changes
  useEffect(() => {
    if (availableYears.length > 0) {
      const selectedYearNum = parseInt(selectedYear);
      if (!availableYears.includes(selectedYearNum)) {
        // If selected year is not available, set to the first available year (most recent)
        setSelectedYear(availableYears[0].toString());
      }
    }
  }, [availableYears, selectedYear]);

  return (
    <TabsContent value="booking" className="space-y-6">
      {/* Filters */}
      <div className="flex items-end justify-end gap-4">
        {/* Year Filter */}
        {availableYears.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year:</span>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[130px] bg-background">
                <SelectValue placeholder={selectedYear || currentYear.toString()} />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Month Filter */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Month:</span>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[130px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map(month => (
                <SelectItem key={month} value={month}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Hotel Filter - Multi-select with search */}
        {hotelOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hotel:</span>
            <Popover open={hotelFilterOpen} onOpenChange={(isOpen) => {
              setHotelFilterOpen(isOpen);
              if (!isOpen) {
                setHotelSearchTerm('');
              }
            }}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 justify-between min-w-[140px] px-4 pt-[20px] pb-[18px]">
                  <span className="truncate">{hotelDisplayText}</span>
                  <ChevronRight className="h-4 w-4 opacity-50 rotate-90 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[250px] p-0 bg-popover z-50" align="start">
                <div className="p-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Filter</Label>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setPendingHotels([...hotelOptions]);
                        }}
                      >
                        All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setPendingHotels([]);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="mb-2 border-b pb-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Type to search"
                        value={hotelSearchTerm}
                        onChange={(e) => setHotelSearchTerm(e.target.value)}
                        className="pl-8 h-8"
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-1 p-1">
                      {filteredHotels.map(hotel => {
                        const isSelected = pendingHotels.includes(hotel);
                        return (
                          <div
                            key={hotel}
                            className="group flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent text-sm relative"
                            onClick={() => {
                              const newHotels = isSelected
                                ? pendingHotels.filter(h => h !== hotel)
                                : [...pendingHotels, hotel];
                              setPendingHotels(newHotels);
                            }}
                          >
                            <Checkbox 
                              checked={isSelected} 
                              onCheckedChange={() => {}}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="truncate flex-1">{hotel}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingHotels([hotel]);
                              }}
                            >
                              ONLY
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  <div className="border-t p-2">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleApplyHotelFilter}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Booking Data ({filteredBookingData.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-muted-foreground">Loading booking data...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-destructive">{error}</p>
            </div>
          ) : filteredBookingData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No booking data available for the selected filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((column) => (
                        <TableHead key={column} className="whitespace-nowrap">
                          {column}
                        </TableHead>
                      ))}
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((row, index) => {
                      try {
                        const currentStatus = getStatusForRow(row);
                        return (
                          <TableRow key={index}>
                            {columns.map((column) => (
                              <TableCell key={column} className="whitespace-nowrap">
                                {formatValue(row[column])}
                              </TableCell>
                            ))}
                            <TableCell className="whitespace-nowrap">
                              <Select
                                value={currentStatus || "none"}
                                onValueChange={(value) => handleStatusChange(row, value === "none" ? "" : value)}
                              >
                                <SelectTrigger className="w-[140px] h-8 text-sm">
                                  <SelectValue placeholder="-" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">-</SelectItem>
                                  <SelectItem value="Confirmed">Confirmed</SelectItem>
                                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      } catch (err) {
                        console.error("Error rendering booking row:", err);
                        // Fallback: render row without status column if there's an error
                        return (
                          <TableRow key={index}>
                            {columns.map((column) => (
                              <TableCell key={column} className="whitespace-nowrap">
                                {formatValue(row[column])}
                              </TableCell>
                            ))}
                            <TableCell className="whitespace-nowrap">-</TableCell>
                          </TableRow>
                        );
                      }
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, filteredBookingData.length)} of{" "}
                    {filteredBookingData.length} rows
                  </div>
                  <div className="flex items-center gap-4">
                    <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                          className={cn(
                            currentPage === 1 && "pointer-events-none opacity-50",
                            "cursor-pointer"
                          )}
                        />
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          // Show first page, last page, current page, and pages around current
                          return (
                            page === 1 ||
                            page === totalPages ||
                            Math.abs(page - currentPage) <= 1
                          );
                        })
                        .map((page, index, array) => {
                          // Add ellipsis if there's a gap
                          const prevPage = array[index - 1];
                          const showEllipsis = prevPage && page - prevPage > 1;
                          
                          return (
                            <Fragment key={page}>
                              {showEllipsis && (
                                <PaginationItem key={`ellipsis-${page}`}>
                                  <PaginationEllipsis />
                                </PaginationItem>
                              )}
                              <PaginationItem>
                                <PaginationLink
                                  onClick={() => setCurrentPage(page)}
                                  isActive={currentPage === page}
                                  className="cursor-pointer"
                                >
                                  {page}
                                </PaginationLink>
                              </PaginationItem>
                            </Fragment>
                          );
                        })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                          }
                          className={cn(
                            currentPage === totalPages && "pointer-events-none opacity-50",
                            "cursor-pointer"
                          )}
                        />
                      </PaginationItem>
                    </PaginationContent>
                    </Pagination>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page:</span>
                    <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                      setItemsPerPage(parseInt(value));
                      setCurrentPage(1); // Reset to first page when changing items per page
                    }}>
                      <SelectTrigger className="w-[80px] h-8 text-sm">
                        <SelectValue />
                       </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}