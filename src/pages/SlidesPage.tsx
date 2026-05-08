import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, PresentationIcon, Calendar, Building2 } from "lucide-react";
import { useUserAccount } from "@/hooks/useUserAccount";

// Static slide deck registry — extend this array to add more decks
const SLIDE_DECKS = [
  {
    id: "performance-wip-may-2026",
    title: "Performance — WiP — May 07",
    subtitle: "Multi-Client Snapshot · Apr 2026 YoY + YTD",
    description: "16-slide working document covering all clients across all 3 paid channels. SEM (Brady · Aqua · Food 4 Fitness · Roomstay — Windsor.ai), Metasearch (full hotel portfolio — Supabase), Social (Brady · Food 4 Fitness — Windsor.ai). Per-client KPI tables (Spend / Conv / Revenue / ROAS — Month YoY + YTD), graph-led breakdowns by device · country · funnel for every client (Brady hotels regrouped as one), per-channel optimization plans (Pause / Scale / Test) and a cross-channel ROAS league + 30-day priority list. Reuses the chart-card / hbar / kpi-strip / funnel-card components from the Brady Combined Report.",
    period: "May 07, 2026",
    client: "Brady · Aqua · F4F · Roomstay",
    channel: "SEM · Metasearch · Social",
    slides: 16,
    kpis: [
      { label: "Total Rev", value: "$902K" },
      { label: "Blended ROAS", value: "23.4×" },
      { label: "Top ROAS", value: "38.4×" },
    ],
    src: "/slides/performance-wip-may-2026.html",
    accentColor: "#f5a623",
  },
  {
    id: "brady-wip-april-2026",
    title: "Brady Hotels — WiP Snapshot",
    subtitle: "April 2026 vs YoY · Working Document",
    description: "14-slide working document. Apr 2026 vs Apr 2025 (and MoM where YoY isn't possible) for SEM · Metasearch · Social. Per-channel KPI snapshot, monthly trend lines, SEM campaign + device breakdowns, Metasearch by hotel/channel/market/device, Social by campaign + audience, plus a concrete 30-day Pause / Scale / Test action plan with exact campaign names. Headline finding: SEM revenue −55.7% YoY on stable spend — flagged for tracking-vs-real investigation.",
    period: "April 2026",
    client: "Brady Hotels — WiP",
    channel: "SEM · Metasearch · Social",
    slides: 14,
    kpis: [
      { label: "SEM ROAS", value: "26.0×" },
      { label: "Meta ROAS", value: "36.8×" },
      { label: "Social ROAS", value: "18.7×" },
    ],
    src: "/slides/brady-wip-april-2026.html",
    accentColor: "#f5a623",
  },
  {
    id: "brady-creative-refresh-april-2026",
    title: "Brady — Creative Refresh Before/After",
    subtitle: "April 2026 · Saver Rate Theme Launch · CTR Analysis",
    description: "5-slide focused study on the April 2026 creative refresh. All 32 legacy Sales ads (Sep–Dec '25) replaced by 12 new \"Saver Rate | Apr '26\" ads — CTR more than doubled (1.19% → 2.60%, +118%). Per-hotel before/after table, UGC video format winner analysis (3.36% CTR), and clear pause/scale recommendations.",
    period: "Sep 2025 → Apr 2026",
    client: "Brady Hotels — Meta Ads",
    channel: "Facebook + Instagram",
    slides: 5,
    kpis: [
      { label: "Old CTR", value: "1.19%" },
      { label: "New CTR", value: "2.60%" },
      { label: "Uplift", value: "+118%" },
    ],
    src: "/slides/brady-creative-refresh-april-2026.html",
    accentColor: "#C2358F",
  },
  {
    id: "brady-elizabeth-launch",
    title: "Brady Elizabeth — Launch Strategy",
    subtitle: "Melbourne 250-room 4-star · 12-Month Digital Plan",
    description: "26-slide strategic launch plan for a new 250-room 4-star hotel in saturated Melbourne. Capacity & revenue scenarios (occupancy × ADR × marketing penetration), three budget scenarios ($60K / $100K / $150K) with split + impact, three demand-creation bets (Founders' Club, Creator-Led Media Activation, Event hijacking), full channel architecture (Google · Social · Metasearch · CRM), 12-month event calendar, and Year-1 forecast.",
    period: "Year 1 (2026/27)",
    client: "Brady Hotels — Brady Elizabeth (new)",
    channel: "Google · Social · Meta · Creator media",
    slides: 26,
    kpis: [
      { label: "Budget", value: "$100K" },
      { label: "Y1 Revenue", value: "$1.06M" },
      { label: "Members", value: "5,000" },
    ],
    src: "/slides/brady-elizabeth-launch.html",
    accentColor: "#E84B3C",
  },
  {
    id: "brady-april-2026-hybrid",
    title: "Brady Hotels × Dijitally — Combined Report",
    subtitle: "Hybrid Performance Report — April 2026",
    description: "35-slide combined report (v2). Real Brady CBD room counts (554 total). Restructured SEM/Social funnels (Display→top, Brand+PMAX→bottom, Group+broad→mid). Combined dual-axis YTD charts. Channel Mix with Revenue/ROAS/CoS KPI cards. Membership campaign with confirmed OUTCOME_LEADS objective. Cost of Sale (CoS) columns. Asset performance Apr 2026 creative refresh study. Full Year Forecast Jan–Dec (Cost/Revenue/Agency/ROI/CoS) + per-hotel × channel revenue matrix.",
    period: "April 2026",
    client: "Brady Hotels",
    channel: "SEM · Metasearch · Social",
    slides: 35,
    kpis: [
      { label: "Spend", value: "$13,881" },
      { label: "Revenue", value: "$244,905" },
      { label: "ROAS", value: "17.6×" },
    ],
    src: "/slides/brady-april-2026-hybrid.html",
    accentColor: "#5E3FBE",
  },
  {
    id: "brady-april-2026-highlevel",
    title: "Brady Hotels × Dijitally — Executive Summary",
    subtitle: "High-Level Performance Report — April 2026",
    description: "23-slide executive overview built around charts, not tables. 4 hotels + Group, per-channel structure (1 page tables, 1 page breakdowns chart, 1 page funnel, 1 page action plan). Focus on winners, losers and clear next steps with budget allocation, targeting, audiences and asset specs.",
    period: "April 2026",
    client: "Brady Hotels",
    channel: "SEM · Metasearch · Social",
    slides: 23,
    kpis: [
      { label: "Spend", value: "$13,881" },
      { label: "Revenue", value: "$244,905" },
      { label: "ROAS", value: "17.6×" },
    ],
    src: "/slides/brady-april-2026-highlevel.html",
    accentColor: "#2B6FE0",
  },
  {
    id: "brady-april-2026-full",
    title: "Brady Hotels × Dijitally — Full Report",
    subtitle: "Comprehensive Performance Report — April 2026",
    description: "39-slide deep-dive across 4 Brady properties + Group cross-portfolio. SEM · Metasearch · Social — per-hotel/funnel/audience/device/market/placement breakdowns, hotel-funnel winner-loser action tables, full Jan–Dec YTD vs FY 2025, May–Dec forecast with event calendar, dedicated SEM + Social asset production specs, and a separate Membership Lead-Generation slide.",
    period: "April 2026",
    client: "Brady Hotels",
    channel: "SEM · Metasearch · Social",
    slides: 39,
    kpis: [
      { label: "Spend", value: "$14,625" },
      { label: "Revenue", value: "$283,830" },
      { label: "ROAS", value: "19.4×" },
    ],
    src: "/slides/brady-april-2026-full.html",
    accentColor: "#d4a843",
  },
  {
    id: "brady-april-2026",
    title: "Brady Hotels × Dijitally — Summary",
    subtitle: "Performance Report — April 2026",
    description: "8-slide executive summary: spend, revenue, ROAS and channel breakdown for April 2026. Includes YTD 2026 vs 2025 funnel comparisons.",
    period: "April 2026",
    client: "Brady Hotels",
    channel: "Google Ads · Meta Ads",
    slides: 8,
    kpis: [
      { label: "Spend", value: "$11,867" },
      { label: "Revenue", value: "$185,460" },
      { label: "ROAS", value: "15.6×" },
    ],
    src: "/slides/brady-april-2026.html",
    accentColor: "#d4a843",
  },
];

