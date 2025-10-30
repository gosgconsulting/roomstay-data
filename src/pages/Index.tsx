import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChartsGrid } from "@/components/KPIChartsGrid";
import { PerformanceTable } from "@/components/PerformanceTable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";

const Index = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportId, setReportId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    dimensionFilters: {},
    dateRange: undefined,
    datePreset: "this_month",
    compareEnabled: false,
    compareType: "previous_period",
  });
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setIsLoading(false);
      }
    );

    // THEN check for existing session and load reports
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
      
      // Always load reports, even without authentication
      loadFirstReport();
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadFirstReport = async () => {
    try {
      // Only load reports if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: reports, error: fetchError } = await supabase
        .from("reports")
        .select("*")
        .eq("user_id", session.user.id)
        .limit(1);

      if (fetchError) throw fetchError;

      if (reports && reports.length > 0) {
        setReportId(reports[0].id);
      }
    } catch (error) {
      console.error("Error loading report:", error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleDataSync = () => {
    // Trigger refresh by updating the key - this will cause all components to reload their data
    setDataRefreshKey(prev => prev + 1);
    
    // Show feedback to user
    toast({
      title: "Refreshing data",
      description: "All components are reloading their data...",
    });
    
    console.log('Data refresh triggered. Components will reload with key:', dataRefreshKey + 1);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Data Dashboard</h1>
            {session?.user && (
              <span className="text-sm text-muted-foreground">{session.user.email}</span>
            )}
          </div>
          {session ? (
            <Button variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          ) : (
            <Button variant="outline" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
          )}
        </div>
      </div>
      <DashboardHeader 
        reportId={reportId} 
        onReportChange={setReportId} 
        onDataSync={handleDataSync}
      />
      {reportId ? (
        <>
          <FiltersBar reportId={reportId} onFiltersChange={setFilters} />
          <main className="container mx-auto px-6 py-6 space-y-6">
            <KPIMetricsCards reportId={reportId} filters={filters} key={`metrics-${dataRefreshKey}`} />
            <KPIChartsGrid reportId={reportId} filters={filters} key={`charts-${dataRefreshKey}`} />
            <PerformanceTable reportId={reportId} filters={filters} key={`table-${dataRefreshKey}`} />
          </main>
        </>
      ) : (
        <main className="container mx-auto px-6 py-6">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Create a report to get started</p>
          </div>
        </main>
      )}
    </div>
  );
};

export default Index;
