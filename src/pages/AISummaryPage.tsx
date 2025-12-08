import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Plus, Trash2, Loader2, Settings, MoreHorizontal, Database, Pencil, Share2 } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ReportsSidebar } from "@/components/ReportsSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AddAICardModal } from "@/components/AddAICardModal";
import { CreateShareLinkModal } from "@/components/CreateShareLinkModal";
import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/auth";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { format, subMonths, startOfYear } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FormattedAISummary from "@/components/FormattedAISummary";
import GenerateAISummaryModal, { type ComparisonOption } from "@/components/GenerateAISummaryModal";
import { 
  AISummaryPivotTable, 
  type CachedPivotData,
  type DateBreakdownRow,
  type DateTab,
  type ReportTab,
  getDateRange,
  getComparisonDateRange,
  aggregateMetrics,
  getDateGroupKey,
  parseDate,
} from "@/components/AISummaryPivotTable";
import { type DateTab as SidebarDateTab, type ReportTab as SidebarReportTab } from "@/components/ReportsSidebar";

interface AISummaryCard {
  id: string;
  name: string;
  report_ids: string[];
  report_configs: Record<string, any>;
  selected_metrics: string[];
  since_date: string;
  ai_prompt: string;
  generated_summary: string | null;
  last_generated_at: string | null;
  created_at: string;
  cached_pivot_data?: CachedPivotData | null;
  pivot_data_refreshed_at?: string | null;
}

interface Report {
  id: string;
  name: string;
}

interface DataSource {
  id: string;
  report_id: string;
  name: string;
  source_type: "google_sheets" | "csv_url";
  spreadsheet_id: string | null;
  google_sheets_url: string | null;
  csv_url: string | null;
  tab_name: string | null;
  header_row: number;
  column_mappings: any[] | null;
}

