# Roomstay

## Overview

Roomstay is a hotel performance analytics SaaS. It ingests data from Google Sheets and CSV sources, maps columns to typed dimensions, and renders a single canonical **Data Studio** report view with KPI cards, a performance table, channel breakdowns, budget tracking, and AI-generated summaries. Reports can be shared publicly via a slug link.

---

## Goals

- One canonical report view (Data Studio) per account — no parallel report systems.
- One canonical data storage path: `dimension_data` table (post-mapping, typed, dimension-id keyed).
- One canonical dimension loading API with a clear precedence rule: account → custom → global.
- Clean separation: UI components do not contain business logic or DB access.
- All secret-bearing API calls go through Supabase Edge Functions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Build tool | Vite 5 (`@vitejs/plugin-react-swc`) |
| Framework | React 18 + TypeScript 5 |
| Routing | React Router DOM v6 |
| Server state | TanStack React Query v5 |
| Backend / DB | Supabase (Postgres + Auth + Edge Functions) |
| UI components | shadcn/ui (Radix UI primitives + Tailwind CSS) |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| Drag & drop | @dnd-kit / @hello-pangea/dnd |
| Dates | date-fns |
| Virtualization | react-virtuoso |
| Notifications | sonner + Radix Toast |
| Testing | Vitest + Testing Library |
| Production server | `server.js` (Express, serves Vite build) |
| External integrations | Composio (via `composio-proxy` edge function) |

---

## Architecture

```
Browser (React + Vite)
  │
  ├── UI Layer          src/components/   Presentational components; no DB calls
  ├── Hook Layer        src/hooks/        Data fetching, state, orchestration
  ├── Lib Layer         src/lib/          Business logic, calculators, mappers, sync clients
  ├── Integration Layer src/lib/data-sources/, src/lib/composio-proxy.ts
  │
  └── Supabase
        ├── Postgres    dimension_data, dimensions, report_views, accounts, …
        ├── Auth        supabase.auth (session stored in localStorage)
        └── Edge Funcs  supabase/functions/   Secret-bearing API calls, data sync
```

### Key principles

- **No secrets in the browser.** Google Sheets API keys, service role keys, and external tokens live only in Edge Function environment variables.
- **One account per user.** `useUserAccount()` resolves `accounts` where `user_id = session.user.id` and returns the first row. No account selector UI.
- **One report per account.** A single "Data Studio" `slide_report` row per account is created on first access.
- **Dimension precedence (frontend + edge):** account-scoped > custom (report-scoped or null) > global. Implemented in `src/lib/dimensionLoader.ts` and mirrored in `supabase/functions/resync-data-source/utils/dimensions.ts`.

---

## Route Map

Defined in `src/App.tsx`. All `:accountId` routes resolve the account from `useUserAccount()` when the param is absent.

| Route | Component | Notes |
|---|---|---|
| `/` | `SlideViewPage` | **Canonical entry — Data Studio is the homepage** |
| `/landing` | `Navigate to="/"` | Redirect alias |
| `/auth` | `Auth` | Login / signup only |
| `/tools/reports` | `Navigate to="/"` | Legacy redirect |
| `/tools/reports/:accountId` | `Navigate to="/"` | Legacy redirect |
| `/tools/reports/:accountId/data-studio` | `Navigate to="/"` | Legacy redirect |
| `/tools/data` | `Navigate to="/"` | Legacy redirect |
| `/tools/data/:accountId` | `Navigate to="/"` | Legacy redirect |
| `/tools/data-sources` | `DataSourcesPage` | Manage Google Sheets / CSV sources |
| `/tools/data-sources/:accountId` | `DataSourcesPage` | Account-scoped alias |
| `/tools/dimensions` | `DimensionsPage` | Manage dimension definitions |
| `/tools/dimensions/:accountId` | `DimensionsPage` | Account-scoped alias |
| `/tools/forecasting` | `ForecastingDashboard` | Forecasting overview |
| `/tools/forecasting/:accountId` | `ForecastingDashboard` | Account-scoped alias |
| `/tools/forecasting/scenario/:scenarioId` | `ForecastScenarioPage` | Scenario editor |
| `/tools/price-widget` | `PriceWidgetPage` | Price widget listing |
| `/tools/price-widget/:accountId` | `PriceWidgetPage` | Account-scoped alias |
| `/tools/price-widget/:accountId/:widgetId` | `PriceWidgetDetailPage` | Widget detail |
| `/tools/report/:reportName` | `AISummaryPage` | AI summary by report name |
| `/tools/report/:accountId/:summaryId` | `AISummaryPage` | Legacy deep link |
| `/integrations` | `Integrations` | Composio integrations |
| `/shared/:slug` | `SharedReport` | Public shared report |
| `/shared/reports/:slug` | `SharedAISummary` | Public shared AI summary |
| `/:slug` | `SharedReport` | Catch-all slug alias |

