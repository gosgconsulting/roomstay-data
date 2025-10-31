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
  
  // Reset filters when report changes
  useEffect(() => {
    setFilters({
      dimensionFilters: {},
      dateRange: undefined,
      datePreset: "last_30_days",
      compareEnabled: false,
      compareType: "previous_period",
      compareDateRange: undefined,
    });
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
      // Verify the shared link token
      const { data, error } = await supabase
        .from('shared_links')
        .select('report_id, expires_at')
        .eq('token', token)
        .single();
      
      if (error) throw error;
      
      if (!data) {
        toast({
          title: "Invalid Link",
          description: "This shared link is invalid or has been deleted.",
          variant: "destructive",
        });
        navigate('/');
        return;
      }
      
      // Check if link has expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast({
          title: "Link Expired",
          description: "This shared link has expired.",
          variant: "destructive",
        });
        navigate('/');
        return;
      }
      
      // Set the report ID from the shared link
      setReportId(data.report_id);
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
    setDataRefreshKey(prev => prev + 1);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
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
            <KPIMetricsCards reportId={reportId} filters={filters} key={`metrics-${dataRefreshKey}`} />
            <KPIChart reportId={reportId} filters={filters} key={`charts-${dataRefreshKey}`} />
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
