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
import { format, subMonths, startOfYear } from "date-fns";
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
  type DateTab,
  type ReportTab,
} from "@/components/AISummaryPivotTable";
import { AISummaryBudgetTable } from "@/components/AISummaryBudgetTable";
import { useQueryClient } from "@tanstack/react-query";
import { aiSummaryKeys } from "@/hooks/useAISummaryData";
import {
  fetchReportsAndDataSources,
  generateMonthKeys,
  buildDateRanges,
  processReportPivotData,
  processReportBudgetData,
  aggregatePivotResults,
  aggregateBudgetResults,
  invalidateCaches,
  fetchWithRetry,
  type ReportResult,
} from "@/lib/refreshPivotDataHelpers";
import { invokeGenerateAISummary } from "@/lib/generate-ai-summary-client";

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
  const queryClient = useQueryClient();
  
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
  const [refreshConfirmCardId, setRefreshConfirmCardId] = useState<string | null>(null);
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
  // ADD: Budget year selector state (this year / last year)
  const [selectedBudgetYear, setSelectedBudgetYear] = useState<number>(new Date().getFullYear());

  // Generate year options for the year selector (current year and previous 10 years)
  const yearOptions = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    // Generate years from current year going back 10 years
    for (let i = 0; i <= 10; i++) {
      years.push(currentYear - i);
    }
    return years;
  }, []);

  // Generate date options based on selected year
  const dateOptions = React.useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    const isCurrentYear = selectedBudgetYear === now.getFullYear();
    
    // Add Year to date at the top
    options.push({ value: "ytd", label: "Year to date" });
    
    if (isCurrentYear) {
      // For current year: start from current month and go back to January
      let current = now;
      const yearStart = startOfYear(now);
      while (current >= yearStart) {
        const monthKey = format(current, "yyyy-MM");
        const monthLabel = format(current, "MMMM");
        options.push({ value: monthKey, label: monthLabel });
        current = subMonths(current, 1);
      }
    } else {
      // For past years: show all 12 months of that year (Dec to Jan)
      for (let month = 11; month >= 0; month--) {
        const monthDate = new Date(selectedBudgetYear, month, 1);
        const monthKey = format(monthDate, "yyyy-MM");
        const monthLabel = format(monthDate, "MMMM");
        options.push({ value: monthKey, label: monthLabel });
      }
    }
    
    return options;
  }, [selectedBudgetYear]);

  // Reset date period when year changes to the first available month
  useEffect(() => {
    const now = new Date();
    const isCurrentYear = selectedBudgetYear === now.getFullYear();
    
    if (isCurrentYear) {
      // Current year: default to current month
      setSelectedDatePeriod(format(now, "yyyy-MM"));
      setSelectedDateTab(format(now, "yyyy-MM") as DateTab);
    } else {
      // Past year: default to December of that year
      const decemberKey = format(new Date(selectedBudgetYear, 11, 1), "yyyy-MM");
      setSelectedDatePeriod(decemberKey);
      setSelectedDateTab(decemberKey as DateTab);
    }
  }, [selectedBudgetYear]);

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
            setAccountId(reportName);
            if (querySummaryId) {
              setSummaryId(querySummaryId);
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
            setAccountId(report.account_id);
            // Set summaryId from query param if provided
            if (querySummaryId) {
              setSummaryId(querySummaryId);
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
        setAccountId(legacyAccountId);
        if (legacySummaryId) {
          setSummaryId(legacySummaryId);
        }
      }
    };

    resolveReport();
  }, [reportName, legacyAccountId, legacySummaryId, querySummaryId, navigate]);

  // Use resolved accountId
  const [accountId, setAccountId] = useState<string | undefined>(legacyAccountId);
  const [summaryId, setSummaryId] = useState<string | null>(legacySummaryId || null);

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
    navigate("/");
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

  const handleConfirmRefresh = () => {
    if (!refreshConfirmCardId) return;
    
    const cardToRefresh = cards.find(c => c.id === refreshConfirmCardId);
    if (cardToRefresh) {
      setRefreshConfirmCardId(null);
      handleRefreshPivotData(cardToRefresh);
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

      // Generate month keys based on since_date from card settings
      const now = new Date();
      const sinceDate = card.since_date ? new Date(card.since_date) : new Date(now.getFullYear(), 0, 1);
      const monthKeys = generateMonthKeys(sinceDate, now);
      
      console.log('[Refresh] Using since_date:', card.since_date, '- Loading months:', monthKeys);

      // Batch fetch all reports and data sources
      const reportsAndSources = await fetchReportsAndDataSources(card.report_ids);
      
      if (reportsAndSources.size === 0) {
        toast.error("No reports or data sources found");
        return;
      }

      // Build date ranges for all tabs
      const allDateTabs = ["mtd", "ytd", ...monthKeys];
      const dateRanges = buildDateRanges(allDateTabs);

      // Extract filter configs from report_configs
      const { breakdown_configs, ...filterConfigs } = card.report_configs as any;

      // Process all reports in parallel with error isolation
      const reportResults = await Promise.allSettled(
        Array.from(reportsAndSources.entries()).map(async ([reportId, { report, dataSource }]): Promise<ReportResult> => {
          try {
            // Fetch source data once (reuse for both pivot and budget)
            const sourceData = await fetchWithRetry(
              () => fetchSourceData(dataSource, user.id, accountId),
              3,
              1000
            );
            
            if (!sourceData?.transformedRows) {
              return { reportId, success: false, error: 'No data available' };
            }

            // Process pivot data
            const pivotResult = await processReportPivotData(
              reportId,
              report,
              dataSource,
              sourceData,
              card,
              dateRanges,
              allDateTabs,
              monthKeys,
              user,
              accountId
            );

            // Process budget data (reuse sourceData)
            // Process all years, not just current year
            const budgetResult = await processReportBudgetData(
              reportId,
              dataSource,
              sourceData,
              filterConfigs[reportId]
            );

            return {
              reportId,
              success: true,
              pivot: pivotResult,
              budget: budgetResult,
              actualDataRange: pivotResult.actualDataRange,
            };
          } catch (error: any) {
            console.error(`[Refresh] Error processing report ${reportId}:`, error);
            return { 
              reportId, 
              success: false, 
              error: error?.message || 'Unknown error' 
            };
          }
        })
      );

      // Separate successful and failed reports
      const successfulReports = reportResults
        .filter((r): r is PromiseFulfilledResult<ReportResult> => 
          r.status === 'fulfilled' && r.value.success
        )
        .map(r => r.value);

      const failedReports = reportResults
        .filter((r): r is PromiseRejectedResult | PromiseFulfilledResult<ReportResult> => 
          r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
        );

      // Show warnings for failed reports
      if (failedReports.length > 0) {
        const failedReportIds = failedReports
          .map(r => r.status === 'fulfilled' ? r.value.reportId : 'unknown')
          .join(', ');
        toast.warning(
          `${failedReports.length} report(s) failed to refresh: ${failedReportIds}. Other reports succeeded.`,
          { duration: 5000 }
        );
      }

      if (successfulReports.length === 0) {
        toast.error("All reports failed to refresh");
        return;
      }

      // Aggregate pivot results from successful reports
      const pivotResults = successfulReports
        .filter(r => r.pivot)
        .map(r => r.pivot!);
      
      const completePivotData = aggregatePivotResults(pivotResults, monthKeys, card.selected_metrics);

      // Aggregate budget results from successful reports
      const budgetResults = successfulReports
        .filter(r => r.budget)
        .map(r => r.budget!);
      
      const cachedBudgetData = aggregateBudgetResults(budgetResults);

      toast.dismiss("refresh-pivot");
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

      // Invalidate caches so UI recomputes using fresh data
      invalidateCaches(card.id, queryClient);

      // Build summary of data ranges for each report
      const dataRangeSummaries = Object.values(completePivotData.actual_data_ranges || {})
        .map((info: any) => {
          if (info.firstDate && info.lastDate) {
            const firstDate = new Date(info.firstDate);
            const lastDate = new Date(info.lastDate);
            return `${info.reportName}: ${format(firstDate, "MMM d")} - ${format(lastDate, "MMM d, yyyy")}`;
          }
          return `${info.reportName}: No data`;
        })
        .join("\n");

      // Format the refresh range based on since_date
      const refreshRangeLabel = `${format(sinceDate, "MMM yyyy")} - ${format(now, "MMM yyyy")}`;

      toast.success(
        <div className="space-y-1">
          <div className="font-medium">Data refreshed!</div>
          <div className="text-xs text-muted-foreground">
            Refreshed: {refreshRangeLabel}
          </div>
          <div className="text-xs text-muted-foreground whitespace-pre-line">
            Latest data available:
            {"\n"}{dataRangeSummaries}
          </div>
          {successfulReports.length < card.report_ids.length && (
            <div className="text-xs text-amber-600">
              {card.report_ids.length - successfulReports.length} report(s) failed to refresh
            </div>
          )}
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

      const result = await invokeGenerateAISummary({
        cardId: card.id,
        pivotData: card.cached_pivot_data,
        selectedMetrics: card.selected_metrics,
        reportConfigs: card.report_configs,
        aiPrompt,
        comparisonType,
        selectedPeriods,
      });

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
                  value={selectedCardId || ""} 
                  onValueChange={handleReportSelect}
                >
                  <SelectTrigger className="w-[200px] bg-background border-border">
                    <SelectValue placeholder="Select report" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border z-50">
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
                  {selectedCard && (
                    <Button 
                      variant="outline" 
                      onClick={() => setRefreshConfirmCardId(selectedCard.id)}
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
        {/* ADDED: small guidance when on overview and a breakdown is likely configured */}
        {selectedReportTab === "overview" && selectedCard && (selectedCard.report_configs as any)?.breakdown_configs ? (
          <div className="mb-2 text-xs text-muted-foreground">
            Breakdown tables are available on each report tab. Switch from "Overview" to a specific report to see the breakdown.
          </div>
        ) : null}
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
                selectedYear={selectedBudgetYear}
                onYearChange={setSelectedBudgetYear}
              />
            ) : (
              cards
                .filter(card => card.id === selectedCardId)
                .map(card => (
              <div key={card.id} className="w-full">
                  {selectedReportTab === "budget" ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Button
                          variant="link"
                          size="sm"
                          className="px-0"
                          onClick={() => setSelectedReportTab("overview")}
                          title="Back to report"
                        >
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Back to report
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
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
                        </div>
                        {/* ADD: Year selector (current year and previous 10 years) */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">Year</span>
                          <Select
                            value={selectedBudgetYear.toString()}
                            onValueChange={(v) => setSelectedBudgetYear(parseInt(v, 10))}
                          >
                            <SelectTrigger className="w-[120px] bg-background border-border">
                              <SelectValue placeholder="Year" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border z-50">
                              {yearOptions.map((year) => (
                                <SelectItem key={year} value={year.toString()}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
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
                          selectedYear={selectedBudgetYear}
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
                              selectedYear={selectedBudgetYear}
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
                      sinceDate={card.since_date}
                      selectedYear={selectedBudgetYear}
                      onYearChange={setSelectedBudgetYear}
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

      {/* Refresh Data Confirmation Dialog */}
      <AlertDialog open={!!refreshConfirmCardId} onOpenChange={() => setRefreshConfirmCardId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh Data</AlertDialogTitle>
            <AlertDialogDescription>
              This will refresh all pivot data from the source. This may take a few moments. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!refreshingPivotCardId}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmRefresh}
              disabled={!!refreshingPivotCardId}
            >
              {refreshingPivotCardId ? "Refreshing..." : "Refresh"}
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