**Removed routes:** `/tools/reports/:accountId/brady`, `/tools/reports/:accountId/master-report`, `/tools/reports/:accountId/view/:slideId`

**Not in router (files exist but unused):** `SlidesPage.tsx`, `ForecastingPage.tsx`, `ReportDashboard.tsx` — these are dead code candidates for Phase 9 cleanup.

---

## Core Systems

### 1. Dimension System

- **Registry:** `dimensions` table. Scopes: account-level, custom (report-scoped or null), global.
- **Canonical loader:** `src/lib/dimensionLoader.ts` — `loadDimensionsForUser(userId, reportId?, options)`. Precedence: account → custom → global. Deduplication by name (`dedupeDimensionsByName`).
- **View settings mapper:** `src/lib/performanceTable/viewSettingsMapper.ts` — maps `visible_columns`, `visible_kpis`, `kpi_order` from stored IDs to account-scoped dimension IDs. Handles stale ID resolution.
- **DB guardrail:** `dimensions_unique_name_per_context` unique index prevents duplicate names per context.

### 2. Data Ingestion Pipeline

```
Google Sheets / CSV URL
  → fetch-google-sheets / fetch-csv-url (Edge Function, keeps API key server-side)
  → resync-data-source (Edge Function)
      → dimensions.ts (canonical precedence)
      → transformRows → dimension_data (upsert by report_id + data_source_id + row_number)
```

- **Canonical writer:** `resync-data-source` edge function.
- **Canonical table:** `dimension_data` — shape: `(report_id, data_source_id, row_number, dimension_values jsonb)`.
- **Unique index:** `dimension_data_report_source_row_key` on `(report_id, data_source_id, row_number)`.

### 3. Data Studio / Report View

- **Entry point:** `/` renders `SlideViewPage` directly — Data Studio is the app homepage.
- **Orchestrator hook:** `src/hooks/useSlideReportPage.ts` — composes ~8 sub-hooks.
- **Raw rows:** `src/hooks/useDataStudioRawRows.ts` — reads `dimension_data` directly (no live fetch).
- **Pivot / aggregation:** `src/lib/slideReportPivotComputation.ts` (legacy; still used — Phase 7-F3).
- **Performance table:** `src/components/PerformanceTable/` + `src/hooks/performanceTable/`.
- **View settings:** stored in `report_views`; repaired by `src/lib/resync-report-views.ts`.
- **Layout:** `flex h-screen overflow-hidden` root → `ReportSidebar` (left nav: tabs + Actions/Manage/Tools sections) + main column (`flex-col flex-1`) → `SlideViewHeader` (topbar: back, report name, Data Sources, Dimensions, Share, Refresh Data) + scrollable tab content.
- **Filters:** `FiltersRow` component (date range + channel filters); uses `DateRangeFilter` from `src/components/filters/`.
- **AI summary display:** `AISummaryDisplay` component (markdown renderer with design system styling).

### 4. KPI / Metrics System

- **KPI derivation:** `src/lib/metricsCalculations.ts` — ROAS, CPC, cost-of-sale, etc.
- **Default KPIs:** `getAccountDefaultKPIs()` returns exact KPI names matched case-insensitively from available dimensions.
- **KPI repair:** `resyncReportViews()` normalizes and repairs `kpi_order` to stay consistent with `visible_kpis`.

### 5. AI Summary System

- **Generation:** `generate-ai-summary` edge function (LLM via LLMGateway).
- **Storage:** `ai_summary_cards` table (canonical). `slide_report_summaries` is legacy — migration path: Phase 7-F5.
- **Client:** `src/lib/generate-ai-summary-client.ts`.

### 6. Refresh / Sync Workflow

