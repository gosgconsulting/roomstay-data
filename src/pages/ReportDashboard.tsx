import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { startOfMonth, endOfMonth } from "date-fns";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCardsFixed";
import { KPIChart } from "@/components/KPIChartFixed";
import { PerformanceTable } from "@/components/PerformanceTable";
import { ForecastingPage } from "@/pages/ForecastingPage";
import { KPISettingsModal } from "@/components/KPISettingsModal";
import { LoadingToast } from "@/components/LoadingToast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { Settings, ArrowLeft, BarChart3, TrendingUp } from "lucide-react";
import { resyncAllDimensions } from "@/lib/resync-all-dimensions";

interface Account {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  user_id: string;
}

export default function ReportDashboard() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
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
  const [activeTab, setActiveTab] = useState("performance");

  // Clear loading state when switching to forecasting tab
  useEffect(() => {
    if (activeTab === "forecasting") {
      setLoadingComponents(new Set());
      setIsDataLoading(false);
    }
  }, [activeTab]);
  
  // Filter state - default to this month with timezone-free date range
  const [filters, setFilters] = useState<FilterState>(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Create timezone-free dates
    const fromDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const toDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
    
    const from = new Date(fromDateString);
    const to = new Date(toDateString);
    
    console.log('[testing] ReportDashboard - Initializing with timezone-free date range:', {
      fromDateString,
      toDateString,
      from: from.toISOString(),
      to: to.toISOString(),
      preset: "this_month"
    });
    
    return {
      dimensionFilters: {},
      dateRange: { from, to },
      datePreset: "this_month",
      compareEnabled: false,
      compareType: "previous_period",
      compareDateRange: undefined,
    };
  });

  // Track filter changes
  useEffect(() => {
    console.log('[testing] ReportDashboard - Filter state updated:', {
      dateRange: filters.dateRange,
      dateFrom: filters.dateRange?.from?.toISOString(),
      dateTo: filters.dateRange?.to?.toISOString(),
      preset: filters.datePreset,
      timestamp: new Date().toISOString()
    });
  }, [filters]);

  // Stabilize the onFiltersChange callback to prevent unnecessary re-renders
  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    console.log('[testing] ReportDashboard - Filters changing:', newFilters);
    console.log('[testing] ReportDashboard - Date filter change details:', {
      oldDateRange: filters.dateRange,
      newDateRange: newFilters.dateRange,
      oldPreset: filters.datePreset,
      newPreset: newFilters.datePreset,
      dateRangeChanged: JSON.stringify(filters.dateRange) !== JSON.stringify(newFilters.dateRange),
      timestamp: new Date().toISOString()
    });
    setFilters(newFilters);
  }, [filters.dateRange, filters.datePreset]);
  
  // Track component loading states
  const markComponentLoading = (component: string) => {
    console.log('[LOADING-DEBUG] Component loading:', component);
    setLoadingComponents(prev => {
      const next = new Set(prev).add(component);
      console.log('[LOADING-DEBUG] Loading components:', Array.from(next));
      return next;
    });
    setIsDataLoading(true);
  };
  
  const markComponentLoaded = (component: string) => {
    console.log('[LOADING-DEBUG] Component loaded:', component);
    setLoadingComponents(prev => {
      const next = new Set(prev);
      next.delete(component);
      console.log('[LOADING-DEBUG] Remaining components:', Array.from(next));
      if (next.size === 0) {
        console.log('[LOADING-DEBUG] All components loaded, hiding loading toast');
        setIsDataLoading(false);
      }
      return next;
    });
  };
  
  // Reset filters and mark loading when report changes
  useEffect(() => {
    if (reportId) {
      // Cancel previous loading by incrementing generation
      setLoadingGeneration(prev => prev + 1);
      
      // Clear previous loading states immediately
      setLoadingComponents(new Set());
      setIsDataLoading(false);
      
      // Start new loading cycle
      markComponentLoading('metrics');
      markComponentLoading('chart');
      markComponentLoading('table');
      
        setFilters({
          dimensionFilters: {},
          dateRange: undefined,
          datePreset: "this_month",
          compareEnabled: false,
          compareType: "previous_period",
          compareDateRange: undefined,
        });
    }
  }, [reportId]);
  
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
        const reportIdFromUrl = searchParams.get('reportId');
        const selectedReportId = reportIdFromUrl && reports.find(r => r.id === reportIdFromUrl)
          ? reportIdFromUrl
          : reports[0].id;
        
        setReportId(selectedReportId);
        
        // Resync dimensions in the background (non-blocking)
        resyncAllDimensions(selectedReportId, accountId)
          .then(() => {
            console.log('[RESYNC] Dimension resync completed successfully');
          })
          .catch((error) => {
            console.error('[RESYNC] Error resyncing dimensions:', error);
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
    // Cancel previous loading by incrementing generation
    setLoadingGeneration(prev => prev + 1);
    
    // Clear previous loading states immediately
    setLoadingComponents(new Set());
    setIsDataLoading(false);
    
    // Start new loading cycle
    markComponentLoading('metrics');
    markComponentLoading('chart');
    markComponentLoading('table');
    setDataRefreshKey(prev => prev + 1);
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
    <div className="min-h-screen bg-background">
      {/* Loading toast for data loading */}
      <LoadingToast 
        isVisible={isDataLoading} 
        loadingComponents={loadingComponents}
      />
      
      {/* Header with back button and account info */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/tools/report')}
              title="Back to accounts"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{account?.name}</h1>
              {account?.description && (
                <p className="text-sm text-muted-foreground">{account.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{session?.user?.email}</p>
            </div>
          </div>
        </div>
      </header>
      
      <DashboardHeader
        reportId={reportId}
        accountId={accountId}
        onReportChange={setReportId}
        onRefreshData={refreshData}
        onVisibilityChange={() => setVisibilityRefreshTrigger(prev => prev + 1)}
        session={session}
        onSignOut={handleSignOut}
        isSharedView={isSharedView}
      />
      
      {reportId ? (
        <>
          <FiltersBar reportId={reportId} onFiltersChange={handleFiltersChange} isSharedView={isSharedView} accountId={accountId} refreshTrigger={loadingGeneration} />
          <main className="container mx-auto px-6 py-6 space-y-6">


            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="performance" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Performance
                </TabsTrigger>
                <TabsTrigger value="forecasting" className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Forecasting
                </TabsTrigger>
              </TabsList>

              <TabsContent value="performance" className="space-y-6">
                {!isSharedView && (
                  <div className="flex justify-end mb-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setKpiSettingsOpen(true)}
                      className="gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      KPI Settings
                    </Button>
                  </div>
                )}
                <KPIMetricsCards
                  reportId={reportId}
                  filters={filters}
                  accountId={accountId}
                  visibilityRefreshTrigger={visibilityRefreshTrigger}
                  key={`metrics-${dataRefreshKey}-${loadingGeneration}`}
                  onLoadingComplete={() => markComponentLoaded('metrics')}
                />
                <KPIChart
                  reportId={reportId}
                  filters={filters}
                  accountId={accountId}
                  visibilityRefreshTrigger={visibilityRefreshTrigger}
                  key={`charts-${dataRefreshKey}-${loadingGeneration}`}
                  onLoadingComplete={() => markComponentLoaded('chart')}
                />
                <PerformanceTable 
                  reportId={reportId} 
                  filters={filters} 
                  isSharedView={isSharedView} 
                  accountId={accountId} 
                  visibilityRefreshTrigger={visibilityRefreshTrigger}
                  key={`table-${dataRefreshKey}-${loadingGeneration}`}
                  onLoadingComplete={() => markComponentLoaded('table')}
                />
              </TabsContent>

              <TabsContent value="forecasting">
                <ForecastingPage 
                  reportId={reportId} 
                  accountId={accountId}
                />
              </TabsContent>
            </Tabs>
          </main>
          
          <KPISettingsModal
            open={kpiSettingsOpen}
            onOpenChange={setKpiSettingsOpen}
            reportId={reportId}
            onSettingsChange={refreshData}
            visibilityRefreshTrigger={visibilityRefreshTrigger}
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
    </div>
  );
}
