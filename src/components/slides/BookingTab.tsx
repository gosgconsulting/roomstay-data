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
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { MONTH_NAMES } from "@/constants/slideViewConstants";
import { isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { getOrCreateStatusDimension, findDimensionDataRow, updateBookingStatus } from "@/lib/bookingStatus";

interface BookingTabProps {
  accountId: string | undefined;
  selectedHotels?: string[];
  onHotelsChange?: (hotels: string[]) => void;
}

interface BookingDataRow {
  [key: string]: any;
}

export function BookingTab({ accountId, selectedHotels: externalSelectedHotels, onHotelsChange }: BookingTabProps) {
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
  // Internal state if not controlled externally
  const [internalSelectedHotels, setInternalSelectedHotels] = useState<string[]>([]); // Empty array = all hotels
  
  // Use external state if provided, otherwise use internal
  const selectedHotels = externalSelectedHotels !== undefined ? externalSelectedHotels : internalSelectedHotels;
  const setSelectedHotels = onHotelsChange || setInternalSelectedHotels;
  const [hotelOptions, setHotelOptions] = useState<string[]>([]);
  const [hotelFilterOpen, setHotelFilterOpen] = useState(false);
  const [pendingHotels, setPendingHotels] = useState<string[]>([]);
  const [hotelSearchTerm, setHotelSearchTerm] = useState('');
  const [dimensionNameToIdMap, setDimensionNameToIdMap] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [statusDimensionId, setStatusDimensionId] = useState<string | null>(null);
  const [bookingReportId, setBookingReportId] = useState<string | null>(null);
  const [availableYearsState, setAvailableYearsState] = useState<number[]>([currentYear]);

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

        setBookingReportId(bookingReport.id);

        // Load or create Status dimension first
        let statusDimId: string | null = null;
        if (bookingReport.id && userData.user.id) {
          try {
            statusDimId = await getOrCreateStatusDimension(
              bookingReport.id,
              userData.user.id,
              accountId
            );
            setStatusDimensionId(statusDimId);
          } catch (err) {
            console.error("Error loading Status dimension:", err);
          }
        }

        // Fetch dimension_data directly - this is the canonical source with all updates including status
        const allDimensionDataRows: any[] = [];
        const batchSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('dimension_data')
            .select('id, dimension_values, row_number, data_source_id')
            .eq('report_id', bookingReport.id)
            .order('row_number', { ascending: true })
            .range(offset, offset + batchSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allDimensionDataRows.push(...data);
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }

        if (allDimensionDataRows.length === 0) {
          setError("No booking data found. Please sync your data sources first.");
          setIsLoading(false);
          return;
        }

        // Collect all dimension IDs from dimension_data rows
        const dimensionIdSet = new Set<string>();
        allDimensionDataRows.forEach((row: any) => {
          if (row.dimension_values) {
            Object.keys(row.dimension_values).forEach(dimId => {
              dimensionIdSet.add(dimId);
            });
          }
        });

        // Add Status dimension if it exists
        if (statusDimId) {
          dimensionIdSet.add(statusDimId);
        }

        // Fetch all dimension names from database
        const dimensionIdsToFetch = Array.from(dimensionIdSet);
        const dimensionIdToNameMap: Record<string, string> = {};

        if (dimensionIdsToFetch.length > 0) {
          const { data: dimensions, error: dimError } = await supabase
            .from('dimensions')
            .select('id, name')
            .in('id', dimensionIdsToFetch);

          if (dimError) throw dimError;

          if (dimensions) {
            dimensions.forEach((dim: any) => {
              dimensionIdToNameMap[dim.id] = dim.name;
            });
          }

          // Ensure Status dimension is in the map
          if (statusDimId && !dimensionIdToNameMap[statusDimId]) {
            dimensionIdToNameMap[statusDimId] = 'Status';
          }
        }

        // Transform dimension_data rows to use dimension names as keys instead of IDs
        const transformedRows = allDimensionDataRows.map((ddRow: any) => {
          const transformedRow: BookingDataRow & { _originalRow?: any; _dimensionDataId?: string } = {};
          const dimensionValues = ddRow.dimension_values as Record<string, any> || {};
          
          // Transform dimension IDs to dimension names
          Object.entries(dimensionValues).forEach(([dimId, value]) => {
            const dimName = dimensionIdToNameMap[dimId] || dimId;
            transformedRow[dimName] = value;
          });
          
          // Store original row data and dimension_data ID for status updates
          transformedRow._originalRow = {
            dimension_values: dimensionValues,
            row_number: ddRow.row_number,
            data_source_id: ddRow.data_source_id,
          };
          transformedRow._dimensionDataId = ddRow.id;
          
          return transformedRow;
        });

        // Build column list from dimension names with Hotel first, then Booking Number
        // Exclude Status and Channel columns (Status is shown separately, Channel is hidden)
        const allColumnNames = Array.from(dimensionIdSet)
          .map(dimId => dimensionIdToNameMap[dimId] || dimId)
          .filter(colName => {
            const colLower = colName.toLowerCase();
            return !colLower.includes('channel') && colLower !== 'status';
          });
        
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

        // Extract available years from checkout date column
        // Try multiple ways to find checkout date column
        const checkoutDateColumnName = columnNames.find(col => {
          const colLower = col.toLowerCase();
          return colLower.includes('checkout') || colLower.includes('check-out') || colLower.includes('departure');
        });
        
        // Also find checkout date dimension ID for direct lookup
        const checkoutDateDimensionId = Object.entries(dimensionIdToNameMap).find(([_, name]) => {
          const nameLower = name?.toLowerCase() || '';
          return nameLower.includes('checkout') || nameLower.includes('check-out') || nameLower.includes('departure');
        })?.[0];
        
        console.log('[BookingTab] Extracting years:', {
          checkoutDateColumnName,
          checkoutDateDimensionId,
          totalRows: transformedRows.length,
          columnNames,
        });
        
        const years = new Set<number>();
        years.add(currentYear); // Always include current year
        
        // Extract years from transformed rows using column name
        if (checkoutDateColumnName) {
          transformedRows.forEach((row, index) => {
            const dateValue = row[checkoutDateColumnName];
            if (dateValue !== null && dateValue !== undefined && dateValue !== '') {
              try {
                // Try parsing as Date object or string
                let date: Date;
                if (dateValue instanceof Date) {
                  date = dateValue;
                } else if (typeof dateValue === 'string') {
                  // Try ISO format first, then other formats
                  if (dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
                    date = new Date(dateValue);
                  } else {
                    date = new Date(dateValue);
                  }
                } else {
                  date = new Date(dateValue);
                }
                
                if (!isNaN(date.getTime())) {
                  const year = date.getFullYear();
                  years.add(year);
                  if (index < 5) {
                    console.log(`[BookingTab] Row ${index}: Found year ${year} from column ${checkoutDateColumnName}:`, dateValue, '->', date);
                  }
                } else {
                  if (index < 5) {
                    console.warn(`[BookingTab] Row ${index}: Invalid date from column:`, dateValue);
                  }
                }
              } catch (err) {
                if (index < 5) {
                  console.warn(`[BookingTab] Row ${index}: Failed to parse date:`, dateValue, err);
                }
              }
            }
          });
        }
        
        // Also try extracting from dimension_values directly (fallback and primary method)
        if (checkoutDateDimensionId) {
          transformedRows.forEach((row, index) => {
            const originalRow = (row as any)._originalRow;
            if (originalRow?.dimension_values) {
              const dateValue = originalRow.dimension_values[checkoutDateDimensionId];
              if (dateValue !== null && dateValue !== undefined && dateValue !== '') {
                try {
                  let date: Date;
                  if (dateValue instanceof Date) {
                    date = dateValue;
                  } else if (typeof dateValue === 'string') {
                    if (dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
                      date = new Date(dateValue);
                    } else {
                      date = new Date(dateValue);
                    }
                  } else {
                    date = new Date(dateValue);
                  }
                  
                  if (!isNaN(date.getTime())) {
                    const year = date.getFullYear();
                    years.add(year);
                    if (index < 5) {
                      console.log(`[BookingTab] Row ${index}: Found year ${year} from dimension_values:`, dateValue, '->', date);
                    }
                  }
                } catch (err) {
                  if (index < 5) {
                    console.warn(`[BookingTab] Row ${index}: Failed to parse date from dimension_values:`, dateValue, err);
                  }
                }
              }
            }
          });
        }
        
        // If still no years found, try all date-like columns
        if (years.size <= 1) {
          console.log('[BookingTab] Trying to find years from all date-like columns');
          columnNames.forEach(colName => {
            const colLower = colName.toLowerCase();
            if (colLower.includes('date') || colLower.includes('checkout') || colLower.includes('departure')) {
              transformedRows.slice(0, 10).forEach((row, index) => {
                const dateValue = row[colName];
                if (dateValue) {
                  try {
                    const date = new Date(dateValue);
                    if (!isNaN(date.getTime())) {
                      const year = date.getFullYear();
                      years.add(year);
                      console.log(`[BookingTab] Row ${index}: Found year ${year} from column ${colName}:`, dateValue);
                    }
                  } catch {
                    // Ignore
                  }
                }
              });
            }
          });
        }
        
        const yearsArray = Array.from(years).sort((a, b) => b - a); // Descending order
        console.log('[BookingTab] Extracted years:', yearsArray);
        setAvailableYearsState(yearsArray.length > 0 ? yearsArray : [currentYear]);

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
    const newHotels = pendingHotels.length === hotelOptions.length ? [] : pendingHotels;
    setSelectedHotels(newHotels);
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

  // Get status for a row (from dimension_values or computed initial)
  const getStatusForRow = (row: BookingDataRow, originalRow?: any): string => {
    // First, try to get status from the transformed row's Status field (set during loading)
    if (row['Status'] !== null && row['Status'] !== undefined && row['Status'] !== '') {
      return row['Status'];
    }

    // Second, try to get status from dimension_values if we have the original row data
    if (originalRow?.dimension_values && statusDimensionId) {
      const status = originalRow.dimension_values[statusDimensionId];
      if (status !== null && status !== undefined && status !== '') {
        return status;
      }
    }

    // Fallback to computed initial status based on checkout date
    const initialStatus = getInitialStatus(row);
    return initialStatus || 'none'; // Return 'none' instead of empty string for Select component
  };

  // Handle status change
  const handleStatusChange = async (row: BookingDataRow, newStatus: string) => {
    if (!accountId || !bookingReportId || !userData?.user) {
      toast({
        title: "Error",
        description: "Missing required context (account, report, or user)",
        variant: "destructive",
      });
      return;
    }

    // Get dimension_data row ID from the row if available
    const dimensionDataRowId = (row as any)._dimensionDataId;
    const originalRow = (row as any)._originalRow;

    // Get dimension IDs for hotel, booking number, and checkout date
    // Try multiple variations of names
    const hotelDimensionId = dimensionNameToIdMap['Hotel'] || 
      dimensionNameToIdMap['hotel'] ||
      Object.entries(dimensionNameToIdMap).find(([name]) => name.toLowerCase() === 'hotel')?.[1];
    
    const bookingNumberDimensionId = getBookingNumberColumn 
      ? dimensionNameToIdMap[getBookingNumberColumn] ||
        Object.entries(dimensionNameToIdMap).find(([name]) => {
          const nameLower = name.toLowerCase();
          return nameLower.includes('booking') && 
            (nameLower.includes('number') || nameLower.includes('#') || 
             nameLower.includes('id') || nameLower.includes('no'));
        })?.[1]
      : Object.entries(dimensionNameToIdMap).find(([name]) => {
          const nameLower = name.toLowerCase();
          return nameLower.includes('booking') && 
            (nameLower.includes('number') || nameLower.includes('#') || 
             nameLower.includes('id') || nameLower.includes('no'));
        })?.[1];

    // Try multiple variations for checkout date - use let so we can update it if found later
    let checkoutDateDimensionId = getCheckoutDateColumn
      ? dimensionNameToIdMap[getCheckoutDateColumn] ||
        Object.entries(dimensionNameToIdMap).find(([name]) => 
          name.toLowerCase().includes('checkout')
        )?.[1] ||
        Object.entries(dimensionNameToIdMap).find(([name]) => 
          name.toLowerCase().includes('check-out') || name.toLowerCase().includes('check out')
        )?.[1] ||
        Object.entries(dimensionNameToIdMap).find(([name]) => 
          name.toLowerCase().includes('departure') || name.toLowerCase().includes('depart')
        )?.[1]
      : Object.entries(dimensionNameToIdMap).find(([name]) => 
          name.toLowerCase().includes('checkout')
        )?.[1] ||
        Object.entries(dimensionNameToIdMap).find(([name]) => 
          name.toLowerCase().includes('check-out') || name.toLowerCase().includes('check out')
        )?.[1] ||
        Object.entries(dimensionNameToIdMap).find(([name]) => 
          name.toLowerCase().includes('departure') || name.toLowerCase().includes('depart')
        )?.[1];

    // Get values from original row's dimension_values (most reliable) or transformed row
    let hotel = '';
    let bookingNumber = '';
    let checkoutDate: any = null;

    if (originalRow?.dimension_values) {
      // Use original dimension_values - this is the most reliable source
      if (hotelDimensionId) {
        hotel = String(originalRow.dimension_values[hotelDimensionId] || '').trim();
      }
      if (bookingNumberDimensionId) {
        bookingNumber = String(originalRow.dimension_values[bookingNumberDimensionId] || '').trim();
      }
      if (checkoutDateDimensionId) {
        checkoutDate = originalRow.dimension_values[checkoutDateDimensionId];
      }
      
      // If still missing, try to find by iterating through all dimension values
      if (!hotel && hotelDimensionId) {
        // Try alternative approach: find by dimension ID directly
        const hotelValue = originalRow.dimension_values[hotelDimensionId];
        if (hotelValue !== undefined && hotelValue !== null) {
          hotel = String(hotelValue).trim();
        }
      }
      if (!bookingNumber && bookingNumberDimensionId) {
        const bookingValue = originalRow.dimension_values[bookingNumberDimensionId];
        if (bookingValue !== undefined && bookingValue !== null) {
          bookingNumber = String(bookingValue).trim();
        }
      }
      if (!checkoutDate && checkoutDateDimensionId) {
        const checkoutValue = originalRow.dimension_values[checkoutDateDimensionId];
        if (checkoutValue !== undefined && checkoutValue !== null) {
          checkoutDate = checkoutValue;
        }
      }
    }
    
    // Fallback to transformed row if still missing
    if (!hotel) {
      hotel = String(row['Hotel'] || row['hotel'] || '').trim();
    }
    if (!bookingNumber) {
      bookingNumber = getBookingNumberColumn 
        ? String(row[getBookingNumberColumn] || '').trim()
        : '';
    }
    if (!checkoutDate) {
      checkoutDate = getCheckoutDateColumn
        ? row[getCheckoutDateColumn]
        : null;
      
      // Also try common variations
      if (!checkoutDate) {
        checkoutDate = row['Checkout Date'] || row['Checkout'] || row['checkout'] || 
                      row['Check-out Date'] || row['Departure Date'] || row['Departure'];
      }
    }

    if (!dimensionDataRowId) {
      // Fallback: try to find the row using dimension values
      // Checkout date might be null/undefined/empty, but we need it for matching
      // If it's truly missing, we can't proceed
      const hasCheckoutDate = checkoutDate !== null && checkoutDate !== undefined && checkoutDate !== '';
      
      if (!hotel || !bookingNumber || !hasCheckoutDate) {
        // Try one more time to find checkout date by searching all dimensions
        if (!hasCheckoutDate && originalRow?.dimension_values) {
          // Search through all dimension values to find any date-like value
          for (const [dimId, value] of Object.entries(originalRow.dimension_values)) {
            if (value && (typeof value === 'string' || value instanceof Date)) {
              const dateStr = value instanceof Date ? value.toISOString() : String(value);
              // Check if it looks like a date
              if (dateStr.match(/\d{4}-\d{2}-\d{2}/) || dateStr.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                // Check if this dimension name suggests it's a checkout/departure date
                const dimName = dimensionNameToIdMap[dimId] || 
                  Object.entries(dimensionNameToIdMap).find(([_, id]) => id === dimId)?.[0];
                if (dimName && (
                  dimName.toLowerCase().includes('checkout') ||
                  dimName.toLowerCase().includes('check-out') ||
                  dimName.toLowerCase().includes('departure') ||
                  dimName.toLowerCase().includes('depart') ||
                  dimName.toLowerCase().includes('date')
                )) {
                  checkoutDate = value;
                  // Update the dimension ID if we found it
                  checkoutDateDimensionId = dimId;
                  break;
                }
              }
            }
          }
        }
        
        const finalHasCheckoutDate = checkoutDate !== null && checkoutDate !== undefined && checkoutDate !== '';
        
        if (!hotel || !bookingNumber || !finalHasCheckoutDate) {
          console.error('[BookingTab] Missing required fields:', {
            hotel,
            bookingNumber,
            checkoutDate,
            hasCheckoutDate: finalHasCheckoutDate,
            hotelDimensionId,
            bookingNumberDimensionId,
            checkoutDateDimensionId,
            getCheckoutDateColumn,
            rowKeys: Object.keys(row),
            originalRowKeys: originalRow ? Object.keys(originalRow) : null,
            dimensionValues: originalRow?.dimension_values,
            dimensionNameToIdMap,
            allDimensionNames: Object.keys(dimensionNameToIdMap),
          });
          toast({
            title: "Error",
            description: `Missing required fields. Hotel: ${hotel ? '✓' : '✗'}, Booking: ${bookingNumber ? '✓' : '✗'}, Checkout: ${finalHasCheckoutDate ? '✓' : '✗'}`,
            variant: "destructive",
          });
          return;
        }
      }

      if (!hotelDimensionId || !bookingNumberDimensionId || !checkoutDateDimensionId) {
        console.error('[BookingTab] Missing dimension IDs:', {
          hotelDimensionId,
          bookingNumberDimensionId,
          checkoutDateDimensionId,
          dimensionNameToIdMap,
        });
        toast({
          title: "Error",
          description: "Could not find required dimension IDs (Hotel, Booking Number, or Checkout Date)",
          variant: "destructive",
        });
        return;
      }

      try {
        // Find the dimension_data row
        const dimensionDataRow = await findDimensionDataRow(
          bookingReportId,
          hotelDimensionId,
          bookingNumberDimensionId,
          checkoutDateDimensionId,
          hotel,
          bookingNumber,
          checkoutDate
        );

        if (!dimensionDataRow) {
          toast({
            title: "Error",
            description: "Could not find booking row in database",
            variant: "destructive",
          });
          return;
        }

        // Use the found row ID
        const foundRowId = dimensionDataRow.id;

        // Ensure status dimension exists
        let currentStatusDimensionId = statusDimensionId;
        if (!currentStatusDimensionId) {
          currentStatusDimensionId = await getOrCreateStatusDimension(
            bookingReportId,
            userData.user.id,
            accountId
          );
          setStatusDimensionId(currentStatusDimensionId);
        }

        // Update the status
        await updateBookingStatus(
          foundRowId,
          currentStatusDimensionId,
          newStatus || null
        );

        // Update local state
        setAllBookingData(prev => prev.map(r => {
          const rowKey = getBookingKey(r);
          const currentKey = getBookingKey(row);
          if (rowKey === currentKey) {
            const updatedRow = { ...r };
            if (updatedRow._originalRow) {
              updatedRow._originalRow = {
                ...updatedRow._originalRow,
                dimension_values: {
                  ...updatedRow._originalRow.dimension_values,
                  [currentStatusDimensionId]: newStatus || null,
                },
              };
            }
            updatedRow['Status'] = newStatus || null;
            updatedRow._dimensionDataId = foundRowId;
            return updatedRow;
          }
          return r;
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
    } else {
      // We have the dimension_data row ID, use it directly
      try {
        // Ensure status dimension exists
        let currentStatusDimensionId = statusDimensionId;
        if (!currentStatusDimensionId) {
          currentStatusDimensionId = await getOrCreateStatusDimension(
            bookingReportId,
            userData.user.id,
            accountId
          );
          setStatusDimensionId(currentStatusDimensionId);
        }

        // Update the status
        await updateBookingStatus(
          dimensionDataRowId,
          currentStatusDimensionId,
          newStatus || null
        );

        // Update local state
        setAllBookingData(prev => prev.map(r => {
          const rowKey = getBookingKey(r);
          const currentKey = getBookingKey(row);
          if (rowKey === currentKey) {
            const updatedRow = { ...r };
            if (updatedRow._originalRow) {
              updatedRow._originalRow = {
                ...updatedRow._originalRow,
                dimension_values: {
                  ...updatedRow._originalRow.dimension_values,
                  [currentStatusDimensionId]: newStatus || null,
                },
              };
            }
            updatedRow['Status'] = newStatus || null;
            return updatedRow;
          }
          return r;
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
    }
  };

  // Apply filters to booking data
  const filteredBookingData = useMemo(() => {
    let filtered = [...allBookingData];

    console.log('[BookingTab] Filtering data:', {
      totalRows: allBookingData.length,
      selectedYear,
      selectedMonth,
      selectedHotels: selectedHotels.length,
      checkoutDateColumn: getCheckoutDateColumn,
      columns: columns.slice(0, 5), // Show first 5 columns for debugging
    });

    // Filter by Hotels (multi-select)
    if (selectedHotels.length > 0) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(row => {
        const hotelValue = row['Hotel'] || row['hotel'];
        if (hotelValue === undefined || hotelValue === null) return false;
        return selectedHotels.includes(String(hotelValue).trim());
      });
      console.log('[BookingTab] Hotel filter:', { before: beforeCount, after: filtered.length });
    }

    // Filter by Checkout Date (Year/Month) - only filter if we can find checkout dates
    // First, find checkout date column by searching all columns
    let checkoutDateColumn: string | undefined = getCheckoutDateColumn;
    
    // If not found, search through all columns for checkout-related names
    if (!checkoutDateColumn) {
      checkoutDateColumn = columns.find(col => {
        const colLower = col.toLowerCase();
        return colLower.includes('checkout') || 
               colLower.includes('check-out') || 
               colLower.includes('check out') ||
               colLower.includes('departure');
      });
    }
    
    // Find checkout date dimension ID for reliable lookup
    const checkoutDateDimensionId = Object.entries(dimensionNameToIdMap).find(([_, name]) => {
      const nameLower = name?.toLowerCase() || '';
      return nameLower.includes('checkout') || 
             nameLower.includes('check-out') || 
             nameLower.includes('check out') ||
             nameLower.includes('departure');
    })?.[1];
    
    // Find all possible checkout date column names
    const checkoutDateColumnNames = [
      checkoutDateColumn,
      'Checkout Date',
      'Checkout',
      'checkout',
      'Check-out Date',
      'Check-out',
      'Check Out Date',
      'Departure Date',
      'Departure',
    ].filter(Boolean) as string[];
    
    console.log('[BookingTab] Looking for checkout date:', {
      getCheckoutDateColumn,
      foundCheckoutDateColumn: checkoutDateColumn,
      checkoutDateDimensionId,
      checkoutDateColumnNames,
      allColumns: columns,
    });
    
    // Check if we can find checkout dates in the data
    let canFilterByDate = false;
    // Sample a few rows to see if we can find checkout dates
    for (let i = 0; i < Math.min(10, filtered.length); i++) {
      const row = filtered[i];
      let dateValue: any = null;
      
      // Try column name first
      if (checkoutDateColumn) {
        dateValue = row[checkoutDateColumn];
      }
      
      // Try all possible column name variations
      if (!dateValue) {
        for (const colName of checkoutDateColumnNames) {
          if (row[colName]) {
            dateValue = row[colName];
            break;
          }
        }
      }
      
      // Try dimension_values
      if (!dateValue && checkoutDateDimensionId) {
        const originalRow = (row as any)._originalRow;
        if (originalRow?.dimension_values) {
          dateValue = originalRow.dimension_values[checkoutDateDimensionId];
        }
      }
      
      // Try searching all dimension_values for any date-like value
      if (!dateValue) {
        const originalRow = (row as any)._originalRow;
        if (originalRow?.dimension_values) {
          // Look for any dimension that might be a checkout date
          // dimensionNameToIdMap maps name -> id
          for (const [dimName, dimId] of Object.entries(dimensionNameToIdMap)) {
            const dimNameLower = dimName.toLowerCase();
            if ((dimNameLower.includes('checkout') || 
                 dimNameLower.includes('check-out') || 
                 dimNameLower.includes('check out') ||
                 dimNameLower.includes('departure')) &&
                originalRow.dimension_values[dimId]) {
              dateValue = originalRow.dimension_values[dimId];
              break;
            }
          }
        }
      }
      
      if (dateValue) {
        canFilterByDate = true;
        if (i < 3) {
          console.log(`[BookingTab] Found checkout date in row ${i}:`, dateValue);
        }
        break;
      }
    }
    
    console.log('[BookingTab] Can filter by date:', canFilterByDate);
    
    if (selectedYear && selectedMonth && canFilterByDate) {
      const monthNum = MONTH_NAMES.indexOf(selectedMonth);
      const yearNum = parseInt(selectedYear);
      
      if (isNaN(monthNum) || isNaN(yearNum)) {
        console.warn('[BookingTab] Invalid year/month for filtering:', { selectedYear, selectedMonth, monthNum, yearNum });
      } else {
        const dateRange = {
          start: new Date(yearNum, monthNum, 1),
          end: new Date(yearNum, monthNum + 1, 0, 23, 59, 59),
        };

        const beforeCount = filtered.length;
        
        console.log('[BookingTab] Date filter setup:', {
          checkoutDateColumn,
          checkoutDateDimensionId,
          checkoutDateColumnNames,
          dateRange: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
          },
        });
        
        let foundDatesCount = 0;
        let matchedDatesCount = 0;
        let missingDatesCount = 0;
        let parseErrorCount = 0;
        const sampleDates: string[] = [];
        
        // Try multiple ways to get the checkout date
        filtered = filtered.filter((row, index) => {
          let dateValue: any = null;
          
          // First try the found checkout date column
          if (checkoutDateColumn) {
            dateValue = row[checkoutDateColumn];
          }
          
          // If not found, try common variations
          if (!dateValue) {
            for (const colName of checkoutDateColumnNames) {
              if (row[colName]) {
                dateValue = row[colName];
                break;
              }
            }
          }
          
          // If still not found, try to get from original row's dimension_values using dimension ID
          if (!dateValue && checkoutDateDimensionId) {
            const originalRow = (row as any)._originalRow;
            if (originalRow?.dimension_values) {
              dateValue = originalRow.dimension_values[checkoutDateDimensionId];
            }
          }
          
          // Last resort: search all dimension_values for checkout-related dimensions
          if (!dateValue) {
            const originalRow = (row as any)._originalRow;
            if (originalRow?.dimension_values) {
              // Search through all dimensions to find checkout date
              // dimensionNameToIdMap maps name -> id, so we need to check if any name matches checkout
              for (const [dimName, dimId] of Object.entries(dimensionNameToIdMap)) {
                const dimNameLower = dimName.toLowerCase();
                if ((dimNameLower.includes('checkout') || 
                     dimNameLower.includes('check-out') || 
                     dimNameLower.includes('check out') ||
                     dimNameLower.includes('departure')) &&
                    originalRow.dimension_values[dimId]) {
                  dateValue = originalRow.dimension_values[dimId];
                  break;
                }
              }
            }
          }
          
          if (!dateValue) {
            missingDatesCount++;
            if (index < 3) {
              console.log(`[BookingTab] Row ${index}: No checkout date found`, {
                rowKeys: Object.keys(row).slice(0, 10),
                hasOriginalRow: !!(row as any)._originalRow,
                dimensionValuesKeys: (row as any)._originalRow?.dimension_values ? Object.keys((row as any)._originalRow.dimension_values).slice(0, 10) : null,
              });
            }
            return false; // Filter out rows without checkout date
          }
          
          foundDatesCount++;
          
          try {
            let rowDate: Date;
            if (dateValue instanceof Date) {
              rowDate = dateValue;
            } else if (typeof dateValue === 'string') {
              // Handle ISO format and other string formats
              rowDate = new Date(dateValue);
            } else {
              rowDate = new Date(dateValue);
            }
            
            if (isNaN(rowDate.getTime())) {
              parseErrorCount++;
              if (index < 3) {
                console.warn(`[BookingTab] Row ${index}: Invalid date:`, dateValue);
              }
              return false;
            }
            
            // Store sample dates for debugging
            if (sampleDates.length < 5) {
              sampleDates.push(`${rowDate.toISOString()} (${rowDate.getFullYear()}-${rowDate.getMonth() + 1})`);
            }
            
            const isInRange = isWithinInterval(rowDate, dateRange);
            if (isInRange) {
              matchedDatesCount++;
            } else {
              if (index < 3) {
                console.log(`[BookingTab] Row ${index}: Date out of range`, {
                  rowDate: rowDate.toISOString(),
                  dateRange: {
                    start: dateRange.start.toISOString(),
                    end: dateRange.end.toISOString(),
                  },
                  rowYear: rowDate.getFullYear(),
                  rowMonth: rowDate.getMonth() + 1, // getMonth() is 0-indexed
                  selectedYear: yearNum,
                  selectedMonth: monthNum + 1, // monthNum is 0-indexed
                });
              }
            }
            return isInRange;
          } catch (err) {
            parseErrorCount++;
            if (index < 3) {
              console.warn(`[BookingTab] Row ${index}: Date parsing error:`, dateValue, err);
            }
            return false;
          }
        });
        
        console.log('[BookingTab] Date filter results:', { 
          before: beforeCount, 
          after: filtered.length,
          foundDates: foundDatesCount,
          matchedDates: matchedDatesCount,
          missingDates: missingDatesCount,
          parseErrors: parseErrorCount,
          sampleDates,
        });
      }
    } else if (selectedYear && selectedMonth && !canFilterByDate) {
      console.warn('[BookingTab] Cannot filter by date - checkout date column not found in data');
    }

    console.log('[BookingTab] Final filtered count:', filtered.length);
    return filtered;
  }, [allBookingData, selectedYear, selectedMonth, selectedHotels, columns, getCheckoutDateColumn, dimensionNameToIdMap]);

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

  // Use availableYears from state (computed during data loading)
  const availableYears = availableYearsState;

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
                        const handleToggle = () => {
                          const newHotels = isSelected
                            ? pendingHotels.filter(h => h !== hotel)
                            : [...pendingHotels, hotel];
                          setPendingHotels(newHotels);
                        };
                        return (
                          <div
                            key={hotel}
                            className="group flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent text-sm relative"
                            onClick={handleToggle}
                          >
                            <Checkbox 
                              checked={isSelected} 
                              onCheckedChange={handleToggle}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggle();
                              }}
                              className="pointer-events-auto"
                            />
                            <span className="truncate flex-1" onClick={(e) => e.stopPropagation()}>{hotel}</span>
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
                        const originalRow = (row as any)._originalRow;
                        const currentStatus = getStatusForRow(row, originalRow);
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
                            <span key={page}>
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
                            </span>
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