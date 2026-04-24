import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pencil,
  Check,
  X,
  BarChart2,
  TableIcon,
  MessageSquare,
  LayoutGrid,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Zap,
  Target,
  AlertTriangle,
  Info,
  Link as LinkIcon,
  Globe,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CustomReportBlock,
  BlockConfig,
  CommentConfig,
  KpiCardsConfig,
  TableConfig,
  WinnersLosersConfig,
  EventsCalendarConfig,
  BudgetRecommendationConfig,
  CampaignBudgetConfig,
  ForecastProjectionConfig,
  HotelCapacityConfig,
  HotelCapacityRow,
  MemoryNotesConfig,
  MemoryNote,
  MemoryNoteKind,
  CampaignAction,
  HotelEvent,
  EventType,
  EventImpact,
  SeasonalSignal,
  InteractiveBullet,
  HighlightTarget,
  ForecastSim,
} from "@/types/customReports";
import type { BreakdownRow, WinnerLoserRow, WinnersLosersSegment } from "@/hooks/useCustomReportData";

interface ReportBlockRendererProps {
  block: CustomReportBlock;
  /** All blocks in the report — needed by the bullet editor to pick targets */
  allBlocks?: CustomReportBlock[];
  onUpdate: (updates: { title?: string; config?: BlockConfig }) => void;
  /** Aggregated totals for KPI / table blocks */
  totals?: Record<string, number>;
  /** Grouped breakdown rows for table blocks */
  breakdownRows?: BreakdownRow[];
  /** Comparison-period totals (YoY or previous period) */
  comparisonTotals?: Record<string, number>;
  /** % change vs comparison totals per metric key */
  totalsDeltaPct?: Record<string, number>;
  /** Active comparison mode — controls delta display */
  comparisonMode?: "yoy" | "previous_period" | "none";
  /** Human-readable label for the comparison period, e.g. "Apr '25 – Apr '25" */
  comparisonLabel?: string;
  /** Whether data is still loading */
  isDataLoading?: boolean;
  /** When false, hide edit affordances (title pencil, comment editor, etc.) */
  isEditMode?: boolean;
  /** Active highlight targets that apply to THIS block */
  highlights?: HighlightTarget[];
  /** ID of the currently-active interactive bullet (across the whole report) */
  activeBulletId?: string | null;
  /** Toggle callback for interactive bullets */
  onBulletToggle?: (
    bulletId: string,
    highlights?: HighlightTarget[],
    forecast?: ForecastSim
  ) => void;
  /** True when forecast is active and targets this block (shows forecast badge) */
  isForecastActive?: boolean;
  /** Pre-computed winners/losers for winners_losers blocks */
  winnersLosers?: { winners: WinnerLoserRow[]; losers: WinnerLoserRow[]; segments?: WinnersLosersSegment[] };
  /** Optional count of distinct campaigns per breakdown row (table blocks). */
  campaignCountByRow?: Record<string, number>;
}

const METRIC_LABELS: Record<string, string> = {
  impressions: "Impressions",
  clicks: "Clicks",
  ctr: "CTR",
  cost: "Cost",
  bookings: "Bookings",
  revenue: "Revenue",
  roas: "ROAS",
  cpa: "CPA",
  cpc: "CPC",
  conversionRate: "Conv. Rate",
  conversion_rate: "Conv. Rate",
  aov: "AOV",
  conv_rate: "Conv. Rate",
  costOfSale: "Cost of Sale",
  leads: "Leads",
  grossProfit: "Gross Profit",
};

