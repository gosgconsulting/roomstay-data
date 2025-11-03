import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChart } from "@/components/KPIChart";
import { PerformanceTable } from "@/components/PerformanceTable";
import { KPISettingsModal } from "@/components/KPISettingsModal";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { Settings, ArrowLeft } from "lucide-react";

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
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    dimensionFilters: {},
    dateRange: undefined,
    datePreset: "last_30_days",
    compareEnabled: false,
    compareType: "previous_period",
    compareDateRange: undefined,
  });

  // Stabilize the onFiltersChange callback to prevent unnecessary re-renders
  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    console.log('[testing] ReportDashboard - Filters changing:', newFilters);
    setFilters(newFilters);
  }, []);
  
  // Track component loading states
  const markComponentLoading = (component: string) => {
    setLoadingComponents(prev => new Set(prev).add(component));
    setIsDataLoading(true);
  };
  
  const markComponentLoaded = (component: string) => {
    setLoadingComponents(prev => {
      const next = new Set(prev);
      next.delete(component);
      if (next.size === 0) {
        setIsDataLoading(false);
      }
      return next;
    });
  };
  
  // Reset filters and mark loading when report changes
  useEffect(() => {
    if (reportId) {
      markComponentLoading('metrics');
      markComponentLoading('chart');
      setFilters({
        dimensionFilters: {},
        dateRange: undefined,
        datePreset: "last_30_days",
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
      
      // If user has reports for this account, select the first one
      if (reports && reports.length > 0) {
        setReportId(reports[0].id);
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
    markComponentLoading('metrics');
    markComponentLoading('chart');
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
      {/* Full screen loading overlay for data loading */}
      {isDataLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading report data...</p>
          </div>
        </div>
      )}
      
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
          <FiltersBar reportId={reportId} onFiltersChange={handleFiltersChange} isSharedView={isSharedView} accountId={accountId} />
          <main className="container mx-auto px-6 py-6 space-y-6">
            <div className="relative">
              <div className="absolute right-0 -top-2 z-10">
                {!isSharedView && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setKpiSettingsOpen(true)}
                    className="gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    KPI Settings
                  </Button>
                )}
              </div>
              <KPIMetricsCards
                reportId={reportId}
                filters={filters}
                accountId={accountId}
                visibilityRefreshTrigger={visibilityRefreshTrigger}
                key={`metrics-${dataRefreshKey}`}
                onLoadingComplete={() => markComponentLoaded('metrics')}
              />
            </div>
            <KPIChart
              reportId={reportId}
              filters={filters}
              accountId={accountId}
              visibilityRefreshTrigger={visibilityRefreshTrigger}
              key={`charts-${dataRefreshKey}`}
              onLoadingComplete={() => markComponentLoaded('chart')}
            />
            <PerformanceTable 
              reportId={reportId} 
              filters={filters} 
              isSharedView={isSharedView} 
              accountId={accountId} 
              visibilityRefreshTrigger={visibilityRefreshTrigger}
              key={`table-${dataRefreshKey}`} 
            />
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