- **Entry point:** `src/lib/refreshWorkflow.ts` → `run-refresh-workflow` edge function.
- **Workflow:** clears `dimension_data` for the report → calls `resync-data-source` for each data source.
- **Legacy gate:** `SLIDE_REPORT_CACHE_ENABLED` env var (default off) gates legacy pivot cache writes.

### 7. Sharing System

- **Public links:** `/shared/:slug` and `/shared/reports/:slug`.
- **Shared report:** `SharedReport.tsx` — no auth required.
- **Slug contract:** shared links do **not** redirect into `/tools/*` routes.

### 8. Integrations

- **Composio:** all tool execution is server-side via `composio-proxy` edge function.
- **FX rates:** `get-fx-rate` edge function.

---

## Data Flow

```
1. User adds a data source (Google Sheets URL or CSV)
   → UnifiedDataSourceModal → DataSourcesPage
   → supabase.from('data_sources').insert(...)

2. User triggers sync (or auto-sync runs)
   → refreshWorkflow.ts → run-refresh-workflow (Edge)
   → resync-data-source (Edge)
       → fetch-google-sheets / fetch-csv-url (Edge)
       → maps columns to dimension IDs
       → upserts rows into dimension_data

3. User opens Data Studio (homepage `/`)
   → SlideViewPage → useSlideReportPage
   → useDataStudioRawRows → supabase.from('dimension_data').select(...)
   → slideReportPivotComputation → pivot rows
   → ReportSidebar (left nav) + SlideViewHeader (topbar) + tab content
   → PerformanceTable / KPICards / Charts rendered

4. User saves a view
   → usePerformanceTableViews → supabase.from('report_views').upsert(...)
   → viewSettingsMapper resolves IDs on next load

5. User generates AI summary
   → GenerateAISummaryModal → generate-ai-summary-client.ts
   → generate-ai-summary (Edge) → LLM → ai_summary_cards upsert
```

---

## Shared Components / Hooks / Services

### Components

| Component | Location | Purpose |
|---|---|---|
| `ReportSidebar` | `src/components/slides/ReportSidebar.tsx` | Left nav: tabs + Actions/Manage/Tools sections |
| `SlideViewHeader` | `src/components/slides/SlideViewHeader.tsx` | Topbar: back, report name, Data Sources, Dimensions, Share, Refresh Data |
| `FiltersRow` | `src/components/slides/FiltersRow.tsx` | Date range + channel filter dropdowns row |
| `DateRangeFilter` | `src/components/filters/DateRangeFilter.tsx` | Date range picker with presets + compare toggle |
| `AISummaryDisplay` | `src/components/slides/AISummaryDisplay.tsx` | Markdown AI summary card with design system styling |
| `PerformanceTable` | `src/components/PerformanceTable/` | Core data table with dimensions, sorting, column visibility |
| `DashboardHeader` | `src/components/DashboardHeader.tsx` | Top nav (used in ReportDashboard / legacy views) |
| `FiltersBar` | `src/components/FiltersBar.tsx` | Date + dimension filter bar (used in ReportDashboard) |
| `KPICardsSection` / `KPICardItem` | `src/components/slides/KPICardsSection.tsx` | **Canonical** KPI card grid — minimalist, no icons, no left bar. Used by `renderKPICards` (SlideViewPage) and `KPIMetricsCards`. |
| `KPIMetricsCards` | `src/components/KPIMetricsCards.tsx` | Self-contained KPI cards with data fetching (used by SharedReport). Renders via `KPICardItem`. |
| `KPIChartsGrid` | `src/components/KPIChartsGrid.tsx` | KPI chart grid |
| `EditSourceModal` | `src/components/slides/EditSourceModal/` | Multi-step data source config wizard |
| `UnifiedDataSourceModal` | `src/components/UnifiedDataSourceModal.tsx` | Add/edit data source |
| `ShareModal` | `src/components/ShareModal.tsx` | Public link sharing |
| `MasterFilter` | `src/components/MasterFilter.tsx` | Master dimension filter |

### Hooks

