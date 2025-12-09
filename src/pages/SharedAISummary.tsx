import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Lock, Eye, EyeOff, Sparkles } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, subMonths, startOfYear } from "date-fns";
import { cn } from "@/lib/utils";
import { 
  AISummaryPivotTable, 
  type CachedPivotData,
  type DateTab,
  type ReportTab,
} from "@/components/AISummaryPivotTable";

interface AISummaryCard {
  id: string;
  name: string;
  report_ids: string[];
  report_configs: Record<string, any>;
  selected_metrics: string[];
  since_date: string;
  ai_prompt: string;
  generated_summary: string | null;
  last_generated_at: string | null;
  created_at: string;
  cached_pivot_data?: CachedPivotData | null;
  pivot_data_refreshed_at?: string | null;
}

interface Report {
  id: string;
  name: string;
}

interface ShareLink {
  id: string;
  slug: string;
  account_id: string | null;
  report_ids: string[];
  password_hash: string;
}

const SharedAISummary = () => {
  const { slug } = useParams();
  
  // Authentication state
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  
  // AI Summary state
  const [card, setCard] = useState<AISummaryCard | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDateTab, setSelectedDateTab] = useState<DateTab>(format(new Date(), "yyyy-MM"));
  const [selectedReportTab, setSelectedReportTab] = useState<ReportTab>("overview");
  const [selectedDatePeriod, setSelectedDatePeriod] = useState<string>(format(new Date(), "yyyy-MM"));

  // Generate date options: YTD at top, then MTD (current month), then previous months
  const dateOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    const yearStart = startOfYear(now);
    const currentMonthKey = format(now, "yyyy-MM");
    
    options.push({ value: "ytd", label: "YTD" });
    
    let current = now;
    while (current >= yearStart) {
      const monthKey = format(current, "yyyy-MM");
      const monthLabel = monthKey === currentMonthKey ? "MTD" : format(current, "MMMM yyyy");
      options.push({ value: monthKey, label: monthLabel });
      current = subMonths(current, 1);
    }
    
    return options;
  }, []);

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
        initializeAISummary(linkData);
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
      toast.error("This share link does not exist");
      setIsLoading(false);
      return;
    }

    setShareLink(data as ShareLink);
    
    const authKey = `share_auth_${slug}`;
    const storedAuth = sessionStorage.getItem(authKey);
    if (storedAuth === "true") {
      setAuthenticated(true);
      initializeAISummary(data as ShareLink);
    } else {
      setIsLoading(false);
    }
  };

  const initializeAISummary = async (linkData: ShareLink) => {
    setIsLoading(true);
    
    try {
      // The share link stores the AI summary card ID in report_ids[0]
      const summaryId = linkData.report_ids?.[0];
      
      if (!summaryId) {
        toast.error("AI Summary not found in share link");
        setIsLoading(false);
        return;
      }
      
      const { data: cardData, error: cardError } = await (supabase.from("ai_summary_cards") as any)
        .select("*")
        .eq("id", summaryId)
        .single();

      if (cardError || !cardData) {
        toast.error("AI Summary not found");
        setIsLoading(false);
        return;
      }

      setCard(cardData as AISummaryCard);

      // Fetch reports for tabs
      if (cardData.report_ids && cardData.report_ids.length > 0) {
        const { data: reportsData } = await supabase
          .from("reports")
          .select("id, name")
          .in("id", cardData.report_ids);

        if (reportsData) {
          setReports(reportsData);
        }
      }
    } catch (err) {
      console.error("Error loading AI Summary:", err);
      toast.error("Failed to load AI Summary");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      toast.error("Please enter the password");
      return;
    }

    setLoading(true);

    const passwordHash = btoa(password);

    if (shareLink && passwordHash === shareLink.password_hash) {
      const authKey = `share_auth_${slug}`;
      sessionStorage.setItem(authKey, "true");
      sessionStorage.setItem(`share_data_${slug}`, JSON.stringify(shareLink));
      
      setAuthenticated(true);
      toast.success("Access granted");

      await initializeAISummary(shareLink);
    } else {
      toast.error("Incorrect password");
    }

    setLoading(false);
  };

  // Password form
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Protected AI Summary</CardTitle>
            <CardDescription>
              This AI Summary is password protected. Please enter the password to continue.
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
                {loading ? "Verifying..." : "Access AI Summary"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading AI Summary...</p>
        </div>
      </div>
    );
  }

  // No card found
  if (!card) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold">AI Summary Not Found</h2>
          <p className="text-muted-foreground mt-2">The requested AI Summary could not be found.</p>
        </div>
      </div>
    );
  }

  // Get report tabs from the card's report_ids
  const aiSummaryReportTabs = reports.filter(r => card.report_ids.includes(r.id));

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* Simplified Sidebar - Only report tabs, no dropdowns */}
        <Sidebar collapsible="icon" className="w-64 border-r bg-sidebar">
          <SidebarContent className="p-6">
            {/* Report Tabs Section */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-base font-medium text-sidebar-foreground mb-3 px-0 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {card.name}
              </SidebarGroupLabel>
              <SidebarGroupContent className="space-y-1">
                <Button
                  variant={selectedReportTab === "overview" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start text-left h-9 px-3",
                    selectedReportTab === "overview" && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => setSelectedReportTab("overview")}
                >
                  Overview
                </Button>
                {aiSummaryReportTabs.map((report) => (
                  <Button
                    key={report.id}
                    variant={selectedReportTab === report.id ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start text-left h-9 px-3",
                      selectedReportTab === report.id && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => setSelectedReportTab(report.id)}
                  >
                    {report.name}
                  </Button>
                ))}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        
        {/* Main Content - Direct pivot table, no header or card wrapper */}
        <div className="flex-1 flex flex-col">
          <div className="px-6 py-6 flex-1">
            <AISummaryPivotTable
              reportIds={card.report_ids}
              selectedMetrics={card.selected_metrics}
              accountId={shareLink?.account_id || undefined}
              cachedPivotData={card.cached_pivot_data}
              reportConfigs={card.report_configs}
              selectedTab={selectedDateTab}
              onTabChange={setSelectedDateTab}
              selectedReportTab={selectedReportTab}
              onReportTabChange={setSelectedReportTab}
              dateOptions={dateOptions}
              selectedDatePeriod={selectedDatePeriod}
              onDatePeriodChange={setSelectedDatePeriod}
            />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SharedAISummary;
