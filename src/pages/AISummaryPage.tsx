import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Plus, Trash2, Loader2, Settings, MoreHorizontal, Database, Pencil } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/auth";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { format } from "date-fns";
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
import FormattedAISummary from "@/components/FormattedAISummary";
import { 
  AISummaryPivotTable, 
  type CachedPivotData,
  type DateBreakdownRow,
  getDateRange,
  getComparisonDateRange,
  aggregateMetrics,
  getDateGroupKey,
  parseDate,
  type DateTab
} from "@/components/AISummaryPivotTable";

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
  const { accountId } = useParams();
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

      const pivotData: CachedPivotData = {
        last_month: [],
        mtd: [],
        ytd: [],
      };
      
      // Initialize breakdown data structures
      const breakdownData: Record<string, Record<DateTab, Array<{ groupValue: string; metrics: Record<string, number> }>>> = {};
      const breakdownDimensionNames: Record<string, string> = {}; // Map of reportId -> dimension name
      const combinedDateBreakdown: Record<DateTab, DateBreakdownRow[]> = {
        last_month: [], mtd: [], ytd: []
      };
      // To accumulate all rows for combined date breakdown
      const allRowsForDateBreakdown: any[] = [];
      const allMetricNameToIdMaps: Record<string, string>[] = [];
      
      // Initialize comparison data
      const comparisonPreviousPeriod: {
        [key in DateTab]: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
      } & { breakdown_data?: Record<string, Record<DateTab, Array<{ groupValue: string; metrics: Record<string, number> }>>> } = {
        last_month: [], mtd: [], ytd: [], breakdown_data: {}
      };
      const comparisonPreviousYear: {
        [key in DateTab]: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
      } & { breakdown_data?: Record<string, Record<DateTab, Array<{ groupValue: string; metrics: Record<string, number> }>>> } = {
        last_month: [], mtd: [], ytd: [], breakdown_data: {}
      };

      const dateRanges: Record<DateTab, { start: Date; end: Date }> = {
        last_month: getDateRange("last_month"),
        mtd: getDateRange("mtd"),
        ytd: getDateRange("ytd"),
      };
      
      // Comparison date ranges
      const comparisonRanges = {
        previous_period: {
          last_month: getComparisonDateRange("last_month", "previous_period"),
          mtd: getComparisonDateRange("mtd", "previous_period"),
          ytd: getComparisonDateRange("ytd", "previous_period"),
        },
        previous_year: {
          last_month: getComparisonDateRange("last_month", "previous_year"),
          mtd: getComparisonDateRange("mtd", "previous_year"),
          ytd: getComparisonDateRange("ytd", "previous_year"),
        },
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

        // Fetch source data
        const sourceData = await fetchSourceData(dsData as DataSource, user.id, accountId);
        
        if (!sourceData?.transformedRows) continue;

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

        // Aggregate metrics for each date range
        (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
          const metrics = aggregateMetrics(
            sourceData.transformedRows,
            card.selected_metrics,
            dateRanges[tab],
            dimensionFilter,
            metricNameToIdMap
          );

          pivotData[tab].push({
            reportId: reportData.id,
            reportName: reportData.name,
            metrics,
          });
          
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
            comparisonPreviousPeriod[tab].push({
              reportId: reportData.id,
              reportName: reportData.name,
              metrics: prevPeriodMetrics,
            });
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
            comparisonPreviousYear[tab].push({
              reportId: reportData.id,
              reportName: reportData.name,
              metrics: prevYearMetrics,
            });
          }
        });

        // Build breakdown data if configured
        const breakdownConfig = breakdown_configs?.[reportId];
        if (breakdownConfig?.breakdownDimensionId) {
          const { data: breakdownDimData } = await supabase
            .from("dimensions")
            .select("name")
            .eq("id", breakdownConfig.breakdownDimensionId)
            .single();
          
          const breakdownDimName = breakdownDimData?.name;
          const breakdownDimId = breakdownConfig.breakdownDimensionId;
          
          // Store the dimension name for this report
          if (breakdownDimName) {
            breakdownDimensionNames[reportId] = breakdownDimName;
          }
          
          // First filter rows by dimension filter, then get unique breakdown values
          const filteredByDimension = sourceData.transformedRows.filter((row: any) => {
            if (!dimensionFilter || dimensionFilter.values.length === 0) return true;
            const rowData = row.dimension_values || row;
            const dimVal = rowData[dimensionFilter.dimensionId] || 
                           (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
            return dimVal !== undefined && dimensionFilter.values.includes(String(dimVal));
          });
          
          // Get unique values for this breakdown dimension from filtered rows only
          const uniqueValues = new Set<string>();
          let hasUncategorized = false;
          
          filteredByDimension.forEach((row: any) => {
            const rowData = row.dimension_values || row;
            const val = rowData[breakdownDimId] || (breakdownDimName ? rowData[breakdownDimName] : undefined);
            if (val !== undefined && val !== null && val !== '') {
              uniqueValues.add(String(val));
            } else {
              hasUncategorized = true;
            }
          });

          breakdownData[reportId] = { last_month: [], mtd: [], ytd: [] };
          
          // Initialize comparison breakdown data for this report
          if (!comparisonPreviousPeriod.breakdown_data) comparisonPreviousPeriod.breakdown_data = {};
          if (!comparisonPreviousYear.breakdown_data) comparisonPreviousYear.breakdown_data = {};
          comparisonPreviousPeriod.breakdown_data[reportId] = { last_month: [], mtd: [], ytd: [] };
          comparisonPreviousYear.breakdown_data[reportId] = { last_month: [], mtd: [], ytd: [] };
          
          (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
            // Process each named group
            uniqueValues.forEach((groupValue) => {
              // Filter rows for this specific group value
              const groupRows = filteredByDimension.filter((row: any) => {
                const rowData = row.dimension_values || row;
                const groupVal = rowData[breakdownDimId] || 
                                 (breakdownDimName ? rowData[breakdownDimName] : undefined);
                return groupVal !== undefined && String(groupVal) === groupValue;
              });
              
              // Main metrics
              const metrics = aggregateMetrics(
                groupRows,
                card.selected_metrics,
                dateRanges[tab],
                undefined, // Already filtered
                metricNameToIdMap
              );

              breakdownData[reportId][tab].push({
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
                comparisonPreviousPeriod.breakdown_data![reportId][tab].push({
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
                comparisonPreviousYear.breakdown_data![reportId][tab].push({
                  groupValue,
                  metrics: prevYearMetrics,
                });
              }
            });
            
            // Add Uncategorized group for rows without breakdown value
            if (hasUncategorized) {
              const uncategorizedRows = filteredByDimension.filter((row: any) => {
                const rowData = row.dimension_values || row;
                const val = rowData[breakdownDimId] || (breakdownDimName ? rowData[breakdownDimName] : undefined);
                return val === undefined || val === null || val === '';
              });
              
              const metrics = aggregateMetrics(
                uncategorizedRows,
                card.selected_metrics,
                dateRanges[tab],
                undefined,
                metricNameToIdMap
              );

              breakdownData[reportId][tab].push({
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
                comparisonPreviousPeriod.breakdown_data![reportId][tab].push({
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
                comparisonPreviousYear.breakdown_data![reportId][tab].push({
                  groupValue: 'Uncategorized',
                  metrics: prevYearMetrics,
                });
              }
            }
          });
        }
        
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
      
      (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
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

      // Build complete pivot data with all breakdowns and comparisons
      const completePivotData = { 
        ...pivotData, 
        breakdown_data: breakdownData, 
        breakdown_dimension_names: breakdownDimensionNames,
        combined_date_breakdown: combinedDateBreakdown,
        comparison_previous_period: comparisonPreviousPeriod,
        comparison_previous_year: comparisonPreviousYear,
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

      toast.success("Pivot data refreshed!");
    } catch (err) {
      console.error("Error refreshing pivot data:", err);
      toast.error("Failed to refresh pivot data");
    } finally {
      setRefreshingPivotCardId(null);
    }
  };

  const handleGenerateSummary = async (card: AISummaryCard) => {
    setGeneratingCardId(card.id);
    
    try {
      const { user } = await getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      // Check if pivot data exists
      if (!card.cached_pivot_data || Object.keys(card.cached_pivot_data).length === 0) {
        toast.error("Please refresh the pivot data first before generating a summary");
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
          aiPrompt: card.ai_prompt
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
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-6 py-4">
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
            <Button onClick={() => setIsAddCardModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add card
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
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
            {cards.map(card => (
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
                      onClick={() => handleGenerateSummary(card)}
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
        onCardCreated={fetchCards}
        editingCard={editingCard}
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
    </div>
  );
};

export default AISummaryPage;
