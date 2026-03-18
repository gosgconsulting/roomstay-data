import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { ArrowLeft, Presentation, LogOut, Trash2, RefreshCw, Database, Layers, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SlideListItem } from "@/components/slides/SlideListItem";
import { useSlides, useDeleteSlide, useRefreshSlideData } from "@/hooks/useSlides";
import { useSlideReports, useDeleteSlideReport, useCreateSlideReport } from "@/hooks/useSlideReports";
import { SlideReport } from "@/types/slideReports";
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
import { SlideWithDetails } from "@/types/slides";

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slideToDelete, setSlideToDelete] = useState<SlideWithDetails | null>(null);
  const [refreshingSlideId, setRefreshingSlideId] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<SlideReport | null>(null);
  const [deleteReportDialogOpen, setDeleteReportDialogOpen] = useState(false);

  const queryClient = useQueryClient();
  const { data: slides = [], isLoading: slidesLoading } = useSlides(accountId || null);
  const { data: slideReports = [], isLoading: slideReportsLoading } = useSlideReports(accountId || null);
  const deleteSlide = useDeleteSlide();
  const refreshSlideData = useRefreshSlideData();
  const deleteSlideReport = useDeleteSlideReport();
  const createSlideReport = useCreateSlideReport();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (session && accountId) {
      loadAccount();
    }
  }, [session, accountId]);

  // Ensure one Data Studio report exists per account (create if none)
  const [dataStudioCreateAttempted, setDataStudioCreateAttempted] = useState(false);
  useEffect(() => {
    if (!accountId || !session || slideReportsLoading || dataStudioCreateAttempted) return;
    const dataStudio = slideReports?.find(r => r.name === 'Data Studio');
    if (dataStudio) {
      setDataStudioCreateAttempted(true);
      return;
    }
    setDataStudioCreateAttempted(true);
    createSlideReport.mutate({
      name: 'Data Studio',
      account_id: accountId,
      user_id: session.user.id,
      configuration: undefined,
      report_ids: undefined,
      date_range: undefined,
      description: 'Data Studio: data sources and dimensions. Fetches directly from sources each time.',
    });
  }, [accountId, session, slideReports, slideReportsLoading, dataStudioCreateAttempted, createSlideReport]);

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

  const dataStudioReport = slideReports?.find(r => r.name === 'Data Studio') || null;

  const handleOpenDataStudio = () => {
    if (dataStudioReport) {
      navigate(`/tools/reports/${accountId}/data-studio?reportId=${dataStudioReport.id}`);
    } else {
      navigate(`/tools/reports/${accountId}/data-studio`);
    }
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
              onClick={() => navigate("/")}
              title="Back to dashboard"
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
          <div className="mb-6">
            <div>
              <h2 className="text-xl font-semibold">Reports</h2>
              <p className="text-sm text-muted-foreground">Data Studio — data sources and dimensions</p>
            </div>
          </div>

          {/* Single Data Studio entry */}
          <div className="space-y-4">
            <Card
              className="p-4 hover:shadow-md transition-shadow cursor-pointer border-primary/20 bg-primary/5"
              onClick={handleOpenDataStudio}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Database className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Data Studio</h3>
                    <p className="text-sm text-muted-foreground">
                      Data sources and dimensions • Fetches directly from sources each time
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm">Open</Button>
              </div>
            </Card>
          </div>

          {/* Data Sources and Dimensions Cards */}
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-6">Configuration</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Data Sources Card */}
              <Card
                className="hover:shadow-lg hover:border-primary/50 cursor-pointer transition-all group"
                onClick={() => navigate(`/tools/data-sources/${accountId}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary">
                      <Database className="h-6 w-6" />
                    </div>
                  </div>
                  <CardTitle className="mt-4 flex items-center gap-2">
                    Data Sources
                  </CardTitle>
                  <CardDescription>Manage database sources and add new ones</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">
                    Open Data Sources
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>

              {/* Dimensions Card */}
              <Card
                className="hover:shadow-lg hover:border-primary/50 cursor-pointer transition-all group"
                onClick={() => navigate(`/tools/dimensions/${accountId}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary">
                      <Layers className="h-6 w-6" />
                    </div>
                  </div>
                  <CardTitle className="mt-4 flex items-center gap-2">
                    Dimensions
                  </CardTitle>
                  <CardDescription>View and manage text and value dimensions</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">
                    Open Dimensions
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

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
