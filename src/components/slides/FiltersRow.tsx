import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookmarkPlus, Trash2, Filter, Share2, RefreshCw, Loader2 } from "lucide-react";
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
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  customDateRange?: DateRange | undefined;
  setCustomDateRange?: (range: DateRange | undefined) => void;
  comparisonType: string;
  setComparisonType: (type: string) => void;
  onOpenFilters: () => void;
  onShare: () => void;
  onRefreshData: () => void;
  isRefreshInProgress: boolean;
  showRefreshButton: boolean;
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
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  customDateRange,
  setCustomDateRange,
  comparisonType,
  setComparisonType,
  onOpenFilters,
  onShare,
  onRefreshData,
  isRefreshInProgress,
  showRefreshButton,
}: FiltersRowProps) {
  return (
    <div className="flex flex-nowrap items-center justify-between gap-4">
      {/* Left: view + date range */}
      <div className="flex flex-nowrap items-center gap-6 flex-1 min-w-0">
      {/* View selector - Show when on overview tab */}
      {selectedTab === "overview" && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">View:</span>
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
      )}

      {/* Date Filters - Show on all tabs except Budget */}
      {selectedTab !== "budget" && (
        <div className="flex items-center shrink-0">
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
      </div>{/* end left */}

      {/* Right: Filters, Share, Refresh Data — same row as view + date range */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onOpenFilters}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onShare}
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>
        {showRefreshButton && (
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 bg-primary hover:bg-primary/90"
            onClick={onRefreshData}
            disabled={isRefreshInProgress}
          >
            {isRefreshInProgress ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh Data
          </Button>
        )}
      </div>
    </div>
  );
}

