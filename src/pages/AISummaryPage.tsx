import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Plus, Trash2, Loader2, Settings, MoreHorizontal, Database, Pencil, Share2, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AddAICardModal } from "@/components/AddAICardModal";
import { CreateAISummaryShareLinkModal } from "@/components/CreateAISummaryShareLinkModal";
import { ForecastSettingsModal } from "@/components/ForecastSettingsModal";
import { MasterReportSetupModal, type MasterReportConfig } from "@/components/MasterReportSetupModal";
import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/auth";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { format, subMonths, subYears, startOfYear } from "date-fns";
import { toast } from "sonner";
import { reportNameToSlug, findReportBySlug, getReportUrl, getReportUrlWithSummary } from "@/lib/report-url";
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
import { AISummaryBudgetTable } from "@/components/AISummaryBudgetTable";

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
  account_id?: string | null;
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
  const { reportName, accountId: legacyAccountId, summaryId: legacySummaryId } = useParams();
  const navigate = useNavigate();
  const [resolvedAccountId, setResolvedAccountId] = useState<string | undefined>(undefined);
  const [resolvedSummaryId, setResolvedSummaryId] = useState<string | null>(null);
  
  // Get summaryId from query params if provided
  const searchParams = new URLSearchParams(window.location.search);
  const querySummaryId = searchParams.get('summary') || null;
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
  const [selectedCardId, setSelectedCardId] = useState<string | null>(legacySummaryId || querySummaryId || null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isForecastModalOpen, setIsForecastModalOpen] = useState(false);
  const [isAPIBuilderModalOpen, setIsAPIBuilderModalOpen] = useState(false);
  const [selectedDateTab, setSelectedDateTab] = useState<DateTab>(format(new Date(), "yyyy-MM"));
  const [selectedReportTab, setSelectedReportTab] = useState<ReportTab>("overview");
  const [selectedDatePeriod, setSelectedDatePeriod] = useState<string>(format(new Date(), "yyyy-MM"));
  const [selectedBudgetReportId, setSelectedBudgetReportId] = useState<string | null>(null);
  const [budgetForecastEnabled, setBudgetForecastEnabled] = useState(false);
  const [isMasterReportSetupOpen, setIsMasterReportSetupOpen] = useState(false);
  const [masterReportConfigs, setMasterReportConfigs] = useState<Record<string, MasterReportConfig>>({});

  // Generate date options: Year to date at top, then current month, then previous months
  const dateOptions = React.useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    const yearStart = startOfYear(now);
    
    // Add Year to date at the top
    options.push({ value: "ytd", label: "Year to date" });
    
    // Start from current month and go back to January
    let current = now;
    while (current >= yearStart) {
      const monthKey = format(current, "yyyy-MM");
      // Use actual month name instead of "MTD"
      const monthLabel = format(current, "MMMM yyyy");
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

  // Resolve accountId from reportName if provided
  useEffect(() => {
    const resolveReport = async () => {
      // If using new route with reportName
      if (reportName) {
        try {
          const { user } = await getUser();
          if (!user) return;

          // Check if reportName is a UUID (legacy format)
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const isUUID = uuidRegex.test(reportName);

          if (isUUID) {
            // Legacy UUID format - treat as accountId
            console.log('[AISummaryPage] Detected UUID in reportName, treating as accountId');
            setResolvedAccountId(reportName);
            if (querySummaryId) {
              setResolvedSummaryId(querySummaryId);
            }
            return;
          }

          // Fetch all reports for the user
          const { data: allReports, error } = await supabase
            .from("reports")
            .select("id, name, account_id")
            .eq("user_id", user.id);

          if (error) {
            console.error("Error fetching reports:", error);
            toast.error("Failed to load report");
            setIsLoading(false);
            return;
          }

          // Find report by slug
          const report = findReportBySlug(reportName, allReports || []);
          
          console.log('[AISummaryPage] Looking up report:', {
            reportName,
            allReportsCount: allReports?.length || 0,
            reportNames: allReports?.map(r => r.name),
            reportSlugs: allReports?.map(r => ({ name: r.name, slug: reportNameToSlug(r.name) })),
            foundReport: report
          });
          
          if (report && report.account_id) {
            setResolvedAccountId(report.account_id);
            // Set summaryId from query param if provided
            if (querySummaryId) {
              setResolvedSummaryId(querySummaryId);
            }
          } else {
            console.error('[AISummaryPage] Report not found:', {
              reportName,
              decodedSlug: decodeURIComponent(reportName).toLowerCase(),
              availableReports: allReports?.map(r => ({ 
                name: r.name, 
                slug: reportNameToSlug(r.name),
                account_id: r.account_id 
              }))
            });
            toast.error(`Report "${reportName}" not found`);
            setIsLoading(false);
          }
        } catch (err) {
          console.error("Error resolving report:", err);
          toast.error("Failed to load report");
          setIsLoading(false);
        }
      } else if (legacyAccountId) {
        // Legacy route support
        setResolvedAccountId(legacyAccountId);
        if (legacySummaryId) {
          setResolvedSummaryId(legacySummaryId);
        }
      }
    };

    resolveReport();
  }, [reportName, legacyAccountId, legacySummaryId, querySummaryId, navigate]);

  // Use resolved accountId
  const accountId = resolvedAccountId || legacyAccountId;
  const summaryId = resolvedSummaryId || legacySummaryId || querySummaryId;

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
    if (accountId) {
      fetchCards();
      fetchReports();
    }
  }, [accountId]);

  // Update selectedCardId when summaryId from URL changes
  useEffect(() => {
    if (summaryId) {
      setSelectedCardId(summaryId);
    }
  }, [summaryId]);

  const handleBack = () => {
    if (accountId) {
      navigate(`/?account=${accountId}`);
    } else {
      navigate("/");
    }
  };

  // Get currently selected card
  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    return cards.find(c => c.id === selectedCardId) || null;
  }, [cards, selectedCardId]);


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
      
      // Helper to get date from row (handles both flat and nested dimension_values)
      const getRowDateHelper = (row: any): Date | null => {
        const rowData = row.dimension_values || row;
        let dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
        if (!dateValue) {
          for (const [key, val] of Object.entries(rowData)) {
            if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
              dateValue = val as string;
              break;
            }
          }
        }
        return parseDate(dateValue);
      };
      
      // Helper to calculate dynamic comparison range based on actual data dates
      const getDynamicComparisonRange = (
        rows: any[],
        periodRange: { start: Date; end: Date },
        comparisonType: "previous_period" | "previous_year"
      ): { start: Date; end: Date } | null => {
        // Find actual data dates within the period
        const datesInPeriod = rows
          .map((row: any) => getRowDateHelper(row))
          .filter((d: Date | null): d is Date => d !== null && d >= periodRange.start && d <= periodRange.end)
          .sort((a: Date, b: Date) => a.getTime() - b.getTime());
        
        if (datesInPeriod.length === 0) {
          // Fallback to theoretical range
          return getComparisonDateRange(
            periodRange.start.toISOString().substring(0, 7) === format(new Date(), "yyyy-MM") ? "mtd" : periodRange.start.toISOString().substring(0, 7),
            comparisonType
          );
        }
        
        const actualStart = datesInPeriod[0];
        const actualEnd = datesInPeriod[datesInPeriod.length - 1];
        
        if (comparisonType === "previous_period") {
          // Same-day matching for previous period (month before)
          return {
            start: subMonths(actualStart, 1),
            end: subMonths(actualEnd, 1),
          };
        } else {
          // Same-day matching for previous year
          return {
            start: subYears(actualStart, 1),
            end: subYears(actualEnd, 1),
          };
        }
      };

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
          .map((row: any) => {
            const rowData = row.dimension_values || row;
            // Try multiple date field names
            let dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
            
            // Also search for date patterns if not found by name
            if (!dateValue) {
              for (const [key, val] of Object.entries(rowData)) {
                if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
                  dateValue = val as string;
                  break;
                }
              }
            }
            
            return parseDate(dateValue);
          })
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
          
          // Compute comparison data - Previous Period (using dynamic same-day matching)
          const prevPeriodRange = getDynamicComparisonRange(
            sourceData.transformedRows,
            dateRanges[tab],
            "previous_period"
          );
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
          
          // Compute comparison data - Previous Year (using dynamic same-day matching)
          const prevYearRange = getDynamicComparisonRange(
            sourceData.transformedRows,
            dateRanges[tab],
            "previous_year"
          );
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
              
              // Comparison - Previous Period (using dynamic same-day matching)
              const breakdownPrevPeriodRange = getDynamicComparisonRange(
                groupRows,
                dateRanges[tab],
                "previous_period"
              );
              if (breakdownPrevPeriodRange) {
                const prevPeriodMetrics = aggregateMetrics(
                  groupRows,
                  card.selected_metrics,
                  breakdownPrevPeriodRange,
                  undefined,
                  metricNameToIdMap
                );
                comparisonPreviousPeriod.breakdown_data![breakdownKey][tab].push({
                  groupValue,
                  metrics: prevPeriodMetrics,
                });
              }
              
              // Comparison - Previous Year (using dynamic same-day matching)
              const breakdownPrevYearRange = getDynamicComparisonRange(
                groupRows,
                dateRanges[tab],
                "previous_year"
              );
              if (breakdownPrevYearRange) {
                const prevYearMetrics = aggregateMetrics(
                  groupRows,
                  card.selected_metrics,
                  breakdownPrevYearRange,
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
              
              // Comparison for Uncategorized - Previous Period
              const uncatPrevPeriodRange = getDynamicComparisonRange(
                uncategorizedRows,
                dateRanges[tab],
                "previous_period"
              );
              if (uncatPrevPeriodRange) {
                const prevPeriodMetrics = aggregateMetrics(
                  uncategorizedRows,
                  card.selected_metrics,
                  uncatPrevPeriodRange,
                  undefined,
                  metricNameToIdMap
                );
                comparisonPreviousPeriod.breakdown_data![breakdownKey][tab].push({
                  groupValue: 'Uncategorized',
                  metrics: prevPeriodMetrics,
                });
              }
              
              // Comparison for Uncategorized - Previous Year
              const uncatPrevYearRange = getDynamicComparisonRange(
                uncategorizedRows,
                dateRanges[tab],
                "previous_year"
              );
              if (uncatPrevYearRange) {
                const prevYearMetrics = aggregateMetrics(
                  uncategorizedRows,
                  card.selected_metrics,
                  uncatPrevYearRange,
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

      // Build budget data for all reports (unified caching)
      toast.info("Caching budget data...", { id: "refresh-budget" });
      const cachedBudgetData: Record<string, Record<string, { cost: number; revenue: number }>> = {};
      
      for (const reportId of card.report_ids) {
        // Initialize entry for this report (even if fetch fails, we track it)
        const monthlyMetrics: Record<string, { cost: number; revenue: number }> = {};
        const currentYear = new Date().getFullYear();
        
        try {
          // Fetch data source for this report
          const { data: dsData, error: dsError } = await supabase
            .from("data_sources")
            .select("*")
            .eq("report_id", reportId)
            .limit(1)
            .single();

          if (dsError || !dsData) {
            console.warn(`No data source found for report ${reportId}:`, dsError);
            cachedBudgetData[reportId] = monthlyMetrics;
            continue;
          }

          // Build metric name to ID mapping
          const columnMappings = Array.isArray(dsData.column_mappings) ? dsData.column_mappings : [];
          const metricNameToIdMap: Record<string, string> = {};
          const dimIdToColumnHeader: Record<string, string> = {};
          columnMappings.forEach((m: any) => {
            if (m.dimensionName && m.dimensionId && m.dimensionId !== "none") {
              metricNameToIdMap[m.dimensionName] = m.dimensionId;
            }
            if (m.dimensionId && m.dimensionId !== "none" && m.columnHeader) {
              dimIdToColumnHeader[m.dimensionId] = m.columnHeader;
            }
          });

          // Get filter config for this report
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

          // Helper to get dimension value
          const getDimensionValue = (rowData: any, dimId: string, dimName?: string): string | undefined => {
            if (rowData[dimId] !== undefined && rowData[dimId] !== null && rowData[dimId] !== '') {
              return String(rowData[dimId]);
            }
            if (dimName && rowData[dimName] !== undefined && rowData[dimName] !== null && rowData[dimName] !== '') {
              return String(rowData[dimName]);
            }
            const columnHeader = dimIdToColumnHeader[dimId];
            if (columnHeader && rowData[columnHeader] !== undefined && rowData[columnHeader] !== null && rowData[columnHeader] !== '') {
              return String(rowData[columnHeader]);
            }
            return undefined;
          };

          // Re-fetch source data for budget calculation
          const sourceData = await fetchSourceData(dsData as DataSource, user.id, accountId);
          
          if (!sourceData?.transformedRows || sourceData.transformedRows.length === 0) {
            console.warn(`No transformed rows for report ${reportId}`);
            cachedBudgetData[reportId] = monthlyMetrics;
            continue;
          }

          console.log(`Processing ${sourceData.transformedRows.length} rows for budget report ${reportId}`);

          sourceData.transformedRows.forEach((row: any) => {
            const rowData = row.dimension_values || row;

            // Apply dimension filter
            if (dimensionFilter) {
              const filterValue = getDimensionValue(rowData, dimensionFilter.dimensionId, dimensionFilter.dimensionName);
              if (!filterValue || !dimensionFilter.values.includes(filterValue)) {
                return;
              }
            }

            // Find date value
            let dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
            if (!dateValue) {
              for (const [key, val] of Object.entries(rowData)) {
                if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}/)) {
                  dateValue = val as string;
                  break;
                }
              }
            }

            if (!dateValue) return;

            const date = new Date(dateValue);
            if (isNaN(date.getTime())) return;
            if (date.getFullYear() !== currentYear) return;

            const monthKey = `${currentYear}-${String(date.getMonth() + 1).padStart(2, "0")}`;

            if (!monthlyMetrics[monthKey]) {
              monthlyMetrics[monthKey] = { cost: 0, revenue: 0 };
            }

            // Get Cost - try multiple possible field names/IDs
            const costId = metricNameToIdMap["Cost"];
            const costValue = parseFloat(
              rowData[costId] || 
              rowData["Cost"] || 
              rowData["cost"] || 
              rowData["Spend"] || 
              rowData["spend"] ||
              rowData["Amount spent"] ||
              rowData["Amount Spent"] ||
              0
            );
            if (!isNaN(costValue)) {
              monthlyMetrics[monthKey].cost += costValue;
            }

            // Get Revenue - try multiple possible field names/IDs
            const revenueId = metricNameToIdMap["Revenue"];
            const revenueValue = parseFloat(
              rowData[revenueId] || 
              rowData["Revenue"] || 
              rowData["revenue"] ||
              rowData["Conversion value"] ||
              rowData["Purchase value"] ||
              0
            );
            if (!isNaN(revenueValue)) {
              monthlyMetrics[monthKey].revenue += revenueValue;
            }
          });
        } catch (err) {
          console.error(`Error processing budget data for report ${reportId}:`, err);
        }

        // Always save the metrics for this report (even if empty)
        cachedBudgetData[reportId] = monthlyMetrics;
      }

      console.log("Final cached budget data:", Object.keys(cachedBudgetData));
      toast.dismiss("refresh-budget");

      // Save to database including breakdown data, date breakdown data, and budget data
      const { error } = await (supabase.from("ai_summary_cards") as any)
        .update({
          cached_pivot_data: completePivotData,
          cached_budget_data: cachedBudgetData,
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
          if (info.firstDate && info.lastDate) {
            return `${info.reportName}: ${format(info.firstDate, "MMM d")} - ${format(info.lastDate, "MMM d, yyyy")}`;
          }
          return `${info.reportName}: No data`;
        })
        .join("\n");

      toast.success(
        <div className="space-y-1">
          <div className="font-medium">Data refreshed!</div>
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

  const handleGenerateSummary = async (comparisonType: ComparisonOption, selectedPeriods: string[], aiPrompt: string) => {
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

      toast.info("Generating AI summary...");

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
          aiPrompt: aiPrompt, // Use the prompt from the modal
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

  // Generate full API URL for a card (using Supabase Edge Function)
  const getCardApiUrl = (card: AISummaryCard): string => {
    try {
      // Use Supabase Edge Function URL for universal access
      const supabaseUrl = 'https://zcxxwpwheevwavdcgfht.supabase.co';
      return `${supabaseUrl}/functions/v1/get-ai-summary-data?cardId=${card.id}`;
    } catch (error) {
      console.error('[AISummaryPage] Error generating API URL:', error);
      return '';
    }
  };

  // Get report tabs for the selected AI Summary card
  const aiSummaryReportTabs = selectedCard 
    ? reports.filter(r => selectedCard.report_ids.includes(r.id))
    : [];

  const handleReportSelect = (cardId: string) => {
    if (cardId === "add-new") {
      setIsAddCardModalOpen(true);
      return;
    }
    if (cardId === "all-reports") {
      setSelectedCardId(null);
      // Use report name if available, otherwise use first report for the account
      if (reportName) {
        navigate(getReportUrl(reportName));
      } else if (reports.length > 0) {
        navigate(getReportUrl(reports[0].name));
      } else if (accountId) {
        // Fallback to legacy route
        navigate(`/tools/report/${accountId}`);
      }
      return;
    }
    setSelectedCardId(cardId);
    // Use report name if available, otherwise use first report for the account
    if (reportName) {
      navigate(getReportUrlWithSummary(reportName, cardId));
    } else if (reports.length > 0) {
      navigate(getReportUrlWithSummary(reports[0].name, cardId));
    } else if (accountId) {
      // Fallback to legacy route
      navigate(`/tools/report/${accountId}/${cardId}`);
    }
  };

  const handleReportTabSelect = (tab: ReportTab) => {
    setSelectedReportTab(tab);
  };

  // Build report tabs list (Overview + reports + Budget)
  const reportTabOptions: { value: ReportTab; label: string }[] = [
    { value: "overview", label: "Overview" },
    ...aiSummaryReportTabs.map(r => ({ value: r.id, label: r.name })),
    { value: "budget", label: "Budget" },
  ];

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <div className="border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              
              {/* Reports Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Reports</span>
                <Select 
                  value={selectedCardId || "all-reports"} 
                  onValueChange={handleReportSelect}
                >
                  <SelectTrigger className="w-[200px] bg-background border-border">
                    <SelectValue placeholder="Select report" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border z-50">
                    <SelectItem value="all-reports" className="font-medium">
                      All reports:
                    </SelectItem>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="add-new" className="text-primary">
                      <span className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Add New Report
                      </span>
                    </SelectItem>
                </SelectContent>
                </Select>
              </div>

            </div>
            <div className="flex items-center gap-2">
                  {selectedCard ? (
                    <Button 
                      variant="outline" 
                      onClick={() => handleRefreshPivotData(selectedCard)}
                      disabled={refreshingPivotCardId === selectedCard.id}
                    >
                      {refreshingPivotCardId === selectedCard.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      onClick={() => window.location.reload()}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setIsShareModalOpen(true)}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover">
                      <DropdownMenuItem onClick={() => setIsMasterReportSetupOpen(true)}>
                        <Settings className="h-4 w-4 mr-2" />
                        Edit Master Report
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setIsAddCardModalOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add New Report
                      </DropdownMenuItem>
                      {selectedCard && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleStartRename(selectedCard)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenSettings(selectedCard)}>
                            <Database className="h-4 w-4 mr-2" />
                            Edit source
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteCardId(selectedCard.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-8 flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="w-full">
            {!selectedCardId ? (
              /* All Reports view - show table with empty data */
              <AISummaryPivotTable
                cardId={undefined}
                reportIds={[]}
                selectedMetrics={["Impressions", "Clicks", "Cost", "Revenue", "ROAS"]}
                accountId={accountId}
                cachedPivotData={undefined}
                reportConfigs={{}}
                selectedTab={selectedDateTab}
                onTabChange={setSelectedDateTab}
                selectedReportTab={selectedReportTab}
                onReportTabChange={setSelectedReportTab}
                dateOptions={dateOptions}
                selectedDatePeriod={selectedDatePeriod}
                onDatePeriodChange={setSelectedDatePeriod}
              />
            ) : (
              cards
                .filter(card => card.id === selectedCardId)
                .map(card => (
              <div key={card.id} className="w-full">
                  {selectedReportTab === "budget" ? (
                    <div className="space-y-4">
                      {/* Budget Report Tabs */}
                      <div className="flex gap-2 border-b pb-3">
                        <Button
                          key="budget-overview"
                          variant={selectedBudgetReportId === "overview" || !selectedBudgetReportId ? "default" : "ghost"}
                          size="sm"
                          className="px-4"
                          onClick={() => setSelectedBudgetReportId("overview")}
                        >
                          Overview
                        </Button>
                        {card.report_ids.map((reportId) => {
                          const report = reports.find(r => r.id === reportId);
                          const isSelected = selectedBudgetReportId === reportId;
                          return (
                            <Button
                              key={reportId}
                              variant={isSelected ? "default" : "ghost"}
                              size="sm"
                              className="px-4"
                              onClick={() => setSelectedBudgetReportId(reportId)}
                            >
                              {report?.name || "Report"}
                            </Button>
                          );
                        })}
                      </div>
                      {/* Show the selected report's budget table or overview */}
                      {selectedBudgetReportId === "overview" || !selectedBudgetReportId ? (
                        <AISummaryBudgetTable
                          key="budget-overview"
                          aiSummaryCardId={card.id}
                          reportId="overview"
                          reportName="Overview"
                          accountId={accountId}
                          reportConfigs={card.report_configs}
                          allReportIds={card.report_ids}
                          isOverview={true}
                          forecastEnabled={budgetForecastEnabled}
                          onForecastEnabledChange={setBudgetForecastEnabled}
                        />
                      ) : (
                        (() => {
                          const report = reports.find(r => r.id === selectedBudgetReportId);
                          return (
                            <AISummaryBudgetTable
                              key={selectedBudgetReportId}
                              aiSummaryCardId={card.id}
                              reportId={selectedBudgetReportId}
                              reportName={report?.name || "Report"}
                              accountId={accountId}
                              reportConfigs={card.report_configs}
                              forecastEnabled={budgetForecastEnabled}
                              onForecastEnabledChange={setBudgetForecastEnabled}
                            />
                          );
                        })()
                      )}
                    </div>
                  ) : (
                    <AISummaryPivotTable
                      cardId={card.id}
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
                  )}
                
                {/* AI Executive Summary section - TEMPORARILY HIDDEN
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
                */}
              </div>
            ))
            )}
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
          if (newCardId) {
            // Use report name if available, otherwise use first report for the account
            if (reportName) {
              navigate(getReportUrlWithSummary(reportName, newCardId));
            } else if (reports.length > 0) {
              navigate(getReportUrlWithSummary(reports[0].name, newCardId));
            } else if (accountId) {
              // Fallback to legacy route
              navigate(`/tools/report/${accountId}/${newCardId}`);
            }
          }
        }}
        editingCard={editingCard}
        accountId={accountId}
      />

      {selectedCardId && cards.find(c => c.id === selectedCardId) && (
        <CreateAISummaryShareLinkModal
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
          onSuccess={() => {
            setIsShareModalOpen(false);
            toast.success("Share link created successfully");
          }}
          summaryId={selectedCardId}
          summaryName={cards.find(c => c.id === selectedCardId)?.name || "AI Summary"}
          accountId={accountId}
        />
      )}

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
        initialAiPrompt={generateModalCard?.ai_prompt}
      />

      {/* Forecast Settings Modal */}
      {summaryId && (
        <ForecastSettingsModal
          open={isForecastModalOpen}
          onOpenChange={setIsForecastModalOpen}
          aiSummaryCardId={summaryId}
        />
      )}

      {/* API Builder Modal - Now using unified AddAICardModal */}
      <AddAICardModal
        open={isAPIBuilderModalOpen}
        onOpenChange={setIsAPIBuilderModalOpen}
        editingCard={selectedCard ? {
          id: selectedCard.id,
          name: selectedCard.name,
          report_ids: selectedCard.report_ids,
          report_configs: selectedCard.report_configs,
          breakdown_configs: (selectedCard.report_configs as any)?.breakdown_configs,
          selected_metrics: selectedCard.selected_metrics,
          since_date: selectedCard.since_date,
          ai_prompt: selectedCard.ai_prompt || ""
        } : null}
        mode="api"
      />

      {/* Master Report Setup Modal */}
      <MasterReportSetupModal
        open={isMasterReportSetupOpen}
        onOpenChange={setIsMasterReportSetupOpen}
        reports={reports}
        accountId={accountId}
        currentConfigs={masterReportConfigs}
        onSave={setMasterReportConfigs}
      />
    </div>
  );
};

export default AISummaryPage;