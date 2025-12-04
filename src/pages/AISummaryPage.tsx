import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Plus, Trash2, Calendar, BarChart3, FileText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generatingCardId, setGeneratingCardId] = useState<string | null>(null);
  const [viewingSummary, setViewingSummary] = useState<AISummaryCard | null>(null);

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

  const getReportNames = (reportIds: string[]) => {
    return reportIds
      .map(id => reports.find(r => r.id === id)?.name || "Unknown")
      .join(", ");
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map(card => (
              <Card key={card.id} className="relative group flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <CardTitle className="text-lg">{card.name}</CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setDeleteCardId(card.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Created {format(new Date(card.created_at), "MMM d, yyyy")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span className="truncate">
                      {getReportNames(card.report_ids) || "No reports"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Since {format(new Date(card.since_date), "MMM d, yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    <span>{card.selected_metrics.length} metrics</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-2">
                    {card.selected_metrics.slice(0, 4).map(metric => (
                      <Badge key={metric} variant="secondary" className="text-xs">
                        {metric}
                      </Badge>
                    ))}
                    {card.selected_metrics.length > 4 && (
                      <Badge variant="outline" className="text-xs">
                        +{card.selected_metrics.length - 4}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex-1" />
                  
                  {card.generated_summary ? (
                    <div className="pt-3 border-t space-y-2">
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {card.generated_summary}
                      </p>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => setViewingSummary(card)}
                        >
                          View Full
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleGenerateSummary(card)}
                          disabled={generatingCardId === card.id}
                        >
                          {generatingCardId === card.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 border-t">
                      <Button 
                        className="w-full" 
                        size="sm"
                        onClick={() => handleGenerateSummary(card)}
                        disabled={generatingCardId === card.id}
                      >
                        {generatingCardId === card.id ? (
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
        onOpenChange={setIsAddCardModalOpen}
        onCardCreated={fetchCards}
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
