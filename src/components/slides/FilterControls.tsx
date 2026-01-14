/**
 * Filter Controls Component
 * 
 * Displays filter controls for the SlideViewPage including:
 * - Channel-specific dimension filters (shown on channel tabs)
 * - Date filters (Year, Month)
 * - Comparison type selector (None, Previous Period, Previous Year)
 * 
 * Supports loading states, pending filter values, and automatic value loading
 * from pivot_data or database.
 * 
 * @module FilterControls
 */

import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ChevronRight, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import type { SlideReportPivotData } from '@/types/slideReports';

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface FilterControlsProps {
  selectedTab: string;
  selectedYear: string;
  selectedMonth: string;
  comparisonType: 'none' | 'previous_period' | 'previous_year';
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  onComparisonChange: (type: 'none' | 'previous_period' | 'previous_year') => void;
  // Channel filter props
  currentChannel?: 'metasearch' | 'sem' | 'social';
  filterDimIds?: string[];
  filterDimensionNames?: Record<string, Record<string, string>>;
  filterDimensionValues?: Record<string, Record<string, string[]>>;
  filterValues?: Record<string, Record<string, string[]>>;
  pendingFilterValues?: Record<string, Record<string, string[]>>;
  filterValuesLoading?: Record<string, Record<string, boolean>>;
  dimensions?: Record<string, Dimension[]>;
  pivotData?: SlideReportPivotData | null;
  onFilterValueChange?: (channel: string, dimensionId: string, values: string[]) => void;
  onPendingFilterValueChange?: (channel: string, dimensionId: string, values: string[]) => void;
  onLoadFilterValues?: (channel: string, dimensionId: string) => Promise<string[]>;
  onFilterDimensionNameChange?: (channel: string, dimensionId: string, name: string) => void;
  onFilterLoadingChange?: (channel: string, dimensionId: string, loading: boolean) => void;
}

/**
 * Filter Controls Component
 * 
 * Renders filter dropdowns for channel dimensions, date selection, and comparison types.
 * Handles filter value loading, pending state management, and applies filters to data.
 * 
 * The component is memoized for performance optimization.
 * 
 * @param props - Component props
 * @returns FilterControls component
 */
