import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { BudgetModal } from "@/components/BudgetModal";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { Session } from "@supabase/supabase-js";

interface Budget {
  id: string;
  dimension_name: string;
  dimension_item: string;
  budget_data: Record<string, Record<string, number>>;
  created_at: string;
  updated_at: string;
}

export default function BudgetPage() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId?: string }>();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (session) {
      loadBudgets();
    }
  }, [session, accountId]);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      if (!session) {
        navigate("/auth");
        return;
      }

      // Load default report for the account if accountId is provided
      if (accountId) {
        const { data: reports } = await supabase
          .from("reports")
          .select("id")
          .eq("account_id", accountId)
          .limit(1)
          .single();

        if (reports) {
          setReportId(reports.id);
        }
      }
    } catch (error) {
      console.error("Error checking auth:", error);
      navigate("/auth");
    }
  };

  const loadBudgets = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = (supabase as any)
        .from("budgets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      // Filter by account if accountId is provided
      if (accountId) {
        query = query.eq("account_id", accountId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setBudgets(data || []);
    } catch (error) {
      console.error("Error loading budgets:", error);
      toast({
        title: "Error",
        description: "Failed to load budgets",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingBudget(null);
    setShowBudgetModal(true);
  };

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setShowBudgetModal(true);
  };

  const handleDelete = async () => {
    if (!deletingBudget) return;

    try {
      const { error } = await (supabase as any)
        .from("budgets")
        .delete()
        .eq("id", deletingBudget.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Budget deleted successfully",
      });

      setDeletingBudget(null);
      loadBudgets();
    } catch (error) {
      console.error("Error deleting budget:", error);
      toast({
        title: "Error",
        description: "Failed to delete budget",
        variant: "destructive",
      });
    }
  };

  const handleModalSuccess = () => {
    loadBudgets();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        reportId={reportId}
        accountId={accountId}
        onReportChange={setReportId}
        session={session}
        onSignOut={handleSignOut}
        title="Budget Management"
      />

      <div className="container mx-auto px-6 py-8">
        {/* Header with Add Button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Budgets</h1>
            <p className="text-muted-foreground mt-1">
              Manage your budget allocations by dimension and item
            </p>
          </div>
          <Button onClick={handleAddNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Add new budget
          </Button>
        </div>

        {/* Budget List */}
        {budgets.length === 0 ? (
          <div className="border rounded-lg p-12 text-center">
            <p className="text-muted-foreground mb-4">No budgets created yet</p>
            <Button onClick={handleAddNew} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create your first budget
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((budget) => (
              <div
                key={budget.id}
                className="border rounded-lg p-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-foreground">
                      {budget.dimension_name}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{budget.dimension_item}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Created {new Date(budget.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(budget)}
                    className="h-8 w-8"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingBudget(budget)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Budget Modal */}
      <BudgetModal
        open={showBudgetModal}
        onOpenChange={setShowBudgetModal}
        budget={editingBudget}
        reportId={reportId}
        accountId={accountId || undefined}
        onSuccess={handleModalSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingBudget}
        onOpenChange={(open) => !open && setDeletingBudget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the budget for{" "}
              <strong>{deletingBudget?.dimension_name}</strong> -{" "}
              <strong>{deletingBudget?.dimension_item}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