export default function SlidesPage() {
  const { accountId: urlAccountId } = useParams<{ accountId?: string }>();
  const { account: resolvedAccount } = useUserAccount();
  const accountId = urlAccountId ?? resolvedAccount?.id ?? null;
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PresentationIcon className="h-6 w-6" />
              Slide Decks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Presentation-ready reports built with the frontend-slides design system.
            </p>
          </div>
        </div>

        {/* Deck grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {SLIDE_DECKS.map((deck) => (
            <Card
              key={deck.id}
              className="group overflow-hidden border hover:border-primary/40 transition-colors cursor-pointer"
              onClick={() =>
                navigate(
                  `/tools/slides/${accountId ?? "default"}/${deck.id}`
                )
              }
            >
              {/* Preview banner */}
              <div
                className="h-36 flex items-center justify-center relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, #07101e 0%, #0d1b2e 100%)`,
                  borderBottom: `2px solid ${deck.accentColor}22`,
                }}
              >
                {/* Decorative bracket corners */}
                <div
                  className="absolute top-3 left-3 w-8 h-8"
                  style={{
                    borderTop: `1px solid ${deck.accentColor}50`,
                    borderLeft: `1px solid ${deck.accentColor}50`,
                  }}
                />
                <div
                  className="absolute bottom-3 right-3 w-8 h-8"
                  style={{
                    borderBottom: `1px solid ${deck.accentColor}50`,
                    borderRight: `1px solid ${deck.accentColor}50`,
                  }}
                />
                {/* Glow */}
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, ${deck.accentColor}40, transparent 70%)`,
                  }}
                />
                {/* Title */}
                <div className="z-10 text-center px-4">
                  <p
                    className="text-xs font-medium tracking-widest uppercase mb-1"
                    style={{ color: deck.accentColor, letterSpacing: "0.28em" }}
                  >
                    {deck.client}
                  </p>
                  <p
                    className="font-serif text-xl font-bold text-white leading-tight"
                    style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                  >
                    Performance<br />Report
                  </p>
                  <p
                    className="mt-1 text-sm font-medium"
                    style={{
                      color: deck.accentColor,
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontStyle: "italic",
                    }}
                  >
                    {deck.period}
                  </p>
                </div>
              </div>

              <CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">{deck.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {deck.subtitle}
                  </p>
                </div>

                {/* Quick KPIs */}
                <div className="flex gap-2">
                  {deck.kpis.map((k) => (
                    <div
                      key={k.label}
                      className="flex-1 text-center bg-muted/50 rounded px-2 py-1.5"
                    >
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {k.label}
                      </p>
                      <p className="text-sm font-bold">{k.value}</p>
                    </div>
                  ))}
                </div>

                {/* Meta row */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs gap-1 py-0">
                      <Calendar className="h-3 w-3" />
                      {deck.period}
                    </Badge>
                    <Badge variant="outline" className="text-xs gap-1 py-0">
                      <Building2 className="h-3 w-3" />
                      {deck.slides} slides
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        `/tools/slides/${accountId ?? "default"}/${deck.id}`
                      );
                    }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Present
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty state placeholder for future decks */}
        <p className="text-xs text-muted-foreground text-center pt-2">
          Additional slide decks will appear here as they are created.
        </p>
      </div>
    </div>
  );
}
