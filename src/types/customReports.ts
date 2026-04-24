/**
 * Custom Reports: doc-style report pages linked to views.
 * Each report contains ordered blocks (KPI cards, charts, tables, comments,
 * and the five SEM-analysis specific block types).
 */

// ── Core block types ──────────────────────────────────────────────────────────

export type BlockType =
  | 'kpi_cards'
  | 'chart'
  | 'table'
  | 'comment'
  // ── SEM Analysis block types ──────────────────────────────────────────────
  | 'winners_losers'        // Section 2 — campaign winners & losers
  | 'events_calendar'       // Section 3 — hotel events + seasonality signals
  | 'budget_recommendation' // Section 4 — before/after total budget
  | 'campaign_budget'       // Section 6 — campaign-level execution table
  | 'forecast_projection'   // Section 7 — projected metrics with confidence bands
  | 'hotel_capacity'        // Overview — per-hotel rooms/AOV/TAM/revenue share
  | 'memory_notes';         // Memory tab — curated notes / knowledge-base entries

// ── Existing block configs ────────────────────────────────────────────────────

export interface KpiCardsConfig {
  channel: string;
  metrics: string[];
  dateRange?: { from: string; to: string };
}

export interface ChartConfig {
  channel: string;
  metrics: string[];
  chartType: 'area' | 'bar' | 'line';
  dateRange?: { from: string; to: string };
  granularity?: 'day' | 'week' | 'month';
}

export interface TableConfig {
  channel: string;
  groupBy?: string;
  breakdownBy?: string;
  metrics: string[];
  dateRange?: { from: string; to: string };
}

/** A highlight target: a KPI metric inside a block, or a breakdown row */
export interface HighlightTarget {
  blockId: string;
  /** When "kpi", `key` = metric key (e.g. "cost"). When "row", `key` = dimension value (e.g. "Brady Hotels Jones Lane"). */
  type: 'kpi' | 'row' | 'block';
  key?: string;
}

/**
 * Forecast simulation: shift a percentage of `cost` from one row to another
 * in a target block. Revenue/bookings scale linearly with cost.
 */
export interface ForecastSim {
  blockId: string;
  fromRow: string;
  toRow: string;
  /** Fraction of source row's cost to move — e.g. 0.5 = move 50%. */
  percentShift: number;
}

export interface InteractiveBullet {
  id: string;
  text: string;
  highlights?: HighlightTarget[];
  forecast?: ForecastSim;
}

export interface CommentConfig {
  content?: string;              // legacy plain text / markdown
  bullets?: InteractiveBullet[]; // interactive bullet-point comments
  /** When set, this comment only appears on the matching channel tab. */
  channel?: string;
}

// ── SEM Analysis block configs ────────────────────────────────────────────────

/**
 * Section 2 — Winners & Losers
 * Shows top-3 campaigns with the highest revenue/efficiency gain and the top-3
 * with the worst delta vs the comparison period.
 */
export interface WinnersLosersConfig {
  channel: string;
  /** Dimension ID to group by (campaign). */
  groupBy: string;
  /** Metric to rank by: absolute delta is used for sorting. */
  rankBy: 'revenue' | 'roas' | 'bookings' | 'cost';
  dateRange?: { from: string; to: string };
  /** Number of winners/losers to show. Defaults to 3. */
  topN?: number;
  /**
   * Optional secondary dimension (e.g. a Funnels tag ID) used to show a
   * segment summary above the campaign cards — winners/losers count plus
   * aggregated Cost/Revenue/ROAS per segment.
   */
  secondaryGroupBy?: string;
}

/**
 * Section 3 — Events Calendar + Seasonality
 * Manually curated per-hotel events for the upcoming 1–2 months, plus a
 * seasonality signal card per hotel.
 */
export type EventType =
  | 'concert' | 'conference' | 'holiday'
  | 'school_break' | 'mice' | 'sports' | 'other';

export type EventImpact = 'tailwind' | 'headwind' | 'neutral';

export type SeasonalSignal =
  | 'strong_up' | 'moderate_up' | 'flat' | 'moderate_down' | 'strong_down';

export interface HotelEvent {
  id: string;
  date: string;   // ISO date string
  name: string;
  type: EventType;
  impact: EventImpact;
  notes?: string;
}

export interface SeasonalityEntry {
  hotelName: string;
  signal: SeasonalSignal;
  notes?: string;
}

export interface EventsCalendarConfig {
  channel?: string;
  hotels: Array<{
    name: string;
    events: HotelEvent[];
  }>;
  seasonality: SeasonalityEntry[];
}

/**
 * Section 4 — Headline Budget Recommendation
 * Before/after totals with a one-line rationale and per-hotel breakdown.
 */
export interface BudgetRecommendationRow {
  id: string;
  label: string;        // e.g. hotel name or funnel tier
  current: number;
  recommended: number;
}

export interface BudgetRecommendationConfig {
  channel?: string;
  currentTotal: number;
  recommendedTotal: number;
  rationale: string;
  rows: BudgetRecommendationRow[];
}

/**
 * Section 6 — Campaign-Level Execution Table
 * Operator checklist: per campaign, show current spend/day, recommended budget,
 * % change, and action tag.
 */
export type CampaignAction = 'scale' | 'hold' | 'cut' | 'pause' | 'test';

