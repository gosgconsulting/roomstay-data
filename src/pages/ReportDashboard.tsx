import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import KPIChartsGrid from "@/components/KPIChartsGrid";
import { PerformanceTable } from "@/components/PerformanceTable";

import { KPISettingsModal } from "@/components/KPISettingsModal";
import { LoadingToast } from "@/components/LoadingToast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ReportsSidebar } from "@/components/ReportsSidebar";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Database, Grid3x3, GitCompare, Star, Share2, Settings, Code } from "lucide-react";
import { ShareModal } from "@/components/ShareModal";
import { APIBuilderModal } from "@/components/APIBuilderModal";
import { useQueryClient } from "@tanstack/react-query";
import { resyncAllDimensions } from "@/lib/resync-all-dimensions";
import { resyncReportViews } from "@/lib/resync-report-views";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import { DataSourcesListModal } from "@/components/DataSourcesListModal";
import { DimensionsListModal } from "@/components/DimensionsListModal";
import VlookupModal from "@/components/VlookupModal";
import { ReportModal } from "@/components/ReportModal";
import { CreateAISummaryModal } from "@/components/CreateAISummaryModal";
import { CacheStatusIndicator } from "@/components/CacheStatusIndicator";

interface Account {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  user_id: string;
}

type SidebarReport = { id: string; name: string; account_id: string | null; created_at: string; updated_at: string };

