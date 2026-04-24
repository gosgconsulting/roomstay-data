import { useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  BarChart2,
  TableIcon,
  MessageSquare,
  LayoutGrid,
  Eye,
  Edit3,
  Trophy,
  CalendarDays,
  Wallet,
  ListChecks,
  Target,
  Building2,
  Brain,
  Share2,
  Copy,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useCustomReport,
  useUpdateCustomReport,
  useCreateBlock,
  useUpdateBlock,
  useDeleteBlock,
} from "@/hooks/useCustomReports";
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
  BlockType,
  BlockConfig,
  CommentConfig,
  KpiCardsConfig,
  ChartConfig,
  TableConfig,
  WinnersLosersConfig,
  EventsCalendarConfig,
  BudgetRecommendationConfig,
  CampaignBudgetConfig,
  ForecastProjectionConfig,
  HotelCapacityConfig,
  MemoryNotesConfig,
  CustomReportBlock,
  HighlightTarget,
  ForecastSim,
} from "@/types/customReports";

// ── Types ────────────────────────────────────────────────────────────────────

type ChannelTab = "executive" | "overview" | "metasearch" | "sem" | "social" | "memory";
export type ComparisonMode = "yoy" | "previous_period" | "none";

const BLOCK_TYPE_OPTIONS: { value: BlockType; label: string; icon: React.ReactNode; group?: string }[] = [
  { value: "kpi_cards",            label: "KPI Cards",          icon: <LayoutGrid className="h-4 w-4" />,   group: "Data" },
  { value: "chart",                label: "Chart",              icon: <BarChart2 className="h-4 w-4" />,    group: "Data" },
  { value: "table",                label: "Table",              icon: <TableIcon className="h-4 w-4" />,    group: "Data" },
  { value: "comment",              label: "Comment",            icon: <MessageSquare className="h-4 w-4" />, group: "Data" },
  { value: "winners_losers",       label: "Winners / Losers",   icon: <Trophy className="h-4 w-4" />,       group: "SEM Analysis" },
  { value: "events_calendar",      label: "Events Calendar",    icon: <CalendarDays className="h-4 w-4" />,  group: "SEM Analysis" },
  { value: "budget_recommendation",label: "Budget Rec.",        icon: <Wallet className="h-4 w-4" />,       group: "SEM Analysis" },
  { value: "campaign_budget",      label: "Campaign Budget",    icon: <ListChecks className="h-4 w-4" />,   group: "SEM Analysis" },
  { value: "forecast_projection",  label: "Forecast",           icon: <Target className="h-4 w-4" />,       group: "SEM Analysis" },
  { value: "hotel_capacity",       label: "Hotel Capacity",     icon: <Building2 className="h-4 w-4" />,    group: "SEM Analysis" },
  { value: "memory_notes",         label: "Memory",             icon: <Brain className="h-4 w-4" />,         group: "Knowledge" },
];