| Hook | Location | Purpose |
|---|---|---|
| `useSlideReportPage` | `src/hooks/useSlideReportPage.ts` | Master orchestrator for report view |
| `useUser` / `getUser` | `src/lib/auth.ts` | Auth state (React Query backed) |
| `useUserAccount` | `src/hooks/useUserAccount.ts` | Resolves current user's account |
| `useCachedSourceData` | `src/hooks/dataSources/useCachedSourceData.ts` | Cache-first data source rows |
| `useDataStudioRawRows` | `src/hooks/useDataStudioRawRows.ts` | Raw `dimension_data` rows |
| `usePerformanceTableData` | `src/hooks/performanceTable/usePerformanceTableData.ts` | Table row data |
| `usePerformanceTableViews` | `src/hooks/performanceTable/usePerformanceTableViews.ts` | Saved table views |

### Services / Lib

| Module | Location | Purpose |
|---|---|---|
| `dimensionLoader` | `src/lib/dimensionLoader.ts` | Canonical dimension loading |
| `viewSettingsMapper` | `src/lib/performanceTable/viewSettingsMapper.ts` | View settings ID resolution |
| `metricsCalculations` | `src/lib/metricsCalculations.ts` | KPI derivation |
| `slideReportPivotComputation` | `src/lib/slideReportPivotComputation.ts` | Pivot table engine |
| `refreshWorkflow` | `src/lib/refreshWorkflow.ts` | Data sync entry point |
| `resync-all-dimensions/` | `src/lib/resync-all-dimensions/` | Canonical dimension resync (modular) |
| `composio-proxy` | `src/lib/composio-proxy.ts` | Composio integration client |

---

## Conventions

### File organization

- `src/pages/` — route-level page components (thin; delegate to hooks + components)
- `src/components/` — presentational UI components; no direct DB access
- `src/hooks/` — data fetching, state, orchestration; use React Query
- `src/lib/` — pure business logic, calculators, mappers, sync clients
- `supabase/functions/` — Edge Functions; all secret-bearing API calls

### Design system (UI tokens)

- **Single source of truth:** `src/index.css` defines shadcn/Tailwind tokens as **HSL CSS variables** (`--background`, `--primary`, `--border`, etc.).
- **Theme policy:** Light-only UI (white background, neutral borders). Any `.dark` tokens are intentionally aligned to the light theme.
- **Typography:** DM Sans is loaded in `index.html` and used as the default Tailwind `font-sans`.
- **Design rules:** See `docs/DESIGN_SYSTEM.md` for strict color discipline, hover/focus rules, and component standards (variants-first shadcn/ui).

### Naming

- Hooks: `use[Feature][Noun].ts` (e.g. `usePerformanceTableData`)
- Lib utilities: `[noun][Verb].ts` or `[noun]Utils.ts`
- Components: PascalCase; co-locate sub-components in a folder when complex

### Data access

- Never call Supabase directly from a UI component. Use hooks.
- Never call external APIs (Google Sheets, LLM, FX) from the browser. Use Edge Functions.
- Use React Query for all async data. Prefer `staleTime` + `gcTime` for caching strategy.

### Apply / Cancel behavior (modals and sheets)

- **Apply** = persist (where applicable) + close modal/sheet.
- **Cancel** = revert local state + close modal/sheet.

### Verify → Migrate → Delete protocol

Before deleting any module:
1. No imports in `src/` (search).
2. No runtime references (routes, lazy imports, dynamic requires).
3. No tests depend on it.
4. No Edge Functions depend on it.
5. If DB schema is affected: additive-only unless explicitly marked safe.

---

## Environment Variables

| Variable | Where used | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `src/lib/api-url.ts` | Base URL for Express server (default: `http://localhost:3000`) |
| `SUPABASE_URL` | Edge Functions (Deno runtime) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions (Deno runtime) | Service role key for admin DB access |
| `SLIDE_REPORT_CACHE_ENABLED` | Edge Functions | Gates legacy pivot cache writes (default: off) |

Supabase anon key and project URL are hardcoded in `src/integrations/supabase/client.ts` (auto-generated by Supabase tooling).

---

## Current Known Issues

