import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff } from "lucide-react";
import { isChannelBasedFormat, convertReportToChannelFormat } from "@/lib/filterFormatUtils";
import { getCurrentMonthToDateRange, DEFAULT_REPORT_DATE_PRESET, formatDateToLocalIso } from "@/lib/monthUtils";
import { writeShareDateToSession, type ShareDateSelection } from "@/lib/shareSession";

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
  
  // Prevent double-bootstrap when slug/effect deps fire twice
  const bootstrapDoneRef = useRef(false);

  const initializeReport = useCallback(async (linkData: any) => {
    // ALL share links now redirect to Data Studio (/shared/:slug/studio)
    // This unifies the data fetching pipeline and enables cross-year dates, multi-year parallel fetch, etc.
    
    try {
      let finalSlideReportId = linkData.slide_report_id;
      let accountId = linkData.account_id;
      const hasViewId = linkData.view_id;

      // If we have slide_report_id directly, use it (new format)
      if (finalSlideReportId) {
        // Already have slide_report_id, no-op
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
      } else if (linkData.report_ids && linkData.report_ids.length > 0) {
        // Legacy classic share link with report_ids array but no slide_report_id
        // Auto-create or find the account's Data Studio slide report
        
        // First, get account_id from the first report if not provided
        if (!accountId) {
          const { data: report } = await supabase
            .from("reports")
            .select("account_id")
            .eq("id", linkData.report_ids[0])
            .maybeSingle();
          
          if (report?.account_id) {
            accountId = report.account_id;
          }
        }

        if (accountId) {
          // Find or create the account's Data Studio slide report
          const { data: existingSlideReports } = await supabase
            .from("slide_reports")
            .select("id, name")
            .eq("account_id", accountId)
            .eq("name", "Data Studio")
            .limit(1);

          if (existingSlideReports && existingSlideReports.length > 0) {
            finalSlideReportId = existingSlideReports[0].id;
          } else {
            // Create a new Data Studio slide report for this account
            console.log('[SharedReport] Auto-creating Data Studio slide report for account:', accountId);
            
            // Build report_ids mapping from the array
            // Try to infer channel from report names
            const reportIdsMap: Record<string, string> = {};
            for (const reportId of linkData.report_ids) {
              const { data: report } = await supabase
                .from("reports")
                .select("name, channel")
                .eq("id", reportId)
                .maybeSingle();
              
              if (report) {
                const channel = report.channel || inferChannelFromName(report.name);
                if (channel) {
                  reportIdsMap[channel] = reportId;
                }
              }
            }

            const { data: newSlideReport, error: createError } = await supabase
              .from("slide_reports")
              .insert({
                account_id: accountId,
                name: "Data Studio",
                report_ids: reportIdsMap,
                configuration: {},
              })
              .select()
              .single();

            if (!createError && newSlideReport) {
              finalSlideReportId = newSlideReport.id;
            }
          }
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
      
      // Store date selection for Data Studio embed
      // Priority: share_links date fields > view date fields > default month-to-date
      let dateSelection: ShareDateSelection;
      
      if (linkData.selected_year || linkData.selected_month || linkData.custom_date_range) {
        // Use date from share_links (new format)
        dateSelection = {
          selectedYear: linkData.selected_year || new Date().getFullYear().toString(),
          selectedMonth: linkData.selected_month || 'Month to Date',
          customDateRange: linkData.custom_date_range 
            ? { from: linkData.custom_date_range.from, to: linkData.custom_date_range.to }
            : undefined,
          datePreset: linkData.date_preset,
        };
      } else if (hasViewId) {
        // Fallback: try to load date from view
        try {
          const { data: view } = await supabase
            .from("views")
            .select("selected_year, selected_month")
            .eq("id", linkData.view_id)
            .maybeSingle();
          
          if (view) {
            dateSelection = {
              selectedYear: view.selected_year || new Date().getFullYear().toString(),
              selectedMonth: view.selected_month || 'Month to Date',
            };
          } else {
            // View not found, use default
            const mtd = getCurrentMonthToDateRange();
            dateSelection = {
              selectedYear: mtd.to!.getFullYear().toString(),
              selectedMonth: 'Month to Date',
              customDateRange: { from: formatDateToLocalIso(mtd.from!), to: formatDateToLocalIso(mtd.to!) },
              datePreset: DEFAULT_REPORT_DATE_PRESET,
            };
          }
        } catch (err) {
          console.error('Error loading view date:', err);
          // Fallback to default
          const mtd = getCurrentMonthToDateRange();
          dateSelection = {
            selectedYear: mtd.to!.getFullYear().toString(),
            selectedMonth: 'Month to Date',
            customDateRange: { from: formatDateToLocalIso(mtd.from!), to: formatDateToLocalIso(mtd.to!) },
            datePreset: DEFAULT_REPORT_DATE_PRESET,
          };
        }
      } else {
        // No date info available, use default month-to-date
        const mtd = getCurrentMonthToDateRange();
        dateSelection = {
          selectedYear: mtd.to!.getFullYear().toString(),
          selectedMonth: 'Month to Date',
          customDateRange: { from: formatDateToLocalIso(mtd.from!), to: formatDateToLocalIso(mtd.to!) },
          datePreset: DEFAULT_REPORT_DATE_PRESET,
        };
      }
      
      writeShareDateToSession(slug, dateSelection);
      
      // Legacy: Store view_id if it exists (for backward compatibility)
      if (hasViewId) {
        sessionStorage.setItem(`share_view_id_${finalSlideReportId}`, linkData.view_id);
      }
      
      // Store share link data for authentication persistence
      const authKey = `share_auth_${slug}`;
      sessionStorage.setItem(authKey, "true");
      sessionStorage.setItem(`share_data_${slug}`, JSON.stringify(linkData));

      // Navigate to Data Studio embed for ALL shares (unified pipeline)
      navigate(`/shared/${slug}/studio`, { replace: true });
    } catch (error) {
      console.error('Error handling share link:', error);
      toast({
        title: "Error",
        description: "Failed to load shared report",
        variant: "destructive",
      });
    }
  }, [slug, navigate, toast]);

  // Helper function to infer channel from report name
  const inferChannelFromName = (name: string): string | null => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('metasearch') || lowerName.includes('meta search')) return 'metasearch';
    if (lowerName.includes('sem') || lowerName.includes('google ads') || lowerName.includes('search')) return 'sem';
    if (lowerName.includes('social') || lowerName.includes('facebook') || lowerName.includes('meta')) return 'social';
    return null;
  };

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

  // All authenticated shares now redirect to Data Studio (/shared/:slug/studio)
  // Show a loading state while the redirect happens
  if (authenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Opening shared report...</p>
        </div>
      </div>
    );
  }

  // This should never be reached since authenticated shares redirect immediately
  return null;
}