export interface CampaignBudgetRow {
  id: string;
  campaign: string;
  funnel?: string;            // optional funnel tier label
  /** Current monthly cost (interpreted in monthly mode). */
  currentBudget: number;
  /** Recommended monthly budget. */
  recommendedBudget: number;
  /** Current monthly revenue (optional — monthly mode only). */
  currentRevenue?: number;
  /** Projected monthly revenue at the recommended budget (optional). */
  recommendedRevenue?: number;
  action: CampaignAction;
  notes?: string;
}

export interface CampaignBudgetConfig {
  channel: string;
  rows: CampaignBudgetRow[];
  /**
   * When 'monthly' (or omitted for new reports), the renderer treats the
   * budget + revenue fields as monthly totals and shows a totals row.
   * 'daily' preserves the legacy daily-spend display.
   */
  cadence?: 'monthly' | 'daily';
}

/**
 * Section 7 — Forecast & Accountability
 * Projected metrics for the recommended budget scenario, with low/high confidence bands.
 */
export interface ForecastProjectionRow {
  metric: string;
  current: number;
  projected: number;
  low: number;    // lower bound of confidence interval
  high: number;   // upper bound
}

/**
 * Monthly YTD + forecast row used by the year-long monthly view.
 * `status` distinguishes actuals (closed months), partial (current month),
 * and forecast (future months).
 */
export interface ForecastMonthRow {
  /** ISO month key, e.g. "2026-01" */
  month: string;
  status: 'actual' | 'partial' | 'forecast';
  revenue: number;
  bookings: number;
  cost: number;
  /** Derived ROAS (revenue / cost). Stored so authors can override. */
  roas: number;
  /** Notable events / context for the month (short strings). */
  events?: string[];
}

export interface ForecastProjectionConfig {
  channel?: string;
  /** Legacy per-metric rows view. */
  rows: ForecastProjectionRow[];
  /**
   * Optional monthly view: when populated, the block renders a Year-to-Date +
   * Forecast table with one row per month + events column.
   */
  months?: ForecastMonthRow[];
  notes?: string;
}

/**
 * Overview — Per-Hotel Capacity & Revenue Share
 * Manually curated per-hotel table with rooms, AOV (nightly rate), and actual
 * marketing-driven revenue. Estimated monthly revenue and revenue-share % are
 * derived columns computed by the renderer.
 */
export interface HotelCapacityRow {
  id: string;
  name: string;
  rooms?: number;
  /** Nightly rate used to compute estimated TAM. */
  aov?: number;
  /** Actual marketing-driven revenue in the period. */
  actualRevenue: number;
  /** When true, renderer hides rooms/AOV/TAM cells (e.g. Brady Group). */
  isGroup?: boolean;
}

export interface HotelCapacityConfig {
  channel?: string;
  /** Fraction, e.g. 0.8 = 80%. */
  occupancyRate: number;
  /** Days in the reporting period (defaults to 30). */
  daysInMonth: number;
  rows: HotelCapacityRow[];
  /** Optional label for the first column ("Property" by default — e.g. "Channel"). */
  rowLabel?: string;
  /**
   * When true, rooms/AOV/Est Revenue are shared across all rows (e.g. all
   * channels compete for the same portfolio capacity). The totals row then
   * shows the single shared value instead of summing per-row values.
   */
  sharedCapacity?: boolean;
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type BlockConfig =
  | KpiCardsConfig
  | ChartConfig
  | TableConfig
  | CommentConfig
  | WinnersLosersConfig
  | EventsCalendarConfig
  | BudgetRecommendationConfig
  | CampaignBudgetConfig
  | ForecastProjectionConfig
  | HotelCapacityConfig
  | MemoryNotesConfig;

// ── Memory tab ────────────────────────────────────────────────────────────────

/**
 * Memory tab — curated knowledge-base entries. Each entry captures a piece of
 * context that informs how the numbers should be read (data-quality notes,
 * source citations, prior-agency context, event reminders, etc).
 */
export type MemoryNoteKind =
  | 'data_quality'  // tracker / attribution issues
  | 'context'       // business context (promotions, competitor moves, etc.)
  | 'source'        // citation / reference link
  | 'web'           // web search finding
  | 'note';         // generic note

export interface MemoryNote {
  id: string;
  kind: MemoryNoteKind;
  title: string;
  body: string;           // markdown / plain text
  /** Optional external reference (url or label). */
  source?: string;
  /** ISO date the note was added or refers to. */
  date?: string;
  tags?: string[];
}

export interface MemoryNotesConfig {
  channel?: string;   // always "memory" for the memory tab
  entries: MemoryNote[];
}

// ── Report + Block entities ───────────────────────────────────────────────────

export interface CustomReportBlock {
  id: string;
  report_id: string;
  sort_order: number;
  block_type: BlockType;
  title: string;
  config: BlockConfig;
  created_at: string;
  updated_at: string;
}

export interface CustomReport {
  id: string;
  account_id: string;
  view_id: string | null;
  created_by: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  blocks: CustomReportBlock[];
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateCustomReportInput {
  account_id: string;
  view_id?: string | null;
  name: string;
  description?: string;
  blocks?: {
    block_type: BlockType;
    title?: string;
    config: BlockConfig;
    sort_order?: number;
  }[];
}

export interface UpdateCustomReportInput {
  id: string;
  name?: string;
  description?: string;
  view_id?: string | null;
}

export interface CreateBlockInput {
  report_id: string;
  block_type: BlockType;
  title?: string;
  config: BlockConfig;
  sort_order?: number;
}

export interface UpdateBlockInput {
  id: string;
  title?: string;
  config?: BlockConfig;
  sort_order?: number;
}
