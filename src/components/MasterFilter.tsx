import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Check, ChevronDown, Settings, X, Filter, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Dimension {
  id: string;
  name: string;
  type: string;
  scope: string;
}

interface Report {
  id: string;
  name: string;
}

interface MasterFilterProps {
  accountId?: string;
  reports: Report[];
  onFilterChange: (
    dimension: string | null, 
    values: string[], 
    dateRange?: { from: Date; to: Date },
    reportIds?: string[]
  ) => void;
  selectedDimension: string | null;
  selectedValues: string[];
  selectedDateRange?: { from: Date; to: Date };
  selectedReportIds?: string[];
}

export const MasterFilter = ({ 
  accountId,
  reports,
  onFilterChange, 
  selectedDimension, 
  selectedValues,
  selectedDateRange,
  selectedReportIds 
}: MasterFilterProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [showValueSelector, setShowValueSelector] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showReportSelector, setShowReportSelector] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  
  const [localDateRange, setLocalDateRange] = useState<{ from: Date; to: Date } | undefined>(selectedDateRange);
  const [localReportIds, setLocalReportIds] = useState<string[]>(selectedReportIds || reports.map(r => r.id));

  useEffect(() => {
    loadDimensions();
  }, [accountId]);

  useEffect(() => {
    if (selectedDimension) {
      loadDimensionValues(selectedDimension);
    }
  }, [selectedDimension]);

  const loadDimensions = async () => {
    try {
      setIsLoading(true);
      console.log('[MASTER-FILTER] Loading dimensions for account:', accountId);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load dimensions that can be used as master filters (text type only)
      let query = supabase
        .from('dimensions')
        .select('id, name, type, scope')
        .eq('type', 'text') // Only text dimensions can be used as master filters
        .in('scope', ['global', 'account']);

      if (accountId) {
        query = query.or(`account_id.eq.${accountId},scope.eq.global`);
      } else {
        query = query.eq('scope', 'global');
      }

      const { data, error } = await query.order('name');

      if (error) {
        console.error('[MASTER-FILTER] Error loading dimensions:', error);
        return;
      }

      // Deduplicate dimensions by name, prioritizing account > global
      const dimensionMap = new Map<string, Dimension>();
      (data || []).forEach(dim => {
        const existing = dimensionMap.get(dim.name);
        if (!existing || (dim.scope === 'account' && existing.scope === 'global')) {
          dimensionMap.set(dim.name, dim);
        }
      });

      const uniqueDimensions = Array.from(dimensionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      console.log('[MASTER-FILTER] Loaded unique dimensions:', uniqueDimensions.length);
      setDimensions(uniqueDimensions);
    } catch (error) {
      console.error('[MASTER-FILTER] Error in loadDimensions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDimensionValues = async (dimensionId: string) => {
    try {
      console.log('[MASTER-FILTER] Loading values for dimension:', dimensionId);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get unique values for this dimension across all reports
      let query = supabase
        .from('dimension_data')
        .select('dimension_values')
        .not('dimension_values', 'is', null);

      if (accountId) {
        // Filter by account if specified
        const { data: reports } = await supabase
          .from('reports')
          .select('id')
          .eq('account_id', accountId);
        
        if (reports && reports.length > 0) {
          const reportIds = reports.map(r => r.id);
          query = query.in('report_id', reportIds);
        }
      }

      const { data, error } = await query.limit(10000);

      if (error) {
        console.error('[MASTER-FILTER] Error loading dimension values:', error);
        return;
      }

      // Extract unique values for the selected dimension
      const uniqueValues = new Set<string>();
      data?.forEach(row => {
        const value = row.dimension_values[dimensionId];
        if (value && typeof value === 'string') {
          uniqueValues.add(value);
        }
      });

      const sortedValues = Array.from(uniqueValues).sort();
      console.log('[MASTER-FILTER] Loaded values:', sortedValues.length);
      
      setDimensionValues(prev => ({
        ...prev,
        [dimensionId]: sortedValues
      }));
    } catch (error) {
      console.error('[MASTER-FILTER] Error in loadDimensionValues:', error);
    }
  };

  const handleDimensionSelect = (dimensionId: string) => {
    console.log('[MASTER-FILTER] Selected dimension:', dimensionId);
    onFilterChange(dimensionId, [], localDateRange, localReportIds);
    setShowDimensionSelector(false);
    setIsConfiguring(false);
  };

  const handleValueToggle = (value: string) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    
    console.log('[MASTER-FILTER] Updated values:', newValues);
    onFilterChange(selectedDimension, newValues, localDateRange, localReportIds);
  };

  const handleDateRangeChange = (range: { from: Date; to: Date } | undefined) => {
    setLocalDateRange(range);
    onFilterChange(selectedDimension, selectedValues, range, localReportIds);
  };

  const handleReportToggle = (reportId: string) => {
    const newReportIds = localReportIds.includes(reportId)
      ? localReportIds.filter(id => id !== reportId)
      : [...localReportIds, reportId];
    
    setLocalReportIds(newReportIds);
    onFilterChange(selectedDimension, selectedValues, localDateRange, newReportIds);
  };

  const handleClearFilter = () => {
    setLocalDateRange(undefined);
    setLocalReportIds(reports.map(r => r.id));
    onFilterChange(null, [], undefined, reports.map(r => r.id));
    setIsConfiguring(false);
  };

  const selectedDimensionObj = dimensions.find(d => d.id === selectedDimension);
  const availableValues = selectedDimension ? dimensionValues[selectedDimension] || [] : [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Master Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="animate-pulse h-4 bg-muted rounded w-32"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Master Filter
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsConfiguring(!isConfiguring)}
            className="h-8 w-8 p-0"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Date Range Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Date Range</label>
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {localDateRange?.from ? (
                    localDateRange.to ? (
                      <>
                        {format(localDateRange.from, "LLL dd, y")} -{" "}
                        {format(localDateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(localDateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span className="text-muted-foreground">Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={localDateRange?.from}
                  selected={{ from: localDateRange?.from, to: localDateRange?.to }}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      handleDateRangeChange({ from: range.from, to: range.to });
                      setShowDatePicker(false);
                    }
                  }}
                  numberOfMonths={2}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Report Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Data Sources</label>
            <Popover open={showReportSelector} onOpenChange={setShowReportSelector}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                >
                  {localReportIds.length === reports.length
                    ? "All reports"
                    : `${localReportIds.length} of ${reports.length} selected`}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search reports..." />
                  <CommandList>
                    <CommandEmpty>No reports found.</CommandEmpty>
                    <CommandGroup>
                      {reports.map((report) => (
                        <CommandItem
                          key={report.id}
                          value={report.name}
                          onSelect={() => handleReportToggle(report.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              localReportIds.includes(report.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {report.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Dimension Filter */}
          {!selectedDimension || isConfiguring ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Dimension Filter (Optional)</label>
              <Popover open={showDimensionSelector} onOpenChange={setShowDimensionSelector}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={showDimensionSelector}
                    className="w-full justify-between"
                  >
                    {selectedDimensionObj ? selectedDimensionObj.name : "Select dimension..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search dimensions..." />
                    <CommandList>
                      <CommandEmpty>No dimensions found.</CommandEmpty>
                      <CommandGroup>
                        {dimensions.map((dimension) => (
                          <CommandItem
                            key={dimension.id}
                            value={dimension.name}
                            onSelect={() => handleDimensionSelect(dimension.id)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedDimension === dimension.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {dimension.name}
                            <Badge variant="secondary" className="ml-auto">
                              {dimension.scope}
                            </Badge>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedDimension && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsConfiguring(false)}
                  >
                    Done
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilter}
                  >
                    Clear All
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  {selectedDimensionObj?.name}
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onFilterChange(null, [], localDateRange, localReportIds);
                  }}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                  >
                    {selectedValues.length > 0 
                      ? `${selectedValues.length} selected`
                      : "Select values..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search values..." />
                    <CommandList>
                      <CommandEmpty>No values found.</CommandEmpty>
                      <CommandGroup>
                        {availableValues.map((value) => (
                          <CommandItem
                            key={value}
                            value={value}
                            onSelect={() => handleValueToggle(value)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedValues.includes(value) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {value}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {selectedValues.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedValues.map((value) => (
                    <Badge key={value} variant="secondary" className="text-xs">
                      {value}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleValueToggle(value)}
                        className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