function defaultConfig(blockType: BlockType): BlockConfig {
  switch (blockType) {
    case "kpi_cards":
      return { channel: "metasearch", metrics: ["impressions", "clicks", "cost", "bookings"] } satisfies KpiCardsConfig;
    case "chart":
      return { channel: "metasearch", metrics: ["impressions", "clicks"], chartType: "area", granularity: "month" } satisfies ChartConfig;
    case "table":
      return { channel: "metasearch", metrics: ["impressions", "clicks", "cost", "bookings"], groupBy: "" } satisfies TableConfig;
    case "comment":
      return { content: "" } satisfies CommentConfig;
    case "winners_losers":
      return { channel: "sem", groupBy: "", rankBy: "revenue" } satisfies WinnersLosersConfig;
    case "events_calendar":
      return { hotels: [], seasonality: [] } satisfies EventsCalendarConfig;
    case "budget_recommendation":
      return { currentTotal: 0, recommendedTotal: 0, rationale: "", rows: [] } satisfies BudgetRecommendationConfig;
    case "campaign_budget":
      return { channel: "sem", rows: [] } satisfies CampaignBudgetConfig;
    case "forecast_projection":
      return { rows: [], notes: "" } satisfies ForecastProjectionConfig;
    case "hotel_capacity":
      return { channel: "all", occupancyRate: 0.8, daysInMonth: 30, rows: [] } satisfies HotelCapacityConfig;
    case "memory_notes":
      return { channel: "memory", entries: [] } satisfies MemoryNotesConfig;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

  // Previous period: same duration, ending the day before `from`
  const duration = to.getTime() - from.getTime();
  const compTo = new Date(from.getTime() - 86_400_000); // 1 day before
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
  // If the range covers a single month, render one label (avoids "Apr 25 – Apr 25")
  if (
    from.getUTCFullYear() === to.getUTCFullYear() &&
    from.getUTCMonth() === to.getUTCMonth()
  ) {
    return fmt(from);
  }
  return `${fmt(from)} – ${fmt(to)}`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function AddBlockMenu({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const groups = [...new Set(BLOCK_TYPE_OPTIONS.map((o) => o.group || "Other"))];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Block
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="end">
        {groups.map((group) => (
          <div key={group}>
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
            {BLOCK_TYPE_OPTIONS.filter((o) => (o.group || "Other") === group).map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onAdd(opt.value); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm hover:bg-muted transition-colors text-left"
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Simple segmented control used for Period + Channel tabs */
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomReportViewPage() {
  const { accountId, reportId } = useParams<{ accountId: string; reportId: string }>();
  const navigate = useNavigate();

  const { data: report, isLoading } = useCustomReport(reportId);
  const updateReport = useUpdateCustomReport();
  const createBlock = useCreateBlock();
  const updateBlock = useUpdateBlock();
  const deleteBlock = useDeleteBlock();

  // Fetch live data for the report (current + comparison years)
  const { channelData, comparisonChannelData, filterValues, isLoading: isDataLoading } = useCustomReportData(report);

  // ── Channel tabs (period is hard-locked to April 2026) ────────────────────
  const [channelTab, setChannelTab] = useState<ChannelTab>("overview");
  // Comparison is hard-wired to YoY — no user-facing toggle.
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

  /** Pick which dataset to use as comparison rows for a channel */
  const getComparisonRows = useCallback(
    (channel: string) => {
      if (!comparisonDateRange) return undefined;
      // If comparison falls within 2026, reuse current-year rows; otherwise use 2025 data
      if (comparisonDateRange.from >= "2026-01-01") {
        return channelData[channel]?.rows;
      }
      return comparisonChannelData[channel]?.rows;
    },
    [comparisonDateRange, channelData, comparisonChannelData]
  );

  // ── Interactive bullet: active highlight + forecast ────────────────────
  const [activeBulletId, setActiveBulletId] = useState<string | null>(null);
  const [activeHighlights, setActiveHighlights] = useState<HighlightTarget[]>([]);
  const [activeForecast, setActiveForecast] = useState<ForecastSim | null>(null);

  const toggleBullet = useCallback(
    (bulletId: string, highlights?: HighlightTarget[], forecast?: ForecastSim) => {
      if (activeBulletId === bulletId) {
        setActiveBulletId(null);
        setActiveHighlights([]);
        setActiveForecast(null);
      } else {
        setActiveBulletId(bulletId);
        setActiveHighlights(highlights || []);
        setActiveForecast(forecast || null);
      }
    },
    [activeBulletId]
  );

  const applyForecast = useCallback(
    (
      breakdownRows: Array<{ dimensionValue: string; metrics: Record<string, number> }>,
      forecast: ForecastSim
    ) => {
      const from = breakdownRows.find((r) => r.dimensionValue === forecast.fromRow);
      const to = breakdownRows.find((r) => r.dimensionValue === forecast.toRow);
      if (!from || !to) return breakdownRows;
      const shiftedCost = (from.metrics.cost || 0) * forecast.percentShift;
      if (shiftedCost <= 0) return breakdownRows;

      const fromRatio = from.metrics.cost ? shiftedCost / from.metrics.cost : 0;
      const fromRevenueShift = (from.metrics.revenue || 0) * fromRatio;
      const fromBookingsShift = (from.metrics.bookings || 0) * fromRatio;
      const fromClicksShift = (from.metrics.clicks || 0) * fromRatio;
      const fromImprShift = (from.metrics.impressions || 0) * fromRatio;
      const toCostBefore = to.metrics.cost || 0;
      const toCostAfter = toCostBefore + shiftedCost;
      const toGrowthRatio = toCostBefore > 0 ? toCostAfter / toCostBefore : 1;

      return breakdownRows.map((r) => {
        if (r.dimensionValue === forecast.fromRow) {
          const m = { ...r.metrics };
          m.cost = (m.cost || 0) - shiftedCost;
          m.revenue = (m.revenue || 0) - fromRevenueShift;
          m.bookings = (m.bookings || 0) - fromBookingsShift;
          m.clicks = (m.clicks || 0) - fromClicksShift;
          m.impressions = (m.impressions || 0) - fromImprShift;
          m.ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
          m.cpa = m.bookings > 0 ? m.cost / m.bookings : 0;
          m.cpc = m.clicks > 0 ? m.cost / m.clicks : 0;
          m.roas = m.cost > 0 ? m.revenue / m.cost : 0;
          return { ...r, metrics: m };
        }
        if (r.dimensionValue === forecast.toRow) {
          const m = { ...r.metrics };
          m.cost = toCostAfter;
          m.revenue = (m.revenue || 0) * toGrowthRatio;
          m.bookings = (m.bookings || 0) * toGrowthRatio;
          m.clicks = (m.clicks || 0) * toGrowthRatio;
          m.impressions = (m.impressions || 0) * toGrowthRatio;
          m.ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
          m.cpa = m.bookings > 0 ? m.cost / m.bookings : 0;
          m.cpc = m.clicks > 0 ? m.cost / m.clicks : 0;
          m.roas = m.cost > 0 ? m.revenue / m.cost : 0;
          return { ...r, metrics: m };
        }
        return r;
      });
    },
    []
  );

  // Pre-compute block data (applies period override + comparison + forecast simulation)
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
          // Apply forecast if active and targets this block
          if (activeForecast && activeForecast.blockId === block.id) {
            result.breakdownRows = applyForecast(result.breakdownRows, activeForecast);
            const sumKeys = ["impressions", "clicks", "cost", "revenue", "bookings", "leads"];
            const newTotals: Record<string, number> = {};
            for (const k of sumKeys) {
              newTotals[k] = result.breakdownRows.reduce((s, r) => s + (r.metrics[k] || 0), 0);
            }
            newTotals.ctr = newTotals.impressions > 0 ? (newTotals.clicks / newTotals.impressions) * 100 : 0;
            newTotals.cpa = newTotals.bookings > 0 ? newTotals.cost / newTotals.bookings : 0;
            newTotals.cpc = newTotals.clicks > 0 ? newTotals.cost / newTotals.clicks : 0;
            newTotals.roas = newTotals.cost > 0 ? newTotals.revenue / newTotals.cost : 0;
            result.totals = newTotals;
          }
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
    periodDateRange, comparisonDateRange, comparisonMode,
    activeForecast, applyForecast, getComparisonRows,
  ]);

  const visibleBlocks = useMemo(() => {
    if (!report) return [];

    // Blocks that are driven by a config-level channel field (manual / editorial)
    const CHANNEL_SCOPED_TYPES = new Set([
      "comment", "winners_losers", "events_calendar",
      "budget_recommendation", "campaign_budget", "forecast_projection",
      "hotel_capacity", "memory_notes",
    ]);

    return report.blocks.filter((block) => {
      const cfg = block.config as { channel?: string };

      if (CHANNEL_SCOPED_TYPES.has(block.block_type)) {
        // No channel → show on every tab EXCEPT executive (which is fully curated)
        if (!cfg.channel) return channelTab !== "executive";
        // Explicit channel → only show on the matching tab
        if (channelTab === "overview") return cfg.channel === "all";
        return cfg.channel === channelTab;
      }

      // Data blocks (kpi_cards, chart, table) are always channel-scoped
      if (channelTab === "overview") return cfg.channel === "all";
      return cfg.channel === channelTab;
    });
  }, [report, channelTab]);

  // Mode toggle: view vs edit
  const [mode, setMode] = useState<"view" | "edit">("view");
  const isEditMode = mode === "edit";

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  // Inline name editing
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const startEditName = useCallback(() => {
    if (report) { setNameDraft(report.name); setEditingName(true); }
  }, [report]);

  const saveName = useCallback(() => {
    if (!report || !nameDraft.trim()) return;
    updateReport.mutate({ id: report.id, name: nameDraft.trim() });
    setEditingName(false);
  }, [report, nameDraft, updateReport]);

  const handleAddBlock = useCallback((blockType: BlockType) => {
    if (!reportId) return;
    const maxOrder = (report?.blocks || []).reduce((max, b) => Math.max(max, b.sort_order), -1);
    createBlock.mutate({
      report_id: reportId,
      block_type: blockType,
      title: "",
      config: defaultConfig(blockType),
      sort_order: maxOrder + 1,
    });
  }, [reportId, report?.blocks, createBlock]);

  const handleUpdateBlock = useCallback((block: CustomReportBlock, updates: { title?: string; config?: BlockConfig }) => {
    updateBlock.mutate({ id: block.id, report_id: block.report_id, ...updates });
  }, [updateBlock]);

  const handleDeleteBlock = useCallback((block: CustomReportBlock) => {
    if (!confirm("Delete this block?")) return;
    deleteBlock.mutate({ blockId: block.id, reportId: block.report_id });
  }, [deleteBlock]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading report...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Report not found.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

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
      {/* Back link */}
      <div className="w-full max-w-6xl mx-auto px-8 pt-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(accountId ? `/tools/reports/${accountId}` : "/tools/reports")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reports
        </Button>
      </div>

      {/* Document header */}
      <header className="w-full max-w-6xl mx-auto px-8 pt-4 pb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-0">
            {editingName && isEditMode ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-10 text-2xl font-semibold max-w-xl"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <Button variant="ghost" size="icon" onClick={saveName}><Check className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setEditingName(false)}><X className="h-4 w-4" /></Button>
              </div>
            ) : isEditMode ? (
              <button onClick={startEditName} className="group flex items-center gap-2 text-left">
                <h1 className="text-3xl font-semibold tracking-tight">{report.name}</h1>
                <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ) : (
              <h1 className="text-3xl font-semibold tracking-tight">{report.name}</h1>
            )}
            {report.description && (
              <p className="mt-2 text-sm text-muted-foreground max-w-3xl">{report.description}</p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex items-center rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
              April 2026 · vs Apr 2025
            </span>
            <Button
              variant={isEditMode ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setMode(isEditMode ? "view" : "edit")}
              title={isEditMode ? "Switch to view mode" : "Switch to edit mode"}
            >
              {isEditMode ? <Eye className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
              {isEditMode ? "View" : "Edit"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShareDialogOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            {isEditMode && <AddBlockMenu onAdd={handleAddBlock} />}
          </div>
        </div>

        {/* Channel tabs as underlined nav */}
        <div className="mt-6">
          <SegmentedTabs
            value={channelTab}
            onChange={setChannelTab}
            options={channelOptions}
            variant="underline"
          />
        </div>

        {activeBulletId && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{activeForecast ? "Forecast active" : "Highlight active"}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setActiveBulletId(null);
                setActiveHighlights([]);
                setActiveForecast(null);
              }}
            >
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        )}
      </header>

      {/* Document body */}
      <main className="w-full max-w-6xl mx-auto px-8 pb-24">
        {/* YTD overview sits at the top of every channel tab as a reader-friendly
            entry point to the rest of the story. On a specific channel tab the
            charts narrow to that channel only. Not shown on the Memory tab. */}
        {channelTab !== "memory" && channelTab !== "executive" && <YtdOverviewCharts
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
        />}

        {/* Period section divider — clearly marks where the April 2026 deep-dive starts.
            Hidden on the Memory tab, which has its own header below. */}
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
                ? "This report is empty. Add blocks to start building your report."
                : `No content for ${channelTab === "overview" ? "Overview" : channelTab === "executive" ? "Action Items" : channelTab}. Switch tab or add blocks.`}
            </p>
            {isEditMode && (
              <div className="flex justify-center gap-2 flex-wrap">
                {BLOCK_TYPE_OPTIONS.map((opt) => (
                  <Button key={opt.value} variant="outline" size="sm" className="gap-1.5" onClick={() => handleAddBlock(opt.value)}>
                    {opt.icon} {opt.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {visibleBlocks.map((block, idx) => {
              const bd = blockDataMap[block.id];
              const blockHighlights = activeHighlights.filter((h) => h.blockId === block.id);

              // Vertical rhythm: large gap between major sections (anything with
              // a §N eyebrow title), tighter gap between commentary and the data
              // section immediately above it.
              const isFirst = idx === 0;
              const isCommentary = block.block_type === "comment";
              const spacing = isFirst
                ? ""
                : isCommentary
                  ? "mt-4"     // commentary sits close to the data it refers to
                  : "mt-16";   // new section = generous breathing room

              return (
                <div
                  key={block.id}
                  className={cn(
                    "group relative",
                    spacing,
                    isEditMode && "hover:outline hover:outline-1 hover:outline-dashed hover:outline-border/60 hover:outline-offset-8 rounded"
                  )}
                >
                  {isEditMode && (
                    <div className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDeleteBlock(block)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                  <ReportBlockRenderer
                    block={block}
                    allBlocks={report.blocks}
                    onUpdate={(updates) => handleUpdateBlock(block, updates)}
                    totals={bd?.totals}
                    breakdownRows={bd?.breakdownRows}
                    comparisonTotals={bd?.comparisonTotals}
                    totalsDeltaPct={bd?.totalsDeltaPct}
                    winnersLosers={bd?.winnersLosers}
                    campaignCountByRow={bd?.campaignCountByRow}
                    comparisonMode={comparisonMode}
                    comparisonLabel={comparisonLabel}
                    isDataLoading={isDataLoading}
                    isEditMode={isEditMode}
                    highlights={blockHighlights}
                    activeBulletId={activeBulletId}
                    onBulletToggle={toggleBullet}
                    isForecastActive={!!(activeForecast && activeForecast.blockId === block.id)}
                  />
                </div>
              );
            })}

            {isEditMode && (
              <div className="flex justify-center pt-16">
                <AddBlockMenu onAdd={handleAddBlock} />
              </div>
            )}
          </div>
        )}
      </main>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Report</DialogTitle>
            <DialogDescription>
              Generate a password-protected link. Anyone with the link and password can view this report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {!shareSlug ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="share-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="share-password"
                      type="password"
                      placeholder="Set a password for this link"
                      className="pl-9"
                      value={sharePassword}
                      onChange={(e) => setSharePassword(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!sharePassword || shareLoading}
                  onClick={async () => {
                    if (!sharePassword || !reportId) return;
                    setShareLoading(true);
                    try {
                      const slug = Math.random().toString(36).slice(2, 10);
                      const { data, error } = await supabase.functions.invoke('create-share-link', {
                        body: {
                          slug,
                          password: sharePassword,
                          custom_report_id: reportId,
                          account_id: report?.account_id,
                        },
                      });
                      if (error) throw error;
                      setShareSlug(data?.slug || slug);
                    } catch (err) {
                      console.error('Share error', err);
                    } finally {
                      setShareLoading(false);
                    }
                  }}
                >
                  {shareLoading ? "Creating link..." : "Generate Link"}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Share Link</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/shared/${shareSlug}/report`}
                      className="text-xs"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/shared/${shareSlug}/report`);
                        setShareCopied(true);
                        setTimeout(() => setShareCopied(false), 2000);
                      }}
                    >
                      {shareCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this link along with the password you set. The recipient will be asked for the password before viewing.
                </p>
                <Button variant="outline" className="w-full" onClick={() => { setShareSlug(null); setSharePassword(""); }}>
                  Create Another Link
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
