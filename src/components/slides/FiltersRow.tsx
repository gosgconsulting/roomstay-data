import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookmarkPlus, Trash2, Search, ChevronRight, Loader2 } from "lucide-react";
import { SlideReport, SlideReportPivotData } from "@/types/slideReports";
import { MONTH_NAMES } from "@/constants/slideViewConstants";
import { parseSelectedMonths, enforceConsecutive, formatSelectedMonths, slideSelectionToDateRange, dateRangeToSlideSelection, deriveSlideDatePreset, dateRangeFromPreset, derivePresetFromDateRange } from "@/lib/monthUtils";
import { DateRangeFilter } from "@/components/filters";
import type { DateRange } from "react-day-picker";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface FilterConfig {
  filterDimensionIds: string[];
}

interface View {
  id: string | null;
  name: string;
}

interface FiltersRowProps {
  selectedTab: string;
  selectedViewId: string | null;
  setSelectedViewId: (viewId: string | null) => void;
  isReadOnlyMode: boolean;
  availableViews: View[];
  handleApplyView: (viewId: string | null) => void;
  handleDeleteView: (viewId: string) => void;
  setIsSaveViewDialogOpen: (open: boolean) => void;
  setIsSaveOrUpdateViewDialogOpen: (open: boolean) => void;
  filterValues: Record<string, Record<string, string[]>>;
  setFilterValues: (values: Record<string, Record<string, string[]>> | ((prev: Record<string, Record<string, string[]>>) => Record<string, Record<string, string[]>>)) => void;
  filterDimensionValues: Record<string, Record<string, string[]>>;
  setFilterDimensionValues: (values: Record<string, Record<string, string[]>> | ((prev: Record<string, Record<string, string[]>>) => Record<string, Record<string, string[]>>)) => void;
  filterDimensionNames: Record<string, Record<string, string>>;
  setFilterDimensionNames: (names: Record<string, Record<string, string>> | ((prev: Record<string, Record<string, string>>) => Record<string, Record<string, string>>)) => void;
  dimensions: Record<string, Dimension[]>;
  filterConfigs: Record<string, FilterConfig>;
  slideReport?: SlideReport | null;
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  customDateRange?: DateRange | undefined;
  setCustomDateRange?: (range: DateRange | undefined) => void;
  comparisonType: string;
  setComparisonType: (type: string) => void;
  pendingFilterValues: Record<string, Record<string, string[]>>;
  setPendingFilterValues: (values: Record<string, Record<string, string[]>> | ((prev: Record<string, Record<string, string[]>>) => Record<string, Record<string, string[]>>)) => void;
  filterSearchTerms: Record<string, string>;
  setFilterSearchTerms: (terms: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  openFilterPopovers: Record<string, boolean>;
  setOpenFilterPopovers: (popovers: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  filterValuesLoading: Record<string, Record<string, boolean>>;
  setFilterValuesLoading: (loading: Record<string, Record<string, boolean>> | ((prev: Record<string, Record<string, boolean>>) => Record<string, Record<string, boolean>>)) => void;
  loadFilterDimensionValues: (channel: 'metasearch' | 'sem' | 'social', filterDimId: string) => Promise<string[]>;
}

export function FiltersRow({
  selectedTab,
  selectedViewId,
  setSelectedViewId,
  isReadOnlyMode,
  availableViews,
  handleApplyView,
  handleDeleteView,
  setIsSaveViewDialogOpen,
  setIsSaveOrUpdateViewDialogOpen,
  filterValues,
  setFilterValues,
  filterDimensionValues,
  setFilterDimensionValues,
  setFilterDimensionNames,
  filterDimensionNames,
  dimensions,
  filterConfigs,
  slideReport,
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  customDateRange,
  setCustomDateRange,
  comparisonType,
  setComparisonType,
  pendingFilterValues,
  setPendingFilterValues,
  filterSearchTerms,
  setFilterSearchTerms,
  openFilterPopovers,
  setOpenFilterPopovers,
  filterValuesLoading,
  setFilterValuesLoading,
  loadFilterDimensionValues,
}: FiltersRowProps) {
  return (
    <div className="flex items-end justify-start gap-6">
      {/* View selector - Show when on overview tab */}
      {selectedTab === "overview" && (
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">View:</span>
            <div className="flex items-center gap-2">
              <Select 
                value={selectedViewId === null ? 'master' : selectedViewId || 'master'} 
                onValueChange={(value) => {
                  if (isReadOnlyMode) return; // Prevent changes in read-only mode
                  const newViewId = value === 'master' ? null : (value === 'unsaved' ? 'unsaved' : value);
                  setSelectedViewId(newViewId);
                  // Immediately apply the view filters (unless it's Unsaved)
                  if (newViewId !== 'unsaved') {
                    handleApplyView(newViewId);
                  }
                }}
                disabled={isReadOnlyMode}
              >
                <SelectTrigger className="w-[150px] text-sm bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableViews.map((view) => (
                    <SelectItem key={view.id === null ? 'master' : view.id} value={view.id === null ? 'master' : view.id}>
                      {view.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isReadOnlyMode && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-3"
                    onClick={() => {
                      // If a view is selected (and not 'unsaved'), show SaveOrUpdate dialog
                      // Otherwise, show Save dialog directly
                      if (selectedViewId && selectedViewId !== 'unsaved') {
                        setIsSaveOrUpdateViewDialogOpen(true);
                      } else {
                        setIsSaveViewDialogOpen(true);
                      }
                    }}
                    title="Save current filters as a view"
                  >
                    <BookmarkPlus className="h-4 w-4" />
                  </Button>
                  {selectedViewId && selectedViewId !== 'unsaved' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 px-3 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteView(selectedViewId)}
                      title="Delete this view"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Channel Filter Dropdowns - Show when on channel tabs */}
      {selectedTab !== "overview" && selectedTab !== "budget" && (() => {
        const currentChannel = selectedTab as 'metasearch' | 'sem' | 'social';
        const savedFilterConfigs = slideReport?.configuration?.filterConfigs?.[currentChannel];
        const localFilterConfig = filterConfigs?.[currentChannel];
        const rawFilterDimIds = savedFilterConfigs?.filterDimensionIds || localFilterConfig?.filterDimensionIds || [];
        const filterDimIds = [...new Set(rawFilterDimIds)];
        
        if (filterDimIds.length === 0) return null;
        
        return (
          <div className="flex items-center gap-6">
            {filterDimIds.map(filterDimId => {
              const filterDimName = filterDimensionNames[currentChannel]?.[filterDimId] 
                                 || dimensions[currentChannel]?.find(d => d.id === filterDimId)?.name
                                 || `Filter`;
              const filterValuesList = filterDimensionValues[currentChannel]?.[filterDimId] || [];
              const selectedFilterValues = filterValues[currentChannel]?.[filterDimId];
              // Check if filter is explicitly set (exists in filterValues) vs not set at all
              const isFilterSet = filterValues[currentChannel] && filterDimId in filterValues[currentChannel];
              const selectedValues = isFilterSet ? (selectedFilterValues || []) : filterValuesList;
              // Dedupe by normalized key (trim + lowercase) so "Account 1" and "Account 1 " or "account 1" count as one
              function uniqueByNormalized(arr: string[]): string[] {
                const seen = new Set<string>();
                const result: string[] = [];
                for (const v of arr) {
                  const key = String(v).trim().toLowerCase();
                  if (key && !seen.has(key)) {
                    seen.add(key);
                    result.push(String(v).trim());
                  }
                }
                return result;
              }
              const uniqueSelected = uniqueByNormalized(selectedValues);
              const uniqueFilterList = uniqueByNormalized(filterValuesList);
              const pendingValues = pendingFilterValues[currentChannel]?.[filterDimId] ?? (isFilterSet ? (selectedFilterValues || []) : uniqueFilterList);
              const uniquePending = uniqueByNormalized(pendingValues);
              // "All" means all values are selected, not when filter is not set
              const isAllSelected = isFilterSet ? uniqueSelected.length === uniqueFilterList.length : true;
              const hasValues = uniqueFilterList.length > 0;
              
              const popoverKey = `${currentChannel}-${filterDimId}`;
              const isPopoverOpen = openFilterPopovers[popoverKey] || false;
              
              return (
                <Popover 
                  key={`filter-${popoverKey}`}
                  open={isPopoverOpen}
                  onOpenChange={async (open) => {
                    setOpenFilterPopovers(prev => ({
                      ...prev,
                      [popoverKey]: open,
                    }));
                    
                    // Clear search term when closing (must run even in read-only mode)
                    if (!open) {
                      const key = `${currentChannel}-${filterDimId}`;
                      setFilterSearchTerms(prev => {
                        const { [key]: _, ...rest } = prev;
                        return rest;
                      });
                    }
                    
                    // Prevent opening logic in read-only mode
                    if (isReadOnlyMode) return;
                    
                    if (open) {
                      // Initialize pending values based on current state
                      const isFilterCurrentlySet = filterValues[currentChannel] && filterDimId in filterValues[currentChannel];
                      if (isFilterCurrentlySet) {
                        // Filter is set - use current selection deduplicated (avoid "2 selected" when only 1 unique)
                        setPendingFilterValues(prev => ({
                          ...prev,
                          [currentChannel]: {
                            ...prev[currentChannel],
                            [filterDimId]: uniqueByNormalized(selectedFilterValues || []),
                          },
                        }));
                      } else {
                        // Filter not set - default to all selected (dedupe in case list has duplicates)
                        setPendingFilterValues(prev => ({
                          ...prev,
                          [currentChannel]: {
                            ...prev[currentChannel],
                            [filterDimId]: [...uniqueFilterList],
                          },
                        }));
                      }
                      
                      // If values aren't loaded yet, trigger loading immediately
                      if (!hasValues && !filterValuesLoading[currentChannel]?.[filterDimId]) {
                        setFilterValuesLoading(prev => ({
                          ...prev,
                          [currentChannel]: {
                            ...prev[currentChannel],
                            [filterDimId]: true,
                          },
                        }));
                          
                          const values = await loadFilterDimensionValues(currentChannel, filterDimId);
                          if (values.length > 0) {
                            const seen = new Set<string>();
                            const uniqueValues: string[] = [];
                            for (const v of values) {
                              const key = String(v).trim().toLowerCase();
                              if (key && !seen.has(key)) {
                                seen.add(key);
                                uniqueValues.push(String(v).trim());
                              }
                            }
                            setFilterDimensionValues(prev => ({
                              ...prev,
                              [currentChannel]: {
                                ...prev[currentChannel],
                                [filterDimId]: uniqueValues,
                              },
                            }));
                              
                              // Get dimension name
                              const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
                              const channelData = pivotData?.channels?.[currentChannel];
                              const dimName = (channelData as any)?.dimensionMap?.[filterDimId] 
                                || dimensions[currentChannel]?.find(d => d.id === filterDimId)?.name
                                || filterDimId;
                              
                              setFilterDimensionNames(prev => ({
                                ...prev,
                                [currentChannel]: {
                                  ...prev[currentChannel],
                                  [filterDimId]: dimName,
                                },
                              }));
                            }
                            
                            setFilterValuesLoading(prev => ({
                              ...prev,
                              [currentChannel]: {
                                ...prev[currentChannel],
                                [filterDimId]: false,
                              },
                            }));
                          }
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{filterDimName}:</span>
                          <Button variant="outline" className="h-9 justify-between min-w-[140px] px-4 pt-[20px] pb-[18px]">
                            <span className="truncate">
                              {isAllSelected 
                                ? 'All'
                                : uniqueSelected.length === 0
                                  ? '0 selected'
                                  : uniqueSelected.length === 1
                                    ? uniqueSelected[0]
                                    : `${uniqueSelected.length} selected`}
                            </span>
                            <ChevronRight className="h-4 w-4 opacity-50 rotate-90 ml-2" />
                          </Button>
                        </div>
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
                                  setPendingFilterValues(prev => ({
                                    ...prev,
                                    [currentChannel]: {
                                      ...prev[currentChannel],
                                      [filterDimId]: [...uniqueFilterList],
                                    },
                                  }));
                                }}
                              >
                                All
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                  setPendingFilterValues(prev => ({
                                    ...prev,
                                    [currentChannel]: {
                                      ...prev[currentChannel],
                                      [filterDimId]: [],
                                    },
                                  }));
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
                                value={filterSearchTerms[`${currentChannel}-${filterDimId}`] || ''}
                                onChange={(e) => {
                                  setFilterSearchTerms(prev => ({
                                    ...prev,
                                    [`${currentChannel}-${filterDimId}`]: e.target.value
                                  }));
                                }}
                                className="pl-8 h-8"
                              />
                            </div>
                          </div>
                          <ScrollArea className="h-[200px]">
                            <div className="space-y-1 p-1">
                              {(() => {
                                const isLoading = filterValuesLoading[currentChannel]?.[filterDimId];
                                
                                if (isLoading) {
                                  return (
                                    <div className="flex items-center justify-center py-8">
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                                      <span className="text-sm text-muted-foreground">Loading values...</span>
                                    </div>
                                  );
                                }
                                
                                if (!hasValues) {
                                  return (
                                    <div className="text-center py-4 text-muted-foreground text-sm">
                                      Click "Refresh Data" to load filter values
                                    </div>
                                  );
                                }

                                const searchTerm = filterSearchTerms[`${currentChannel}-${filterDimId}`] || '';
                                const filteredList = searchTerm
                                  ? uniqueFilterList.filter(v => 
                                      v.toLowerCase().includes(searchTerm.toLowerCase())
                                    )
                                  : uniqueFilterList;
                                
                                return filteredList.map(value => {
                                  const isSelected = uniquePending.includes(value);
                                  return (
                                    <div
                                      key={value}
                                      className="group flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent text-sm relative"
                                      onClick={() => {
                                        if (isReadOnlyMode) return; // Prevent changes in read-only mode
                                        setPendingFilterValues(prev => {
                                          const current = prev[currentChannel]?.[filterDimId] || [];
                                          const currentUnique = [...new Set(current)];
                                          const newValues = isSelected
                                            ? currentUnique.filter(v => v !== value)
                                            : currentUnique.includes(value)
                                              ? currentUnique
                                              : [...currentUnique, value];
                                          return {
                                            ...prev,
                                            [currentChannel]: {
                                              ...prev[currentChannel],
                                              [filterDimId]: newValues,
                                            },
                                          };
                                        });
                                      }}
                                    >
                                      <Checkbox 
                                        checked={isSelected} 
                                        onCheckedChange={() => {}}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <span className="truncate flex-1">{value}</span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!isReadOnlyMode) {
                                            setPendingFilterValues(prev => ({
                                              ...prev,
                                              [currentChannel]: {
                                                ...prev[currentChannel],
                                                [filterDimId]: [value],
                                              },
                                            }));
                                          }
                                        }}
                                      >
                                        ONLY
                                      </Button>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </ScrollArea>
                          <div className="border-t p-2">
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => {
                                if (isReadOnlyMode) return; // Prevent changes in read-only mode
                                // Apply the pending filter values
                                setFilterValues(prev => ({
                                  ...prev,
                                  [currentChannel]: {
                                    ...prev[currentChannel],
                                    [filterDimId]: uniqueByNormalized(pendingValues),
                                  },
                                }));
                                // Close the popover after applying
                                setOpenFilterPopovers(prev => ({
                                  ...prev,
                                  [popoverKey]: false,
                                }));
                                // Clear search term when closing
                                setFilterSearchTerms(prev => {
                                  const { [popoverKey]: _, ...rest } = prev;
                                  return rest;
                                });
                              }}
                              disabled={isReadOnlyMode}
                            >
                              Apply
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>
            );
          })()}

      {/* Date Filters - Show on all tabs except Budget */}
      {selectedTab !== "budget" && (
        <div className="flex items-center gap-6">
          <DateRangeFilter
            dateRange={customDateRange ?? slideSelectionToDateRange(selectedYear, selectedMonth)}
            datePreset={customDateRange ? derivePresetFromDateRange(customDateRange) : deriveSlideDatePreset(selectedYear, selectedMonth)}
            compareEnabled={comparisonType !== "none"}
            compareType={comparisonType}
            onDatePresetChange={(preset) => {
              if (isReadOnlyMode) return;
              if (preset === "all_time") {
                setCustomDateRange?.(undefined);
                setSelectedYear("all");
                setSelectedMonth("all");
                setComparisonType("none");
                return;
              }
              // Try to resolve via preset → exact DateRange first
              const presetRange = dateRangeFromPreset(preset);
              if (presetRange) {
                setCustomDateRange?.(presetRange);
                // Also sync year/month for backward compat (views saving)
                const next = dateRangeToSlideSelection(presetRange);
                setSelectedYear(next.year);
                setSelectedMonth(next.month);
                return;
              }
              // custom: no-op (user picks in calendar)
            }}
            onDateRangeChange={(range) => {
              if (isReadOnlyMode) return;
              // Always store the exact range
              setCustomDateRange?.(range);
              // Also sync year/month for backward compat
              const next = dateRangeToSlideSelection(range);
              setSelectedYear(next.year);
              setSelectedMonth(next.month);
            }}
            onCompareEnabledChange={(enabled) => {
              if (isReadOnlyMode) return;
              setComparisonType(enabled ? "previous_period" : "none");
            }}
            onCompareTypeChange={(type) => {
              if (isReadOnlyMode) return;
              setComparisonType(type);
            }}
            presets={[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "last_7_days", label: "Last 7 Days" },
              { id: "last_14_days", label: "Last 14 Days" },
              { id: "last_30_days", label: "Last 30 Days" },
              { id: "this_month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "this_year", label: "This Year" },
              { id: "last_year", label: "Last Year" },
              { id: "all_time", label: "All Time" },
            ]}
            showCompare
          />
        </div>
      )}
    </div>
  );
}

/**
 * Inline Month Multi-Select for FiltersRow
 */
const MonthMultiSelectInline = React.memo<{
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  disabled?: boolean;
}>(({ selectedMonth, onMonthChange, disabled }) => {
  const currentMonths = parseSelectedMonths(selectedMonth);
  const currentIndices = currentMonths
    ? currentMonths.map(m => m - 1)
    : [new Date().getMonth()]; // default to current month

  const [pendingIndices, setPendingIndices] = useState<number[]>(currentIndices);
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = (open: boolean) => {
    if (open) {
      const months = parseSelectedMonths(selectedMonth);
      setPendingIndices(months ? months.map(m => m - 1) : [new Date().getMonth()]);
    }
    setIsOpen(open);
  };

  const toggleMonth = (idx: number) => {
    let newIndices: number[];
    if (pendingIndices.includes(idx)) {
      newIndices = pendingIndices.filter(i => i !== idx);
    } else {
      newIndices = [...pendingIndices, idx];
    }
    setPendingIndices(enforceConsecutive(newIndices));
  };

  const handleOnly = (idx: number) => {
    onMonthChange(MONTH_NAMES[idx]);
    setIsOpen(false);
  };

  const handleApply = () => {
    if (pendingIndices.length === 0) {
      onMonthChange(MONTH_NAMES[0]);
    } else {
      const sorted = [...pendingIndices].sort((a, b) => a - b);
      onMonthChange(sorted.map(i => MONTH_NAMES[i]).join(','));
    }
    setIsOpen(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Month:</span>
      <Popover open={isOpen} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-[160px] h-9 justify-between px-4 bg-background"
            disabled={disabled}
          >
            <span className="truncate">{formatSelectedMonths(selectedMonth)}</span>
            <ChevronRight className="h-4 w-4 opacity-50 rotate-90 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0 bg-popover z-50" align="start">
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Months</Label>
            </div>
            <ScrollArea className="h-[280px]">
              <div className="space-y-0.5 p-1">
                {MONTH_NAMES.map((month, idx) => {
                  const isSelected = pendingIndices.includes(idx);
                  return (
                    <div
                      key={month}
                      className="group flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent text-sm"
                      onClick={() => toggleMonth(idx)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => {}}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="truncate flex-1">{month}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOnly(idx);
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
              <Button size="sm" className="w-full" onClick={handleApply}>
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});

MonthMultiSelectInline.displayName = 'MonthMultiSelectInline';