export const FilterControls = React.memo<FilterControlsProps>(
  ({
    selectedTab,
    selectedYear,
    selectedMonth,
    comparisonType,
    onYearChange,
    onMonthChange,
    onComparisonChange,
    currentChannel,
    filterDimIds = [],
    filterDimensionNames = {},
    filterDimensionValues = {},
    filterValues = {},
    pendingFilterValues = {},
    filterValuesLoading = {},
    dimensions = {},
    pivotData,
    onFilterValueChange,
    onPendingFilterValueChange,
    onLoadFilterValues,
    onFilterDimensionNameChange,
    onFilterLoadingChange,
  }) => {
    const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

    const handleFilterOpen = useCallback(
      async (open: boolean, filterDimId: string) => {
        if (!open || !currentChannel || !onLoadFilterValues) return;

        const filterValuesList = filterDimensionValues[currentChannel]?.[filterDimId] || [];
        const selectedFilterValues = filterValues[currentChannel]?.[filterDimId] || [];
        const hasValues = filterValuesList.length > 0;

        // Initialize pending values with all values by default (all checked)
        if (onPendingFilterValueChange) {
          // If no values are selected, select all by default
          if (selectedFilterValues.length === 0 && filterValuesList.length > 0) {
            onPendingFilterValueChange(currentChannel, filterDimId, [...filterValuesList]);
          } else {
            onPendingFilterValueChange(currentChannel, filterDimId, selectedFilterValues);
          }
        }

        // If values aren't loaded yet, trigger loading immediately
        if (!hasValues && !filterValuesLoading[currentChannel]?.[filterDimId]) {
          if (onFilterLoadingChange) {
            onFilterLoadingChange(currentChannel, filterDimId, true);
          }

          try {
            const values = await onLoadFilterValues(currentChannel, filterDimId);
            if (values.length > 0 && onFilterValueChange) {
              // Update filter dimension values
              const currentValues = filterDimensionValues[currentChannel] || {};
              const updatedValues = {
                ...currentValues,
                [filterDimId]: values,
              };
              // This would need to be handled by parent, but we can call a callback
              // For now, we'll rely on the parent to handle this through the hook
            }

            // Get dimension name
            const channelData = pivotData?.channels?.[currentChannel];
            const dimName =
              (channelData as any)?.dimensionMap?.[filterDimId] ||
              dimensions[currentChannel]?.find((d) => d.id === filterDimId)?.name ||
              filterDimId;

            if (onFilterDimensionNameChange) {
              onFilterDimensionNameChange(currentChannel, filterDimId, dimName);
            }
          } finally {
            if (onFilterLoadingChange) {
              onFilterLoadingChange(currentChannel, filterDimId, false);
            }
          }
        }
      },
      [
        currentChannel,
        filterDimensionValues,
        filterValues,
        filterValuesLoading,
        dimensions,
        pivotData,
        onLoadFilterValues,
        onPendingFilterValueChange,
        onFilterLoadingChange,
        onFilterDimensionNameChange,
        onFilterValueChange,
      ]
    );

    return (
      <div className="flex items-end justify-end gap-6">
        {/* Channel Filter Dropdowns - Show when on channel tabs */}
        {selectedTab !== 'overview' &&
          selectedTab !== 'budget' &&
          currentChannel &&
          filterDimIds.length > 0 && (
            <div className="flex items-center gap-6">
              {filterDimIds.map((filterDimId) => {
                const filterDimName =
                  filterDimensionNames[currentChannel]?.[filterDimId] ||
                  dimensions[currentChannel]?.find((d) => d.id === filterDimId)?.name ||
                  'Filter';
                const filterValuesList = filterDimensionValues[currentChannel]?.[filterDimId] || [];
                const selectedFilterValues = filterValues[currentChannel]?.[filterDimId] || [];
                const pendingValues =
                  pendingFilterValues[currentChannel]?.[filterDimId] ?? selectedFilterValues;
                const isAllSelected =
                  selectedFilterValues.length === 0 ||
                  selectedFilterValues.length === filterValuesList.length;
                const hasValues = filterValuesList.length > 0;
                const isLoading = filterValuesLoading[currentChannel]?.[filterDimId];

                return (
                    <Popover
                    key={`filter-${currentChannel}-${filterDimId}`}
                    onOpenChange={(open) => {
                      handleFilterOpen(open, filterDimId);
                      if (!open) {
                        // Clear search term when closing
                        setSearchTerms(prev => {
                          const key = `${currentChannel}-${filterDimId}`;
                          const { [key]: _, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {filterDimName}:
                        </span>
                        <Button
                          variant="outline"
                          className="h-9 justify-between min-w-[140px] px-4 pt-[20px] pb-[18px]"
                        >
                          <span className="truncate">
                            {isAllSelected
                              ? 'All'
                              : selectedFilterValues.length === 1
                                ? selectedFilterValues[0]
                                : `${selectedFilterValues.length} selected`}
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
                                if (onPendingFilterValueChange) {
                                  onPendingFilterValueChange(
                                    currentChannel,
                                    filterDimId,
                                    [...filterValuesList]
                                  );
                                }
                              }}
                            >
                              All
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => {
                                if (onPendingFilterValueChange) {
                                  onPendingFilterValueChange(currentChannel, filterDimId, []);
                                }
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
                              value={searchTerms[`${currentChannel}-${filterDimId}`] || ''}
                              onChange={(e) => {
                                setSearchTerms(prev => ({
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
                            {isLoading ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                                <span className="text-sm text-muted-foreground">
                                  Loading values...
                                </span>
                              </div>
                            ) : hasValues ? (
                              (() => {
                                const searchTerm = searchTerms[`${currentChannel}-${filterDimId}`] || '';
                                const filteredList = searchTerm
                                  ? filterValuesList.filter(v => 
                                      v.toLowerCase().includes(searchTerm.toLowerCase())
                                    )
                                  : filterValuesList;
                                
                                return filteredList.map((value) => {
                                  const isSelected = pendingValues.includes(value);
                                  return (
                                    <div
                                      key={value}
                                      className="group flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent text-sm relative"
                                      onClick={() => {
                                        if (onPendingFilterValueChange) {
                                          const current =
                                            pendingFilterValues[currentChannel]?.[filterDimId] || [];
                                          const newValues = isSelected
                                            ? current.filter((v) => v !== value)
                                            : [...current, value];
                                          onPendingFilterValueChange(
                                            currentChannel,
                                            filterDimId,
                                            newValues
                                          );
                                        }
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
                                          if (onPendingFilterValueChange) {
                                            onPendingFilterValueChange(
                                              currentChannel,
                                              filterDimId,
                                              [value]
                                            );
                                          }
                                        }}
                                      >
                                        ONLY
                                      </Button>
                                    </div>
                                  );
                                });
                              })()
                            ) : (
                              <div className="text-center py-4 text-muted-foreground text-sm">
                                Click "Refresh Data" to load filter values
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                        <div className="border-t p-2">
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              if (onFilterValueChange) {
                                onFilterValueChange(currentChannel, filterDimId, pendingValues);
                              }
                            }}
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
          )}

        {/* Date Filters - Show on all tabs except Budget */}
        {selectedTab !== 'budget' && (
          <div className="flex items-center gap-6">
            {/* Year Filter */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Year:
              </span>
              <Select value={selectedYear} onValueChange={onYearChange}>
                <SelectTrigger className="w-[130px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Month Filter */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Month:
              </span>
              <Select value={selectedMonth} onValueChange={onMonthChange}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTH_NAMES.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Comparison dropdown */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Compare:
              </span>
              <Select value={comparisonType} onValueChange={onComparisonChange}>
                <SelectTrigger className="w-[160px] bg-background">
                  <SelectValue placeholder="No Comparison" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Comparison</SelectItem>
                  <SelectItem value="previous_period">Previous Period</SelectItem>
                  <SelectItem value="previous_year">Previous Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    );
  }
);

FilterControls.displayName = 'FilterControls';

/**
 * Comparison Info Banner Component
 * 
 * Displays a banner showing the current comparison configuration (Previous Period
 * or Previous Year) with the selected date range.
 * 
 * @param props - Component props
 * @param props.selectedTab - Currently selected tab
 * @param props.comparisonType - Type of comparison being performed
 * @param props.selectedYear - Selected year filter
 * @param props.selectedMonth - Selected month filter
 * @returns ComparisonInfoBanner component or null if comparison is disabled
 */
export const ComparisonInfoBanner = React.memo<{
  selectedTab: string;
  comparisonType: 'none' | 'previous_period' | 'previous_year';
  selectedYear: string;
  selectedMonth: string;
}>(({ selectedTab, comparisonType, selectedYear, selectedMonth }) => {
  if (selectedTab === 'budget' || comparisonType === 'none') {
    return null;
  }

  return (
    <div className="mb-4 p-3 bg-muted rounded-lg text-sm">
      {comparisonType === 'previous_period' && (
        <span>
          Comparing {selectedYear !== 'all' ? selectedYear : 'Current Period'}
          {selectedMonth !== 'all' ? ` ${selectedMonth}` : ''} vs Previous Period
        </span>
      )}
      {comparisonType === 'previous_year' && (
        <span>
          Comparing {selectedYear !== 'all' ? selectedYear : 'Current Year'}
          {selectedMonth !== 'all' ? ` ${selectedMonth}` : ''} vs Previous Year
        </span>
      )}
    </div>
  );
});

ComparisonInfoBanner.displayName = 'ComparisonInfoBanner';
