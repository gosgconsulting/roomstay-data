import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Plus, Trash2, Calendar, BarChart3, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddAICardModal } from "@/components/AddAICardModal";
import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/auth";
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

const AISummaryPage = () => {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [cards, setCards] = useState<AISummaryCard[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCards = async () => {
    try {
      const { user } = await getUser();
      if (!user) return;

      const query = supabase
        .from("ai_summary_cards")
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

      setCards((data || []) as unknown as AISummaryCard[]);
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
      const { error } = await supabase
        .from("ai_summary_cards")
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
              <Card key={card.id} className="relative group">
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
                <CardContent className="space-y-3">
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
                  {card.generated_summary ? (
                    <div className="pt-3 border-t">
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {card.generated_summary}
                      </p>
                    </div>
                  ) : (
                    <div className="pt-3 border-t">
                      <Badge variant="outline" className="text-xs">
                        Not generated yet
                      </Badge>
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
    </div>
  );
};

export default AISummaryPage;
