import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { PerformanceTable } from "@/components/PerformanceTable";
import { LoadingToast } from "@/components/LoadingToast";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";

interface Report {
  id: string;
  name: string;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function AllReports() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingGeneration, setLoadingGeneration] = useState(0);
  
  // Filter state for each report - using reportId as key
  const [reportFilters, setReportFilters] = useState<Record<string, FilterState>>({});
  
  // Loading state management
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState<Set<string>>(new Set());

  const markComponentLoading = (component: string) => {
    console.log(`[testing] AllReports - Marking ${component} as loading`);
    setLoadingComponents(prev => new Set(prev).add(component));
    setIsDataLoading(true);
  };

  const markComponentLoaded = (component: string) => {
    console.log(`[testing] AllReports - Marking ${component} as loaded`);
    setLoadingComponents(prev => {
      const newSet = new Set(prev);
      newSet.delete(component);
      if (newSet.size === 0) {
        setIsDataLoading(false);
        console.log('[testing] AllReports - All components loaded');
      }
      return newSet;
    });
  };

  // Initialize default filters for a report
  const getDefaultFilters = (): FilterState => ({
    dimensionFilters: {},
    dateRange: undefined,
    datePreset: "last_7_days",
    compareEnabled: false,
    compareType: "previous_period",
    compareDateRange: undefined,
  });

  // Load user session and reports on mount
  useEffect(() => {
    checkAuth();
  }, []);

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
        setReports(reports);
        
        // Initialize filters for each report
        const initialFilters: Record<string, FilterState> = {};
        reports.forEach(report => {
          initialFilters[report.id] = getDefaultFilters();
        });
        setReportFilters(initialFilters);
      }
      
    } catch (error) {
      console.error('Error loading reports:', error);
      toast({
        title: "Error",
        description: "Failed to load reports. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleFiltersChange = (reportId: string, newFilters: FilterState) => {
    console.log('[testing] AllReports - Filters changing for report:', reportId, newFilters);
    setReportFilters(prev => ({
      ...prev,
      [reportId]: newFilters
    }));
  };

  const refreshData = () => {
    console.log('[testing] AllReports - Starting comprehensive data refresh...');
    
    // Cancel previous loading by incrementing generation
    setLoadingGeneration(prev => prev + 1);
    
    // Mark all components as loading
    reports.forEach(report => {
      markComponentLoading(`table-${report.id}`);
    });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading your reports...</p>
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
        reportId={null} // No single report selected in consolidated view
        onReportChange={() => {}} // Not applicable for consolidated view
        session={session}
        onSignOut={handleSignOut}
        onRefresh={refreshData}
        title="All Reports" // Custom title for consolidated view
      />
      
      {reports.length > 0 ? (
        <main className="container mx-auto px-6 py-6 space-y-8">
          {reports.map((report) => (
            <div key={report.id} className="space-y-4">
              {/* Report Title */}
              <div className="border-b pb-2">
                <h2 className="text-2xl font-bold text-foreground">{report.name}</h2>
                <p className="text-sm text-muted-foreground">
                  Last updated: {new Date(report.updated_at).toLocaleDateString()}
                </p>
              </div>
              
              {/* Filters for this report */}
              <FiltersBar 
                reportId={report.id} 
                onFiltersChange={(filters) => handleFiltersChange(report.id, filters)}
                isSharedView={false} 
                accountId={report.account_id || undefined}
                refreshTrigger={loadingGeneration} 
              />
              
              {/* Performance Table for this report */}
              <PerformanceTable 
                reportId={report.id} 
                filters={reportFilters[report.id] || getDefaultFilters()} 
                isSharedView={false}
                accountId={report.account_id || undefined}
                onFiltersChange={(filters) => handleFiltersChange(report.id, filters)}
                key={`table-${report.id}-${loadingGeneration}`}
                onLoadingComplete={() => markComponentLoaded(`table-${report.id}`)}
                visibilityRefreshTrigger={loadingGeneration}
              />
            </div>
          ))}
        </main>
      ) : (
        <main className="container mx-auto px-6 py-6">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">No Reports Found</h2>
            <p className="text-muted-foreground mb-6">
              You don't have any reports yet. Create your first report to get started.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
