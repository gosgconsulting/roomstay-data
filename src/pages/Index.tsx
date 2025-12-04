import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChart } from "@/components/KPIChart";
import { PerformanceTable } from "@/components/PerformanceTable";

import { KPISettingsModal } from "@/components/KPISettingsModal";
import { LoadingToast } from "@/components/LoadingToast";
import { ReportModal } from "@/components/ReportModal";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ReportsSidebar } from "@/components/ReportsSidebar";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { Settings } from "lucide-react";
import { fallbackAuth, clearAuthAndReload, checkCORSIssues } from "@/lib/auth-fallback";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import { useQueryClient } from "@tanstack/react-query";
import { authKeys } from "@/lib/auth";

// ADD: Minimal Report type and state to populate sidebar
type SidebarReport = { id: string; name: string; account_id: string | null; created_at: string; updated_at: string };
const [reportsList, setReportsList] = useState<SidebarReport[]>([]);

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportId, setReportId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [kpiSettingsOpen, setKpiSettingsOpen] = useState(false);
  const [loadingGeneration, setLoadingGeneration] = useState(0);
  const [visibilityRefreshTrigger, setVisibilityRefreshTrigger] = useState(0);
  const [showCreateReportModal, setShowCreateReportModal] = useState(false);

  // Load dimensions using the same hook as PerformanceTable
  const {
    dimensions,
    dimensionHasData,
    isLoadingDimensions,
    loadDimensions,
  } = usePerformanceTableDimensions({
    reportId,
    accountId,
  });
  
  // Filter state - default to last 7 days for better performance with large datasets
  const [filters, setFilters] = useState<FilterState>({
    dimensionFilters: {},
    dateRange: undefined,
    datePreset: "all_time",
    compareEnabled: false,
    compareType: "previous_period",
    compareDateRange: undefined,
  });
  
  // Loading state management
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState<Set<string>>(new Set());

  const markComponentLoading = (component: string) => {
    console.log(`[INDEX] Marking ${component} as loading`);
    setLoadingComponents(prev => new Set(prev).add(component));
    setIsDataLoading(true);
  };

  const markComponentLoaded = (component: string) => {
    console.log(`[INDEX] Marking ${component} as loaded`);
    setLoadingComponents(prev => {
      const newSet = new Set(prev);
      newSet.delete(component);
      if (newSet.size === 0) {
        setIsDataLoading(false);
        console.log('[INDEX] All components loaded');
      }
      return newSet;
    });
  };
  
  // Load user session and reports on mount
  useEffect(() => {
    // Set a safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (isLoading) {
        console.error('[AUTH] Loading timeout reached, forcing stop');
        setIsLoading(false);
        toast({
          title: "Loading Timeout",
          description: "The page is taking too long to load. Please refresh or try signing in again.",
          variant: "destructive",
        });
      }
    }, 15000); // 15 second timeout
    
    checkAuth();
    
    return () => clearTimeout(loadingTimeout);
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('[AUTH] Auth state changed:', event);
      
      // Invalidate React Query cache on auth state changes
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        queryClient.invalidateQueries({ queryKey: authKeys.user() });
      }
      
      // Update session when signed in
      if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        // The checkAuth function will handle loading reports
      }
      
      // Clear session when signed out
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setReportId(null);
        setAccountId(null);
        navigate('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, queryClient]);

  // When reportId changes, refresh all components
  useEffect(() => {
    if (reportId) {
      console.log('[testing] Index - reportId changed to:', reportId);
      
      // Cancel previous loading by incrementing generation
      setLoadingGeneration(prev => prev + 1);
      
      // Clear previous loading states immediately
      setLoadingComponents(new Set());
      setIsDataLoading(false);
      
      // Invalidate all report-specific caches to prevent cross-contamination
      queryClient.invalidateQueries({ queryKey: ['performance-table-data'] });
      queryClient.invalidateQueries({ queryKey: ['performance-table-filters'] });
      queryClient.invalidateQueries({ queryKey: ['performance-table-dimensions'] });
      queryClient.invalidateQueries({ queryKey: ['dimensions'] });
      queryClient.invalidateQueries({ queryKey: ['vlookup-mappings'] });
      console.log('[testing] Index - Invalidated all caches for report change');
      
      // Start new loading cycle
      markComponentLoading('metrics');
      markComponentLoading('chart');
      markComponentLoading('table');
      setDataRefreshKey(prev => prev + 1);

      // Load dimensions when reportId changes
      loadDimensions();
    }
  }, [reportId, loadDimensions, queryClient]);

  const checkAuth = async () => {
    let authCompleted = false;
    try {
      console.log('[AUTH] Starting authentication check...');
      
      // Check for CORS issues first
      const corsCheck = checkCORSIssues();
      if (corsCheck.hasCORSIssue) {
        console.warn('[AUTH] Potential CORS issue detected:', corsCheck);
      }
      
      // Try primary authentication method
      let session, error;
      try {
        const result = await supabase.auth.getSession();
        session = result.data.session;
        error = result.error;
      } catch (networkError) {
        console.error('[AUTH] Network error, trying fallback:', networkError);
        try {
          const fallbackResult = await fallbackAuth();
          session = fallbackResult.session;
          error = fallbackResult.error;
        } catch (fallbackError) {
          console.error('[AUTH] Fallback auth also failed:', fallbackError);
          setIsLoading(false);
          authCompleted = true;
          toast({
            title: "Connection Error",
            description: "Unable to connect to authentication service. Please check your connection and try again.",
            variant: "destructive",
          });
          return;
        }
      }
      
      if (error) {
        console.error('[AUTH] Session error:', error);
        setIsLoading(false);
        authCompleted = true;
        
        // If it's a CORS or network error, provide specific guidance
        if (error.message?.includes('CORS') || error.message?.includes('fetch')) {
          toast({
            title: "Connection Error",
            description: "Please check your internet connection and try refreshing the page. If the issue persists, the Supabase configuration may need updating.",
            variant: "destructive",
          });
          return;
        }
        
        toast({
          title: "Authentication Error",
          description: error.message || "Failed to authenticate. Please try signing in again.",
          variant: "destructive",
        });
        navigate('/auth');
        return;
      }
      
      if (!session) {
        console.log('[AUTH] No session found, redirecting to auth');
        setIsLoading(false);
        authCompleted = true;
        navigate('/auth');
        return;
      }
      
      console.log('[AUTH] Session found, loading reports...');
      setSession(session);
      
      // Load user's reports with timeout
      const reportsPromise = supabase
        .from('reports')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Reports loading timeout')), 10000)
      );

      const { data: reports, error: reportsError } = await Promise.race([
        reportsPromise,
        timeoutPromise
      ]) as any;

      if (reportsError) {
        console.error('[AUTH] Reports error:', reportsError);
        throw reportsError;
      }

      console.log('[AUTH] Loaded reports:', reports?.length || 0);

      if (reports && reports.length > 0) {
        // Save to sidebar
        setReportsList(reports as SidebarReport[]);
        // Check if there's a reportId in the URL
        const urlParams = new URLSearchParams(location.search);
        const urlReportId = urlParams.get('reportId');
        
        if (urlReportId && reports.find(r => r.id === urlReportId)) {
          setReportId(urlReportId);
          console.log('[AUTH] Set reportId from URL:', urlReportId);
        } else {
          setReportId(reports[0].id);
          console.log('[AUTH] Set reportId to first report:', reports[0].id);
        }
        
        // Load account ID for the selected report
        const selectedReport = reports.find(r => r.id === (urlReportId || reports[0].id));
        if (selectedReport?.account_id) {
          setAccountId(selectedReport.account_id);
          console.log('[AUTH] Set accountId:', selectedReport.account_id);
        }
      }
      
      console.log('[AUTH] Authentication check completed successfully');
      setIsLoading(false);
      authCompleted = true;
    } catch (error) {
      console.error('[AUTH] Error in checkAuth:', error);
      // Only set loading to false if we haven't already
      if (!authCompleted) {
        setIsLoading(false);
      }
      
      if (error.message === 'Reports loading timeout') {
        toast({
          title: "Loading Timeout",
          description: "Reports are taking too long to load. Please refresh the page.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to load user session. Please try signing in again.",
          variant: "destructive",
        });
        navigate('/auth');
      }
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
    console.log('[INDEX] Starting comprehensive data refresh...');
    
    // Cancel previous loading by incrementing generation
    setLoadingGeneration(prev => prev + 1);
    
    // Clear previous loading states immediately
    setLoadingComponents(new Set());
    setIsDataLoading(false);
    
    // Start new loading cycle with proper sequencing
    markComponentLoading('metrics');
    markComponentLoading('chart');
    markComponentLoading('table');
    
    
    // Increment both refresh keys to ensure all components reload
    setDataRefreshKey(prev => prev + 1);
    setVisibilityRefreshTrigger(prev => prev + 1);
    
    console.log('[INDEX] Data refresh triggered - all components will reload with fresh data');
  };
  
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading your workspace...</p>
          <div className="flex gap-2 mt-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearAuthAndReload}
            >
              Clear Cache & Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex">
        <ReportsSidebar 
          reports={reportsList} 
          accountId={accountId || undefined}
          onAddNewReport={() => setShowCreateReportModal(true)}
          onSelectReport={(id) => {
            setReportId(id);
            const selected = reportsList.find(r => r.id === id);
            setAccountId(selected?.account_id || null);
          }}
        />
        <SidebarInset className="flex-1">
          {/* Loading toast - HIDDEN: Individual components show their own loading states */}
          {/* <LoadingToast 
            isVisible={isDataLoading} 
            loadingComponents={loadingComponents}
          /> */}
          
          <DashboardHeader 
            reportId={reportId} 
            onReportChange={(newReportId) => {
              setReportId(newReportId);
              if (newReportId) {
                supabase
                  .from('reports')
                  .select('account_id')
                  .eq('id', newReportId)
                  .single()
                  .then(({ data }) => setAccountId(data?.account_id || null));
              }
            }}
            onRefreshData={refreshData}
            onVisibilityChange={() => setVisibilityRefreshTrigger(prev => prev + 1)}
            session={session}
            onSignOut={handleSignOut}
            isSharedView={false}
          />
          
          {reportId ? (
            <>
              <FiltersBar 
                reportId={reportId} 
                onFiltersChange={setFilters} 
                isSharedView={false} 
                accountId={accountId || undefined}
                refreshTrigger={loadingGeneration} 
              />
              <main className="container mx-auto px-6 py-6 space-y-6">
                <div className="relative">
                  <div className="absolute right-0 -top-2 z-10">
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
                  <KPIMetricsCards 
                    reportId={reportId} 
                    filters={filters}
                    accountId={accountId || undefined}
                    key={`metrics-${dataRefreshKey}-${loadingGeneration}`}
                    onLoadingComplete={() => markComponentLoaded('metrics')}
                    visibilityRefreshTrigger={visibilityRefreshTrigger}
                  />
                </div>
                <KPIChart
                  reportId={reportId}
                  filters={filters}
                  accountId={accountId}
                  key={`charts-${dataRefreshKey}-${loadingGeneration}`}
                />
                <PerformanceTable 
                  reportId={reportId} 
                  filters={filters} 
                  isSharedView={false}
                  accountId={accountId || undefined}
                  onFiltersChange={setFilters}
                  key={`table-${dataRefreshKey}-${loadingGeneration}`}
                  onLoadingComplete={() => markComponentLoaded('table')}
                  visibilityRefreshTrigger={visibilityRefreshTrigger}
                />

              </main>
              
              <KPISettingsModal
                open={kpiSettingsOpen}
                onOpenChange={setKpiSettingsOpen}
                reportId={reportId}
                onSettingsChange={refreshData}
              />
            </>
          ) : (
            <main className="container mx-auto px-6 py-6">
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold mb-4">No Reports Found</h2>
                <p className="text-muted-foreground mb-6">
                  You don't have any reports yet. Create your first report to get started.
                </p>
                <Button>Create Report</Button>
              </div>
            </main>
          )}
        </SidebarInset>
      </div>

      <ReportModal
        open={showCreateReportModal}
        onOpenChange={setShowCreateReportModal}
        title="Create Report"
        description="Name your new performance report."
        onSave={async (name) => {
          if (!session) return;
          const { data, error } = await supabase
            .from("reports")
            .insert({
              user_id: session.user.id,
              name,
              account_id: accountId || null,
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
          // Prepend new report into sidebar and select it
          setReportsList((prev) => [data, ...prev]);
          setReportId(data.id);
          setAccountId(data.account_id || null);
          toast({ title: "Report created", description: "Your report was created successfully." });
        }}
      />
    </SidebarProvider>
  );
}