function formatMetric(key: string, value: number | undefined): string {
  if (value === undefined || value === null) return "—";
  if (!isFinite(value)) return "—";
  switch (key) {
    case "impressions":
    case "clicks":
    case "bookings":
    case "leads":
      return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
    case "ctr":
    case "conversionRate":
    case "conversion_rate":
    case "conv_rate":
    case "costOfSale":
      return value.toFixed(2) + "%";
    case "cost":
    case "revenue":
    case "cpa":
    case "cpc":
    case "aov":
    case "grossProfit":
      return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "roas":
      return value.toFixed(1) + "x";
    default:
      return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

// Metrics where a lower value is better (positive delta = bad)
const LOWER_IS_BETTER = new Set(["cost", "cpa", "cpc", "costOfSale"]);

/**
 * Small inline badge showing % change vs comparison period.
 * Green = improvement (higher is better + positive, or lower is better + negative).
 * Red  = decline.
 */
function DeltaBadge({ delta, metricKey }: { delta: number | undefined; metricKey: string }) {
  if (delta == null || !isFinite(delta) || delta === 0) return null;
  const isPositive = delta > 0;
  const isGood = LOWER_IS_BETTER.has(metricKey) ? !isPositive : isPositive;
  return (
    <span
      className={cn(
        "text-[10px] font-medium tabular-nums flex items-center gap-0.5 leading-none",
        isGood ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
      )}
    >
      {isPositive ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function BlockIcon({ type }: { type: string }) {
  switch (type) {
    case "kpi_cards": return <LayoutGrid className="h-4 w-4" />;
    case "chart": return <BarChart2 className="h-4 w-4" />;
    case "table": return <TableIcon className="h-4 w-4" />;
    case "comment": return <MessageSquare className="h-4 w-4" />;
    default: return null;
  }
}

function BlockTypeLabel({ type }: { type: string }) {
  switch (type) {
    case "kpi_cards": return "KPI Cards";
    case "chart": return "Chart";
    case "table": return "Table";
    case "comment": return "Comment";
    default: return type;
  }
}

// ── Comment Block ───────────────────────────────────────────────────────────

function genId() {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

function CommentBlock({
  block,
  allBlocks = [],
  onUpdate,
  isEditMode = true,
  activeBulletId,
  onBulletToggle,
}: {
  block: CustomReportBlock;
  allBlocks?: CustomReportBlock[];
  onUpdate: ReportBlockRendererProps["onUpdate"];
  isEditMode?: boolean;
  activeBulletId?: string | null;
  onBulletToggle?: ReportBlockRendererProps["onBulletToggle"];
}) {
  const config = block.config as CommentConfig;
  const bullets: InteractiveBullet[] = config.bullets || [];
  const [editingContent, setEditingContent] = useState(false);
  const [draft, setDraft] = useState(config.content || "");
  const [editingBulletId, setEditingBulletId] = useState<string | null>(null);

  const saveContent = () => {
    onUpdate({ config: { ...config, content: draft } });
    setEditingContent(false);
  };

  const updateBullets = (next: InteractiveBullet[]) => {
    onUpdate({ config: { ...config, bullets: next } });
  };

  const addBullet = () => {
    const newBullet: InteractiveBullet = {
      id: genId(),
      text: "New insight — click to edit",
      highlights: [],
    };
    updateBullets([...bullets, newBullet]);
    setEditingBulletId(newBullet.id);
  };

  const removeBullet = (id: string) => {
    updateBullets(bullets.filter((b) => b.id !== id));
    if (editingBulletId === id) setEditingBulletId(null);
  };

  const updateBullet = (id: string, patch: Partial<InteractiveBullet>) => {
    updateBullets(bullets.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const hasAnyContent = !!config.content || bullets.length > 0;

  return (
    <div className="space-y-3">
      {/* Free-text content */}
      {editingContent && isEditMode ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write your commentary, analysis, or notes here..."
            rows={3}
            className="resize-y"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveContent} className="gap-1">
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(config.content || ""); setEditingContent(false); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : config.content ? (
        <div
          className={cn("whitespace-pre-wrap leading-relaxed", isEditMode && "cursor-pointer hover:text-foreground rounded")}
          onClick={() => { if (isEditMode) { setDraft(config.content || ""); setEditingContent(true); } }}
        >
          {config.content}
        </div>
      ) : isEditMode && bullets.length === 0 ? (
        <p
          className="text-sm text-muted-foreground italic cursor-pointer"
          onClick={() => { setDraft(""); setEditingContent(true); }}
        >
          Click to add a comment...
        </p>
      ) : null}

      {/* Interactive bullet list */}
      {bullets.length > 0 && (
        <ul className="space-y-2 list-none pl-0">
          {bullets.map((bullet) => (
            <InteractiveBulletItem
              key={bullet.id}
              bullet={bullet}
              allBlocks={allBlocks}
              isActive={activeBulletId === bullet.id}
              isEditMode={isEditMode}
              isEditing={editingBulletId === bullet.id}
              onClick={() => onBulletToggle?.(bullet.id, bullet.highlights, bullet.forecast)}
              onEditToggle={() => setEditingBulletId(editingBulletId === bullet.id ? null : bullet.id)}
              onRemove={() => removeBullet(bullet.id)}
              onChange={(patch) => updateBullet(bullet.id, patch)}
            />
          ))}
        </ul>
      )}

      {/* Add-bullet button (edit mode only) */}
      {isEditMode && (
        <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs" onClick={addBullet}>
          <Plus className="h-3 w-3" /> Add interactive bullet
        </Button>
      )}

      {!hasAnyContent && !isEditMode && (
        <p className="text-sm text-muted-foreground italic">No comment.</p>
      )}
    </div>
  );
}

// ── Interactive Bullet Item ─────────────────────────────────────────────────

function InteractiveBulletItem({
  bullet,
  allBlocks,
  isActive,
  isEditMode,
  isEditing,
  onClick,
  onEditToggle,
  onRemove,
  onChange,
}: {
  bullet: InteractiveBullet;
  allBlocks: CustomReportBlock[];
  isActive: boolean;
  isEditMode: boolean;
  isEditing: boolean;
  onClick: () => void;
  onEditToggle: () => void;
  onRemove: () => void;
  onChange: (patch: Partial<InteractiveBullet>) => void;
}) {
  const hasForecast = !!bullet.forecast;
  const hasHighlights = (bullet.highlights?.length || 0) > 0;

  return (
    <li
      className={cn(
        "group/bullet transition-colors rounded",
        isActive && "bg-primary/5"
      )}
    >
      <div className="flex items-start gap-2 py-0.5">
        <button
          onClick={onClick}
          className="flex-1 text-left text-[15px] leading-relaxed flex items-start gap-2"
          disabled={!hasForecast && !hasHighlights}
          title={
            hasForecast
              ? "Click to apply forecast simulation"
              : hasHighlights
                ? "Click to highlight referenced data"
                : "No interactive targets configured"
          }
        >
          <span
            className={cn(
              "shrink-0 select-none font-medium leading-relaxed",
              isActive ? "text-primary" : hasForecast || hasHighlights ? "text-primary/60" : "text-muted-foreground/50"
            )}
            aria-hidden
          >
            —
          </span>
          <span className={cn(
            "flex-1",
            (hasForecast || hasHighlights) && !isActive && "underline decoration-dotted decoration-primary/30 underline-offset-4"
          )}>
            {bullet.text}
            {hasForecast && (
              <Badge variant="secondary" className="ml-2 text-[9px] gap-0.5 py-0 px-1">
                <Zap className="h-2.5 w-2.5" /> Forecast
              </Badge>
            )}
            {!hasForecast && hasHighlights && (
              <Badge variant="outline" className="ml-2 text-[9px] gap-0.5 py-0 px-1">
                <Target className="h-2.5 w-2.5" /> {bullet.highlights!.length}
              </Badge>
            )}
          </span>
        </button>

        {isEditMode && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/bullet:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEditToggle} title="Edit bullet">
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove} title="Remove bullet">
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {isEditing && isEditMode && (
        <BulletEditor bullet={bullet} allBlocks={allBlocks} onChange={onChange} onClose={onEditToggle} />
      )}
    </li>
  );
}

// ── Bullet Editor (inline) ──────────────────────────────────────────────────

function BulletEditor({
  bullet,
  allBlocks,
  onChange,
  onClose,
}: {
  bullet: InteractiveBullet;
  allBlocks: CustomReportBlock[];
  onChange: (patch: Partial<InteractiveBullet>) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(bullet.text);
  const [highlights, setHighlights] = useState<HighlightTarget[]>(bullet.highlights || []);
  const [forecast, setForecast] = useState<ForecastSim | null>(bullet.forecast || null);

  const dataBlocks = allBlocks.filter((b) => b.block_type === "kpi_cards" || b.block_type === "table");
  const tableBlocks = allBlocks.filter((b) => b.block_type === "table");

  const addHighlight = () => {
    setHighlights([...highlights, { blockId: dataBlocks[0]?.id || "", type: "kpi", key: "" }]);
  };

  const updateHighlight = (idx: number, patch: Partial<HighlightTarget>) => {
    setHighlights(highlights.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };

  const removeHighlight = (idx: number) => {
    setHighlights(highlights.filter((_, i) => i !== idx));
  };

  const save = () => {
    onChange({
      text,
      highlights: highlights.length > 0 ? highlights : undefined,
      forecast: forecast || undefined,
    });
    onClose();
  };

  return (
    <div className="border-t border-border/50 p-3 space-y-3 bg-background/50">
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Text</label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="text-sm" />
      </div>

      {/* Highlights */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Highlights ({highlights.length})
          </label>
          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={addHighlight}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
        {highlights.map((h, idx) => (
          <div key={idx} className="flex items-center gap-1.5 text-xs">
            <Select value={h.blockId} onValueChange={(v) => updateHighlight(idx, { blockId: v })}>
              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Block" /></SelectTrigger>
              <SelectContent>
                {dataBlocks.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.title || `${b.block_type} block`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={h.type} onValueChange={(v) => updateHighlight(idx, { type: v as HighlightTarget["type"] })}>
              <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="kpi" className="text-xs">KPI metric</SelectItem>
                <SelectItem value="row" className="text-xs">Table row</SelectItem>
                <SelectItem value="block" className="text-xs">Whole block</SelectItem>
              </SelectContent>
            </Select>
            {h.type !== "block" && (
              <Input
                value={h.key || ""}
                onChange={(e) => updateHighlight(idx, { key: e.target.value })}
                placeholder={h.type === "kpi" ? "metric key (e.g. cost)" : "row name"}
                className="h-7 text-xs flex-1"
              />
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeHighlight(idx)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Forecast */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Forecast simulation
          </label>
          {!forecast ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs gap-1"
              onClick={() =>
                setForecast({
                  blockId: tableBlocks[0]?.id || "",
                  fromRow: "",
                  toRow: "",
                  percentShift: 0.5,
                })
              }
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-destructive" onClick={() => setForecast(null)}>
              <X className="h-3 w-3" /> Remove
            </Button>
          )}
        </div>
        {forecast && (
          <div className="space-y-1.5">
            <Select value={forecast.blockId} onValueChange={(v) => setForecast({ ...forecast, blockId: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Target table block" /></SelectTrigger>
              <SelectContent>
                {tableBlocks.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.title || "table block"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 text-xs">
              <Input
                value={forecast.fromRow}
                onChange={(e) => setForecast({ ...forecast, fromRow: e.target.value })}
                placeholder="From row (dimension value)"
                className="h-7 text-xs flex-1"
              />
              <span className="text-muted-foreground">→</span>
              <Input
                value={forecast.toRow}
                onChange={(e) => setForecast({ ...forecast, toRow: e.target.value })}
                placeholder="To row (dimension value)"
                className="h-7 text-xs flex-1"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="text-muted-foreground whitespace-nowrap">Shift</label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={forecast.percentShift}
                onChange={(e) => setForecast({ ...forecast, percentShift: parseFloat(e.target.value) || 0 })}
                className="h-7 text-xs w-20"
              />
              <span className="text-muted-foreground">
                ({Math.round(forecast.percentShift * 100)}% of cost)
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={save} className="gap-1 h-7 text-xs">
          <Check className="h-3 w-3" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} className="h-7 text-xs">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── KPI Cards Block (matches KPICardsSection design) ──────────────────────

function KpiCardsBlock({
  block,
  totals,
  totalsDeltaPct,
  isDataLoading,
  highlights = [],
}: {
  block: CustomReportBlock;
  totals?: Record<string, number>;
  totalsDeltaPct?: Record<string, number>;
  isDataLoading?: boolean;
  highlights?: HighlightTarget[];
}) {
  const config = block.config as KpiCardsConfig;
  const highlightedKpis = new Set(
    highlights.filter((h) => h.type === "kpi" && h.key).map((h) => h.key as string)
  );
  const wholeBlockHighlighted = highlights.some((h) => h.type === "block");

  if (isDataLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 border-t border-b border-border divide-x divide-border">
        {(config.metrics || []).map((metric) => (
          <div key={metric} className="py-4 px-5 flex flex-col gap-1.5 animate-pulse">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 border-t border-b border-border divide-x divide-border">
      {(config.metrics || []).map((metric) => {
        const isHighlighted = wholeBlockHighlighted || highlightedKpis.has(metric);
        const delta = totalsDeltaPct?.[metric];
        return (
          <div
            key={metric}
            className={cn(
              "py-4 px-5 flex flex-col gap-1 transition-colors",
              isHighlighted && "bg-primary/5"
            )}
          >
            <p className={cn(
              "text-[10px] font-medium uppercase tracking-widest leading-none",
              isHighlighted ? "text-primary" : "text-muted-foreground"
            )}>
              {METRIC_LABELS[metric] || metric}
            </p>
            <p className={cn(
              "text-2xl font-semibold leading-tight tabular-nums",
              isHighlighted ? "text-primary" : "text-foreground"
            )}>
              {formatMetric(metric, totals?.[metric])}
            </p>
            {delta != null && <DeltaBadge delta={delta} metricKey={metric} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Table Block (matches BreakdownTableSection design) ─────────────────────

function TableBlock({
  block,
  totals,
  breakdownRows,
  totalsDeltaPct,
  isDataLoading,
  highlights = [],
  isForecastActive,
  campaignCountByRow,
}: {
  block: CustomReportBlock;
  totals?: Record<string, number>;
  breakdownRows?: BreakdownRow[];
  totalsDeltaPct?: Record<string, number>;
  isDataLoading?: boolean;
  highlights?: HighlightTarget[];
  isForecastActive?: boolean;
  campaignCountByRow?: Record<string, number>;
}) {
  const config = block.config as TableConfig;
  const highlightedRows = new Set(
    highlights.filter((h) => h.type === "row" && h.key).map((h) => h.key as string)
  );
  const highlightedMetrics = new Set(
    highlights.filter((h) => h.type === "kpi" && h.key).map((h) => h.key as string)
  );

  type SortKey = string;
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedRows = [...(breakdownRows || [])].sort((a, b) => {
    const key = sortKey || "cost";
    const aVal = a.metrics[key] || 0;
    const bVal = b.metrics[key] || 0;
    return sortDir === "desc" ? bVal - aVal : aVal - bVal;
  });

  const SortIcon = ({ k }: { k: string }) => {
    if (sortKey !== k) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40 inline-block" />;
    return sortDir === "desc"
      ? <ArrowDown className="ml-1 h-3 w-3 text-primary inline-block" />
      : <ArrowUp className="ml-1 h-3 w-3 text-primary inline-block" />;
  };

  const SortableHead = ({ k, label }: { k: string; label: string }) => (
    <TableHead
      className="text-right cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap text-[10px] uppercase tracking-wider font-medium text-muted-foreground"
      onClick={() => handleSort(k)}
    >
      {label}
      <SortIcon k={k} />
    </TableHead>
  );

  if (isDataLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-full scrollbar-hide">
      <Table className="w-full">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{config.groupBy ? "Dimension" : "Total"}</TableHead>
            {(config.metrics || []).map((m) => (
              <SortableHead key={m} k={m} label={METRIC_LABELS[m] || m} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Breakdown rows */}
          {sortedRows.map((row) => {
            const isRowHighlighted = highlightedRows.has(row.dimensionValue);
            return (
              <TableRow
                key={row.dimensionValue}
                className={cn(
                  "transition-colors",
                  isRowHighlighted
                    ? "bg-primary/10 hover:bg-primary/15 border-l-2 border-l-primary"
                    : "hover:bg-muted/50"
                )}
              >
                <TableCell className={cn("font-medium", isRowHighlighted && "text-primary")}>
                  <div className="flex flex-col gap-0.5">
                    <span>{row.dimensionValue}</span>
                    {campaignCountByRow && campaignCountByRow[row.dimensionValue] != null && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {campaignCountByRow[row.dimensionValue]} campaign{campaignCountByRow[row.dimensionValue] === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </TableCell>
                {(config.metrics || []).map((m) => (
                  <TableCell
                    key={m}
                    className={cn(
                      "text-right tabular-nums whitespace-nowrap align-top",
                      highlightedMetrics.has(m) && !isRowHighlighted && "bg-primary/5 text-primary font-medium"
                    )}
                  >
                    <div className="flex flex-col items-end gap-0.5">
                      <span>{formatMetric(m, row.metrics[m])}</span>
                      <DeltaBadge delta={row.deltaPct?.[m]} metricKey={m} />
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            );
          })}

          {/* Totals row — matches BreakdownTableSection styling */}
          {totals && (
            <TableRow className="bg-muted/50 font-semibold border-t-2">
              <TableCell>Total</TableCell>
              {(config.metrics || []).map((m) => (
                <TableCell key={m} className="text-right tabular-nums whitespace-nowrap align-top">
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{formatMetric(m, totals[m])}</span>
                    <DeltaBadge delta={totalsDeltaPct?.[m]} metricKey={m} />
                  </div>
                </TableCell>
              ))}
            </TableRow>
          )}

          {/* Empty state */}
          {(!breakdownRows || breakdownRows.length === 0) && !totals && (
            <TableRow>
              <TableCell
                colSpan={(config.metrics || []).length + 1}
                className="text-center text-muted-foreground py-8"
              >
                No data available for this date range.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Section 2: Winners & Losers ──────────────────────────────────────────────

const WINNER_RANK_LABELS: Record<string, string> = {
  revenue: "Revenue",
  roas: "ROAS",
  bookings: "Bookings",
  cost: "Cost",
};

function WinnersLosersBlock({
  block,
  winnersLosers,
  isDataLoading,
}: {
  block: CustomReportBlock;
  winnersLosers?: { winners: WinnerLoserRow[]; losers: WinnerLoserRow[]; segments?: WinnersLosersSegment[] };
  isDataLoading?: boolean;
}) {
  const config = block.config as WinnersLosersConfig;
  const rankBy = config.rankBy || "revenue";
  const rankLabel = WINNER_RANK_LABELS[rankBy] || rankBy;

  if (isDataLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ))}
      </div>
    );
  }

  const { winners = [], losers = [], segments = [] } = winnersLosers || {};
  const noData = winners.length === 0 && losers.length === 0;
  const topN = config.topN ?? 3;

  function MetricCell({ k, label, row }: { k: string; label: string; row: WinnerLoserRow }) {
    const curr = row.currentMetrics[k] ?? 0;
    const prev = row.comparisonMetrics[k] ?? 0;
    const pct = row.deltaPct[k];
    const hasDelta = pct != null && isFinite(pct);
    const isPositive = hasDelta && pct > 0;
    const isGood = hasDelta && (LOWER_IS_BETTER.has(k) ? !isPositive : isPositive);
    return (
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-[11px] font-semibold tabular-nums">{formatMetric(k, curr)}</p>
        {hasDelta ? (
          <p className={cn(
            "text-[10px] font-medium tabular-nums leading-tight",
            isGood ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
          )}>
            {isPositive ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground italic leading-tight">no YoY</p>
        )}
        <p className="text-[9px] text-muted-foreground tabular-nums leading-tight">vs {formatMetric(k, prev)}</p>
      </div>
    );
  }

  function WinnerCard({ row, isWinner }: { row: WinnerLoserRow; isWinner: boolean }) {
    return (
      <div className={cn(
        "rounded-lg border p-3 flex flex-col gap-1.5",
        isWinner ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800"
                 : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
      )}>
        <p className="text-[11px] font-medium text-foreground truncate" title={row.dimensionValue}>
          {row.dimensionValue}
        </p>
        {row.segmentValue && (
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{row.segmentValue}</p>
        )}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          <MetricCell k="cost" label="Cost" row={row} />
          <MetricCell k="revenue" label="Revenue" row={row} />
          <MetricCell k="roas" label="ROAS" row={row} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Per-segment summary (e.g. per funnel) */}
      {segments.length > 0 && (
        <div className="rounded-lg border divide-y">
          <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted/30">
            <div>Segment</div>
            <div className="text-right">Winners / Losers</div>
            <div className="text-right">Cost</div>
            <div className="text-right">Revenue</div>
            <div className="text-right">ROAS</div>
          </div>
          {segments.map((s) => (
            <div key={s.segmentValue} className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr] gap-3 px-3 py-2 text-sm items-center">
              <div className="font-medium">{s.segmentValue}</div>
              <div className="text-right text-[11px]">
                <span className="text-emerald-600 dark:text-emerald-400">▲ {s.winnerCount}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="text-red-500 dark:text-red-400">▼ {s.loserCount}</span>
              </div>
              <div className="text-right tabular-nums">
                <div>{formatMetric("cost", s.totalCost)}</div>
                <DeltaBadge delta={s.costDeltaPct} metricKey="cost" />
              </div>
              <div className="text-right tabular-nums">
                <div>{formatMetric("revenue", s.totalRevenue)}</div>
                <DeltaBadge delta={s.revenueDeltaPct} metricKey="revenue" />
              </div>
              <div className="text-right tabular-nums">
                <div>{formatMetric("roas", s.roas)}</div>
                <DeltaBadge delta={s.roasDeltaPct} metricKey="roas" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top winners / losers cards */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
              Top {topN} Winners · {rankLabel}
            </p>
          </div>
          {winners.length === 0
            ? <p className="text-sm text-muted-foreground italic">No winners found.</p>
            : winners.map((r) => <WinnerCard key={r.dimensionValue} row={r} isWinner />)}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
              Top {topN} Losers · {rankLabel}
            </p>
          </div>
          {losers.length === 0
            ? <p className="text-sm text-muted-foreground italic">No losers found.</p>
            : losers.map((r) => <WinnerCard key={r.dimensionValue} row={r} isWinner={false} />)}
        </div>

        {noData && (
          <p className="col-span-2 text-center text-sm text-muted-foreground py-4">
            No comparison data available. Enable a comparison period to see winners & losers.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Section 3: Events Calendar ───────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  concert: "Concert", conference: "Conference", holiday: "Public Holiday",
  school_break: "School Break", mice: "MICE", sports: "Sports", other: "Other",
};
const EVENT_TYPE_COLORS: Record<EventType, string> = {
  concert: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  conference: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  holiday: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  school_break: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  mice: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  sports: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  other: "bg-muted text-muted-foreground",
};
const IMPACT_COLORS: Record<EventImpact, string> = {
  tailwind: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  headwind: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  neutral: "bg-muted text-muted-foreground",
};
const IMPACT_LABELS: Record<EventImpact, string> = {
  tailwind: "Budget ↑",
  headwind: "Budget ↓",
  neutral: "Hold",
};
const SIGNAL_CONFIG: Record<SeasonalSignal, { label: string; icon: string; color: string }> = {
  strong_up:     { label: "Strong Uptrend",   icon: "↑↑", color: "text-emerald-600 dark:text-emerald-400" },
  moderate_up:   { label: "Moderate Uptrend", icon: "↑",  color: "text-emerald-500 dark:text-emerald-400" },
  flat:          { label: "Flat",             icon: "→",  color: "text-muted-foreground" },
  moderate_down: { label: "Moderate Decline", icon: "↓",  color: "text-orange-500 dark:text-orange-400" },
  strong_down:   { label: "Strong Decline",   icon: "↓↓", color: "text-red-500 dark:text-red-400" },
};

function EventsCalendarBlock({
  block,
  onUpdate,
  isEditMode,
}: {
  block: CustomReportBlock;
  onUpdate: (updates: { config?: BlockConfig }) => void;
  isEditMode?: boolean;
}) {
  const config = block.config as EventsCalendarConfig;
  const hotels = config.hotels || [];
  const seasonality = config.seasonality || [];

  // Flatten all events for table view
  const allEvents: Array<HotelEvent & { hotelName: string }> = hotels.flatMap((h) =>
    (h.events || []).map((e) => ({ ...e, hotelName: h.name }))
  ).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      {/* Events table */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Upcoming Events
        </p>
        {allEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {isEditMode ? "No events added yet. Click + Add Event below." : "No upcoming events recorded."}
          </p>
        ) : (
          <div className="w-full scrollbar-hide">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Impact</TableHead>
                  {isEditMode && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {allEvents.map((evt) => (
                  <TableRow key={evt.id}>
                    <TableCell className="text-sm tabular-nums">
                      {new Date(evt.date + 'T00:00:00').toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </TableCell>
                    <TableCell className="text-sm">{evt.hotelName}</TableCell>
                    <TableCell className="text-sm">
                      <div>
                        <span className="font-medium">{evt.name}</span>
                        {evt.notes && <p className="text-[11px] text-muted-foreground">{evt.notes}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", EVENT_TYPE_COLORS[evt.type])}>
                        {EVENT_TYPE_LABELS[evt.type]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", IMPACT_COLORS[evt.impact])}>
                        {IMPACT_LABELS[evt.impact] ?? evt.impact}
                      </span>
                    </TableCell>
                    {isEditMode && (
                      <TableCell>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => {
                            const nextHotels = hotels.map((h) => ({
                              ...h,
                              events: (h.events || []).filter((e) => e.id !== evt.id),
                            }));
                            onUpdate({ config: { ...config, hotels: nextHotels } });
                          }}
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {isEditMode && (
          <EventAddForm
            hotels={hotels.map((h) => h.name)}
            onAdd={(hotelName, evt) => {
              const nextHotels = hotels.some((h) => h.name === hotelName)
                ? hotels.map((h) => h.name === hotelName
                    ? { ...h, events: [...(h.events || []), evt] }
                    : h)
                : [...hotels, { name: hotelName, events: [evt] }];
              onUpdate({ config: { ...config, hotels: nextHotels } });
            }}
          />
        )}
      </div>

      {/* Seasonality signals */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Seasonality Signals
        </p>
        {seasonality.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {isEditMode ? "No seasonality signals added." : "No seasonality data recorded."}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {seasonality.map((s) => {
              const sig = SIGNAL_CONFIG[s.signal];
              return (
                <div key={s.hotelName} className="bg-card border border-border rounded-lg p-3 relative group/sig">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-[11px] font-medium text-muted-foreground truncate">{s.hotelName}</p>
                    {isEditMode && (
                      <button
                        className="opacity-0 group-hover/sig:opacity-100 transition-opacity"
                        onClick={() => onUpdate({ config: { ...config, seasonality: seasonality.filter((x) => x.hotelName !== s.hotelName) } })}
                      >
                        <X className="h-3 w-3 text-destructive" />
                      </button>
                    )}
                  </div>
                  <p className={cn("text-lg font-bold leading-tight mt-0.5", sig.color)}>
                    {sig.icon} <span className="text-sm">{sig.label}</span>
                  </p>
                  {s.notes && <p className="text-[10px] text-muted-foreground mt-1">{s.notes}</p>}
                </div>
              );
            })}
          </div>
        )}

        {isEditMode && (
          <SeasonalityAddForm
            onAdd={(entry) => onUpdate({ config: { ...config, seasonality: [...seasonality, entry] } })}
          />
        )}
      </div>
    </div>
  );
}

function EventAddForm({ hotels, onAdd }: {
  hotels: string[];
  onAdd: (hotelName: string, evt: HotelEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hotel, setHotel] = useState(hotels[0] || "");
  const [newHotel, setNewHotel] = useState("");
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("conference");
  const [impact, setImpact] = useState<EventImpact>("tailwind");
  const [notes, setNotes] = useState("");

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="mt-2 gap-1 h-7 text-xs" onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> Add Event
      </Button>
    );
  }

  const save = () => {
    const hotelName = newHotel.trim() || hotel;
    if (!hotelName || !date || !name) return;
    onAdd(hotelName, { id: `evt_${Date.now()}`, date, name: name.trim(), type, impact, notes: notes.trim() || undefined });
    setOpen(false); setDate(""); setName(""); setNotes(""); setNewHotel("");
  };

  return (
    <div className="mt-2 border rounded-lg p-3 space-y-2 bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground">Add Event</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Date (YYYY-MM-DD)" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 text-xs" />
        <Input placeholder="Event name" value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
        <Input
          placeholder={hotels.length > 0 ? `Hotel (or: ${hotels[0]})` : "Hotel name"}
          value={newHotel}
          onChange={(e) => setNewHotel(e.target.value)}
          className="h-7 text-xs"
        />
        <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-7 text-xs" />
        <Select value={type} onValueChange={(v) => setType(v as EventType)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
              <SelectItem key={t} value={t} className="text-xs">{EVENT_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={impact} onValueChange={(v) => setImpact(v as EventImpact)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tailwind" className="text-xs">Budget ↑ (Increase)</SelectItem>
            <SelectItem value="headwind" className="text-xs">Budget ↓ (Decrease)</SelectItem>
            <SelectItem value="neutral" className="text-xs">Hold</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs gap-1" onClick={save}><Check className="h-3 w-3" /> Add</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}><X className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

function SeasonalityAddForm({ onAdd }: { onAdd: (entry: import("@/types/customReports").SeasonalityEntry) => void }) {
  const [open, setOpen] = useState(false);
  const [hotel, setHotel] = useState("");
  const [signal, setSignal] = useState<SeasonalSignal>("moderate_up");
  const [notes, setNotes] = useState("");

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="mt-2 gap-1 h-7 text-xs" onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> Add Seasonality Signal
      </Button>
    );
  }

  const save = () => {
    if (!hotel.trim()) return;
    onAdd({ hotelName: hotel.trim(), signal, notes: notes.trim() || undefined });
    setOpen(false); setHotel(""); setNotes("");
  };

  return (
    <div className="mt-2 border rounded-lg p-3 space-y-2 bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground">Add Seasonality Signal</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Hotel name" value={hotel} onChange={(e) => setHotel(e.target.value)} className="h-7 text-xs" />
        <Select value={signal} onValueChange={(v) => setSignal(v as SeasonalSignal)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SIGNAL_CONFIG) as SeasonalSignal[]).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{SIGNAL_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-7 text-xs col-span-2" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs gap-1" onClick={save}><Check className="h-3 w-3" /> Add</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}><X className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

// ── Section 4: Budget Recommendation ─────────────────────────────────────────

function BudgetRecommendationBlock({
  block,
  onUpdate,
  isEditMode,
}: {
  block: CustomReportBlock;
  onUpdate: (updates: { config?: BlockConfig }) => void;
  isEditMode?: boolean;
}) {
  const config = block.config as BudgetRecommendationConfig;
  const { currentTotal = 0, recommendedTotal = 0, rationale = "", rows = [] } = config;
  const delta = currentTotal > 0 ? ((recommendedTotal - currentTotal) / currentTotal) * 100 : 0;
  const isIncrease = recommendedTotal >= currentTotal;
  const [editingRationale, setEditingRationale] = useState(false);
  const [rationaleDraft, setRationaleDraft] = useState(rationale);
  const [editingRow, setEditingRow] = useState<string | null>(null);

  const updateConfig = (patch: Partial<BudgetRecommendationConfig>) =>
    onUpdate({ config: { ...config, ...patch } });

  return (
    <div className="space-y-4">
      {/* Hero: before/after totals */}
      <div className="flex items-center gap-6">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Current Total</p>
          <p className="text-3xl font-bold tabular-nums">
            {isEditMode
              ? <input
                  type="number"
                  value={currentTotal || ""}
                  onChange={(e) => updateConfig({ currentTotal: parseFloat(e.target.value) || 0 })}
                  className="w-32 bg-transparent border-b text-3xl font-bold tabular-nums outline-none text-center"
                  placeholder="0"
                />
              : formatMetric("cost", currentTotal)
            }
          </p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className={cn(
            "text-2xl font-bold",
            isIncrease ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
          )}>
            {isIncrease ? "▶" : "◀"}
          </div>
          <span className={cn(
            "text-sm font-semibold",
            isIncrease ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
          )}>
            {isIncrease ? "+" : ""}{delta.toFixed(1)}%
          </span>
        </div>
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Recommended</p>
          <p className="text-3xl font-bold tabular-nums">
            {isEditMode
              ? <input
                  type="number"
                  value={recommendedTotal || ""}
                  onChange={(e) => updateConfig({ recommendedTotal: parseFloat(e.target.value) || 0 })}
                  className="w-32 bg-transparent border-b text-3xl font-bold tabular-nums outline-none text-center"
                  placeholder="0"
                />
              : formatMetric("cost", recommendedTotal)
            }
          </p>
        </div>
      </div>

      {/* Rationale */}
      {editingRationale && isEditMode ? (
        <div className="space-y-1.5">
          <Input
            value={rationaleDraft}
            onChange={(e) => setRationaleDraft(e.target.value)}
            placeholder="One-line rationale (e.g. +18% concentrated in Hotel A and C where Q2 events justify it)"
            className="text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { updateConfig({ rationale: rationaleDraft }); setEditingRationale(false); }}>
              <Check className="h-3 w-3" /> Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingRationale(false)}><X className="h-3 w-3" /></Button>
          </div>
        </div>
      ) : rationale ? (
        <p
          className={cn("text-sm text-muted-foreground border-l-2 border-border pl-3 italic", isEditMode && "cursor-pointer hover:bg-muted/20 rounded")}
          onClick={() => { if (isEditMode) { setRationaleDraft(rationale); setEditingRationale(true); } }}
        >
          {rationale}
        </p>
      ) : isEditMode ? (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => { setRationaleDraft(""); setEditingRationale(true); }}>
          <Pencil className="h-3 w-3" /> Add rationale
        </Button>
      ) : null}

      {/* Per-hotel/funnel breakdown table */}
      {(rows.length > 0 || isEditMode) && (
        <div className="w-full scrollbar-hide">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Recommended</TableHead>
                <TableHead className="text-right">Δ%</TableHead>
                {isEditMode && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const rowDelta = row.current > 0 ? ((row.recommended - row.current) / row.current) * 100 : 0;
                const isInc = row.recommended >= row.current;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-sm">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatMetric("cost", row.current)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-semibold">{formatMetric("cost", row.recommended)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums text-sm font-medium", isInc ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                      {isInc ? "+" : ""}{rowDelta.toFixed(1)}%
                    </TableCell>
                    {isEditMode && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateConfig({ rows: rows.filter((r) => r.id !== row.id) })}>
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {isEditMode && (
            <Button variant="ghost" size="sm" className="mt-2 gap-1 h-7 text-xs" onClick={() => {
              const newRow: import("@/types/customReports").BudgetRecommendationRow = {
                id: `row_${Date.now()}`, label: "New Segment", current: 0, recommended: 0,
              };
              updateConfig({ rows: [...rows, newRow] });
            }}>
              <Plus className="h-3 w-3" /> Add Row
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section 6: Campaign Budget ────────────────────────────────────────────────

const ACTION_CONFIG: Record<CampaignAction, { label: string; color: string }> = {
  scale: { label: "Scale",  color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  hold:  { label: "Hold",   color: "bg-muted text-muted-foreground" },
  cut:   { label: "Cut",    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  pause: { label: "Pause",  color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  test:  { label: "Test",   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
};

function CampaignBudgetBlock({
  block,
  onUpdate,
  isEditMode,
}: {
  block: CustomReportBlock;
  onUpdate: (updates: { config?: BlockConfig }) => void;
  isEditMode?: boolean;
}) {
  const config = block.config as CampaignBudgetConfig;
  const rows = config.rows || [];
  const isMonthly = (config.cadence ?? 'monthly') === 'monthly';
  const cadenceLabel = isMonthly ? '/mo' : '/day';
  const [addingRow, setAddingRow] = useState(false);
  const [newCampaign, setNewCampaign] = useState("");
  const [newFunnel, setNewFunnel] = useState("");
  const [newCurrent, setNewCurrent] = useState("");
  const [newRecommended, setNewRecommended] = useState("");
  const [newCurrentRev, setNewCurrentRev] = useState("");
  const [newRecommendedRev, setNewRecommendedRev] = useState("");
  const [newAction, setNewAction] = useState<CampaignAction>("hold");
  const [newNotes, setNewNotes] = useState("");

  const updateConfig = (patch: Partial<CampaignBudgetConfig>) =>
    onUpdate({ config: { ...config, ...patch } });

  const updateRow = (id: string, patch: Partial<import("@/types/customReports").CampaignBudgetRow>) =>
    updateConfig({ rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const totalCurCost = rows.reduce((s, r) => s + (r.currentBudget || 0), 0);
  const totalRecCost = rows.reduce((s, r) => s + (r.recommendedBudget || 0), 0);
  const totalCurRev  = rows.reduce((s, r) => s + (r.currentRevenue || 0), 0);
  const totalRecRev  = rows.reduce((s, r) => s + (r.recommendedRevenue || 0), 0);

  return (
    <div className="space-y-3">
      <div className="w-full scrollbar-hide">
        <Table>
          <TableHeader>
            {/* Grouped header to separate "Current" vs "Recommended" side-by-side */}
            <TableRow className="hover:bg-transparent border-b-0">
              <TableHead colSpan={2} />
              <TableHead colSpan={2} className="text-center text-[10px] uppercase tracking-wider font-medium text-muted-foreground border-l">
                Current ({isMonthly ? 'monthly' : 'daily'})
              </TableHead>
              <TableHead colSpan={2} className="text-center text-[10px] uppercase tracking-wider font-medium text-muted-foreground border-l">
                Recommended ({isMonthly ? 'monthly' : 'daily'})
              </TableHead>
              <TableHead className="border-l" />
              <TableHead />
              {isEditMode && <TableHead className="w-10" />}
            </TableRow>
            <TableRow>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Campaign</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Funnel</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground border-l">Cost</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Revenue</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground border-l">Cost</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Revenue</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground border-l">Δ Cost</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Action</TableHead>
              {isEditMode && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isEditMode && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-6 text-sm">
                  No campaigns added yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const delta = row.currentBudget > 0
                ? ((row.recommendedBudget - row.currentBudget) / row.currentBudget) * 100
                : 0;
              const isInc = row.recommendedBudget >= row.currentBudget;
              const actionCfg = ACTION_CONFIG[row.action];
              return (
                <TableRow key={row.id} className={row.action === "pause" ? "opacity-50" : ""}>
                  <TableCell className="text-sm font-medium max-w-[240px] truncate" title={row.campaign}>
                    {isEditMode
                      ? <Input value={row.campaign} onChange={(e) => updateRow(row.id, { campaign: e.target.value })} className="h-7 text-xs" />
                      : row.campaign}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {isEditMode
                      ? <Input value={row.funnel || ""} onChange={(e) => updateRow(row.id, { funnel: e.target.value })} className="h-7 text-xs w-28" placeholder="—" />
                      : (row.funnel || "—")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm border-l">
                    {isEditMode
                      ? <Input type="number" value={row.currentBudget || ""} onChange={(e) => updateRow(row.id, { currentBudget: parseFloat(e.target.value) || 0 })} className="h-7 text-xs w-24 text-right" />
                      : formatMetric("cost", row.currentBudget)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {isEditMode
                      ? <Input type="number" value={row.currentRevenue ?? ""} onChange={(e) => updateRow(row.id, { currentRevenue: parseFloat(e.target.value) || 0 })} className="h-7 text-xs w-24 text-right" />
                      : formatMetric("revenue", row.currentRevenue ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold border-l">
                    {isEditMode
                      ? <Input type="number" value={row.recommendedBudget || ""} onChange={(e) => updateRow(row.id, { recommendedBudget: parseFloat(e.target.value) || 0 })} className="h-7 text-xs w-24 text-right" />
                      : formatMetric("cost", row.recommendedBudget)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold">
                    {isEditMode
                      ? <Input type="number" value={row.recommendedRevenue ?? ""} onChange={(e) => updateRow(row.id, { recommendedRevenue: parseFloat(e.target.value) || 0 })} className="h-7 text-xs w-24 text-right" />
                      : formatMetric("revenue", row.recommendedRevenue ?? 0)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums text-sm font-medium border-l", isInc ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                    {row.currentBudget > 0 ? (isInc ? "+" : "") + delta.toFixed(1) + "%" : "—"}
                  </TableCell>
                  <TableCell>
                    {isEditMode ? (
                      <Select value={row.action} onValueChange={(v) => updateRow(row.id, { action: v as CampaignAction })}>
                        <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ACTION_CONFIG) as CampaignAction[]).map((a) => (
                            <SelectItem key={a} value={a} className="text-xs">{ACTION_CONFIG[a].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", actionCfg.color)}>
                        {actionCfg.label}
                      </span>
                    )}
                  </TableCell>
                  {isEditMode && (
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateConfig({ rows: rows.filter((r) => r.id !== row.id) })}>
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}

            {/* Totals row — monthly current vs monthly recommended, side by side */}
            {rows.length > 0 && (
              <TableRow className="bg-muted/40 font-semibold border-t-2 hover:bg-muted/40">
                <TableCell className="text-sm">Total{cadenceLabel}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums text-sm border-l">{formatMetric("cost", totalCurCost)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{formatMetric("revenue", totalCurRev)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm border-l">{formatMetric("cost", totalRecCost)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{formatMetric("revenue", totalRecRev)}</TableCell>
                <TableCell className={cn("text-right tabular-nums text-sm border-l",
                  totalRecCost >= totalCurCost ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                )}>
                  {totalCurCost > 0
                    ? (totalRecCost >= totalCurCost ? "+" : "") + (((totalRecCost - totalCurCost) / totalCurCost) * 100).toFixed(1) + "%"
                    : "—"}
                </TableCell>
                <TableCell />
                {isEditMode && <TableCell />}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Action counts chip strip */}
      {rows.length > 0 && (
        <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <span>Action mix:</span>
          {(Object.keys(ACTION_CONFIG) as CampaignAction[]).map((a) => {
            const count = rows.filter((r) => r.action === a).length;
            if (count === 0) return null;
            return (
              <span key={a} className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", ACTION_CONFIG[a].color)}>
                {count} {ACTION_CONFIG[a].label}
              </span>
            );
          })}
        </div>
      )}

      {isEditMode && !addingRow && (
        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => setAddingRow(true)}>
          <Plus className="h-3 w-3" /> Add Campaign
        </Button>
      )}
      {isEditMode && addingRow && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground">Add Campaign</p>
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Campaign name" value={newCampaign} onChange={(e) => setNewCampaign(e.target.value)} className="h-7 text-xs col-span-2" />
            <Input placeholder="Funnel tier" value={newFunnel} onChange={(e) => setNewFunnel(e.target.value)} className="h-7 text-xs" />
            <Input type="number" placeholder={`Current cost${cadenceLabel}`} value={newCurrent} onChange={(e) => setNewCurrent(e.target.value)} className="h-7 text-xs" />
            <Input type="number" placeholder={`Current revenue${cadenceLabel}`} value={newCurrentRev} onChange={(e) => setNewCurrentRev(e.target.value)} className="h-7 text-xs" />
            <Input type="number" placeholder={`Recommended cost${cadenceLabel}`} value={newRecommended} onChange={(e) => setNewRecommended(e.target.value)} className="h-7 text-xs" />
            <Input type="number" placeholder={`Projected revenue${cadenceLabel}`} value={newRecommendedRev} onChange={(e) => setNewRecommendedRev(e.target.value)} className="h-7 text-xs" />
            <Select value={newAction} onValueChange={(v) => setNewAction(v as CampaignAction)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ACTION_CONFIG) as CampaignAction[]).map((a) => (
                  <SelectItem key={a} value={a} className="text-xs">{ACTION_CONFIG[a].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => {
              if (!newCampaign.trim()) return;
              const newRow: import("@/types/customReports").CampaignBudgetRow = {
                id: `cbr_${Date.now()}`,
                campaign: newCampaign.trim(),
                funnel: newFunnel.trim() || undefined,
                currentBudget: parseFloat(newCurrent) || 0,
                recommendedBudget: parseFloat(newRecommended) || 0,
                currentRevenue: parseFloat(newCurrentRev) || 0,
                recommendedRevenue: parseFloat(newRecommendedRev) || 0,
                action: newAction,
                notes: newNotes.trim() || undefined,
              };
              updateConfig({ rows: [...rows, newRow] });
              setAddingRow(false); setNewCampaign(""); setNewFunnel(""); setNewCurrent(""); setNewRecommended(""); setNewCurrentRev(""); setNewRecommendedRev(""); setNewNotes("");
            }}>
              <Check className="h-3 w-3" /> Add
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingRow(false)}><X className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Memory tab: curated notes / knowledge base ───────────────────────────────

const MEMORY_KIND_META: Record<MemoryNoteKind, { label: string; color: string; Icon: typeof Info }> = {
  data_quality: { label: "Data quality", color: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-900", Icon: AlertTriangle },
  context:      { label: "Context",      color: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200 dark:border-sky-900", Icon: Info },
  source:       { label: "Source",       color: "bg-slate-50 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300 border-slate-200 dark:border-slate-800", Icon: BookOpen },
  web:          { label: "Web",          color: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400 border-violet-200 dark:border-violet-900", Icon: Globe },
  note:         { label: "Note",         color: "bg-muted text-foreground border-border", Icon: Info },
};

function MemoryNotesBlock({
  block,
  onUpdate,
  isEditMode,
}: {
  block: CustomReportBlock;
  onUpdate: (updates: { config?: BlockConfig }) => void;
  isEditMode?: boolean;
}) {
  const config = block.config as MemoryNotesConfig;
  const entries = config.entries ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateEntry = (id: string, patch: Partial<MemoryNote>) => {
    onUpdate({
      config: { ...config, entries: entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) },
    });
  };
  const deleteEntry = (id: string) => {
    onUpdate({ config: { ...config, entries: entries.filter((e) => e.id !== id) } });
  };
  const addEntry = () => {
    const id = `m_${Date.now()}`;
    onUpdate({
      config: {
        ...config,
        entries: [
          ...entries,
          { id, kind: "note", title: "New memory", body: "", date: new Date().toISOString().slice(0, 10) },
        ],
      },
    });
    setEditingId(id);
  };

  return (
    <div className="space-y-3">
      {entries.length === 0 && (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No memory entries yet. {isEditMode && "Add one below."}
        </div>
      )}

      {entries.map((e) => {
        const meta = MEMORY_KIND_META[e.kind] || MEMORY_KIND_META.note;
        const isEditing = isEditMode && editingId === e.id;
        return (
          <div key={e.id} className={cn("rounded-lg border p-4 bg-card", "relative group/mem")}>
            <div className="flex items-start gap-3">
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", meta.color)}>
                <meta.Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Select value={e.kind} onValueChange={(v) => updateEntry(e.id, { kind: v as MemoryNoteKind })}>
                        <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(MEMORY_KIND_META) as MemoryNoteKind[]).map((k) => (
                            <SelectItem key={k} value={k} className="text-xs">{MEMORY_KIND_META[k].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="date"
                        value={e.date ?? ""}
                        onChange={(ev) => updateEntry(e.id, { date: ev.target.value })}
                        className="h-7 w-40 text-xs"
                      />
                    </div>
                    <Input
                      value={e.title}
                      onChange={(ev) => updateEntry(e.id, { title: ev.target.value })}
                      placeholder="Memory title"
                      className="h-8"
                    />
                    <Textarea
                      value={e.body}
                      onChange={(ev) => updateEntry(e.id, { body: ev.target.value })}
                      placeholder="Details, caveats, reasoning…"
                      rows={4}
                    />
                    <Input
                      value={e.source ?? ""}
                      onChange={(ev) => updateEntry(e.id, { source: ev.target.value })}
                      placeholder="Source URL or citation (optional)"
                      className="h-8 text-xs"
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Done
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Delete this memory entry?")) {
                            deleteEntry(e.id);
                            setEditingId(null);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border", meta.color)}>
                        {meta.label}
                      </span>
                      <h3 className="text-sm font-semibold leading-tight">{e.title}</h3>
                      {e.date && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">{e.date}</span>
                      )}
                    </div>
                    {e.body && (
                      <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {e.body}
                      </p>
                    )}
                    {e.source && (
                      <a
                        href={/^https?:\/\//.test(e.source) ? e.source : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "mt-2 inline-flex items-center gap-1 text-[11px]",
                          /^https?:\/\//.test(e.source)
                            ? "text-sky-600 dark:text-sky-400 hover:underline"
                            : "text-muted-foreground",
                        )}
                      >
                        <LinkIcon className="h-3 w-3" />
                        {e.source}
                      </a>
                    )}
                  </div>
                )}
              </div>

              {isEditMode && !isEditing && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover/mem:opacity-100 transition-opacity"
                  onClick={() => setEditingId(e.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {isEditMode && (
        <Button variant="outline" size="sm" onClick={addEntry} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add memory
        </Button>
      )}
    </div>
  );
}

// ── Overview: Per-Hotel Capacity & Revenue Share ─────────────────────────────

function HotelCapacityBlock({
  block,
  onUpdate,
  isEditMode,
}: {
  block: CustomReportBlock;
  onUpdate: (updates: { config?: BlockConfig }) => void;
  isEditMode?: boolean;
}) {
  const config = block.config as HotelCapacityConfig;
  const occupancyRate = config.occupancyRate ?? 0.8;
  const daysInMonth = config.daysInMonth ?? 30;
  const rows = config.rows ?? [];

  const propertyRows = rows.filter((r) => !r.isGroup);
  const groupRows = rows.filter((r) => r.isGroup);
  const totalActual = rows.reduce((s, r) => s + (r.actualRevenue || 0), 0);
  const sharedCapacity = !!config.sharedCapacity;
  // When rows share capacity (e.g. channels competing for the same portfolio),
  // the Total uses the first non-group row's rooms/AOV; otherwise we sum.
  const sharedRef = propertyRows[0];
  const totalRooms = sharedCapacity
    ? (sharedRef?.rooms || 0)
    : propertyRows.reduce((s, r) => s + (r.rooms || 0), 0);
  const totalEstRevenue = sharedCapacity
    ? (sharedRef ? (sharedRef.rooms || 0) * daysInMonth * occupancyRate * (sharedRef.aov || 0) : 0)
    : propertyRows.reduce(
        (s, r) => s + (r.rooms || 0) * daysInMonth * occupancyRate * (r.aov || 0),
        0,
      );

  const updateRow = (id: string, patch: Partial<HotelCapacityRow>) => {
    onUpdate({
      config: { ...config, rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
    });
  };
  const updateMeta = (patch: Partial<HotelCapacityConfig>) =>
    onUpdate({ config: { ...config, ...patch } });

  const fmtMoney = (v: number) => formatMetric("revenue", v);
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const renderRow = (r: HotelCapacityRow) => {
    const estRevenue = r.isGroup
      ? null
      : (r.rooms || 0) * daysInMonth * occupancyRate * (r.aov || 0);
    // Capture rate for properties (actual / own TAM). Group rows have no TAM, so
    // fall back to showing their share of total marketing revenue (incremental %).
    const share = r.isGroup
      ? (totalActual > 0 ? r.actualRevenue / totalActual : 0)
      : (estRevenue && estRevenue > 0 ? r.actualRevenue / estRevenue : 0);
    const shareLabel = r.isGroup ? "of marketing total" : "capture rate";

    return (
      <TableRow key={r.id} className={cn(r.isGroup && "bg-muted/30")}>
        <TableCell className="font-medium">
          {isEditMode ? (
            <input
              className="w-full bg-transparent border-b outline-none text-sm"
              value={r.name}
              onChange={(e) => updateRow(r.id, { name: e.target.value })}
            />
          ) : (
            r.name
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {r.isGroup ? (
            <span className="text-muted-foreground">—</span>
          ) : isEditMode ? (
            <input
              type="number"
              className="w-20 bg-transparent border-b outline-none text-right text-sm tabular-nums"
              value={r.rooms ?? ""}
              onChange={(e) => updateRow(r.id, { rooms: parseFloat(e.target.value) || 0 })}
            />
          ) : (
            r.rooms?.toLocaleString() ?? "—"
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {r.isGroup ? (
            <span className="text-muted-foreground">—</span>
          ) : isEditMode ? (
            <input
              type="number"
              className="w-24 bg-transparent border-b outline-none text-right text-sm tabular-nums"
              value={r.aov ?? ""}
              onChange={(e) => updateRow(r.id, { aov: parseFloat(e.target.value) || 0 })}
            />
          ) : (
            r.aov ? fmtMoney(r.aov) : "—"
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {r.isGroup ? <span className="text-muted-foreground">—</span> : fmtMoney(estRevenue || 0)}
        </TableCell>
        <TableCell className="text-right tabular-nums font-semibold">
          {isEditMode ? (
            <input
              type="number"
              className="w-28 bg-transparent border-b outline-none text-right text-sm tabular-nums font-semibold"
              value={r.actualRevenue ?? ""}
              onChange={(e) => updateRow(r.id, { actualRevenue: parseFloat(e.target.value) || 0 })}
            />
          ) : (
            fmtMoney(r.actualRevenue || 0)
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          <span
            className={cn(
              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
              r.isGroup
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
            )}
            title={shareLabel}
          >
            {fmtPct(share)}
          </span>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-3">
      {isEditMode && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            Occupancy
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={occupancyRate}
              onChange={(e) => updateMeta({ occupancyRate: parseFloat(e.target.value) || 0 })}
              className="w-16 border rounded px-1 py-0.5 bg-background"
            />
          </label>
          <label className="flex items-center gap-2">
            Days
            <input
              type="number"
              value={daysInMonth}
              onChange={(e) => updateMeta({ daysInMonth: parseInt(e.target.value) || 30 })}
              className="w-16 border rounded px-1 py-0.5 bg-background"
            />
          </label>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{config.rowLabel || "Property"}</TableHead>
            <TableHead className="text-right">Rooms</TableHead>
            <TableHead className="text-right">ADR / night</TableHead>
            <TableHead className="text-right">
              Est. Revenue<span className="text-[10px] text-muted-foreground ml-1">@ {Math.round(occupancyRate * 100)}% occ.</span>
            </TableHead>
            <TableHead className="text-right">Marketing Revenue</TableHead>
            <TableHead className="text-right">% Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {propertyRows.map(renderRow)}
          {groupRows.length > 0 && (
            <>
              <TableRow>
                <TableCell colSpan={6} className="text-[10px] uppercase tracking-wider text-muted-foreground pt-4 pb-1">
                  Incremental / Group
                </TableCell>
              </TableRow>
              {groupRows.map(renderRow)}
            </>
          )}
          <TableRow className="border-t-2 font-semibold">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">{totalRooms.toLocaleString()}</TableCell>
            <TableCell className="text-right text-muted-foreground">—</TableCell>
            <TableCell className="text-right tabular-nums">{fmtMoney(totalEstRevenue)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtMoney(totalActual)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {totalEstRevenue > 0 ? fmtPct(totalActual / totalEstRevenue) : "—"}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <p className="text-[11px] text-muted-foreground">
        Est. Revenue = Rooms × {daysInMonth} days × {Math.round(occupancyRate * 100)}% occupancy × ADR / night.
        % Share = Marketing Revenue ÷ Est. Revenue (capture rate). Group row shows contribution to total marketing revenue.
      </p>
    </div>
  );
}

// ── Section 7: Forecast Projection ───────────────────────────────────────────

function ForecastProjectionBlock({
  block,
  onUpdate,
  isEditMode,
}: {
  block: CustomReportBlock;
  onUpdate: (updates: { config?: BlockConfig }) => void;
  isEditMode?: boolean;
}) {
  const config = block.config as ForecastProjectionConfig;
  const rows = config.rows || [];
  const months = config.months || [];
  const notes = config.notes || "";
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(notes);

  const updateConfig = (patch: Partial<ForecastProjectionConfig>) =>
    onUpdate({ config: { ...config, ...patch } });

  const updateRow = (metric: string, patch: Partial<import("@/types/customReports").ForecastProjectionRow>) =>
    updateConfig({ rows: rows.map((r) => (r.metric === metric ? { ...r, ...patch } : r)) });

  // ── Monthly YTD + Forecast view ──────────────────────────────────────────
  if (months.length > 0) {
    const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const fmtMonth = (m: string) => {
      const [, mm] = m.split('-');
      const idx = parseInt(mm || '1', 10) - 1;
      return MONTH_LABELS[idx] || m;
    };
    const STATUS_STYLES: Record<string, { badge: string; row: string; label: string }> = {
      actual:   { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', row: '', label: 'Actual' },
      partial:  { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',         row: '', label: 'In progress' },
      forecast: { badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',                 row: 'bg-muted/20', label: 'Forecast' },
    };

    const ytd = months.filter((m) => m.status !== 'forecast');
    const fc  = months.filter((m) => m.status === 'forecast');
    const sum = (arr: typeof months, k: 'revenue'|'bookings'|'cost') => arr.reduce((s, m) => s + (m[k] || 0), 0);
    const ytdRev = sum(ytd, 'revenue');
    const ytdBook = sum(ytd, 'bookings');
    const ytdCost = sum(ytd, 'cost');
    const ytdRoas = ytdCost > 0 ? ytdRev / ytdCost : 0;
    const fyRev = sum(months, 'revenue');
    const fyBook = sum(months, 'bookings');
    const fyCost = sum(months, 'cost');
    const fyRoas = fyCost > 0 ? fyRev / fyCost : 0;

    return (
      <div className="space-y-4">
        {/* YTD / Full-year headline cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
              Year-to-Date ({ytd.length} month{ytd.length === 1 ? '' : 's'} closed / in progress)
            </p>
            <div className="grid grid-cols-4 gap-2">
              <div><p className="text-[10px] text-muted-foreground">Revenue</p><p className="text-sm font-semibold tabular-nums">{formatMetric('revenue', ytdRev)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Bookings</p><p className="text-sm font-semibold tabular-nums">{formatMetric('bookings', ytdBook)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Cost</p><p className="text-sm font-semibold tabular-nums">{formatMetric('cost', ytdCost)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">ROAS</p><p className="text-sm font-semibold tabular-nums">{formatMetric('roas', ytdRoas)}</p></div>
            </div>
          </div>
          <div className="rounded-lg border p-3 bg-sky-50/50 dark:bg-sky-950/10">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
              Full-Year Projection (YTD + {fc.length} forecast month{fc.length === 1 ? '' : 's'})
            </p>
            <div className="grid grid-cols-4 gap-2">
              <div><p className="text-[10px] text-muted-foreground">Revenue</p><p className="text-sm font-semibold tabular-nums">{formatMetric('revenue', fyRev)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Bookings</p><p className="text-sm font-semibold tabular-nums">{formatMetric('bookings', fyBook)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Cost</p><p className="text-sm font-semibold tabular-nums">{formatMetric('cost', fyCost)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">ROAS</p><p className="text-sm font-semibold tabular-nums">{formatMetric('roas', fyRoas)}</p></div>
            </div>
          </div>
        </div>

        {/* Monthly table */}
        <div className="w-full scrollbar-hide">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Month</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Revenue</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Bookings</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Cost</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">ROAS</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Events / Context</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => {
                const s = STATUS_STYLES[m.status] || STATUS_STYLES.forecast;
                return (
                  <TableRow key={m.month} className={cn('hover:bg-muted/30', s.row)}>
                    <TableCell className="font-medium text-sm">{fmtMonth(m.month)}</TableCell>
                    <TableCell>
                      <span className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-medium', s.badge)}>{s.label}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatMetric('revenue', m.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatMetric('bookings', m.bookings)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatMetric('cost', m.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatMetric('roas', m.roas)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(m.events && m.events.length > 0)
                        ? <div className="flex flex-wrap gap-1">{m.events.map((e, i) => (
                            <span key={i} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]">{e}</span>
                          ))}</div>
                        : <span className="italic opacity-60">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Notes */}
        {editingNotes && isEditMode ? (
          <div className="space-y-1.5">
            <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={2} className="text-sm" />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { updateConfig({ notes: notesDraft }); setEditingNotes(false); }}>
                <Check className="h-3 w-3" /> Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNotes(false)}><X className="h-3 w-3" /></Button>
            </div>
          </div>
        ) : notes ? (
          <p
            className={cn('text-sm text-muted-foreground italic border-l-2 border-primary/50 pl-3', isEditMode && 'cursor-pointer hover:bg-muted/20 rounded')}
            onClick={() => { if (isEditMode) { setNotesDraft(notes); setEditingNotes(true); } }}
          >
            {notes}
          </p>
        ) : isEditMode ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => { setNotesDraft(''); setEditingNotes(true); }}>
            <Pencil className="h-3 w-3" /> Add commitment statement
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="w-full scrollbar-hide">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Current Period</TableHead>
              <TableHead className="text-right">Projected</TableHead>
              <TableHead className="text-right">Range (low – high)</TableHead>
              <TableHead className="text-right">Uplift</TableHead>
              {isEditMode && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isEditMode && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">
                  No projections added yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const uplift = row.current > 0 ? ((row.projected - row.current) / row.current) * 100 : 0;
              const isPositive = uplift >= 0;
              const isGood = !LOWER_IS_BETTER.has(row.metric) ? isPositive : !isPositive;
              return (
                <TableRow key={row.metric}>
                  <TableCell className="font-medium text-sm">{METRIC_LABELS[row.metric] || row.metric}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {isEditMode
                      ? <Input type="number" value={row.current || ""} onChange={(e) => updateRow(row.metric, { current: parseFloat(e.target.value) || 0 })} className="h-7 text-xs w-28 text-right" />
                      : formatMetric(row.metric, row.current)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold">
                    {isEditMode
                      ? <Input type="number" value={row.projected || ""} onChange={(e) => updateRow(row.metric, { projected: parseFloat(e.target.value) || 0 })} className="h-7 text-xs w-28 text-right" />
                      : formatMetric(row.metric, row.projected)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {isEditMode ? (
                      <div className="flex items-center gap-1 justify-end">
                        <Input type="number" value={row.low || ""} onChange={(e) => updateRow(row.metric, { low: parseFloat(e.target.value) || 0 })} className="h-7 text-xs w-24 text-right" placeholder="Low" />
                        <span>–</span>
                        <Input type="number" value={row.high || ""} onChange={(e) => updateRow(row.metric, { high: parseFloat(e.target.value) || 0 })} className="h-7 text-xs w-24 text-right" placeholder="High" />
                      </div>
                    ) : `${formatMetric(row.metric, row.low)} – ${formatMetric(row.metric, row.high)}`}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums text-sm font-medium", isGood ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                    {isPositive ? "+" : ""}{uplift.toFixed(1)}%
                  </TableCell>
                  {isEditMode && (
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateConfig({ rows: rows.filter((r) => r.metric !== row.metric) })}>
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Add metric row in edit mode */}
      {isEditMode && (
        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => {
          const availableMetrics = ["bookings", "revenue", "roas", "cost", "cpa", "clicks", "impressions", "ctr"]
            .filter((m) => !rows.some((r) => r.metric === m));
          if (availableMetrics.length === 0) return;
          updateConfig({
            rows: [...rows, { metric: availableMetrics[0], current: 0, projected: 0, low: 0, high: 0 }],
          });
        }}>
          <Plus className="h-3 w-3" /> Add Metric
        </Button>
      )}

      {/* Notes / commitment statement */}
      {editingNotes && isEditMode ? (
        <div className="space-y-1.5">
          <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={2} className="text-sm" placeholder="Add a commitment statement or methodology note..." />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { updateConfig({ notes: notesDraft }); setEditingNotes(false); }}>
              <Check className="h-3 w-3" /> Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNotes(false)}><X className="h-3 w-3" /></Button>
          </div>
        </div>
      ) : notes ? (
        <p
          className={cn("text-sm text-muted-foreground italic border-l-2 border-primary/50 pl-3", isEditMode && "cursor-pointer hover:bg-muted/20 rounded")}
          onClick={() => { if (isEditMode) { setNotesDraft(notes); setEditingNotes(true); } }}
        >
          {notes}
        </p>
      ) : isEditMode ? (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => { setNotesDraft(""); setEditingNotes(true); }}>
          <Pencil className="h-3 w-3" /> Add commitment statement
        </Button>
      ) : null}
    </div>
  );
}

// ── Section Heading (doc-style) ─────────────────────────────────────────────

/**
 * Splits a title like "§2 — Campaign Winners & Losers" into:
 *   eyebrow = "§2"
 *   title   = "Campaign Winners & Losers"
 * Falls back to a single title with no eyebrow for other formats.
 */
function parseSectionTitle(raw: string): { eyebrow?: string; title: string } {
  if (!raw) return { title: "" };
  const match = raw.match(/^\s*(§[^—\-–:]+)\s*[—\-–:]\s*(.+)$/);
  if (match) return { eyebrow: match[1].trim(), title: match[2].trim() };
  return { title: raw };
}

function SectionHeading({
  block,
  isEditMode,
  onUpdate,
  isForecastActive,
  showComparison,
  comparisonLabel,
  size = "lg",
}: {
  block: CustomReportBlock;
  isEditMode: boolean;
  onUpdate: ReportBlockRendererProps["onUpdate"];
  isForecastActive?: boolean;
  showComparison?: boolean;
  comparisonLabel?: string;
  size?: "lg" | "md";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const { eyebrow, title } = parseSectionTitle(block.title || "");

  const start = () => { setDraft(block.title || ""); setEditing(true); };
  const save = () => { onUpdate({ title: draft.trim() }); setEditing(false); };

  if (editing && isEditMode) {
    return (
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 text-base font-semibold"
          placeholder="Section title (use '§N — Title' for eyebrow label)"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={save}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const hasAny = !!title || !!eyebrow;
  const hasAside = isForecastActive || (showComparison && comparisonLabel);

  if (!hasAny && !isEditMode && !hasAside) return null;

  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        {isEditMode ? (
          <button
            onClick={start}
            className="group/title flex items-baseline gap-2 text-left"
          >
            {title ? (
              <h2 className={cn(
                "font-semibold tracking-tight text-foreground",
                size === "lg" ? "text-xl" : "text-base"
              )}>
                {title}
              </h2>
            ) : (
              <span className="text-muted-foreground italic text-sm">
                Click to add a title
              </span>
            )}
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity" />
          </button>
        ) : (
          title && (
            <h2 className={cn(
              "font-semibold tracking-tight text-foreground",
              size === "lg" ? "text-xl" : "text-base"
            )}>
              {title}
            </h2>
          )
        )}
      </div>

      {hasAside && (
        <div className="shrink-0 flex items-center gap-2 pt-1">
          {isForecastActive && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary font-semibold">
              <Zap className="h-3 w-3" /> Forecast
            </span>
          )}
          {/* comparison label intentionally omitted — page header provides period context */}
        </div>
      )}
    </div>
  );
}

// ── Main Renderer ───────────────────────────────────────────────────────────

export function ReportBlockRenderer({
  block,
  allBlocks,
  onUpdate,
  totals,
  breakdownRows,
  totalsDeltaPct,
  comparisonMode,
  comparisonLabel,
  isDataLoading,
  isEditMode = true,
  highlights = [],
  activeBulletId,
  onBulletToggle,
  isForecastActive,
  winnersLosers,
  campaignCountByRow,
}: ReportBlockRendererProps) {
  const showComparison = comparisonMode != null && comparisonMode !== "none";

  // Comment blocks: render as inline prose only — no heading chrome, no card.
  if (block.block_type === "comment") {
    return (
      <section className="max-w-3xl">
        {/* Only show title for comments if one is set (comments often flow as body text) */}
        {(block.title || isEditMode) && (
          <SectionHeading
            block={block}
            isEditMode={isEditMode}
            onUpdate={onUpdate}
            size="md"
          />
        )}
        <div className="text-[15px] leading-relaxed text-foreground/90">
          <CommentBlock
            block={block}
            allBlocks={allBlocks}
            onUpdate={onUpdate}
            isEditMode={isEditMode}
            activeBulletId={activeBulletId}
            onBulletToggle={onBulletToggle}
          />
        </div>
      </section>
    );
  }

  // All other blocks (data + SEM-analysis) render as flat doc sections.
  return (
    <section>
      <SectionHeading
        block={block}
        isEditMode={isEditMode}
        onUpdate={onUpdate}
        isForecastActive={isForecastActive}
        showComparison={showComparison}
        comparisonLabel={comparisonLabel}
      />

      {block.block_type === "kpi_cards" && (
        <KpiCardsBlock
          block={block}
          totals={totals}
          totalsDeltaPct={showComparison ? totalsDeltaPct : undefined}
          isDataLoading={isDataLoading}
          highlights={highlights}
        />
      )}
      {block.block_type === "chart" && (
        <div className="h-48 bg-muted/20 rounded-lg border border-dashed flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chart visualization (coming soon)</p>
          </div>
        </div>
      )}
      {block.block_type === "table" && (
        <TableBlock
          block={block}
          totals={totals}
          breakdownRows={breakdownRows}
          totalsDeltaPct={showComparison ? totalsDeltaPct : undefined}
          isDataLoading={isDataLoading}
          highlights={highlights}
          isForecastActive={isForecastActive}
          campaignCountByRow={campaignCountByRow}
        />
      )}
      {block.block_type === "winners_losers" && (
        <WinnersLosersBlock block={block} winnersLosers={winnersLosers} isDataLoading={isDataLoading} />
      )}
      {block.block_type === "events_calendar" && (
        <EventsCalendarBlock block={block} onUpdate={onUpdate} isEditMode={isEditMode} />
      )}
      {block.block_type === "budget_recommendation" && (
        <BudgetRecommendationBlock block={block} onUpdate={onUpdate} isEditMode={isEditMode} />
      )}
      {block.block_type === "campaign_budget" && (
        <CampaignBudgetBlock block={block} onUpdate={onUpdate} isEditMode={isEditMode} />
      )}
      {block.block_type === "forecast_projection" && (
        <ForecastProjectionBlock block={block} onUpdate={onUpdate} isEditMode={isEditMode} />
      )}
      {block.block_type === "hotel_capacity" && (
        <HotelCapacityBlock block={block} onUpdate={onUpdate} isEditMode={isEditMode} />
      )}
      {block.block_type === "memory_notes" && (
        <MemoryNotesBlock block={block} onUpdate={onUpdate} isEditMode={isEditMode} />
      )}
    </section>
  );
}