export default function ReportDashboard() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState<Set<string>>(new Set());
  const [isSharedView, setIsSharedView] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [visibilityRefreshTrigger, setVisibilityRefreshTrigger] = useState(0);
  const [kpiSettingsOpen, setKpiSettingsOpen] = useState(false);
  const [loadingGeneration, setLoadingGeneration] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false); // View mode by default
  const [showCreateReportModal, setShowCreateReportModal] = useState(false); // NEW
  const [showAISummaryModal, setShowAISummaryModal] = useState(false);

  // FIX: Add missing state for sidebar reports list
  const [reportsList, setReportsList] = useState<SidebarReport[]>([]);
  
  // AI Summaries state for sidebar
  const [aiSummaries, setAiSummaries] = useState<{ id: string; name: string }[]>([]);

  // FIX: Add missing state for local Share modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAPIBuilderModal, setShowAPIBuilderModal] = useState(false);

  // NEW: Persisted chart metrics (defaults)
  const [chartMetrics, setChartMetrics] = useState<string[]>([
    "Clicks",
    "Cost",
    "Bookings",
    "Revenue",
  ]);

  const handleGridMetricChange = (index: number, metric: string) => {
    setChartMetrics((prev) => prev.map((m, i) => (i === index ? metric : m)));
  };

  // NEW: local modals for Looker-style controls
  const [showDataSourcesListModal, setShowDataSourcesListModal] = useState(false);
  const [showDimensionsListModal, setShowDimensionsListModal] = useState(false);
  const [showVlookupModal, setShowVlookupModal] = useState(false);

  // Derive current report name
  const currentReportName = reportsList.find(r => r.id === reportId)?.name || "Reports";

  // Load dimensions using the same hook as PerformanceTable
  const {
    dimensions,
    dimensionHasData,
    isLoadingDimensions,
    loadDimensions,
  } = usePerformanceTableDimensions({
    reportId,
    accountId: accountId || undefined,
  });
  
  // Filter state - default to all_time to avoid date range issues
  const [filters, setFilters] = useState<FilterState>(() => {
    // console.log('[testing] ReportDashboard - Initializing with all_time preset to avoid date issues');
    
    return {
      dimensionFilters: {},
      dateRange: undefined, // Let FiltersBar handle initial date range
      datePreset: "this_month",
      compareEnabled: false,
      compareType: "previous_period",
      compareDateRange: undefined,
    };
  });

  // // Track filter changes
  // useEffect(() => {
  //   console.log('[testing] ReportDashboard - Filter state updated:', {
  //     dateRange: filters.dateRange,
  //     dateFrom: filters.dateRange?.from?.toISOString(),
  //     dateTo: filters.dateRange?.to?.toISOString(),
  //     preset: filters.datePreset,
  //     timestamp: new Date().toISOString()
  //   });
  // }, [filters]);

  // Stabilize the onFiltersChange callback to prevent unnecessary re-renders
  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    // console.log('[testing] ReportDashboard - Filters changing:', newFilters);
    // console.log('[testing] ReportDashboard - Date filter change details:', {
    //   oldDateRange: filters.dateRange,
    //   newDateRange: newFilters.dateRange,
    //   oldPreset: filters.datePreset,
    //   newPreset: newFilters.datePreset,
    //   dateRangeChanged: JSON.stringify(filters.dateRange) !== JSON.stringify(newFilters.dateRange),
    //   timestamp: new Date().toISOString()
    // });
    setFilters(newFilters);
  }, [filters.dateRange, filters.datePreset]);
  
  // Track component loading states
  const markComponentLoading = (component: string) => {
    // console.log('[LOADING-DEBUG] Component loading:', component);
    setLoadingComponents(prev => {
      const next = new Set(prev).add(component);
      // console.log('[LOADING-DEBUG] Loading components:', Array.from(next));
      return next;
    });
    setIsDataLoading(true);
  };
  
  const markComponentLoaded = (component: string) => {
    // console.log('[LOADING-DEBUG] Component loaded:', component);
    setLoadingComponents(prev => {
      const next = new Set(prev);
      next.delete(component);
      // console.log('[LOADING-DEBUG] Remaining components:', Array.from(next));
      if (next.size === 0) {
        // console.log('[LOADING-DEBUG] All components loaded, hiding loading toast');
        setIsDataLoading(false);
      }
      return next;
    });
  };
  
  // Reset filters and mark loading when report changes
  useEffect(() => {
    if (reportId) {
      // console.log('[testing] ReportDashboard - reportId changed to:', reportId);
      
      // Cancel previous loading by incrementing generation
      setLoadingGeneration(prev => prev + 1);
      
      // Clear previous loading states immediately
      setLoadingComponents(new Set());
      setIsDataLoading(false);
      
      // Don't invalidate caches - let React Query use cached data if available
      // This enables instant loading when switching between reports that have been loaded before
      // Cache will only be invalidated when data actually changes (after sync)
      // console.log('[testing] ReportDashboard - Using cached data if available for instant loading');
      
      // Start new loading cycle (components will use cache if available)
      markComponentLoading('metrics');
      markComponentLoading('chart');
      markComponentLoading('table');
      
      setFilters({
        dimensionFilters: {},
        dateRange: undefined, // Let FiltersBar handle initial date range
        datePreset: "this_month",
        compareEnabled: false,
        compareType: "previous_period",
        compareDateRange: undefined,
      });

      // Load dimensions when reportId changes
      loadDimensions();
    }
  }, [reportId, loadDimensions]);
  
  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (session && accountId) {
      loadAccount();
      loadAISummaries();
    }
  }, [session, accountId]);

  const loadAISummaries = async () => {
    if (!session || !accountId) return;
    
    try {
      const { data, error } = await (supabase.from("ai_summary_cards") as any)
        .select("id, name")
        .eq("user_id", session.user.id)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setAiSummaries(data);
      }
    } catch (err) {
      console.error("Error loading AI summaries:", err);
    }
  };

  const handleEditAISummary = (summaryId: string) => {
    // Navigate to the AI summary page where editing is handled
    navigate(`/tools/ai-summary/${accountId}/${summaryId}`);
  };

  const handleDeleteAISummary = async (summaryId: string) => {
    if (!confirm("Are you sure you want to delete this AI Summary?")) return;
    
    try {
      const { error } = await supabase
        .from("ai_summary_cards")
        .delete()
        .eq("id", summaryId);
      
      if (error) throw error;
      
      setAiSummaries(prev => prev.filter(s => s.id !== summaryId));
      toast({
        title: "AI Summary deleted",
        description: "The AI summary has been deleted successfully.",
      });
    } catch (err) {
      console.error("Error deleting AI summary:", err);
      toast({
        title: "Error",
        description: "Failed to delete the AI summary.",
        variant: "destructive",
      });
    }
  };

  const checkAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (!session) {
        navigate('/auth');
        return;
      }
      
      setSession(session);
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsLoading(false); // Ensure loading is stopped on error
      toast({
        title: "Authentication Error",
        description: "Please sign in again.",
        variant: "destructive",
      });
      navigate('/auth');
    }
  };

  const loadAccount = async () => {
    if (!session || !accountId) return;
    
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', session.user.id)
        .single();
      
      if (error) throw error;
      
      if (!data) {
        toast({
          title: "Account Not Found",
          description: "This account does not exist or you don't have access to it.",
          variant: "destructive",
        });
        navigate('/tools/report');
        return;
      }
      
      setAccount(data);
      
      // Load user's reports for this account
      const { data: reports, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      
      if (reportsError) throw reportsError;
      
      // If user has reports for this account, select the first one or the one from URL params
      if (reports && reports.length > 0) {
        // Save for sidebar
        setReportsList(reports as SidebarReport[]);
        const reportIdFromUrl = searchParams.get('reportId');
        const selectedReportId = reportIdFromUrl && reports.find(r => r.id === reportIdFromUrl)
          ? reportIdFromUrl
          : reports[0].id;
        
        setReportId(selectedReportId);
        
        // Resync dimensions in the background (non-blocking) with react-query cache
        resyncAllDimensions(queryClient, selectedReportId, accountId)
          .then(() => {
            console.log('[RESYNC] Dimension resync completed successfully');
          })
          .catch((error) => {
            console.error('[RESYNC] Error resyncing dimensions:', error);
            // Silently fail - resync is best-effort
          });
        
        // Also resync report views to ensure filter_dimensions includes all text dimensions
        resyncReportViews(selectedReportId, accountId)
          .then(() => {
            // console.log('[RESYNC] Report views resync completed successfully');
            // Increment refresh trigger to reload filters with updated dimensions
            setVisibilityRefreshTrigger(prev => prev + 1);
          })
          .catch((error) => {
            console.error('[RESYNC] Error resyncing report views:', error);
            // Silently fail - resync is best-effort
          });
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading account:', error);
      toast({
        title: "Error",
        description: "Failed to load account.",
        variant: "destructive",
      });
      navigate('/tools/report');
    }
  };
  
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error",
        description: "Failed to sign out.",
        variant: "destructive",
      });
    }
  };
  
  const refreshData = () => {
    // console.log('[DASHBOARD] Starting comprehensive data refresh...');
    
    // Cancel previous loading by incrementing generation
    setLoadingGeneration(prev => prev + 1);
    
    // Clear previous loading states immediately
    setLoadingComponents(new Set());
    setIsDataLoading(false);
    
    // Invalidate all caches to ensure fresh data
    queryClient.invalidateQueries({ queryKey: ['performance-table-data'] });
    queryClient.invalidateQueries({ queryKey: ['performance-table-filters'] });
    queryClient.invalidateQueries({ queryKey: ['ai-summary'] }); // Invalidate AI Summary cache for Last 7 Days
    queryClient.invalidateQueries({ queryKey: ['sourceData'] }); // Invalidate source data cache
    queryClient.invalidateQueries({ queryKey: ['dataSource'] }); // Invalidate data source queries
    
    // console.log('[DASHBOARD] Invalidated all caches for data refresh');
    
    // Start new loading cycle
    markComponentLoading('metrics');
    markComponentLoading('chart');
    markComponentLoading('table');
    
    setDataRefreshKey(prev => prev + 1);
  };

  const handleClearAndResync = async () => {
    if (!accountId) return;
    
    if (!window.confirm('This will clear all stored data and resync from source. Continue?')) {
      return;
    }
    
    try {
      toast({
        title: "Clearing data...",
        description: "Please wait while we clear stored data.",
      });
      
      const { data, error } = await supabase.functions.invoke('clear-and-resync', {
        body: { accountId, reportId }
      });
      
      if (error) throw error;
      
      // console.log('[CLEAR-RESYNC] Clear result:', data);
      
      toast({
        title: "Data cleared",
        description: `Cleared data for ${data.clearedReports || 0} reports. Resyncing...`,
      });
      
      // Invalidate all caches
      queryClient.invalidateQueries();
      
      // Trigger resync for each data source
      const { data: dataSources } = await supabase
        .from('data_sources')
        .select('id, name')
        .eq('report_id', reportId);
      
      if (dataSources && dataSources.length > 0) {
        for (const ds of dataSources) {
          console.log(`[CLEAR-RESYNC] Resyncing data source: ${ds.name}`);
          await supabase.functions.invoke('resync-data-source', {
            body: { dataSourceId: ds.id }
          });
        }
        
        toast({
          title: "Resync complete",
          description: "Data has been cleared and resynced from source.",
        });
      }
      
      // Refresh the page data
      refreshData();
    } catch (error) {
      console.error('[CLEAR-RESYNC] Error:', error);
      toast({
        title: "Error",
        description: "Failed to clear and resync data.",
        variant: "destructive",
      });
    }
  };
  
  const handleEditReport = (id: string) => {
    // Navigate to the report tool for editing the selected report
    const url = accountId
      ? `/tools/report/${accountId}?reportId=${id}`
      : `/tools/report?reportId=${id}`;
    navigate(url);
  };

  const handleDeleteReport = async (report: SidebarReport) => {
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', report.id);

    if (error) {
      console.error('Error deleting report:', error);
      toast({
        title: "Error",
        description: "Failed to delete report.",
        variant: "destructive",
      });
      return;
    }

    // Update sidebar list and current selection
    setReportsList((prev) => {
      const next = prev.filter((r) => r.id !== report.id);
      if (reportId === report.id) {
        setReportId(next[0]?.id ?? null);
      }
      return next;
    });

    toast({
      title: "Report deleted",
      description: "The report has been removed.",
    });
  };
  
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex overflow-x-hidden">
        <ReportsSidebar
          reports={reportsList}
          accountId={accountId}
          onEditReport={(id) => handleEditReport(id)}
          onDeleteReport={(id) => handleDeleteReport({ id, name: "", account_id: accountId || null, created_at: "", updated_at: "" } as any)}
          onAddNewReport={() => setShowCreateReportModal(true)}
          onSelectReport={(id) => setReportId(id)}
          onAddAISummary={() => setShowAISummaryModal(true)}
          onEditAISummary={handleEditAISummary}
          onDeleteAISummary={handleDeleteAISummary}
          aiSummaries={aiSummaries}
        />
        <SidebarInset className="flex-1 overflow-x-hidden">
          {/* Loading toast for data loading - HIDDEN: Individual components show their own loading states */}
          {/* <LoadingToast 
            isVisible={isDataLoading} 
            loadingComponents={loadingComponents}
          /> */}
          
          {/* Top Bar - Row 1: Title and main actions */}
          <header className="bg-card border-b">
            <div className="container mx-auto px-6 py-3 flex items-center justify-between">
              {/* Left: Back + Title + Star */}
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(`/?account=${accountId}`)}
                  title="Back to accounts"
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-foreground">{currentReportName}</h1>
                  <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                </div>
              </div>

              {/* Right: Edit mode toggle, edit buttons, share */}
              <div className="flex items-center gap-3">
                {/* Edit mode toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Edit mode</span>
                  <Switch
                    checked={isEditMode}
                    onCheckedChange={setIsEditMode}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </div>

                {/* Cache status indicator */}
                <CacheStatusIndicator 
                  reportId={reportId}
                  onRefreshData={() => {
                    refreshData();
                    setVisibilityRefreshTrigger(prev => prev + 1);
                  }}
                />

                {/* Edit buttons - shown when edit mode is on */}
                {isEditMode && (
                  <>
                    <div className="h-4 w-px bg-border" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowDataSourcesListModal(true)}
                    >
                      <Database className="h-4 w-4" />
                      Data sources
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowDimensionsListModal(true)}
                    >
                      <Grid3x3 className="h-4 w-4" />
                      Dimensions
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowVlookupModal(true)}
                    >
                      <GitCompare className="h-4 w-4" />
                      Vlookup
                    </Button>
                    <div className="h-4 w-px bg-border" />
                  </>
                )}

                {/* API button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAPIBuilderModal(true)}
                  disabled={!reportId}
                  title="API URL Builder"
                >
                  <Code className="h-4 w-4" />
                  API
                </Button>

                {/* Share button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowShareModal(true)}
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              </div>
            </div>
          </header>
          
          <DashboardHeader
            reportId={reportId}
            accountId={accountId}
            onReportChange={setReportId}
            onRefreshData={() => {
              refreshData();
              setVisibilityRefreshTrigger(prev => prev + 1);
            }}
            onVisibilityChange={() => setVisibilityRefreshTrigger(prev => prev + 1)}
            session={session}
            onSignOut={handleSignOut}
            isSharedView={isSharedView}
          />
          
          {reportId ? (
            <>
              <FiltersBar 
                reportId={reportId} 
                onFiltersChange={handleFiltersChange} 
                isSharedView={isSharedView} 
                accountId={accountId} 
                refreshTrigger={loadingGeneration}
                isEditMode={isEditMode}
              />
              <main className="container mx-auto px-6 py-4 space-y-6">
                <div>
                  <KPIMetricsCards
                    reportId={reportId}
                    filters={filters}
                    accountId={accountId}
                    visibilityRefreshTrigger={visibilityRefreshTrigger}
                    key={`metrics-${dataRefreshKey}-${loadingGeneration}`}
                    onLoadingComplete={() => markComponentLoaded('metrics')}
                    headerAction={
                      !isSharedView && isEditMode ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setKpiSettingsOpen(true)}
                          className="gap-2"
                        >
                          <Settings className="h-4 w-4" />
                          KPI Settings
                        </Button>
                      ) : null
                    }
                  />
                </div>

                {/* 4-chart grid with persisted metrics and edit-mode dropdowns */}
                <KPIChartsGrid
                  reportId={reportId}
                  accountId={accountId}
                  filters={filters}
                  visibilityRefreshTrigger={visibilityRefreshTrigger}
                  key={`charts-${dataRefreshKey}-${loadingGeneration}-${chartMetrics.join(",")}`}
                  onLoadingComplete={() => markComponentLoaded('chart')}
                  isEditMode={isEditMode}
                  metrics={chartMetrics}
                  onMetricChange={handleGridMetricChange}
                />

                <PerformanceTable 
                  reportId={reportId} 
                  filters={filters} 
                  isSharedView={isSharedView} 
                  accountId={accountId} 
                  visibilityRefreshTrigger={visibilityRefreshTrigger}
                  isEditMode={isEditMode}
                  key={`table-${dataRefreshKey}-${loadingGeneration}`}
                  onLoadingComplete={() => markComponentLoaded('table')}
                />

              </main>
              
              <KPISettingsModal
                open={kpiSettingsOpen}
                onOpenChange={setKpiSettingsOpen}
                reportId={reportId}
                onSettingsChange={refreshData}
                visibilityRefreshTrigger={visibilityRefreshTrigger}
                isEditMode={isEditMode}
              />
            </>
          ) : (
            <main className="container mx-auto px-6 py-6">
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold mb-4">No Reports Found</h2>
                <p className="text-muted-foreground mb-6">
                  You don't have any reports for this account yet. Create your first report to get started.
                </p>
                <Button>Create Report</Button>
              </div>
            </main>
          )}

          {/* Local Share modal (moved from DashboardHeader) */}
          <ShareModal
            open={showShareModal}
            onOpenChange={setShowShareModal}
            reportId={reportId || ""}
            reportName={currentReportName}
            accountId={accountId}
          />

          {/* API URL Builder modal */}
          <APIBuilderModal
            open={showAPIBuilderModal}
            onOpenChange={setShowAPIBuilderModal}
            reportId={reportId || ""}
          />

          {/* Looker-style modals triggered from title area */}
          <DataSourcesListModal
            open={showDataSourcesListModal}
            onOpenChange={setShowDataSourcesListModal}
            reportId={reportId || ""}
            accountId={accountId}
            onAddNew={() => navigate(accountId ? `/tools/report/${accountId}?reportId=${reportId}` : `/tools/report?reportId=${reportId}`)}
            onDataSync={() => refreshData()}
            onRefreshData={() => refreshData()}
          />

          <DimensionsListModal
            open={showDimensionsListModal}
            onOpenChange={setShowDimensionsListModal}
            onAddNew={() => navigate(accountId ? `/tools/report/${accountId}?reportId=${reportId}` : `/tools/report?reportId=${reportId}`)}
            onEdit={() => navigate(accountId ? `/tools/report/${accountId}?reportId=${reportId}` : `/tools/report?reportId=${reportId}`)}
            refreshTrigger={loadingGeneration}
            reportId={reportId}
            accountId={accountId}
            onVisibilityChange={() => setVisibilityRefreshTrigger(prev => prev + 1)}
          />

          <VlookupModal
            open={showVlookupModal}
            onOpenChange={setShowVlookupModal}
            reportId={reportId || null}
            accountId={accountId}
          />
        </SidebarInset>
      </div>

      {/* NEW: Create Report modal */}
      <ReportModal
        open={showCreateReportModal}
        onOpenChange={setShowCreateReportModal}
        title="Create Report"
        description="Name your new performance report for this account."
        onSave={async (name) => {
          if (!session || !accountId) return;
          const { data, error } = await supabase
            .from("reports")
            .insert({
              user_id: session.user.id,
              name,
              account_id: accountId,
            })
            .select("*")
            .single();

          if (error) {
            console.error("Error creating report:", error);
            toast({
              title: "Error",
              description: "Failed to create report.",
              variant: "destructive",
            });
            return;
          }

          setShowCreateReportModal(false);
          setReportsList((prev) => [data, ...prev]);
          setReportId(data.id);
          toast({ title: "Report created", description: "Your report was created successfully." });
        }}
      />

      {/* Create AI Summary modal */}
      <CreateAISummaryModal
        open={showAISummaryModal}
        onOpenChange={setShowAISummaryModal}
        accountId={accountId}
        userId={session?.user?.id}
        onSummaryCreated={(summary) => {
          setAiSummaries((prev) => [summary, ...prev]);
          navigate(`/tools/ai-summary/${accountId}/${summary.id}`);
        }}
      />
    </SidebarProvider>
  );
}