import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Eye, EyeOff, BarChart2, TableIcon, MessageSquare, LayoutGrid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useCustomReportData,
  processTableBlock,
  processKpiBlock,
  processWinnersLosersBlock,
  type WinnerLoserRow,
  type WinnersLosersSegment,
} from "@/hooks/useCustomReportData";
import { ReportBlockRenderer } from "@/components/reports/ReportBlockRenderer";
import { YtdOverviewCharts } from "@/components/reports/YtdOverviewCharts";
import { cn } from "@/lib/utils";
import type {
  CustomReport,
  KpiCardsConfig,
  TableConfig,
  WinnersLosersConfig,
  HighlightTarget,
  ForecastSim,
} from "@/types/customReports";

type ChannelTab = "executive" | "overview" | "metasearch" | "sem" | "social" | "memory";
type ComparisonMode = "yoy" | "previous_period" | "none";

function getComparisonDateRange(
  periodDateRange: { from: string; to: string },
  mode: ComparisonMode,
): { from: string; to: string } | null {
  if (mode === "none") return null;
  const from = new Date(periodDateRange.from);
  const to = new Date(periodDateRange.to);
  if (mode === "yoy") {
    const compFrom = new Date(from);
    compFrom.setFullYear(compFrom.getFullYear() - 1);
    const compTo = new Date(to);
    compTo.setFullYear(compTo.getFullYear() - 1);
    return {
      from: compFrom.toISOString().slice(0, 10),
      to: compTo.toISOString().slice(0, 10),
    };
  }
  const duration = to.getTime() - from.getTime();
  const compTo = new Date(from.getTime() - 86_400_000);
  const compFrom = new Date(compTo.getTime() - duration);
  return {
    from: compFrom.toISOString().slice(0, 10),
    to: compTo.toISOString().slice(0, 10),
  };
}

function formatDateRangeLabel(range: { from: string; to: string }) {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  if (
    from.getUTCFullYear() === to.getUTCFullYear() &&
    from.getUTCMonth() === to.getUTCMonth()
  ) {
    return fmt(from);
  }
  return `${fmt(from)} – ${fmt(to)}`;
}

