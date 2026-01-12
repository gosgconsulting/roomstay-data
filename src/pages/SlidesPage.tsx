import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { ArrowLeft, Plus, Presentation, LogOut, ChevronDown, Trash2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SlideListItem } from "@/components/slides/SlideListItem";
import { CreateSlideModal } from "@/components/slides/CreateSlideModal";
import { useSlides, useDeleteSlide, useRefreshSlideData } from "@/hooks/useSlides";
import { useSlideReports, useDeleteSlideReport } from "@/hooks/useSlideReports";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SlideWithDetails } from "@/types/slides";
import { SlideReport } from "@/types/slideReports";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  description: string | null;
}

export default function SlidesPage() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slideToDelete, setSlideToDelete] = useState<SlideWithDetails | null>(null);
  const [refreshingSlideId, setRefreshingSlideId] = useState<string | null>(null);
  const [isOtherReportsOpen, setIsOtherReportsOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<SlideReport | null>(null);
  const [deleteReportDialogOpen, setDeleteReportDialogOpen] = useState(false);

  const { data: slides = [], isLoading: slidesLoading } = useSlides(accountId || null);
  const { data: slideReports = [], isLoading: slideReportsLoading } = useSlideReports(accountId || null);
  const deleteSlide = useDeleteSlide();
  const refreshSlideData = useRefreshSlideData();
  const deleteSlideReport = useDeleteSlideReport();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (session && accountId) {
      loadAccount();
    }
  }, [session, accountId]);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) throw error;

      if (!session) {
        navigate("/auth");
        return;
      }

      setSession(session);
    } catch (error) {
      console.error("Error checking auth:", error);
      toast({
        title: "Authentication Error",
        description: "Please sign in again.",
        variant: "destructive",
      });
      navigate("/auth");
    }
  };

  const loadAccount = async () => {
    if (!session || !accountId) return;

    try {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, description")
        .eq("id", accountId)
        .eq("user_id", session.user.id)
        .single();

      if (error) throw error;

      if (!data) {
        toast({
          title: "Account Not Found",
          description: "This account does not exist or you don't have access.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setAccount(data);
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading account:", error);
      toast({
        title: "Error",
        description: "Failed to load account.",
        variant: "destructive",
      });
      navigate("/");
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleViewSlide = (slide: SlideWithDetails) => {
    navigate(`/tools/reports/${accountId}/view/${slide.id}`);
  };

  const handleEditSlide = (slide: SlideWithDetails) => {
    navigate(`/tools/reports/${accountId}/edit/${slide.id}`);
  };

  const handleDeleteSlide = (slide: SlideWithDetails) => {
    setSlideToDelete(slide);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!slideToDelete || !accountId) return;
    
    deleteSlide.mutate({
      id: slideToDelete.id,
      account_id: accountId,
    });
    setDeleteDialogOpen(false);
    setSlideToDelete(null);
  };

  const handleRefreshSlide = async (slide: SlideWithDetails) => {
    setRefreshingSlideId(slide.id);
    try {
      await refreshSlideData.mutateAsync(slide.id);
    } finally {
      setRefreshingSlideId(null);
    }
  };

  const handleSlideCreated = (slide: any) => {
    toast({
      title: "Slide created",
      description: "Your slide has been created. Fetching data...",
    });
    // Refresh data for the new slide
    refreshSlideData.mutate(slide.id);
  };

  const handleViewSlideReport = (report: SlideReport) => {
    navigate(`/tools/reports/${accountId}/master-report?reportId=${report.id}`);
  };

  const handleDeleteSlideReport = (report: SlideReport) => {
    setReportToDelete(report);
    setDeleteReportDialogOpen(true);
  };

  const confirmDeleteReport = async () => {
    if (!reportToDelete || !accountId) return;
    
    deleteSlideReport.mutate({
      id: reportToDelete.id,
      account_id: accountId,
    });
    setDeleteReportDialogOpen(false);
    setReportToDelete(null);
  };

  const formatDateRange = (report: SlideReport) => {
    if (!report.date_range) return "No date range set";
    const dr = report.date_range;
    return `${dr.month} ${dr.year} to present`;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/?account=${accountId}`)}
              title="Back to account"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Presentation className="h-6 w-6" />
                Reports
              </h1>
              <p className="text-sm text-muted-foreground">
                {account?.name} • Pre-rendered data snapshots
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{session?.user?.email}</p>
              <p className="text-xs text-muted-foreground">Account</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Section Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Your Reports</h2>
              <p className="text-sm text-muted-foreground">
                {slideReports.length + 1} report{slideReports.length !== 0 ? "s" : ""}
              </p>
            </div>
            <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Report
            </Button>
          </div>

          {/* Reports List */}
          <div className="space-y-4">
            {/* Master Report Card - Always shown */}
            <Card 
              className="p-4 hover:shadow-md transition-shadow cursor-pointer border-primary/20 bg-primary/5" 
              onClick={() => navigate(`/tools/reports/${accountId}/master-report`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Presentation className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Master Report</h3>
                    <p className="text-sm text-muted-foreground">All accounts/hotels • January 2024 to present</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">View Report</Button>
              </div>
            </Card>

            {/* Other Reports Dropdown */}
            {slideReportsLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Loading reports...</p>
              </div>
            ) : slideReports.length > 0 ? (
              <Collapsible open={isOtherReportsOpen} onOpenChange={setIsOtherReportsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between px-4 py-3 h-auto border rounded-lg hover:bg-muted/50">
                    <span className="text-sm font-medium">
                      Other Reports ({slideReports.length})
                    </span>
                    <ChevronDown className={cn(
                      "h-4 w-4 transition-transform",
                      isOtherReportsOpen && "rotate-180"
                    )} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  {slideReports.map((report) => (
                    <Card 
                      key={report.id}
                      className="p-3 hover:shadow-sm transition-shadow cursor-pointer border-muted"
                      onClick={() => handleViewSlideReport(report)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                            <Presentation className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <h4 className="font-medium text-sm">{report.name}</h4>
                            <p className="text-xs text-muted-foreground">{formatDateRange(report)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSlideReport(report);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                          <Button variant="outline" size="sm">View</Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            {/* Create First Report CTA - Only show if no custom reports */}
            {slideReports.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Presentation className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No custom reports yet</h3>
                  <p className="text-muted-foreground mb-6">
                    Create your first report to display pre-rendered data snapshots.
                  </p>
                  <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Your First Report
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Create Modal */}
      {session && accountId && (
        <CreateSlideModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          accountId={accountId}
          userId={session.user.id}
          onSlideCreated={handleSlideCreated}
        />
      )}

      {/* Delete Slide Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{slideToDelete?.name}"? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Slide Report Confirmation Dialog */}
      <AlertDialog open={deleteReportDialogOpen} onOpenChange={setDeleteReportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{reportToDelete?.name}"? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteReport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
