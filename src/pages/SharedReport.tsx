import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChart } from "@/components/KPIChart";
import { PerformanceTable } from "@/components/PerformanceTable";
import { LoadingToast } from "@/components/LoadingToast";

export default function SharedReport() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Authentication state
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<any>(null);
  const [sharedDimensionFilters, setSharedDimensionFilters] = useState<Record<string, Record<string, string[]>>>({});
  const [authenticated, setAuthenticated] = useState(false);
  
  // Report dashboard state
  const [reportId, setReportId] = useState<string | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [loadingComponents, setLoadingComponents] = useState<Set<string>>(new Set());
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [visibilityRefreshTrigger, setVisibilityRefreshTrigger] = useState(0);
  const [loadingGeneration, setLoadingGeneration] = useState(0);
  
  // Filter state - default to last 7 days for better performance with large datasets
  const [filters, setFilters] = useState<FilterState>({
    dimensionFilters: {},
    dateRange: undefined, // Let FiltersBar handle initial date range
    datePreset: "this_month",
    compareEnabled: false,
    compareType: "previous_period",
    compareDateRange: undefined,
  });

  // Stabilize the onFiltersChange callback to prevent unnecessary re-renders
  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    console.log('[testing] SharedReport - Filters changing:', newFilters);
    setFilters(newFilters);
  }, []);

  // Track component loading states
  const markComponentLoading = (component: string) => {
    setLoadingComponents(prev => new Set([...prev, component]));
    setIsDataLoading(true);
  };

  const markComponentLoaded = (component: string) => {
    setLoadingComponents(prev => {
      const newSet = new Set(prev);
      newSet.delete(component);
      if (newSet.size === 0) {
        setIsDataLoading(false);
      }
      return newSet;
    });
  };

  useEffect(() => {
    loadShareLink();
  }, [slug]);

  useEffect(() => {
    // Check if already authenticated for this slug
    const authKey = `share_auth_${slug}`;
    const storedAuth = sessionStorage.getItem(authKey);
    if (storedAuth === "true") {
      const storedData = sessionStorage.getItem(`share_data_${slug}`);
      if (storedData) {
        const linkData = JSON.parse(storedData);
        setShareLink(linkData);
        setAuthenticated(true);
        initializeReport(linkData);
      }
    }
  }, [slug]);

  const loadShareLink = async () => {
    if (!slug) return;

    const { data, error } = await supabase
      .from("share_links")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !data) {
      toast({
        title: "Not found",
        description: "This share link does not exist",
        variant: "destructive",
      });
      return;
    }

    setShareLink(data);
    
    // If already authenticated, initialize the report
    const authKey = `share_auth_${slug}`;
    const storedAuth = sessionStorage.getItem(authKey);
    if (storedAuth === "true") {
      setAuthenticated(true);
      initializeReport(data);
    }
  };

  const initializeReport = async (linkData: any) => {
    console.log('[testing] SharedReport - Initializing report with data:', linkData);
    
    // If this share link has a view_id, it's for a slide report
    // Redirect to the slide report view
    if (linkData.view_id) {
      try {
        console.log('[testing] SharedReport - Share link has view_id, redirecting to slide report view');
        
        // Get slide_report_id directly from share_links (avoids RLS issues with slide_report_views)
        // Fallback to querying the view if slide_report_id is not stored (for older share links)
        let slideReportId = linkData.slide_report_id;
        let accountId = linkData.account_id;

        // If slide_report_id is not stored, try to get it from the view
        if (!slideReportId && linkData.view_id) {
          console.log('[testing] slide_report_id not in share link, querying view');
          const { data: view, error: viewError } = await (supabase.from("slide_report_views" as any) as any)
            .select("slide_report_id, account_id")
            .eq("id", linkData.view_id)
            .maybeSingle();

          if (!viewError && view) {
            slideReportId = view.slide_report_id;
            accountId = view.account_id || accountId;
          }
        }

        if (!slideReportId || !accountId) {
          console.error('[testing] Missing slide_report_id or account_id in share link');
          toast({
            title: "Invalid share link",
            description: "This share link is missing required information. Please contact the link creator.",
            variant: "destructive",
          });
          return;
        }

        // Store view_id in sessionStorage so SlideViewPage can pick it up
        sessionStorage.setItem(`share_view_id_${slideReportId}`, linkData.view_id);
        
        // Store share link data for authentication persistence
        const authKey = `share_auth_${slug}`;
        sessionStorage.setItem(authKey, "true");
        sessionStorage.setItem(`share_data_${slug}`, JSON.stringify(linkData));

        console.log('[testing] Redirecting to slide report view:', { slideReportId, accountId });
        
        // Navigate to the slide report view with shared flag
        navigate(`/tools/reports/${accountId}/view/${slideReportId}?shared=true&slug=${slug}`);
      } catch (error) {
        console.error('[testing] Error handling slide report view:', error);
        toast({
          title: "Error",
          description: "Failed to load slide report view",
          variant: "destructive",
        });
      }
      return;
    }
    
    // Store dimension filters from the share link
    if (linkData.dimension_filters) {
      setSharedDimensionFilters(linkData.dimension_filters);
      console.log('[testing] SharedReport - Applying dimension filters:', linkData.dimension_filters);
    }
    
    // For shared links with multiple reports, set reportId to null to show "All Reports" view
    // For single report links, set the specific reportId
    if (linkData.report_ids && linkData.report_ids.length > 0) {
      // Cancel previous loading by incrementing generation
      setLoadingGeneration(prev => prev + 1);
      
      // Clear previous loading states immediately
      setLoadingComponents(new Set());
      setIsDataLoading(false);
      
      if (linkData.report_ids.length === 1) {
        // Single report - show traditional view
        markComponentLoading('metrics');
        markComponentLoading('chart');
        markComponentLoading('table');
        setReportId(linkData.report_ids[0]);
        
        // Apply dimension filters for this report to filter state
        const reportFilters = linkData.dimension_filters?.[linkData.report_ids[0]];
        if (reportFilters) {
          setFilters(prev => ({
            ...prev,
            dimensionFilters: reportFilters
          }));
        }
      } else {
        // Multiple reports - show "All Reports" view
        console.log('[testing] SharedReport - Multiple reports shared, showing All Reports view');
        setReportId(null); // null reportId triggers All Reports view in DashboardHeader
      }
      
      // Load account information if account_id is available
      if (linkData.account_id) {
        try {
          const { data: accountData, error: accountError } = await supabase
            .from('accounts')
            .select('*')
            .eq('id', linkData.account_id)
            .single();
            
          if (!accountError && accountData) {
            setAccount(accountData);
          }
        } catch (error) {
          console.error('Error loading account for shared report:', error);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      toast({
        title: "Password required",
        description: "Please enter the password",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    // Simple hash check (same as used when creating)
    const passwordHash = btoa(password);

    if (passwordHash === shareLink.password_hash) {
      // Store authentication in session storage with the share link data
      const authKey = `share_auth_${slug}`;
      sessionStorage.setItem(authKey, "true");
      sessionStorage.setItem(`share_data_${slug}`, JSON.stringify(shareLink));
      
      setAuthenticated(true);
      toast({
        title: "Access granted",
        description: "Loading report...",
      });

      // Initialize the report directly
      await initializeReport(shareLink);
    } else {
      toast({
        title: "Incorrect password",
        description: "Please try again",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  // If not authenticated, show password form
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Protected Report</CardTitle>
            <CardDescription>
              This report is password protected. Please enter the password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying..." : "Access Report"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If authenticated but no account loaded yet (for multi-report shares), show loading
  if (authenticated && !account && shareLink?.account_id) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading reports...</p>
        </div>
      </div>
    );
  }

  // Render the full report dashboard
  return (
    <div className="min-h-screen bg-background">
      {/* Loading toast for data loading - HIDDEN: Individual components show their own loading states */}
      {/* <LoadingToast 
        isVisible={isDataLoading} 
        loadingComponents={loadingComponents}
      /> */}

      <DashboardHeader 
        reportId={reportId}
        accountId={account?.id}
        onReportChange={setReportId}
        onRefreshData={() => setDataRefreshKey(prev => prev + 1)}
        onVisibilityChange={() => setVisibilityRefreshTrigger(prev => prev + 1)}
        session={null} // No session for shared reports
        onSignOut={async () => {}} // No sign out for shared reports
        isSharedView={true}
        title={shareLink?.report_ids?.length > 1 ? "All Shared Reports" : undefined}
        allowedReportIds={shareLink?.report_ids || []}
      />
      
      <FiltersBar 
        reportId={reportId} 
        onFiltersChange={handleFiltersChange} 
        isSharedView={true} 
        accountId={account?.id} 
        refreshTrigger={loadingGeneration}
      />
      
      <main className="container mx-auto px-6 py-6 space-y-6">
        <div className="relative">
          <KPIMetricsCards
            reportId={reportId}
            filters={filters}
            accountId={account?.id}
            visibilityRefreshTrigger={visibilityRefreshTrigger}
            key={`metrics-${dataRefreshKey}-${loadingGeneration}`}
            onLoadingComplete={() => markComponentLoaded('metrics')}
          />
        </div>
        
        <KPIChart
          reportId={reportId}
          filters={filters}
          accountId={account?.id}
          key={`charts-${dataRefreshKey}-${loadingGeneration}`}
          onLoadingComplete={() => markComponentLoaded('chart')}
        />
        
        <PerformanceTable 
          reportId={reportId} 
          filters={filters} 
          isSharedView={true} 
          accountId={account?.id} 
          visibilityRefreshTrigger={visibilityRefreshTrigger}
          key={`table-${dataRefreshKey}-${loadingGeneration}`}
          onLoadingComplete={() => markComponentLoaded('table')}
        />
      </main>
    </div>
  );
}