/** Simple segmented control used for Channel tabs */
function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  variant = "pill",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  variant?: "pill" | "underline";
}) {
  if (variant === "underline") {
    return (
      <div className="flex items-center gap-6 border-b border-border">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative py-2.5 text-sm font-medium transition-colors -mb-px",
              value === opt.value
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center rounded-md border border-border p-0.5 bg-muted/30">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded transition-colors",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Report Viewer (rendered after auth) ──────────────────────────────────────

function ReportViewer({ report }: { report: CustomReport }) {
  const { channelData, comparisonChannelData, filterValues, isLoading: isDataLoading } = useCustomReportData(report);

  const [channelTab, setChannelTab] = useState<ChannelTab>("overview");
  const comparisonMode: ComparisonMode = "yoy";

  const periodDateRange = useMemo(
    () => ({ from: "2026-04-01", to: "2026-04-30" }),
    []
  );

  const comparisonDateRange = useMemo(
    () => getComparisonDateRange(periodDateRange, comparisonMode),
    [periodDateRange, comparisonMode]
  );

  const comparisonLabel = useMemo(() => {
    if (!comparisonDateRange) return undefined;
    return formatDateRangeLabel(comparisonDateRange);
  }, [comparisonDateRange]);

  const getComparisonRows = useCallback(
    (channel: string) => {
      if (!comparisonDateRange) return undefined;
      if (comparisonDateRange.from >= "2026-01-01") {
        return channelData[channel]?.rows;
      }
      return comparisonChannelData[channel]?.rows;
    },
    [comparisonDateRange, channelData, comparisonChannelData]
  );

  const blockDataMap = useMemo(() => {
    if (!report || !channelData) return {};
    const map: Record<string, {
      totals: Record<string, number>;
      breakdownRows: any[];
      comparisonTotals?: Record<string, number>;
      totalsDeltaPct?: Record<string, number>;
      winnersLosers?: { winners: WinnerLoserRow[]; losers: WinnerLoserRow[]; segments?: WinnersLosersSegment[] };
      campaignCountByRow?: Record<string, number>;
    }> = {};

    for (const block of report.blocks) {
      if (block.block_type === "table") {
        const baseConfig = block.config as TableConfig;
        const config: TableConfig = { ...baseConfig, dateRange: periodDateRange };
        const chData = channelData[config.channel];
        if (chData) {
          const compRows = getComparisonRows(config.channel);
          const result = processTableBlock(
            config,
            chData.rows,
            chData.dimMap,
            filterValues[config.channel] || {},
            compRows,
            comparisonDateRange || undefined,
          );
          map[block.id] = result;
        }
      } else if (block.block_type === "winners_losers") {
        const config = block.config as WinnersLosersConfig;
        const chData = channelData[config.channel];
        const compRows = getComparisonRows(config.channel);
        if (chData && compRows && comparisonDateRange) {
          const blockConfig: WinnersLosersConfig = { ...config, dateRange: periodDateRange };
          const wl = processWinnersLosersBlock(
            blockConfig,
            chData.rows,
            chData.dimMap,
            filterValues[config.channel] || {},
            compRows,
            comparisonDateRange,
          );
          map[block.id] = { totals: {}, breakdownRows: [], winnersLosers: wl };
        } else {
          map[block.id] = { totals: {}, breakdownRows: [], winnersLosers: { winners: [], losers: [] } };
        }
      } else if (block.block_type === "kpi_cards") {
        const baseConfig = block.config as KpiCardsConfig;
        const config: KpiCardsConfig = { ...baseConfig, dateRange: periodDateRange };
        const kpiResult = processKpiBlock(
          config,
          channelData,
          filterValues,
          comparisonMode !== "none" ? comparisonChannelData : undefined,
          comparisonDateRange || undefined,
        );
        map[block.id] = { totals: kpiResult.totals, breakdownRows: [], ...kpiResult };
      }
    }
    return map;
  }, [
    report, channelData, comparisonChannelData, filterValues,
    periodDateRange, comparisonDateRange, comparisonMode, getComparisonRows,
  ]);

  const CHANNEL_SCOPED_TYPES = new Set([
    "comment", "winners_losers", "events_calendar",
    "budget_recommendation", "campaign_budget", "forecast_projection",
    "hotel_capacity", "memory_notes",
  ]);

  const visibleBlocks = useMemo(() => {
    if (!report) return [];
    return report.blocks.filter((block) => {
      const cfg = block.config as { channel?: string };
      if (CHANNEL_SCOPED_TYPES.has(block.block_type)) {
        if (!cfg.channel) return channelTab !== "executive";
        if (channelTab === "overview") return cfg.channel === "all";
        return cfg.channel === channelTab;
      }
      if (channelTab === "overview") return cfg.channel === "all";
      return cfg.channel === channelTab;
    });
  }, [report, channelTab]);

  const channelOptions: { value: ChannelTab; label: string }[] = [
    { value: "executive", label: "Action Items" },
    { value: "overview", label: "Overview" },
    { value: "sem", label: "SEM" },
    { value: "metasearch", label: "Metasearch" },
    { value: "social", label: "Social" },
    { value: "memory", label: "Memory" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Document header */}
      <header className="w-full max-w-6xl mx-auto px-8 pt-8 pb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">{report.name}</h1>
            {report.description && (
              <p className="mt-2 text-sm text-muted-foreground max-w-3xl">{report.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex items-center rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
              April 2026 · vs Apr 2025
            </span>
          </div>
        </div>

        {/* Channel tabs */}
        <div className="mt-6">
          <SegmentedTabs
            value={channelTab}
            onChange={setChannelTab}
            options={channelOptions}
            variant="underline"
          />
        </div>
      </header>

      {/* Document body */}
      <main className="w-full max-w-6xl mx-auto px-8 pb-24">
        {channelTab !== "memory" && channelTab !== "executive" && (
          <YtdOverviewCharts
            channelData={channelData}
            comparisonChannelData={comparisonChannelData}
            filterValues={filterValues}
            channels={
              channelTab === "overview"
                ? ["metasearch", "sem", "social"]
                : [channelTab]
            }
            scopeLabel={
              channelTab === "overview"
                ? "SEM · Metasearch · Social"
                : channelTab === "sem"
                  ? "SEM"
                  : channelTab === "metasearch"
                    ? "Metasearch"
                    : "Social"
            }
          />
        )}

        {visibleBlocks.length > 0 && channelTab !== "memory" && channelTab !== "executive" && (
          <div className="mt-12 mb-6 border-b pb-3">
            <h2 className="text-2xl font-semibold tracking-tight">April 2026</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              What happened — compared to April 2025 (YoY).
            </p>
          </div>
        )}
        {channelTab === "memory" && (
          <div className="mb-6 border-b pb-3">
            <h2 className="text-2xl font-semibold tracking-tight">Memory</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Curated notes, data-quality caveats, and source citations that inform how these numbers should be read.
            </p>
          </div>
        )}

        {visibleBlocks.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="flex justify-center gap-3 text-muted-foreground/30">
              <LayoutGrid className="h-10 w-10" />
              <BarChart2 className="h-10 w-10" />
              <TableIcon className="h-10 w-10" />
              <MessageSquare className="h-10 w-10" />
            </div>
            <p className="text-muted-foreground">
              {report.blocks.length === 0
                ? "This report is empty."
                : `No content for ${channelTab === "overview" ? "Overview" : channelTab === "executive" ? "Action Items" : channelTab}. Switch tab to view other content.`}
            </p>
          </div>
        ) : (
          <div>
            {visibleBlocks.map((block, idx) => {
              const bd = blockDataMap[block.id];
              const isFirst = idx === 0;
              const isCommentary = block.block_type === "comment";
              const spacing = isFirst
                ? ""
                : isCommentary
                  ? "mt-4"
                  : "mt-16";

              return (
                <div key={block.id} className={cn("relative", spacing)}>
                  <ReportBlockRenderer
                    block={block}
                    allBlocks={report.blocks}
                    onUpdate={() => {}}
                    totals={bd?.totals}
                    breakdownRows={bd?.breakdownRows}
                    comparisonTotals={bd?.comparisonTotals}
                    totalsDeltaPct={bd?.totalsDeltaPct}
                    winnersLosers={bd?.winnersLosers}
                    campaignCountByRow={bd?.campaignCountByRow}
                    comparisonMode={comparisonMode}
                    comparisonLabel={comparisonLabel}
                    isDataLoading={isDataLoading}
                    isEditMode={false}
                    highlights={[]}
                    activeBulletId={null}
                    onBulletToggle={() => {}}
                    isForecastActive={false}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Password gate + main page ────────────────────────────────────────────────

export default function SharedCustomReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [report, setReport] = useState<CustomReport | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const bootstrapDoneRef = useRef(false);

  const loadReport = useCallback(async (customReportId: string) => {
    const { data, error } = await supabase
      .from("custom_reports")
      .select("*, blocks:custom_report_blocks(*)")
      .eq("id", customReportId)
      .maybeSingle();

    if (error || !data) {
      setFetchError("Report not found or access denied.");
      return;
    }

    // Sort blocks by sort_order
    const sorted = { ...data, blocks: [...(data.blocks || [])].sort((a: any, b: any) => a.sort_order - b.sort_order) };
    setReport(sorted as unknown as CustomReport);
  }, []);

  useEffect(() => {
    if (!slug) return;
    if (bootstrapDoneRef.current) return;
    bootstrapDoneRef.current = true;

    const authKey = `share_auth_${slug}`;
    const storedAuth = sessionStorage.getItem(authKey);
    const storedCustomReportId = sessionStorage.getItem(`share_custom_report_id_${slug}`);

    if (storedAuth === "true" && storedCustomReportId) {
      setAuthenticated(true);
      void loadReport(storedCustomReportId);
    }
  }, [slug, loadReport]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      toast({ title: "Password required", description: "Please enter the password.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('share-link-auth', {
        body: { action: 'verify', slug, password: password.trim() },
      });

      if (error) {
        toast({ title: "Error", description: "Could not verify password. Please try again.", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (!data?.valid) {
        toast({ title: "Incorrect password", description: "The password you entered is incorrect.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Fetch share link to get custom_report_id
      const { data: linkData, error: linkError } = await supabase
        .from("share_links")
        .select("id, slug, custom_report_id, account_id")
        .eq("slug", slug)
        .maybeSingle();

      if (linkError || !linkData?.custom_report_id) {
        toast({ title: "Error", description: "Share link is missing the report reference.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const authKey = `share_auth_${slug}`;
      sessionStorage.setItem(authKey, "true");
      sessionStorage.setItem(`share_custom_report_id_${slug}`, linkData.custom_report_id);

      setAuthenticated(true);
      toast({ title: "Access granted", description: "Loading report..." });
      await loadReport(linkData.custom_report_id);
    } catch (err) {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Access Report</CardTitle>
            <CardDescription>
              Enter the password to view this shared report.
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
                    autoComplete="off"
                    className="pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
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

  if (fetchError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Error</CardTitle>
            <CardDescription>{fetchError}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading report...</p>
        </div>
      </div>
    );
  }

  return <ReportViewer report={report} />;
}
