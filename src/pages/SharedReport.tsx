import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChart } from "@/components/KPIChart";
import { PerformanceTable } from "@/components/PerformanceTable";
import { isChannelBasedFormat, convertReportToChannelFormat } from "@/lib/filterFormatUtils";
import { getCurrentMonthToDateRange, DEFAULT_REPORT_DATE_PRESET } from "@/lib/monthUtils";

export default function SharedReport() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Authentication state
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<any>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [lockedDimensionIds, setLockedDimensionIds] = useState<string[]>([]);
  
  // Report dashboard state
  const [reportId, setReportId] = useState<string | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [accountLoadState, setAccountLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [loadingComponents, setLoadingComponents] = useState<Set<string>>(new Set());
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [visibilityRefreshTrigger, setVisibilityRefreshTrigger] = useState(0);
  const [loadingGeneration, setLoadingGeneration] = useState(0);
  // Prevent double-bootstrap when slug/effect deps fire twice
  const bootstrapDoneRef = useRef(false);
  
  // Filter state — month-to-date by default (same as owner Data Studio / FiltersBar)
  const [filters, setFilters] = useState<FilterState>(() => {
    const mtd = getCurrentMonthToDateRange();
    return {
      dimensionFilters: {},
      dateRange: { from: mtd.from, to: mtd.to },
      datePreset: DEFAULT_REPORT_DATE_PRESET,
      compareEnabled: false,
      compareType: "previous_period",
      compareDateRange: undefined,
    };
  });

  // Stabilize the onFiltersChange callback to prevent unnecessary re-renders
  const handleFiltersChange = useCallback((newFilters: FilterState) => {
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

  const initializeReport = useCallback(async (linkData: any) => {
    // Check if this is a slide report share link (has slide_report_id or view_id)
    const slideReportId = linkData.slide_report_id;
    const hasViewId = linkData.view_id;
    
    if (slideReportId || hasViewId) {
      try {
        let finalSlideReportId = slideReportId;
        let accountId = linkData.account_id;

        // If we have slide_report_id directly, use it (new format)
        if (slideReportId) {
          // no-op
        } else if (hasViewId) {
          // Legacy: Use view_id to look up slide_report_id via the canonical `views` table
          try {
            const { data: view, error: viewError } = await supabase
              .from("views")
              .select("slide_report_id, account_id")
              .eq("id", linkData.view_id)
              .maybeSingle();

            if (!viewError && view && view.slide_report_id) {
              finalSlideReportId = view.slide_report_id;
              accountId = (view as any).account_id || accountId;
            }
          } catch (err) {
            console.error('Exception while querying view:', err);
          }
        }

        // If accountId is still missing, try to get it from the first report
        if (!accountId && linkData.report_ids && linkData.report_ids.length > 0) {
          const { data: report } = await supabase
            .from("reports")
            .select("account_id")
            .eq("id", linkData.report_ids[0])
            .maybeSingle();
          
          if (report?.account_id) {
            accountId = report.account_id;
          }
        }

        if (!finalSlideReportId || !accountId) {
          console.error('Missing slide_report_id or account_id in share link', {
            slideReportId: finalSlideReportId,
            accountId
          });
          toast({
            title: "Invalid share link",
            description: "This share link is missing required information. The share link may need to be recreated. Please contact the link creator.",
            variant: "destructive",
          });
          return;
        }

        // Extract channel-based filters from dimension_filters
        const channelFilters = linkData.dimension_filters || {};
        
        // Store filters in sessionStorage for SlideViewPage to pick up
        // Use channel-based format: { "metasearch": { "dimensionId": ["value1"] }, ... }
        if (Object.keys(channelFilters).length > 0) {
          if (isChannelBasedFormat(channelFilters)) {
            // Already in channel-based format
            sessionStorage.setItem(`share_filters_${slug}`, JSON.stringify(channelFilters));
          } else {
            // Convert from report-based to channel-based format
            try {
              const { data: slideReport } = await supabase
                .from("slide_reports")
                .select("report_ids")
                .eq("id", finalSlideReportId)
                .single();
              
              if (slideReport?.report_ids) {
                const reportIds = slideReport.report_ids as Record<string, string>;
                const convertedFilters = convertReportToChannelFormat(channelFilters, reportIds);
                
                if (Object.keys(convertedFilters).length > 0) {
                  sessionStorage.setItem(`share_filters_${slug}`, JSON.stringify(convertedFilters));
                }
              }
            } catch (error) {
              console.error('Error converting filters:', error);
            }
          }
        }
        
        // Store slide_report_id and account_id in sessionStorage
        sessionStorage.setItem(`share_slide_report_id_${slug}`, finalSlideReportId);
        sessionStorage.setItem(`share_account_id_${slug}`, accountId);
        
        // Store locked dimension IDs for Data Studio embed
        sessionStorage.setItem(`share_locked_dimension_ids_${slug}`, JSON.stringify(linkData.locked_dimension_ids || []));
        
        // Legacy: Store view_id if it exists (for backward compatibility)
        if (hasViewId) {
          sessionStorage.setItem(`share_view_id_${finalSlideReportId}`, linkData.view_id);
        }
        
        // Store share link data for authentication persistence
        const authKey = `share_auth_${slug}`;
        sessionStorage.setItem(authKey, "true");
        sessionStorage.setItem(`share_data_${slug}`, JSON.stringify(linkData));

        // Navigate to Data Studio embed for slide/view shares
        navigate(`/shared/${slug}/studio`, { replace: true });
      } catch (error) {
        console.error('Error handling slide report view:', error);
        toast({
          title: "Error",
          description: "Failed to load slide report view",
          variant: "destructive",
        });
      }
      return;
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
        setReportId(null);
      }
      
      // Load account information if account_id is available
      if (linkData.account_id) {
        await fetchAccountWithRetry(linkData.account_id);
      }
    }
  }, [slug, navigate, toast, setLockedDimensionIds, setLoadingGeneration, setLoadingComponents, setIsDataLoading, markComponentLoading, setReportId, setFilters, setAccount]);

  // Separated account fetch so it can be called from initializeReport and from retry
  const fetchAccountWithRetry = useCallback(async (accountId: string) => {
    setAccountLoadState('loading');
    const TIMEOUT_MS = 15_000;
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
      );
      const fetchPromise = supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .single();

      const { data: accountData, error: accountError } = await Promise.race([
        fetchPromise,
        timeoutPromise,
      ]) as Awaited<typeof fetchPromise>;

      if (!accountError && accountData) {
        setAccount(accountData);
        setAccountLoadState('success');
      } else {
        console.error('Error loading account for shared report:', accountError);
        setAccountLoadState('error');
      }
    } catch (err) {
      console.error('Account fetch failed/timed out:', err);
      setAccountLoadState('error');
    }
  }, []);

  // Consolidated bootstrap: check session auth first, then load from DB if needed.
  // Recovery path: if share_auth is set but share_data is missing or corrupt, re-fetch
  // share_links from DB and rewrite session — avoids leaving the user on a broken password card.
  useEffect(() => {
    if (!slug) return;
    if (bootstrapDoneRef.current) return;
    bootstrapDoneRef.current = true;

    let mounted = true;

    const loadFromDb = async (): Promise<any | null> => {
      const { data, error } = await supabase
        .from("share_links")
        .select("*")
        .eq("slug", slug)
        .single();
      if (error || !data) return null;
      return data;
    };
    
    const bootstrap = async () => {
      const authKey = `share_auth_${slug}`;
      const storedAuth = sessionStorage.getItem(authKey);
      
      if (storedAuth === "true") {
        // Already authenticated — try to restore from session
        let linkData: any | null = null;
        const storedData = sessionStorage.getItem(`share_data_${slug}`);
        if (storedData) {
          try {
            linkData = JSON.parse(storedData);
          } catch {
            // Corrupt JSON — fall through to recovery below
          }
        }

        if (linkData) {
          if (mounted) {
            setShareLink(linkData);
            setAuthenticated(true);
            await initializeReport(linkData);
          }
        } else {
          // share_data missing or corrupt — recover by re-fetching from DB
          const freshData = await loadFromDb();
          if (!mounted) return;
          if (freshData) {
            // Rewrite session so future navigations restore correctly
            sessionStorage.setItem(`share_data_${slug}`, JSON.stringify(freshData));
            setShareLink(freshData);
            setAuthenticated(true);
            await initializeReport(freshData);
          } else {
            // Link no longer exists or request failed — clear stale auth
            sessionStorage.removeItem(authKey);
            sessionStorage.removeItem(`share_data_${slug}`);
            toast({
              title: "Session expired",
              description: "Please re-enter the password to continue.",
              variant: "destructive",
            });
            // Reload link so user sees fresh password card (not undefined shareLink)
            const fallback = await loadFromDb();
            if (mounted && fallback) setShareLink(fallback);
          }
        }
      } else {
        // Not authenticated — load share link from DB so password card can render
        const data = await loadFromDb();
        if (!data) {
          if (mounted) {
            toast({
              title: "Not found",
              description: "This share link does not exist",
              variant: "destructive",
            });
          }
          return;
        }
        if (mounted) {
          setShareLink(data);
        }
      }
    };
    
    bootstrap();
    
    return () => {
      mounted = false;
    };
  }, [slug, toast, initializeReport]);

  // Open (no-password) links: `password_hash` is empty or missing after create (`btoa("")` → "").
  // Without this, first-time visitors stay on the password card because empty submit is blocked.
  useEffect(() => {
    if (!slug || authenticated || !shareLink) return;
    const h = shareLink.password_hash;
    if (h != null && h !== "") return;
    const authKey = `share_auth_${slug}`;
    sessionStorage.setItem(authKey, "true");
    sessionStorage.setItem(`share_data_${slug}`, JSON.stringify(shareLink));
    setAuthenticated(true);
    void initializeReport(shareLink);
  }, [slug, authenticated, shareLink, initializeReport]);

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

  // Classic dashboard only: need `account` for FiltersBar / KPI / table. Slide/studio shares navigate away
  // before account fetch; don't block the UI on a spinner for those.
  const isSlideOrViewShare = !!(shareLink?.slide_report_id || shareLink?.view_id);
  const needsAccount = authenticated && !account && shareLink?.account_id && !isSlideOrViewShare;

  if (needsAccount && accountLoadState === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Failed to load report</CardTitle>
            <CardDescription>
              There was a problem fetching your report data. Please check your connection and try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => fetchAccountWithRetry(shareLink.account_id)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (needsAccount) {
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
    <div className="min-h-screen bg-background relative">
      <ThemeToggle className="fixed top-4 right-4 z-50" />
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
        lockedDimensionIds={lockedDimensionIds}
        sharedDimensionFilters={reportId && shareLink?.dimension_filters?.[reportId] ? shareLink.dimension_filters[reportId] : {}}
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