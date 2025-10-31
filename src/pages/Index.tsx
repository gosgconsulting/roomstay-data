import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const [searchParams] = useSearchParams();
  const sharedSlug = searchParams.get("shared");
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportId, setReportId] = useState<string | null>(null);
  const [isSharedView, setIsSharedView] = useState(false);
  const [sharedReportIds, setSharedReportIds] = useState<string[]>([]);
  const [sharedReports, setSharedReports] = useState<Array<{id: string, name: string}>>([]);
  const [filters, setFilters] = useState<FilterState>({
    dimensionFilters: {},
    dateRange: undefined,
    datePreset: "this_month",
    compareEnabled: false,
    compareType: "previous_period",
  });
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  

  // Reset filters when report changes
  useEffect(() => {
    setFilters({
      dimensionFilters: {},
      dateRange: undefined,
      datePreset: "this_month",
      compareEnabled: false,
      compareType: "previous_period",
    });
  }, [reportId]);

  useEffect(() => {
    let isMounted = true;

    // Check if this is a shared view
    if (sharedSlug) {
      const authKey = `share_auth_${sharedSlug}`;
      const shareDataKey = `share_data_${sharedSlug}`;
      const storedAuth = sessionStorage.getItem(authKey);
      const storedData = sessionStorage.getItem(shareDataKey);
      
      if (storedAuth === "true" && storedData) {
        const shareData = JSON.parse(storedData);
        setIsSharedView(true);
        setSharedReportIds(shareData.report_ids);
        
        // Load report details
        const loadSharedReports = async () => {
          if (shareData.report_ids && shareData.report_ids.length > 0) {
            const { data, error } = await supabase
              .from("reports")
              .select("id, name")
              .in("id", shareData.report_ids);
            
            if (!error && data) {
              setSharedReports(data);
              setReportId(data[0].id);
            }
          }
          setIsLoading(false);
        };
        
        loadSharedReports();
        return;
      } else {
        // Not authenticated for this share link
        navigate(`/${sharedSlug}`);
        return;
      }
    }

    const initializeAuth = async () => {
      try {
        // Set up auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (isMounted) {
              setSession(session);
              setIsLoading(false);
            }
          }
        );

        // Check for existing session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Error getting session:", error);
        }

        if (isMounted) {
          setSession(session);
          setIsLoading(false);
          
          // Load reports if authenticated
          if (session) {
            loadFirstReport();
          }
        }

        return () => {
          isMounted = false;
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error("Error initializing auth:", error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, [sharedSlug]);

  const loadFirstReport = async () => {
    try {
      // Only load reports if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Check if user is master account
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", session.user.id)
        .single();

      const isMaster = profile?.email === "contact@gosgconsulting.com";

      let reports;
      let fetchError;

      if (isMaster) {
        // Master account: Load ALL reports
        const result = await supabase
          .from("reports")
          .select("*")
          .order("name")
          .limit(1);
        
        reports = result.data;
        fetchError = result.error;
      } else {
        // Regular user: Load own reports
        const result = await supabase
          .from("reports")
          .select("*")
          .eq("user_id", session.user.id)
          .limit(1);
        
        reports = result.data;
        fetchError = result.error;
      }

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
      {!isSharedView && (
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
      )}
      {!isSharedView ? (
        <DashboardHeader 
          reportId={reportId} 
          onReportChange={setReportId} 
          onDataSync={handleDataSync}
        />
      ) : (
        sharedReports.length > 1 && (
          <div className="border-b">
            <div className="container mx-auto px-6 py-3">
              <select
                value={reportId || ""}
                onChange={(e) => setReportId(e.target.value)}
                className="w-full max-w-xs px-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {sharedReports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )
      )}
      {reportId ? (
        <>
          <FiltersBar reportId={reportId} onFiltersChange={setFilters} isSharedView={isSharedView} />
          <main className="container mx-auto px-6 py-6 space-y-6">
            <KPIMetricsCards reportId={reportId} filters={filters} key={`metrics-${dataRefreshKey}`} />
            <KPIChartsGrid reportId={reportId} filters={filters} key={`charts-${dataRefreshKey}`} />
            <PerformanceTable reportId={reportId} filters={filters} isSharedView={isSharedView} key={`table-${dataRefreshKey}`} />
          </main>
        </>
      ) : (
        <main className="container mx-auto px-6 py-6">
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {isSharedView ? "No reports available in this share" : "Create a report to get started"}
            </p>
          </div>
        </main>
      )}
    </div>
  );
};

export default Index;