const AISummaryPage = () => {
  const { accountId, summaryId } = useParams();
  const navigate = useNavigate();
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [cards, setCards] = useState<AISummaryCard[]>([]);
  const [editingCard, setEditingCard] = useState<AISummaryCard | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generatingCardId, setGeneratingCardId] = useState<string | null>(null);
  const [viewingSummary, setViewingSummary] = useState<AISummaryCard | null>(null);
  const [refreshingPivotCardId, setRefreshingPivotCardId] = useState<string | null>(null);
  const [renamingCardId, setRenamingCardId] = useState<string | null>(null);
  const [newCardName, setNewCardName] = useState("");
  const [generateModalCard, setGenerateModalCard] = useState<AISummaryCard | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(summaryId || null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedDateTab, setSelectedDateTab] = useState<DateTab>(format(new Date(), "yyyy-MM"));
  const [selectedReportTab, setSelectedReportTab] = useState<ReportTab>("overview");
  const [selectedDatePeriod, setSelectedDatePeriod] = useState<string>(format(new Date(), "yyyy-MM"));

  // Generate date options: YTD at top, then MTD (current month), then previous months
  const dateOptions = React.useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    const yearStart = startOfYear(now);
    const currentMonthKey = format(now, "yyyy-MM");
    
    // Add YTD at the top
    options.push({ value: "ytd", label: "YTD" });
    
    // Start from current month and go back to January
    let current = now;
    while (current >= yearStart) {
      const monthKey = format(current, "yyyy-MM");
      // Label current month as "MTD", others as month name
      const monthLabel = monthKey === currentMonthKey ? "MTD" : format(current, "MMMM yyyy");
      options.push({ value: monthKey, label: monthLabel });
      current = subMonths(current, 1);
    }
    
    return options;
  }, []);

  const fetchCards = async () => {
    try {
      const { user } = await getUser();
      if (!user) return;

      const query = (supabase.from("ai_summary_cards") as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (accountId) {
        query.eq("account_id", accountId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching AI cards:", error);
        return;
      }

      setCards((data || []) as AISummaryCard[]);
    } catch (err) {
      console.error("Error fetching AI cards:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchReports = async () => {
    if (!accountId) return;

    const { data, error } = await supabase
      .from("reports")
      .select("id, name")
      .eq("account_id", accountId);

    if (!error && data) {
      setReports(data);
    }
  };

  useEffect(() => {
    fetchCards();
    fetchReports();
  }, [accountId]);

  // Update selectedCardId when summaryId from URL changes
  useEffect(() => {
    if (summaryId) {
      setSelectedCardId(summaryId);
    }
  }, [summaryId]);

  const handleBack = () => {
    if (accountId) {
      navigate(`/tools/report/${accountId}`);
    } else {
      navigate("/");
    }
  };

  const handleDeleteCard = async () => {
    if (!deleteCardId) return;
    
    setIsDeleting(true);
    try {
      const { error } = await (supabase.from("ai_summary_cards") as any)
        .delete()
        .eq("id", deleteCardId);

      if (error) {
        toast.error("Failed to delete card");
        return;
      }

      toast.success("Card deleted");
      setCards(prev => prev.filter(c => c.id !== deleteCardId));
    } catch (err) {
      toast.error("Failed to delete card");
    } finally {
      setIsDeleting(false);
      setDeleteCardId(null);
    }
  };

  const handleRefreshPivotData = async (card: AISummaryCard) => {
    setRefreshingPivotCardId(card.id);
    
    try {
      const { user } = await getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      toast.info("Refreshing pivot data from sources...", { id: "refresh-pivot" });

      // Generate month keys for the current year (from January to current month)
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed
      const monthKeys: string[] = [];
      for (let m = 0; m <= currentMonth; m++) {
        monthKeys.push(format(new Date(currentYear, m, 1), "yyyy-MM"));
      }

      const pivotData: CachedPivotData = {
        mtd: [],
        ytd: [],
        monthly_data: {},
      };
      
      // Initialize monthly_data for each month
      monthKeys.forEach(monthKey => {
        pivotData.monthly_data![monthKey] = [];
      });
      
      // Initialize breakdown data structures
      const breakdownData: Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>> = {};
      const breakdownDimensionNames: Record<string, string> = {}; // Map of reportId -> dimension name
      const combinedDateBreakdown: Record<string, DateBreakdownRow[]> = {
        mtd: [], ytd: []
      };
      // Initialize combined date breakdown for each month
      monthKeys.forEach(monthKey => {
        combinedDateBreakdown[monthKey] = [];
      });
      
      // Track actual data date ranges per report for display
      const actualDataRanges: Record<string, { reportName: string; firstDate: Date | null; lastDate: Date | null }> = {};
      
      // To accumulate all rows for combined date breakdown
      const allRowsForDateBreakdown: any[] = [];
      const allMetricNameToIdMaps: Record<string, string>[] = [];
      
      // Initialize comparison data
      const comparisonPreviousPeriod: {
        mtd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
        ytd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
        monthly_data?: Record<string, Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>>;
        breakdown_data?: Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>>;
      } = {
        mtd: [], ytd: [], monthly_data: {}, breakdown_data: {}
      };
      const comparisonPreviousYear: {
        mtd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
        ytd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
        monthly_data?: Record<string, Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>>;
        breakdown_data?: Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>>;
      } = {
        mtd: [], ytd: [], monthly_data: {}, breakdown_data: {}
      };
      
      // Initialize comparison monthly data
      monthKeys.forEach(monthKey => {
        comparisonPreviousPeriod.monthly_data![monthKey] = [];
        comparisonPreviousYear.monthly_data![monthKey] = [];
      });

      // Build date ranges for all tabs (mtd, ytd, and each month)
      const allDateTabs = ["mtd", "ytd", ...monthKeys];
      const dateRanges: Record<string, { start: Date; end: Date }> = {};
      allDateTabs.forEach(tab => {
        dateRanges[tab] = getDateRange(tab);
      });
      
      // Comparison date ranges for all tabs
      const comparisonRanges: Record<string, Record<string, { start: Date; end: Date } | null>> = {
        previous_period: {},
        previous_year: {},
      };
      allDateTabs.forEach(tab => {
        comparisonRanges.previous_period[tab] = getComparisonDateRange(tab, "previous_period");
        comparisonRanges.previous_year[tab] = getComparisonDateRange(tab, "previous_year");
      });

      // Extract filter configs from report_configs
      const { breakdown_configs, ...filterConfigs } = card.report_configs as any;

      for (const reportId of card.report_ids) {
        // Fetch report info
        const { data: reportData } = await supabase
          .from("reports")
          .select("id, name")
          .eq("id", reportId)
          .single();

        if (!reportData) continue;

        // Fetch data source
        const { data: dsData } = await supabase
          .from("data_sources")
          .select("*")
          .eq("report_id", reportId)
          .limit(1)
          .single();

        if (!dsData) continue;

        // Build metric name to dimension ID mapping from column_mappings
        const columnMappings = Array.isArray(dsData.column_mappings) ? dsData.column_mappings : [];
        const metricNameToIdMap: Record<string, string> = {};
        columnMappings.forEach((m: any) => {
          if (m.dimensionName && m.dimensionId && m.dimensionId !== 'none') {
            metricNameToIdMap[m.dimensionName] = m.dimensionId;
          }
        });
        
        // Build dimension ID to column header mapping for lookups
        const dimIdToColumnHeader: Record<string, string> = {};
        columnMappings.forEach((m: any) => {
          if (m.dimensionId && m.dimensionId !== 'none' && m.columnHeader) {
            dimIdToColumnHeader[m.dimensionId] = m.columnHeader;
          }
        });
        
        // Helper to get breakdown value from row data
        const getBreakdownValue = (rowData: any, dimId: string, dimName: string): string | undefined => {
          // Try dimension ID first
          if (rowData[dimId] !== undefined && rowData[dimId] !== null && rowData[dimId] !== '') {
            return String(rowData[dimId]);
          }
          // Try dimension name
          if (dimName && rowData[dimName] !== undefined && rowData[dimName] !== null && rowData[dimName] !== '') {
            return String(rowData[dimName]);
          }
          // Try column header from mappings
          const columnHeader = dimIdToColumnHeader[dimId];
          if (columnHeader && rowData[columnHeader] !== undefined && rowData[columnHeader] !== null && rowData[columnHeader] !== '') {
            return String(rowData[columnHeader]);
          }
          return undefined;
        };

        // Fetch source data
        const sourceData = await fetchSourceData(dsData as DataSource, user.id, accountId);
        
        if (!sourceData?.transformedRows) continue;
        
        // Track actual date range for this report
        const allDates = sourceData.transformedRows
          .map((row: any) => parseDate(row.Date || row.date))
          .filter((d: Date | null): d is Date => d !== null)
          .sort((a: Date, b: Date) => a.getTime() - b.getTime());
        
        actualDataRanges[reportId] = {
          reportName: reportData.name,
          firstDate: allDates.length > 0 ? allDates[0] : null,
          lastDate: allDates.length > 0 ? allDates[allDates.length - 1] : null,
        };

        // Get dimension filter for this report
        const filterConfig = filterConfigs[reportId];
        let dimensionFilter: { dimensionId: string; dimensionName?: string; values: string[] } | undefined;

        if (filterConfig?.dimensionId && filterConfig.selectedValues?.length > 0) {
          const { data: dimData } = await supabase
            .from("dimensions")
            .select("name")
            .eq("id", filterConfig.dimensionId)
            .single();

          dimensionFilter = {
            dimensionId: filterConfig.dimensionId,
            dimensionName: dimData?.name,
            values: filterConfig.selectedValues,
          };
        }

        // Aggregate metrics for each date range (mtd, ytd, and each month)
        allDateTabs.forEach((tab) => {
          const metrics = aggregateMetrics(
            sourceData.transformedRows,
            card.selected_metrics,
            dateRanges[tab],
            dimensionFilter,
            metricNameToIdMap
          );

          const reportEntry = {
            reportId: reportData.id,
            reportName: reportData.name,
            metrics,
          };

          // Store in appropriate location
          if (tab === "mtd") {
            pivotData.mtd.push(reportEntry);
          } else if (tab === "ytd") {
            pivotData.ytd.push(reportEntry);
          } else {
            // Individual month
            pivotData.monthly_data![tab].push(reportEntry);
          }
          
          // Compute comparison data - Previous Period
          const prevPeriodRange = comparisonRanges.previous_period[tab];
          if (prevPeriodRange) {
            const prevPeriodMetrics = aggregateMetrics(
              sourceData.transformedRows,
              card.selected_metrics,
              prevPeriodRange,
              dimensionFilter,
              metricNameToIdMap
            );
            const compEntry = {
              reportId: reportData.id,
              reportName: reportData.name,
              metrics: prevPeriodMetrics,
            };
            if (tab === "mtd") {
              comparisonPreviousPeriod.mtd.push(compEntry);
            } else if (tab === "ytd") {
              comparisonPreviousPeriod.ytd.push(compEntry);
            } else {
              comparisonPreviousPeriod.monthly_data![tab].push(compEntry);
            }
          }
          
          // Compute comparison data - Previous Year
          const prevYearRange = comparisonRanges.previous_year[tab];
          if (prevYearRange) {
            const prevYearMetrics = aggregateMetrics(
              sourceData.transformedRows,
              card.selected_metrics,
              prevYearRange,
              dimensionFilter,
              metricNameToIdMap
            );
            const compEntry = {
              reportId: reportData.id,
              reportName: reportData.name,
              metrics: prevYearMetrics,
            };
            if (tab === "mtd") {
              comparisonPreviousYear.mtd.push(compEntry);
            } else if (tab === "ytd") {
              comparisonPreviousYear.ytd.push(compEntry);
            } else {
              comparisonPreviousYear.monthly_data![tab].push(compEntry);
            }
          }
        });

        // Build breakdown data if configured - support multiple breakdown dimensions
        const breakdownConfig = breakdown_configs?.[reportId];
        const breakdownDimensionIds = breakdownConfig?.breakdownDimensionIds || 
          (breakdownConfig?.breakdownDimensionId ? [breakdownConfig.breakdownDimensionId] : []); // Support legacy format
        
        for (const breakdownDimId of breakdownDimensionIds) {
          const { data: breakdownDimData } = await supabase
            .from("dimensions")
            .select("name")
            .eq("id", breakdownDimId)
            .single();
          
          const breakdownDimName = breakdownDimData?.name || 'Group';
          
          // Use composite key: reportId_dimensionId
          const breakdownKey = `${reportId}_${breakdownDimId}`;
          
          // Store the dimension name for this breakdown
          breakdownDimensionNames[breakdownKey] = breakdownDimName;
          
          // DEBUG: Log column mappings and dimension info
          console.log(`[Breakdown Debug] Dimension ID: ${breakdownDimId}, Name: ${breakdownDimName}`);
          console.log(`[Breakdown Debug] dimIdToColumnHeader:`, dimIdToColumnHeader);
          console.log(`[Breakdown Debug] Column header for this dim:`, dimIdToColumnHeader[breakdownDimId]);
          
          // First filter rows by dimension filter, then get unique breakdown values
          const filteredByDimension = sourceData.transformedRows.filter((row: any) => {
            if (!dimensionFilter || dimensionFilter.values.length === 0) return true;
            const rowData = row.dimension_values || row;
            const dimVal = rowData[dimensionFilter.dimensionId] || 
                           (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
            return dimVal !== undefined && dimensionFilter.values.includes(String(dimVal));
          });
          
          // DEBUG: Log sample row data
          if (filteredByDimension.length > 0) {
            const sampleRow = filteredByDimension[0];
            const sampleRowData = sampleRow.dimension_values || sampleRow;
            console.log(`[Breakdown Debug] Sample row keys:`, Object.keys(sampleRowData));
            console.log(`[Breakdown Debug] Sample row data (first 5 keys):`, 
              Object.fromEntries(Object.entries(sampleRowData).slice(0, 10))
            );
          }
          
          // Get unique values for this breakdown dimension from filtered rows only
          const uniqueValues = new Set<string>();
          let hasUncategorized = false;
          
          filteredByDimension.forEach((row: any) => {
            const rowData = row.dimension_values || row;
            const val = getBreakdownValue(rowData, breakdownDimId, breakdownDimName);
            if (val !== undefined) {
              uniqueValues.add(val);
            } else {
              hasUncategorized = true;
            }
          });
          
          console.log(`[Breakdown Debug] Unique values found:`, Array.from(uniqueValues));
          console.log(`[Breakdown Debug] Has uncategorized:`, hasUncategorized);

          // Initialize breakdown data for all date tabs
          breakdownData[breakdownKey] = {};
          allDateTabs.forEach(tab => {
            breakdownData[breakdownKey][tab] = [];
          });
          
          // Initialize comparison breakdown data for this breakdown
          if (!comparisonPreviousPeriod.breakdown_data) comparisonPreviousPeriod.breakdown_data = {};
          if (!comparisonPreviousYear.breakdown_data) comparisonPreviousYear.breakdown_data = {};
          comparisonPreviousPeriod.breakdown_data[breakdownKey] = {};
          comparisonPreviousYear.breakdown_data[breakdownKey] = {};
          allDateTabs.forEach(tab => {
            comparisonPreviousPeriod.breakdown_data![breakdownKey][tab] = [];
            comparisonPreviousYear.breakdown_data![breakdownKey][tab] = [];
          });
          
          allDateTabs.forEach((tab) => {
            // Process each named group
            uniqueValues.forEach((groupValue) => {
              // Filter rows for this specific group value
              const groupRows = filteredByDimension.filter((row: any) => {
                const rowData = row.dimension_values || row;
                const groupVal = getBreakdownValue(rowData, breakdownDimId, breakdownDimName);
                return groupVal === groupValue;
              });
              
              // Main metrics
              const metrics = aggregateMetrics(
                groupRows,
                card.selected_metrics,
                dateRanges[tab],
                undefined, // Already filtered
                metricNameToIdMap
              );

              breakdownData[breakdownKey][tab].push({
                groupValue,
                metrics,
              });
              
              // Comparison - Previous Period
              const prevPeriodRange = comparisonRanges.previous_period[tab];
              if (prevPeriodRange) {
                const prevPeriodMetrics = aggregateMetrics(
                  groupRows,
                  card.selected_metrics,
                  prevPeriodRange,
                  undefined,
                  metricNameToIdMap
                );
                comparisonPreviousPeriod.breakdown_data![breakdownKey][tab].push({
                  groupValue,
                  metrics: prevPeriodMetrics,
                });
              }
              
              // Comparison - Previous Year
              const prevYearRange = comparisonRanges.previous_year[tab];
              if (prevYearRange) {
                const prevYearMetrics = aggregateMetrics(
                  groupRows,
                  card.selected_metrics,
                  prevYearRange,
                  undefined,
                  metricNameToIdMap
                );
                comparisonPreviousYear.breakdown_data![breakdownKey][tab].push({
                  groupValue,
                  metrics: prevYearMetrics,
                });
              }
            });
            
            // Add Uncategorized group for rows without breakdown value
            if (hasUncategorized) {
              const uncategorizedRows = filteredByDimension.filter((row: any) => {
                const rowData = row.dimension_values || row;
                const val = getBreakdownValue(rowData, breakdownDimId, breakdownDimName);
                return val === undefined;
              });
              
              const metrics = aggregateMetrics(
                uncategorizedRows,
                card.selected_metrics,
                dateRanges[tab],
                undefined,
                metricNameToIdMap
              );

              breakdownData[breakdownKey][tab].push({
                groupValue: 'Uncategorized',
                metrics,
              });
              
              // Comparison for Uncategorized
              const prevPeriodRange = comparisonRanges.previous_period[tab];
              if (prevPeriodRange) {
                const prevPeriodMetrics = aggregateMetrics(
                  uncategorizedRows,
                  card.selected_metrics,
                  prevPeriodRange,
                  undefined,
                  metricNameToIdMap
                );
                comparisonPreviousPeriod.breakdown_data![breakdownKey][tab].push({
                  groupValue: 'Uncategorized',
                  metrics: prevPeriodMetrics,
                });
              }
              
              const prevYearRange = comparisonRanges.previous_year[tab];
              if (prevYearRange) {
                const prevYearMetrics = aggregateMetrics(
                  uncategorizedRows,
                  card.selected_metrics,
                  prevYearRange,
                  undefined,
                  metricNameToIdMap
                );
                comparisonPreviousYear.breakdown_data![breakdownKey][tab].push({
                  groupValue: 'Uncategorized',
                  metrics: prevYearMetrics,
                });
              }
            }
          });
        } // End of loop for each breakdown dimension
        
        // Collect rows for combined date breakdown (across all reports)
        // Get rows filtered by dimension filter
        const baseRows = sourceData.transformedRows.filter((row: any) => {
          if (!dimensionFilter || dimensionFilter.values.length === 0) return true;
          const rowData = row.dimension_values || row;
          const dimVal = rowData[dimensionFilter.dimensionId] || 
                         (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
          return dimVal !== undefined && dimensionFilter.values.includes(String(dimVal));
        });
        
        allRowsForDateBreakdown.push(...baseRows);
        allMetricNameToIdMaps.push(metricNameToIdMap);
      }
      
      // Build combined date breakdown after processing all reports
      const mergedMetricMap: Record<string, string> = {};
      allMetricNameToIdMaps.forEach(map => Object.assign(mergedMetricMap, map));
      const dateDimId = mergedMetricMap['Date'] || mergedMetricMap['date'] || mergedMetricMap['Day'];
      
      allDateTabs.forEach((tab) => {
        const dateRange = dateRanges[tab];
        
        // Group all rows by date group (week or month)
        const dateGroups: Record<string, { rows: any[], minDate: Date | null, maxDate: Date | null }> = {};
        
        allRowsForDateBreakdown.forEach((row: any) => {
          const rowData = row.dimension_values || row;
          let dateValue: any = rowData.Date || rowData.date || rowData.Day || rowData.day;
          if (!dateValue && dateDimId) {
            dateValue = rowData[dateDimId];
          }
          if (!dateValue) {
            for (const [key, val] of Object.entries(rowData)) {
              if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
                dateValue = val;
                break;
              }
            }
          }
          
          const rowDate = parseDate(dateValue);
          if (!rowDate) return;
          
          // Check if within date range
          if (rowDate < dateRange.start || rowDate > dateRange.end) return;
          
          const groupKey = getDateGroupKey(rowDate, tab);
          if (!dateGroups[groupKey]) {
            dateGroups[groupKey] = { rows: [], minDate: null, maxDate: null };
          }
          dateGroups[groupKey].rows.push(row);
          
          // Track min/max dates for this group
          if (!dateGroups[groupKey].minDate || rowDate < dateGroups[groupKey].minDate) {
            dateGroups[groupKey].minDate = rowDate;
          }
          if (!dateGroups[groupKey].maxDate || rowDate > dateGroups[groupKey].maxDate) {
            dateGroups[groupKey].maxDate = rowDate;
          }
        });
        
        // Aggregate metrics for each date group
        Object.entries(dateGroups).forEach(([dateGroup, groupData]) => {
          const metrics = aggregateMetrics(
            groupData.rows,
            card.selected_metrics,
            dateRange,
            undefined,
            mergedMetricMap
          );
          
          combinedDateBreakdown[tab].push({
            dateGroup,
            dateRangeStart: groupData.minDate?.toISOString(),
            dateRangeEnd: groupData.maxDate?.toISOString(),
            metrics,
          });
        });
        
        // Sort by date group
        combinedDateBreakdown[tab].sort((a, b) => 
          a.dateGroup.localeCompare(b.dateGroup)
        );
      });

      toast.dismiss("refresh-pivot");

      // Build complete pivot data with all breakdowns, comparisons, and actual data ranges
      const completePivotData = { 
        ...pivotData, 
        breakdown_data: breakdownData, 
        breakdown_dimension_names: breakdownDimensionNames,
        combined_date_breakdown: combinedDateBreakdown,
        comparison_previous_period: comparisonPreviousPeriod,
        comparison_previous_year: comparisonPreviousYear,
        actual_data_ranges: Object.fromEntries(
          Object.entries(actualDataRanges).map(([reportId, info]) => [
            reportId,
            {
              reportName: info.reportName,
              firstDate: info.firstDate?.toISOString() || null,
              lastDate: info.lastDate?.toISOString() || null,
            }
          ])
        ),
      };

      // Save to database including breakdown data and date breakdown data
      const { error } = await (supabase.from("ai_summary_cards") as any)
        .update({
          cached_pivot_data: completePivotData,
          pivot_data_refreshed_at: new Date().toISOString(),
        })
        .eq("id", card.id);

      if (error) {
        toast.error("Failed to save pivot data");
        return;
      }

      // Update local state
      setCards(prev => prev.map(c => 
        c.id === card.id 
          ? { ...c, cached_pivot_data: completePivotData, pivot_data_refreshed_at: new Date().toISOString() }
          : c
      ));

      // Build summary of data ranges for each report
      const dataRangeSummaries = Object.values(actualDataRanges)
        .map(info => {
          if (info.lastDate) {
            return `${info.reportName}: ${format(info.lastDate, "MMM d, yyyy")}`;
          }
          return `${info.reportName}: No data`;
        })
        .join("\n");

      toast.success(
        <div className="space-y-1">
          <div className="font-medium">Pivot data refreshed!</div>
          <div className="text-xs text-muted-foreground whitespace-pre-line">
            Latest data available:
            {"\n"}{dataRangeSummaries}
          </div>
        </div>,
        { duration: 6000 }
      );
    } catch (err) {
      console.error("Error refreshing pivot data:", err);
      toast.error("Failed to refresh pivot data");
    } finally {
      setRefreshingPivotCardId(null);
    }
  };

  const handleOpenGenerateModal = (card: AISummaryCard) => {
    // Check if pivot data exists first
    if (!card.cached_pivot_data || Object.keys(card.cached_pivot_data).length === 0) {
      toast.error("Please refresh the pivot data first before generating a summary");
      return;
    }
    setGenerateModalCard(card);
  };

  const handleGenerateSummary = async (comparisonType: ComparisonOption, selectedPeriods: string[]) => {
    const card = generateModalCard;
    if (!card) return;
    
    setGenerateModalCard(null); // Close modal
    setGeneratingCardId(card.id);
    
    // Update selected date period for display
    if (selectedPeriods.length > 0) {
      setSelectedDatePeriod(selectedPeriods[0]);
    }
    
    try {
      const { user } = await getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      toast.info("Generating AI summary with GPT-4 Turbo...");

      // Get the session token
      const { data: { session } } = await supabase.auth.getSession();
      
      // Call the edge function with a direct fetch for better error handling
      const response = await fetch('https://zcxxwpwheevwavdcgfht.supabase.co/functions/v1/generate-ai-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjeHh3cHdoZWV2d2F2ZGNnZmh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4Mzg1MjAsImV4cCI6MjA3NzQxNDUyMH0.zKmexYsPTkNWa65kjH5H6_aMosY9rHHj0lqg8j4T3Lc'
        },
        body: JSON.stringify({
          cardId: card.id,
          pivotData: card.cached_pivot_data,
          selectedMetrics: card.selected_metrics,
          reportConfigs: card.report_configs,
          aiPrompt: card.ai_prompt,
          comparisonType: comparisonType,
          selectedPeriods: selectedPeriods
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error calling AI function:", response.status, errorText);
        toast.error(`Failed to generate summary: ${response.status}`);
        return;
      }

      const result = await response.json();

      if (result?.error) {
        console.error("AI function error:", result.error);
        toast.error(result.error);
        return;
      }

      // Merge table insights and executive summaries into cached_pivot_data
      const updatedPivotData = {
        ...card.cached_pivot_data,
        table_insights: result.tableInsights || {},
        executive_summaries: result.executiveSummaries || {}
      };

      // Update the card with the generated summary and table insights
      const { error: updateError } = await (supabase.from("ai_summary_cards") as any)
        .update({
          generated_summary: result.summary, // Backwards compatibility (last_month)
          cached_pivot_data: updatedPivotData,
          last_generated_at: new Date().toISOString()
        })
        .eq("id", card.id);

      if (updateError) {
        console.error("Error updating card:", updateError);
        toast.error("Failed to save summary");
        return;
      }

      // Update local state
      setCards(prev => prev.map(c => 
        c.id === card.id 
          ? { 
              ...c, 
              generated_summary: result.summary, 
              cached_pivot_data: updatedPivotData,
              last_generated_at: new Date().toISOString() 
            }
          : c
      ));

      toast.success("AI Summary generated!");
      
      // Show the generated summary
      setViewingSummary({ ...card, generated_summary: result.summary });

    } catch (err) {
      console.error("Error generating summary:", err);
      toast.error("Failed to generate summary");
    } finally {
      setGeneratingCardId(null);
    }
  };

  const handleOpenSettings = (card: AISummaryCard) => {
    setEditingCard(card);
    setIsAddCardModalOpen(true);
  };

  const handleStartRename = (card: AISummaryCard) => {
    setRenamingCardId(card.id);
    setNewCardName(card.name);
  };

  const handleRenameCard = async (cardId: string) => {
    if (!newCardName.trim()) {
      setRenamingCardId(null);
      return;
    }

    try {
      const { error } = await (supabase.from("ai_summary_cards") as any)
        .update({ name: newCardName.trim() })
        .eq("id", cardId);

      if (error) {
        toast.error("Failed to rename card");
        return;
      }

      setCards(prev => prev.map(c => 
        c.id === cardId ? { ...c, name: newCardName.trim() } : c
      ));
      toast.success("Card renamed");
    } catch (err) {
      toast.error("Failed to rename card");
    } finally {
      setRenamingCardId(null);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* Compute report tabs for the selected AI Summary card */}
        {(() => {
          const selectedCard = summaryId ? cards.find(c => c.id === summaryId) : null;
          const aiSummaryReportTabs = selectedCard 
            ? reports.filter(r => selectedCard.report_ids.includes(r.id))
            : [];
          
          return (
            <ReportsSidebar
              reports={reports.map(r => ({ 
                id: r.id, 
                name: r.name, 
                account_id: accountId || null,
                created_at: '',
                updated_at: ''
              }))}
              accountId={accountId}
              selectedAISummaryId={summaryId}
              aiSummaries={cards.map(c => ({ id: c.id, name: c.name }))}
              onAddAISummary={() => setIsAddCardModalOpen(true)}
              showDateTabs={!!summaryId}
              selectedDateTab={selectedDateTab}
              onDateTabChange={setSelectedDateTab}
              aiSummaryReportTabs={aiSummaryReportTabs}
              selectedReportTab={selectedReportTab}
              onReportTabChange={setSelectedReportTab}
            />
          );
        })()}
        
        <div className="flex-1 flex flex-col">
          <div className="border-b">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="icon" onClick={handleBack}>
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h1 className="text-xl font-semibold">AI Summary</h1>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => setIsAddCardModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add card
                  </Button>
                  <Button variant="outline" onClick={() => setIsShareModalOpen(true)}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-8 flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No AI Summary Cards</h2>
            <p className="text-muted-foreground max-w-md">
              Click "Add card" to create an AI-powered executive summary based on your report data.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {cards
              .filter(card => !selectedCardId || card.id === selectedCardId)
              .map(card => (
              <Card key={card.id} className="overflow-hidden group">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <div className="grid grid-cols-2 gap-0.5">
                        <div className="w-1 h-1 rounded-full bg-current" />
                        <div className="w-1 h-1 rounded-full bg-current" />
                        <div className="w-1 h-1 rounded-full bg-current" />
                        <div className="w-1 h-1 rounded-full bg-current" />
                        <div className="w-1 h-1 rounded-full bg-current" />
                        <div className="w-1 h-1 rounded-full bg-current" />
                      </div>
                    </div>
                    <Sparkles className="h-4 w-4 text-primary" />
                    {renamingCardId === card.id ? (
                      <Input
                        autoFocus
                        value={newCardName}
                        onChange={(e) => setNewCardName(e.target.value)}
                        onBlur={() => handleRenameCard(card.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameCard(card.id);
                          if (e.key === "Escape") setRenamingCardId(null);
                        }}
                        className="h-7 w-48 text-sm font-medium"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{card.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleStartRename(card)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => setDeleteCardId(card.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {card.pivot_data_refreshed_at && (
                      <span className="text-xs text-muted-foreground mr-2">
                        Data: {format(new Date(card.pivot_data_refreshed_at), "MMM d 'at' h:mm a")}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setViewingSummary(card)}
                      disabled={!card.generated_summary}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                      </svg>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenSettings(card)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem onClick={() => handleStartRename(card)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleRefreshPivotData(card)}
                          disabled={refreshingPivotCardId === card.id}
                        >
                          {refreshingPivotCardId === card.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Database className="h-4 w-4 mr-2" />
                          )}
                          Refresh Data
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteCardId(card.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                
                {/* Pivot Table */}
                <CardContent className="p-4">
                  <AISummaryPivotTable
                    reportIds={card.report_ids}
                    selectedMetrics={card.selected_metrics}
                    accountId={accountId}
                    cachedPivotData={card.cached_pivot_data}
                    reportConfigs={card.report_configs}
                    selectedTab={selectedDateTab}
                    onTabChange={setSelectedDateTab}
                    selectedReportTab={selectedReportTab}
                    onReportTabChange={setSelectedReportTab}
                    dateOptions={dateOptions}
                    selectedDatePeriod={selectedDatePeriod}
                    onDatePeriodChange={setSelectedDatePeriod}
                  />
                </CardContent>
                
                {/* Generate/Regenerate Button Bar */}
                <CardContent className="p-0 border-t">
                  <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">AI Executive Summary</h3>
                    </div>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenGenerateModal(card)}
                      disabled={generatingCardId === card.id}
                      className="h-7 text-xs"
                    >
                      {generatingCardId === card.id ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                          Generating...
                        </>
                      ) : card.cached_pivot_data?.executive_summaries ? (
                        <>
                          <Sparkles className="h-3 w-3 mr-1.5" />
                          Regenerate
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3 mr-1.5" />
                          Generate
                        </>
                      )}
                    </Button>
                  </div>
                  {generatingCardId === card.id && (
                    <div className="flex items-center justify-center py-4 border-t bg-muted/30">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      <p className="text-sm text-muted-foreground">Generating AI summary...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddAICardModal
        open={isAddCardModalOpen}
        onOpenChange={(open) => {
          setIsAddCardModalOpen(open);
          if (!open) setEditingCard(null);
        }}
        onCardCreated={(newCardId) => {
          fetchCards();
          // Navigate to the new card if an ID was returned
          if (newCardId && accountId) {
            navigate(`/tools/ai-summary/${accountId}/${newCardId}`);
          }
        }}
        editingCard={editingCard}
      />

      <CreateShareLinkModal
        open={isShareModalOpen}
        onOpenChange={setIsShareModalOpen}
        onSuccess={() => {
          setIsShareModalOpen(false);
          toast.success("Share link created successfully");
        }}
        accountId={accountId}
      />

      <AlertDialog open={!!deleteCardId} onOpenChange={() => setDeleteCardId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete AI Summary Card</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this card? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCard}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Summary Dialog */}
      <Dialog open={!!viewingSummary} onOpenChange={() => setViewingSummary(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {viewingSummary?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            {viewingSummary?.generated_summary && (
              <FormattedAISummary summary={viewingSummary.generated_summary} />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Generate AI Summary Modal */}
      <GenerateAISummaryModal
        open={!!generateModalCard}
        onOpenChange={(open) => !open && setGenerateModalCard(null)}
        onGenerate={handleGenerateSummary}
        isGenerating={!!generatingCardId}
        cardName={generateModalCard?.name}
      />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AISummaryPage;
