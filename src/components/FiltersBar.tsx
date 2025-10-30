import { useState, useEffect } from "react";
import { Filter, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { DimensionSelectorModal } from "./DimensionSelectorModal";

interface FiltersBarProps {
  reportId: string | null;
  onFiltersChange?: (filters: Record<string, string>) => void;
}

interface Dimension {
  id: string;
  name: string;
  type: string;
}

export const FiltersBar = ({ reportId, onFiltersChange }: FiltersBarProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [activeDimensions, setActiveDimensions] = useState<string[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (reportId) {
      loadDimensions();
    }
  }, [reportId]);

  useEffect(() => {
    if (activeDimensions.length > 0 && reportId) {
      loadDimensionValues();
    }
  }, [activeDimensions, reportId]);

  const loadDimensions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;

      // Filter only attribute dimensions (text type) that can be used for filtering
      const filterableDimensions = (data || []).filter(
        (d) => d.type === "text" || d.type === "date"
      );
      setDimensions(filterableDimensions);
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDimensionValues = async () => {
    if (!reportId) return;

    try {
      const { data, error } = await supabase
        .from("dimension_data")
        .select("dimension_values")
        .eq("report_id", reportId);

      if (error) throw error;

      const valuesMap: Record<string, Set<string>> = {};

      // Extract unique values for each active dimension
      data?.forEach((row) => {
        const dimensionValues = row.dimension_values as Record<string, any>;
        activeDimensions.forEach((dimId) => {
          const value = dimensionValues[dimId];
          if (value) {
            if (!valuesMap[dimId]) {
              valuesMap[dimId] = new Set();
            }
            valuesMap[dimId].add(String(value));
          }
        });
      });

      // Convert sets to arrays
      const valuesArray: Record<string, string[]> = {};
      Object.keys(valuesMap).forEach((dimId) => {
        valuesArray[dimId] = Array.from(valuesMap[dimId]).sort();
      });

      setDimensionValues(valuesArray);
    } catch (error) {
      console.error("Error loading dimension values:", error);
    }
  };

  const handleFilterChange = (dimensionId: string, value: string) => {
    const newFilters = { ...selectedFilters };
    if (value === "all") {
      delete newFilters[dimensionId];
    } else {
      newFilters[dimensionId] = value;
    }
    setSelectedFilters(newFilters);
    onFiltersChange?.(newFilters);
  };

  const handleDimensionsChange = (dimensionIds: string[]) => {
    setActiveDimensions(dimensionIds);
    // Clear filters for removed dimensions
    const newFilters = { ...selectedFilters };
    Object.keys(newFilters).forEach((key) => {
      if (!dimensionIds.includes(key)) {
        delete newFilters[key];
      }
    });
    setSelectedFilters(newFilters);
    onFiltersChange?.(newFilters);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowDimensionSelector(true);
  };

  return (
    <>
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </div>

            <div className="flex items-center gap-3 flex-1">
              {activeDimensions.map((dimId) => {
                const dimension = dimensions.find((d) => d.id === dimId);
                if (!dimension) return null;

                const values = dimensionValues[dimId] || [];

                return (
                  <div key={dimId} className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                      {dimension.name}
                    </label>
                    <Select
                      value={selectedFilters[dimId] || "all"}
                      onValueChange={(value) => handleFilterChange(dimId, value)}
                    >
                      <SelectTrigger className="w-[200px] bg-background">
                        <SelectValue placeholder={`Search or select ${dimension.name.toLowerCase()}...`} />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="all">All {dimension.name}</SelectItem>
                        {values.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}

              {/* Date Range Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[200px] justify-start text-left font-normal bg-background",
                        !dateRange?.from && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "MMM d")} -{" "}
                            {format(dateRange.to, "MMM d, yyyy")}
                          </>
                        ) : (
                          format(dateRange.from, "MMM d, yyyy")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background z-50" align="start">
                    <CalendarComponent
                      mode="range"
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {activeDimensions.length === 0 && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onContextMenu={handleContextMenu}
                  onClick={handleContextMenu}
                >
                  Right-click to configure filters
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <DimensionSelectorModal
        open={showDimensionSelector}
        onOpenChange={setShowDimensionSelector}
        title="Configure Filter Dimensions"
        selectedDimensions={activeDimensions}
        onDimensionsChange={handleDimensionsChange}
      />
    </>
  );
};
