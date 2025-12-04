import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Plus, Trash2, Loader2, RefreshCw, Settings, MoreHorizontal, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { 
  AISummaryPivotTable, 
  type CachedPivotData,
  getDateRange,
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
      const dateBreakdownData: Record<string, Record<DateTab, Array<{ dateGroup: string; metrics: Record<string, number> }>>> = {};

      const dateRanges: Record<DateTab, { start: Date; end: Date }> = {
        last_month: getDateRange("last_month"),
        mtd: getDateRange("mtd"),
        ytd: getDateRange("ytd"),
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
            }
          });
        }
        
        // Always compute date breakdown data (grouped by week for last_month/mtd, by year for ytd)
        dateBreakdownData[reportId] = { last_month: [], mtd: [], ytd: [] };
        
        // Find date dimension ID
        const dateDimId = metricNameToIdMap['Date'] || metricNameToIdMap['date'] || metricNameToIdMap['Day'];
        
        // Get rows filtered by dimension filter
        const baseRows = sourceData.transformedRows.filter((row: any) => {
          if (!dimensionFilter || dimensionFilter.values.length === 0) return true;
          const rowData = row.dimension_values || row;
          const dimVal = rowData[dimensionFilter.dimensionId] || 
                         (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
          return dimVal !== undefined && dimensionFilter.values.includes(String(dimVal));
        });
        
        (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
          const dateRange = dateRanges[tab];
          
          // Group rows by date group (week or year)
          const dateGroups: Record<string, any[]> = {};
          
          baseRows.forEach((row: any) => {
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
              dateGroups[groupKey] = [];
            }
            dateGroups[groupKey].push(row);
          });
          
          // Aggregate metrics for each date group
          Object.entries(dateGroups).forEach(([dateGroup, groupRows]) => {
            const metrics = aggregateMetrics(
              groupRows,
              card.selected_metrics,
              dateRange,
              undefined,
              metricNameToIdMap
            );
            
            dateBreakdownData[reportId][tab].push({
              dateGroup,
              metrics,
            });
          });
          
          // Sort by date group
          dateBreakdownData[reportId][tab].sort((a, b) => 
            a.dateGroup.localeCompare(b.dateGroup)
          );
        });
      }

      toast.dismiss("refresh-pivot");

      // Save to database including breakdown data and date breakdown data
      const { error } = await (supabase.from("ai_summary_cards") as any)
        .update({
          cached_pivot_data: { ...pivotData, breakdown_data: breakdownData, date_breakdown_data: dateBreakdownData },
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
          ? { ...c, cached_pivot_data: { ...pivotData, breakdown_data: breakdownData, date_breakdown_data: dateBreakdownData }, pivot_data_refreshed_at: new Date().toISOString() }
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

      toast.info("Fetching data from sources...");

      // Fetch data for each report
      const reportData: Array<{ reportName: string; rows: Array<Record<string, any>> }> = [];

      for (const reportId of card.report_ids) {
        const report = reports.find(r => r.id === reportId);
        if (!report) continue;

        // Fetch data source
        const { data: dsData, error: dsError } = await supabase
          .from("data_sources")
          .select("*")
          .eq("report_id", reportId)
          .limit(1)
          .maybeSingle();

        if (dsError || !dsData) {
          console.error(`Error fetching data source for report ${reportId}:`, dsError);
          continue;
        }

        // Fetch source data
        const sourceData = await fetchSourceData(dsData as DataSource, user.id, accountId);
        
        if (sourceData?.transformedRows) {
          // Filter by date if sinceDate is set
          const sinceDate = new Date(card.since_date);
          const filteredRows = sourceData.transformedRows.filter((row: any) => {
            // Find the date column
            const dateValue = row.Date || row.date || row.Day || row.day;
            if (!dateValue) return true;
            const rowDate = new Date(dateValue);
            return rowDate >= sinceDate;
          });

          reportData.push({
            reportName: report.name,
            rows: filteredRows
          });
        }
      }

      if (reportData.length === 0) {
        toast.error("No data available for analysis");
        return;
      }

      toast.info("Generating AI summary with GPT-4 Turbo...");

      // Call the edge function
      const { data: result, error: fnError } = await supabase.functions.invoke('generate-ai-summary', {
        body: {
          cardId: card.id,
          reportData,
          selectedMetrics: card.selected_metrics,
          sinceDate: card.since_date,
          aiPrompt: card.ai_prompt
        }
      });

      if (fnError) {
        console.error("Error calling AI function:", fnError);
        toast.error("Failed to generate summary");
        return;
      }

      if (result?.error) {
        console.error("AI function error:", result.error);
        toast.error(result.error);
        return;
      }

      // Update the card with the generated summary
      const { error: updateError } = await (supabase.from("ai_summary_cards") as any)
        .update({
          generated_summary: result.summary,
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
          ? { ...c, generated_summary: result.summary, last_generated_at: new Date().toISOString() }
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
              <Card key={card.id} className="overflow-hidden">
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
                    <span className="font-medium">{card.name}</span>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleGenerateSummary(card)}
                      disabled={generatingCardId === card.id}
                    >
                      {generatingCardId === card.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
                        <DropdownMenuItem 
                          className="text-destructive"
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
                
                {/* AI Summary Content */}
                <CardContent className="p-0 min-h-[200px] flex items-center justify-center border-t">
                  {generatingCardId === card.id ? (
                    <div className="flex flex-col items-center gap-4 text-muted-foreground py-8">
                      <Loader2 className="h-12 w-12 animate-spin" />
                      <p>Generating AI summary...</p>
                    </div>
                  ) : card.generated_summary ? (
                    <div className="p-6 w-full">
                      <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                        {card.generated_summary}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-muted-foreground py-8">
                      <div className="relative">
                        <div className="absolute -top-2 -right-2">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L5.7 21 8 14l-6-4.6h7.6L12 2z" />
                          </svg>
                        </div>
                        <div className="absolute top-0 right-6">
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 6h16M4 12h16M4 18h10" />
                          </svg>
                        </div>
                        <div className="w-16 h-16 rounded-full border-2 border-muted flex items-center justify-center">
                          <Sparkles className="h-8 w-8" />
                        </div>
                        <div className="absolute -bottom-1 -left-2">
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>
                        <div className="absolute -bottom-2 right-0">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L5.7 21 8 14l-6-4.6h7.6L12 2z" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-center">Click refresh to generate AI summary</p>
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
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
              {viewingSummary?.generated_summary}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AISummaryPage;
