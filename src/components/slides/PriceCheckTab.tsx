/**
 * Price Check Tab Component
 * 
 * Displays price parity data with chart visualization, hotel filtering,
 * and time range filtering.
 * 
 * @module PriceCheckTab
 */

import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PriceCheckChart, type ChartTimeRange } from "./PriceCheckChart";
import { getUniqueHotels } from "@/lib/priceCheckData";
import { useState, useEffect, useMemo } from "react";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface PriceCheckTabProps {
  accountId?: string;
  selectedHotels?: string[];
  onHotelsChange?: (hotels: string[]) => void;
  chartTimeRange?: ChartTimeRange;
  onChartTimeRangeChange?: (range: ChartTimeRange) => void;
}

export function PriceCheckTab({ 
  accountId,
  selectedHotels: externalSelectedHotels,
  onHotelsChange,
  chartTimeRange: externalChartTimeRange,
  onChartTimeRangeChange,
}: PriceCheckTabProps) {
  // Internal state if not controlled externally
  const [internalSelectedHotels, setInternalSelectedHotels] = useState<string[]>([]);
  const [internalChartTimeRange, setInternalChartTimeRange] = useState<ChartTimeRange>('last_6_months');
  
  // Use external state if provided, otherwise use internal
  const selectedHotels = externalSelectedHotels !== undefined ? externalSelectedHotels : internalSelectedHotels;
  const chartTimeRange = externalChartTimeRange !== undefined ? externalChartTimeRange : internalChartTimeRange;
  
  const setSelectedHotels = onHotelsChange || setInternalSelectedHotels;
  const setChartTimeRange = onChartTimeRangeChange || setInternalChartTimeRange;

  const [hotelOptions, setHotelOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [pendingHotels, setPendingHotels] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Load hotel options
  useEffect(() => {
    const hotels = getUniqueHotels();
    setHotelOptions(hotels);
  }, []);

  // Initialize pending hotels when popover opens
  useEffect(() => {
    if (open) {
      const isFilterSet = selectedHotels.length > 0;
      setPendingHotels(isFilterSet ? [...selectedHotels] : [...hotelOptions]);
    }
  }, [open, selectedHotels, hotelOptions]);

  // Check if all hotels are selected
  const isAllSelected = useMemo(() => {
    if (selectedHotels.length === 0) return true; // No filter = all selected
    return selectedHotels.length === hotelOptions.length;
  }, [selectedHotels, hotelOptions]);

  // Get display text for selected hotels
  const displayText = useMemo(() => {
    if (isAllSelected) return 'All';
    if (selectedHotels.length === 0) return '0 selected';
    if (selectedHotels.length === 1) return selectedHotels[0];
    return `${selectedHotels.length} selected`;
  }, [selectedHotels, isAllSelected]);

  // Filter hotels by search term
  const filteredHotels = useMemo(() => {
    if (!searchTerm) return hotelOptions;
    return hotelOptions.filter(hotel => 
      hotel.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [hotelOptions, searchTerm]);

  const handleApply = () => {
    setSelectedHotels(pendingHotels.length === hotelOptions.length ? [] : pendingHotels);
    setOpen(false);
    setSearchTerm('');
  };

  return (
    <TabsContent value="price-check" className="space-y-6">
      {/* Filters */}
      <div className="flex items-end justify-end gap-4">
        {/* Hotel Filter */}
        {hotelOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hotel:</span>
            <Popover open={open} onOpenChange={(isOpen) => {
              setOpen(isOpen);
              if (!isOpen) {
                setSearchTerm('');
              }
            }}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 justify-between min-w-[140px] px-4 pt-[20px] pb-[18px]">
                  <span className="truncate">{displayText}</span>
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
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
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
                      onClick={handleApply}
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

      {/* Chart */}
      <PriceCheckChart
        title="Price Parity"
        chartTimeRange={chartTimeRange}
        onTimeRangeChange={setChartTimeRange}
        selectedHotels={selectedHotels}
      />
    </TabsContent>
  );
}
