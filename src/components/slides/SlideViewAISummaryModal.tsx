import React, { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractMinimalAIData } from "@/lib/extractMinimalAIData";
import type { MinimalAIData } from "@/lib/extractMinimalAIData";
import type { ComparisonOption } from "@/components/GenerateAISummaryModal";
import type { SlideReportView } from "@/types/slideReports";
import type { SlideReportPivotData } from "@/types/slideReports";
import { generateBidManagementSummary } from "@/lib/bidManagementAlgorithm";
import { useSaveSlideReportSummary } from "@/hooks/useSlideReportSummaries";

interface SlideViewAISummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  minimalData: MinimalAIData | null;
  selectedTab: 'overview' | 'metasearch' | 'sem' | 'social';
  selectedYear: string;
  selectedMonth: string;
  pivotData: SlideReportPivotData | null;
  availableViews: Array<{ id: string | null; name: string }>;
  views: SlideReportView[];
  slideReportId: string | null;
  onApplyView?: (viewId: string | null) => void;
  onApplyComparisonType?: (comparisonType: ComparisonOption) => void;
}

export function SlideViewAISummaryModal({
  open,
  onOpenChange,
  minimalData: initialMinimalData,
  selectedTab,
  selectedYear,
  selectedMonth,
  pivotData,
  availableViews,
  views,
  slideReportId,
  onApplyView,
  onApplyComparisonType,
}: SlideViewAISummaryModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [comparisonType, setComparisonType] = useState<ComparisonOption>("none");
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const saveSummaryMutation = useSaveSlideReportSummary();

  // Get the selected view
  const selectedView = useMemo(() => {
    if (!selectedViewId) return null;
    return views.find(v => v.id === selectedViewId) || null;
  }, [selectedViewId, views]);

  // Extract minimal data based on selected view or current filters
  const minimalData = useMemo(() => {
    if (!pivotData) return initialMinimalData;

    // If a view is selected, use view's tab, year/month and filters
    if (selectedView) {
      // Use view's tab if available, otherwise fall back to current selectedTab
      const tabToUse = selectedView.tab || selectedTab;
      return extractMinimalAIData(
        pivotData,
        tabToUse,
        selectedView.selected_year,
        selectedView.selected_month,
        selectedView.filter_values
      );
    }

    // Otherwise use current year/month and no filters (or initial minimal data)
    return initialMinimalData;
  }, [pivotData, selectedTab, selectedView, initialMinimalData]);

  const handleGenerate = async () => {
    if (currentStep !== 3) {
      toast.error("Please complete all steps before generating");
      return;
    }

    if (!selectedViewId) {
      toast.error("Please select a view");
      return;
    }

    if (!minimalData) {
      toast.error("No data available for the selected period");
      return;
    }

    setIsGenerating(true);
    setSummary(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        return;
      }

      let useAlgorithm = false;
      let aiSummary: string | null = null;

      // Log minimalData to debug comparison data
      console.log('[AI Summary] Minimal data:', {
        hasComparison: !!minimalData.comparison,
        previousPeriod: minimalData.comparison?.previous_period,
        previousYear: minimalData.comparison?.previous_year,
        metrics: Object.keys(minimalData.metrics),
        comparisonType,
      });
      
      // Log pivotData to check if comparison data exists
      if (pivotData) {
        console.log('[AI Summary] PivotData comparison check:', {
          hasOverview: !!pivotData.overview,
          overviewPreviousPeriod: pivotData.overview?.previous_period,
          overviewPreviousYear: pivotData.overview?.previous_year,
          channelPreviousPeriod: pivotData.channels[selectedTab]?.previous_period,
          channelPreviousYear: pivotData.channels[selectedTab]?.previous_year,
        });
      }

      // Determine which tab to use: view's tab if available, otherwise current tab
      const tabToUse = selectedView?.tab || selectedTab;
      
      try {
        // Use supabase.functions.invoke for proper authentication
        const { data: result, error: invokeError } = await supabase.functions.invoke('generate-ai-summary', {
          body: {
            minimalData: minimalData,
            selectedTab: tabToUse,
            selectedYear: selectedView ? selectedView.selected_year : selectedYear,
            selectedMonth: selectedView ? selectedView.selected_month : selectedMonth,
            comparisonType: comparisonType,
            isTableComment: false,
            aiPrompt: comparisonType === 'none' 
              ? `Analyze the following ${tabToUse === 'overview' ? 'overview' : tabToUse.toUpperCase()} performance data for ${selectedView ? `${selectedView.selected_month} ${selectedView.selected_year}` : `${selectedMonth} ${selectedYear}`}${selectedView ? ` (View: ${selectedView.name})` : ''}. Provide a concise executive summary focusing on key metrics and trends. DO NOT make any comparisons to previous periods or years. Include absolute KPI values for all metrics.`
              : `Analyze the following ${tabToUse === 'overview' ? 'overview' : tabToUse.toUpperCase()} performance data for ${selectedView ? `${selectedView.selected_month} ${selectedView.selected_year}` : `${selectedMonth} ${selectedYear}`}${selectedView ? ` (View: ${selectedView.name})` : ''}. Provide a concise executive summary focusing on key metrics, trends, and actionable insights. When mentioning changes, ALWAYS include both the percentage change AND the absolute values in the format: "Metric changed by X% (currentValue vs comparisonValue)". Example: "Revenue increased by 8% ($200K vs $185K)".`,
          },
        });

        if (invokeError) {
          console.error("Error calling AI function:", invokeError);
          const errorMessage = invokeError.message || invokeError.toString();
          if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            toast.error("Authentication error: Please refresh the page and try again");
          } else {
            toast.error(`API error: ${errorMessage}`);
          }
          useAlgorithm = true;
        } else if (result?.error) {
          console.error("AI function error:", result.error);
          toast.error(`AI error: ${result.error}`);
          useAlgorithm = true;
        } else {
          aiSummary = result.summary || result.executiveSummary || null;
        }
      } catch (error) {
        console.error("Network error calling AI function, using algorithm fallback:", error);
        toast.error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        useAlgorithm = true;
      }

      // Use algorithm as fallback if AI failed
      let finalSummary: string;
      let summarySource: 'ai' | 'algorithm' = 'ai';
      
      if (useAlgorithm || !aiSummary) {
        console.log("[Bid Management] Using rule-based algorithm as fallback");
        // Use view's tab if available, otherwise use current tab
        const tabToUse = selectedView?.tab || selectedTab;
        const algorithmResult = generateBidManagementSummary(minimalData, tabToUse, comparisonType);
        finalSummary = algorithmResult.summary;
        summarySource = 'algorithm';
        toast.success("Bid Management Analysis generated!");
      } else {
        finalSummary = aiSummary;
        toast.success("AI Summary generated!");
      }

      // Save summary to database
      if (slideReportId && finalSummary) {
        try {
          // Use view's tab if available, otherwise use current tab
          const tabToUse = selectedView?.tab || selectedTab;
          
          await saveSummaryMutation.mutateAsync({
            slide_report_id: slideReportId,
            tab: tabToUse,
            selected_year: selectedView ? selectedView.selected_year : selectedYear,
            selected_month: selectedView ? selectedView.selected_month : selectedMonth,
            view_id: selectedView?.id || null,
            comparison_type: comparisonType,
            summary_text: finalSummary,
            source: summarySource,
          });
          
          // Close modal immediately after successful save - summary will appear in page below tables
          setTimeout(() => {
            handleClose();
          }, 500); // Small delay to show success message
        } catch (error) {
          console.error("Failed to save summary:", error);
          toast.error("Summary generated but failed to save. Please try again.");
          // Show summary in modal as fallback if save fails
          setSummary(finalSummary);
        }
      } else {
        // If no slideReportId, show in modal as fallback
        setSummary(finalSummary);
      }
    } catch (error) {
      console.error("Error generating AI summary:", error);
      toast.error("Failed to generate summary. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1) {
      // Step 1: Validate view selected, apply view, move to step 2
      if (!selectedViewId) {
        toast.error("Please select a view");
        return;
      }
      // Apply view to parent page
      if (onApplyView) {
        onApplyView(selectedViewId);
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // Step 2: Apply comparison type, move to step 3
      if (onApplyComparisonType) {
        onApplyComparisonType(comparisonType);
      }
      setCurrentStep(3);
    }
  };

  const handleClose = () => {
    setSummary(null);
    setIsGenerating(false);
    setComparisonType("none");
    setSelectedViewId(null);
    setCurrentStep(1);
    onOpenChange(false);
  };
  
  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSummary(null);
      setIsGenerating(false);
      setComparisonType("none");
      setSelectedViewId(null);
      setCurrentStep(1);
    }
  }, [open]);

  const canGenerate = minimalData !== null && !isGenerating;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Summary - {(() => {
              const tabToUse = selectedView?.tab || selectedTab;
              return tabToUse === 'overview' ? 'Overview' : tabToUse.charAt(0).toUpperCase() + tabToUse.slice(1);
            })()}
          </DialogTitle>
          <DialogDescription>
            {selectedView 
              ? `${selectedView.selected_month} ${selectedView.selected_year} (${selectedView.name})`
              : `${selectedMonth} ${selectedYear}`
            } • {(() => {
              const tabToUse = selectedView?.tab || selectedTab;
              return tabToUse === 'overview' ? 'All Channels' : tabToUse.toUpperCase();
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {!summary && !isGenerating ? (
            <>
              {/* Step 1: Select View */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Select View</Label>
                    {availableViews.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                        No views available. Please create a view first.
                      </div>
                    ) : (
                      <>
                        <Select
                          value={selectedViewId || ""}
                          onValueChange={(value) => setSelectedViewId(value || null)}
                          disabled={isGenerating}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a view" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableViews.map((view) => (
                              <SelectItem key={view.id || "master"} value={view.id || "master"}>
                                {view.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedView && (
                          <p className="text-xs text-muted-foreground">
                            Using view: {selectedView.name} ({selectedView.selected_month} {selectedView.selected_year})
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Select Comparison Type */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Comparison Type</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={comparisonType === "none" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setComparisonType("none")}
                        disabled={isGenerating}
                      >
                        None
                      </Button>
                      <Button
                        variant={comparisonType === "previous_period" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setComparisonType("previous_period")}
                        disabled={isGenerating}
                      >
                        vs Previous Period
                      </Button>
                      <Button
                        variant={comparisonType === "previous_year" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setComparisonType("previous_year")}
                        disabled={isGenerating}
                      >
                        vs Previous Year
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Ready to Generate */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  {selectedView && (
                    <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
                      <p className="font-medium mb-1">View: {selectedView.name}</p>
                      <p className="mb-2">{selectedView.selected_month} {selectedView.selected_year}</p>
                      <p className="font-medium mb-1">Comparison: {comparisonType === "none" ? "None" : comparisonType === "previous_period" ? "Previous Period" : "Previous Year"}</p>
                    </div>
                  )}
                  {minimalData && (
                    <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
                      <p className="font-medium mb-1">Data Summary:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {Object.entries(minimalData.metrics).map(([channel, metrics]) => (
                          <li key={channel}>
                            {channel === 'overview' ? 'Overview' : channel.toUpperCase()}: 
                            {' '}
                            {metrics.impressions.toLocaleString()} impressions, 
                            {' '}
                            ${metrics.revenue.toLocaleString()} revenue, 
                            {' '}
                            {metrics.bookings} bookings
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose} disabled={isGenerating}>
                  Cancel
                </Button>
                {currentStep < 3 ? (
                  <Button onClick={handleNext} disabled={isGenerating || (currentStep === 1 && !selectedViewId) || (currentStep === 1 && availableViews.length === 0)}>
                    Next
                  </Button>
                ) : (
                  <Button onClick={handleGenerate} disabled={!canGenerate || !selectedViewId}>
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Summary
                      </>
                    )}
                  </Button>
                )}
              </div>
            </>
          ) : isGenerating ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Generating summary...</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Build a minimal data context string for the AI prompt
 */
function buildDataContext(data: MinimalAIData, comparisonType: ComparisonOption): string {
  const { period, metrics, comparison } = data;
  
  let context = `Performance Data for ${period.month} ${period.year} (${data.view === 'overview' ? 'Overview - All Channels' : data.view.toUpperCase()})\n\n`;
  
  // Add metrics
  context += "METRICS:\n";
  Object.entries(metrics).forEach(([channel, channelMetrics]) => {
    const channelLabel = channel === 'overview' ? 'Overview' : channel.toUpperCase();
    context += `\n${channelLabel}:\n`;
    context += `  Impressions: ${channelMetrics.impressions.toLocaleString()}\n`;
    context += `  Clicks: ${channelMetrics.clicks.toLocaleString()}\n`;
    context += `  Cost: $${channelMetrics.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    context += `  Revenue: $${channelMetrics.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    context += `  Bookings: ${channelMetrics.bookings}\n`;
    context += `  CTR: ${channelMetrics.ctr.toFixed(2)}%\n`;
    context += `  Conversion Rate: ${channelMetrics.conversionRate.toFixed(2)}%\n`;
    context += `  CPC: $${channelMetrics.cpc.toFixed(2)}\n`;
    context += `  ROAS: ${channelMetrics.roas.toFixed(2)}x\n`;
    context += `  Cost of Sale: ${channelMetrics.costOfSale.toFixed(2)}%\n`;
  });

  // Add comparison data if available and comparison type is not "none"
  if (comparison && comparisonType !== "none") {
    context += "\n\nCOMPARISON DATA:\n";
    if (comparison.previous_period && comparisonType === "previous_period") {
      context += "\nPrevious Period:\n";
      context += `  Impressions: ${comparison.previous_period.impressions.toLocaleString()}\n`;
      context += `  Clicks: ${comparison.previous_period.clicks.toLocaleString()}\n`;
      context += `  Cost: $${comparison.previous_period.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      context += `  Revenue: $${comparison.previous_period.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      context += `  Bookings: ${comparison.previous_period.bookings}\n`;
    }
    if (comparison.previous_year && comparisonType === "previous_year") {
      context += "\nPrevious Year:\n";
      context += `  Impressions: ${comparison.previous_year.impressions.toLocaleString()}\n`;
      context += `  Clicks: ${comparison.previous_year.clicks.toLocaleString()}\n`;
      context += `  Cost: $${comparison.previous_year.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      context += `  Revenue: $${comparison.previous_year.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      context += `  Bookings: ${comparison.previous_year.bookings}\n`;
    }
  }

  return context;
}
