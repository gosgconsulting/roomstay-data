import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChart } from "@/components/KPIChart";
import { PerformanceTable } from "@/components/PerformanceTable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState<Set<string>>(new Set());
  const [isSharedView, setIsSharedView] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    dimensionFilters: {},
    dateRange: undefined,
    datePreset: "last_30_days",
    compareEnabled: false,
    compareType: "previous_period",
    compareDateRange: undefined,
  });
  
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
    // Check if this is a shared view
    const params = new URLSearchParams(location.search);
    const sharedToken = params.get('token');
    
    if (sharedToken) {
      setIsSharedView(true);
      loadSharedReport(sharedToken);
    } else {
      checkAuth();
    }
  }, [location.search]);
  
  const loadSharedReport = async (token: string) => {
    try {
      // Verify the shared link token from share_links table
      const { data, error } = await supabase
        .from('share_links')
        .select('report_ids, slug')
        .eq('slug', token)
        .single();
      
      if (error) throw error;
      
      if (!data || !data.report_ids || data.report_ids.length === 0) {
        toast({
          title: "Invalid Link",
          description: "This shared link is invalid or has been deleted.",
          variant: "destructive",
        });
        navigate('/');
        return;
      }
      
      // Set the first report ID from the shared link
      setReportId(data.report_ids[0]);
      setIsLoading(false);
      
    } catch (error) {
      console.error('Error loading shared report:', error);
      toast({
        title: "Error",
        description: "Failed to load shared report.",
        variant: "destructive",
      });
      navigate('/');
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
      
      // Load user's reports
      const { data: reports, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      
      if (reportsError) throw reportsError;
      
      // If user has reports, select the first one
      if (reports && reports.length > 0) {
        setReportId(reports[0].id);
      }
      
      setIsLoading(false);
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
      
      <DashboardHeader 
        reportId={reportId} 
        onReportChange={setReportId} 
        onRefreshData={refreshData}
        session={session}
        onSignOut={handleSignOut}
        isSharedView={isSharedView}
      />
      
      {reportId ? (
        <>
          <FiltersBar reportId={reportId} onFiltersChange={setFilters} isSharedView={isSharedView} />
          <main className="container mx-auto px-6 py-6 space-y-6">
            <KPIMetricsCards 
              reportId={reportId} 
              filters={filters} 
              key={`metrics-${dataRefreshKey}`}
              onLoadingComplete={() => markComponentLoaded('metrics')}
            />
            <KPIChart 
              reportId={reportId} 
              filters={filters} 
              key={`charts-${dataRefreshKey}`}
              onLoadingComplete={() => markComponentLoaded('chart')}
            />
            <PerformanceTable reportId={reportId} filters={filters} isSharedView={isSharedView} key={`table-${dataRefreshKey}`} />
          </main>
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