- `slide_report_summaries` reads in `useSlideReportSummaries` should migrate to `ai_summary_cards` (Phase 7-F5).
- `slide_report_views` is still read by `useSlideReportViews`; canonical target is `report_views` (Phase 8-F1).
- `useSlideReportDisplayData` still calls `get-slide-report-display-data` edge function (Phase 7-EF4 deferred).
- `slideReportPivotComputation.ts` still used by `SlideViewPage` + `useSlideReports` (Phase 7-F3 deferred).
- `slideRefreshHelpers.ts` still used by `SlideViewPage` (Phase 7-F4 deferred).
- `refreshPivotDataHelpers.ts` still used by `AISummaryPage.tsx` (Phase 7-F2 deferred).
- Legacy edge functions (`refresh-slide-report`, `get-slide-report-data`, etc.) are gated but not yet removed (Phase 7).
- `resync-dimensions.ts` (flat) and `resync-all-dimensions.ts` (flat orchestrator) still active — superseded by `resync-all-dimensions/` folder pending (Phase 8-F2).
- `data-loading-fix.ts` still imported by `KPIChart.tsx` — cannot delete until KPIChart is migrated (Phase 8-F3).
- `monthly_dimension_data` and `aggregated_breakdown_data` tables — writer/consumer audit pending (Phase 8-F5/F6).
- `SlidesPage.tsx`, `ForecastingPage.tsx`, `ReportDashboard.tsx` — files exist but are not in `App.tsx` router; dead code candidates for removal.
- `FormattedAISummary.tsx` — older markdown formatter; `AISummaryDisplay.tsx` is the new canonical component; consolidation pending.

---

## Refactor Notes

See `docs/REFACTOR.md` for the full refactor plan, phase-by-phase progress, and the Verify → Migrate → Delete protocol.

**Summary of completed phases:**
- Phase 1: DB integrity + mapping references ✅
- Phase 2: Canonical dimension loading + view settings ✅
- Phase 3: Remove duplicate PerformanceTable + hooks ✅
- Phase 4: Unit + integration tests ✅
- Phase 5: Cleanup (unused utilities, legacy routes, account modals) ✅
- Phase 6: Data source unification + canonical Data Studio fetch path ✅ (6-F1 through 6-F6)
- Phase A: Account removal + post-login index ✅
- Phase B: Single Data Studio (reports consolidation) ✅
- Layout redesign: Left sidebar + topbar for Data Studio ✅ (L-1 through L-3)
- Design system: Light-only luxury minimalist theme ✅ (DS-1 through DS-6)
- Route simplification: `/` = Data Studio homepage ✅ (R-1, R-2)

**In progress / next:**
- Phase 6: 6-DB1, 6-DB2 (document `dimension_data` as single read path)
- Phase 7: Legacy pivot cache + edge function cleanup (EF4, F2, F3, F4, F5 deferred)
- Phase 8: View settings + resync consolidation (F1, F2, F3, F5, F6 deferred)
- Phase 9: DB table drops (after proof)
- Dead code removal: `SlidesPage.tsx`, `ForecastingPage.tsx`, `ReportDashboard.tsx` (not in router)
- AI summary consolidation: `FormattedAISummary.tsx` → `AISummaryDisplay.tsx`

---

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| One account per user | Simplifies routing; no account selector UI needed | 2026-03-18 |
| `dimension_data` as canonical fact table | Single typed, dimension-id-keyed store; replaces `sheet_data` + legacy pivot caches | 2026-03-18 |
| Data Studio as the only report view | Removes parallel report systems (Brady, Master Report) | 2026-03-18 |
| Short entry routes (`/tools/reports` etc.) | User-friendly URLs; account resolved from auth context | 2026-03-18 |
| `SLIDE_REPORT_CACHE_ENABLED` gate | Allows temporary backward compatibility while legacy edge functions are phased out | 2026-03-18 |
| `report_views` as canonical view settings table | Single source of truth for column/KPI visibility and ordering | 2026-03-18 |

---

## Next Milestones

1. **Dead code removal** — Delete `SlidesPage.tsx`, `ForecastingPage.tsx`, `ReportDashboard.tsx` (not in router; verify zero imports first).
2. **AI summary consolidation** — Migrate all callers of `FormattedAISummary` to `AISummaryDisplay`; delete `FormattedAISummary.tsx`.
3. **Phase 6-DB** — Document `dimension_data` as single read path; verify `resync-data-source` is sole writer.
4. **Phase 7** — Retire legacy pivot cache edge functions; unblock deferred items (EF4, F2, F3, F4, F5).
5. **Phase 8** — Unify view settings (`report_views` only); consolidate resync utilities.
6. **Phase 9** — Drop confirmed-unused legacy DB tables after full verification.
