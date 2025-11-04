import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChart } from "@/components/KPIChart";
import { PerformanceTable } from "@/components/PerformanceTable";
import { KPISettingsModal } from "@/components/KPISettingsModal";
import { LoadingToast } from "@/components/LoadingToast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { Settings } from "lucide-react";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportId, setReportId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [kpiSettingsOpen, setKpiSettingsOpen] = useState(false);
  const [loadingGeneration, setLoadingGeneration] = useState(0);
  const [visibilityRefreshTrigger, setVisibilityRefreshTrigger] = useState(0);
  
  // Filter state
  // Filter state - default to last 7 days for better performance with large datasets
  const [filters, setFilters] = useState<FilterState>({
    dimensionFilters: {},
    dateRange: undefined,
    datePreset: "last_7_days",
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
    checkAuth();
  }, []);

  // When reportId changes, refresh all components
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
      setDataRefreshKey(prev => prev + 1);
    }
  }, [reportId]);

  const checkAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (!session) {
        navigate('/auth');
        return;
      }
      
      setSession(session);
      
      // Load user's reports
      const { data: reports, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (reportsError) throw reportsError;

      if (reports && reports.length > 0) {
        // Check if there's a reportId in the URL
        const urlParams = new URLSearchParams(location.search);
        const urlReportId = urlParams.get('reportId');
        
        if (urlReportId && reports.find(r => r.id === urlReportId)) {
          setReportId(urlReportId);
        } else {
          setReportId(reports[0].id);
        }
        
        // Load account ID for the selected report
        const selectedReport = reports.find(r => r.id === (urlReportId || reports[0].id));
        if (selectedReport?.account_id) {
          setAccountId(selectedReport.account_id);
        }
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking auth:', error);
      toast({
        title: "Error",
        description: "Failed to load user session",
        variant: "destructive",
      });
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
      
      <DashboardHeader 
        reportId={reportId} 
        onReportChange={(newReportId) => {
          setReportId(newReportId);
          // Load account_id for the new report
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
              accountId={accountId || undefined}
              key={`charts-${dataRefreshKey}-${loadingGeneration}`}
              onLoadingComplete={() => markComponentLoaded('chart')}
            />
            <PerformanceTable 
              reportId={reportId} 
              filters={filters} 
              isSharedView={false}
              accountId={accountId || undefined}
              key={`table-${dataRefreshKey}-${loadingGeneration}`}
              onLoadingComplete={() => markComponentLoaded('table')}
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
    </div>
  );
}
