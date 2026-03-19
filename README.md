# Roomstay

## Overview

Roomstay is a hotel performance analytics SaaS. It ingests data from Google Sheets and CSV sources, maps columns to typed dimensions, and renders a single canonical **Data Studio** report view with KPI cards, a performance table, channel breakdowns, and budget tracking. Reports can be shared publicly via a slug link.

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
        ├── Postgres    dimension_data, dimensions, views, accounts, reports, …
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
| `/integrations` | `Integrations` | Composio integrations |
| `/shared/:slug` | `SharedReport` | Public shared report |
| `/:slug` | `SharedReport` | Catch-all slug alias |

**Removed routes:** `/tools/reports/:accountId/brady`, `/tools/reports/:accountId/master-report`, `/tools/reports/:accountId/view/:slideId`, `/tools/report/:reportName` (AI summary), `/shared/reports/:slug` (AI summary)

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
- **Dedupe data sources:** If a report has multiple CSV or Google Sheets sources (e.g. duplicate metasearch sources), run `supabase/scripts/dedupe_data_sources.sql` to keep one per `(report_id, source_type)` and delete the rest (see docs/REFACTOR.md).

### 3. Data Studio / Report View

- **Entry point:** `/` renders `SlideViewPage` directly — Data Studio is the app homepage.
- **Orchestrator hook:** `src/hooks/useSlideReportPage.ts` — composes sub-hooks for report identity, raw rows, filtered data, views, budgets, and mutations.
- **Raw rows:** `src/hooks/useDataStudioRawRows.ts` — reads `dimension_data` directly. No long-lived cache (refetch on mount, gcTime 0) so KPIs always reflect current DB state.
- **Filtered data:** `src/hooks/useFilteredSlideData.ts` — pure client-side filtering and aggregation. Single source of truth for KPI totals, monthly chart data, and filtered raw rows.
- **Filter state:** `src/hooks/useDataStudioFilters.ts` — canonical owner of `filterValues`, `customDateRange`, `comparisonType`, `filterConfigs`. Restores view filters via `applyView`. All consumers (KPI cards, charts, breakdown tables) read from the same `filterValues` and use a shared `configuredDimensionNames` map for global-to-report dimension ID resolution.
- **Filter flow:** saved view → `applyView` → `filterValues` → `useFilteredSlideData` (KPI totals + monthly data) + `useChannelChartDataFromRawRows` (overview/channel charts) + `BreakdownTableSection` (breakdown tables). All paths resolve filter IDs via `filterRawDataRows(..., combinedDimNames)`.
- **Performance table:** `src/components/PerformanceTable/` + `src/hooks/performanceTable/`.
- **View settings:** stored in `views` table (canonical, replaces legacy `report_views` + `slide_report_views`).
- **Layout:** `flex h-screen overflow-hidden` root → `ReportSidebar` (left nav: tabs + Actions/Manage/Tools sections) + main column (`flex-col flex-1`) → `SlideViewHeader` (topbar: back, report name, Data Sources, Dimensions, Share, Refresh Data) + scrollable tab content.
- **Filters:** `FiltersRow` component (date range + channel filters); uses `DateRangeFilter` from `src/components/filters/`.
- **Chart controls:** Overview and channel charts share two dropdowns in the chart header: a KPI metric selector (Revenue, Impressions, Clicks, Cost, Bookings, CTR, Conversion Rate, CPC, AOV, ROAS, Cost of Sale) and a time-range selector (`This Month`, `This Year`, `Last 12/6/3 Months`). Default range is `This Year`. `This Month` renders daily points.

### 4. KPI / Metrics System

- **KPI derivation:** `src/lib/metricsCalculations.ts` — ROAS, CPC, AOV (revenue / bookings), cost-of-sale, etc.
- **Default KPIs:** `getAccountDefaultKPIs()` returns exact KPI names matched case-insensitively from available dimensions.
- **KPI repair:** `resyncReportViews()` normalizes and repairs `kpi_order` to stay consistent with `visible_kpis`.

### 5. Refresh / Sync Workflow

- **Entry point:** `src/lib/refreshWorkflow.ts` → `run-refresh-workflow` edge function.
- **Workflow:** the UI always passes `clearFirst: true`, so the workflow first deletes all `dimension_data` for the target report(s), then calls `resync-data-source` for each data source. This gives erase-then-replace behavior and prevents duplicate or stale rows. The Refresh Data modal shows an explicit "Clearing and resetting data" step before "Fetching from sources". Full Refresh uses `refreshMode: 'full'` and reloads all data from all sources. See `docs/REFRESH_WORKFLOW_AUDIT.md` for the full SEM/Social/Metasearch flow and dimension-resolution fix (metasearch 0 cost). For hard-refresh steps and fixing metasearch cost via direct Supabase data, see `docs/HARD_REFRESH_AND_METASEARCH_COST.md`.
- **Supabase MCP:** When the project is linked to the Supabase MCP (Cursor/integration), you can run SQL (e.g. metasearch cost fix) and deploy Edge Functions from the IDE. See `docs/MCP_SUPABASE.md`.

### 6. Sharing System

- **Public links:** `/shared/:slug`.
- **Shared report:** `SharedReport.tsx` — no auth required.
- **Slug contract:** shared links do **not** redirect into `/tools/*` routes.

### 7. Integrations

- **Composio:** all tool execution is server-side via `composio-proxy` edge function.
- **FX rates:** `get-fx-rate` edge function.

---

## Active Edge Functions

| Function | Purpose |
|---|---|
| `resync-data-source` | Sole writer to `dimension_data` |
| `run-refresh-workflow` | Orchestrates full resync per account |
| `auto-sync-data-sources` | Cron-triggered auto-sync |
| `fetch-google-sheets` | Fetches Google Sheets data (server-side API key) |
| `fetch-csv-url` | Fetches CSV from URL |
| `get-performance-data` | Reads `dimension_data` with dimension loading |
| `get-unique-dimension-values` | Returns unique values for filter dropdowns |
| `composio-proxy` | Composio integration proxy |
| `get-fx-rate` | FX rate lookup |
| `update-user-password` | Admin password update |
| `create-admin-user` | Admin user creation |

---

## Active DB Tables

| Table | Purpose |
|---|---|
| `dimension_data` | Canonical fact store (post-mapping, dimension-id keyed rows) |
| `dimensions` | Dimension registry (account, custom, global scopes) |
| `data_sources` | Google Sheets / CSV source configs |
| `reports` | Report identity per account |
| `slide_reports` | Data Studio workspace record per account |
| `views` | Unified view settings (replaces legacy `report_views` + `slide_report_views`) |
| `share_links` | Public share link slugs |
| `budgets` | Budget data per view |
| `accounts` | Account records |

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
   → useFilteredSlideData → client-side filtering + aggregation
   → ReportSidebar (left nav) + SlideViewHeader (topbar) + tab content
   → PerformanceTable / KPICards / Charts rendered

4. User saves a view
   → usePerformanceTableViews → supabase.from('views').upsert(...)
   → viewSettingsMapper resolves IDs on next load

5. User shares a report
   → CreateShareLinkModal → supabase.from('share_links').insert(...)
   → /shared/:slug → SharedReport.tsx (public, no auth)
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
| `PerformanceTable` | `src/components/PerformanceTable/` | Core data table with dimensions, sorting, column visibility |
| `DashboardHeader` | `src/components/DashboardHeader.tsx` | Top nav (used in SharedReport) |
| `FiltersBar` | `src/components/FiltersBar.tsx` | Date + dimension filter bar (used in SharedReport) |
| `KPICardsSection` / `KPICardItem` | `src/components/slides/KPICardsSection.tsx` | Canonical KPI card grid |
| `KPIMetricsCards` | `src/components/KPIMetricsCards.tsx` | Self-contained KPI cards with data fetching (used by SharedReport) |
| `EditSourceModal` | `src/components/slides/EditSourceModal/` | Multi-step data source config wizard |
| `UnifiedDataSourceModal` | `src/components/UnifiedDataSourceModal.tsx` | Add/edit data source |
| `ShareModal` | `src/components/ShareModal.tsx` | Public link sharing |

### Hooks

| Hook | Location | Purpose |
|---|---|---|
| `useSlideReportPage` | `src/hooks/useSlideReportPage.ts` | Master orchestrator for report view |
| `useFilteredSlideData` | `src/hooks/useFilteredSlideData.ts` | Client-side filtering + aggregation |
| `useDataStudioRawRows` | `src/hooks/useDataStudioRawRows.ts` | Raw `dimension_data` rows |
| `useChannelChartDataFromRawRows` | `src/hooks/useChannelChartDataFromRawRows.ts` | Canonical chart aggregation from filtered raw rows |
| `useUser` / `getUser` | `src/lib/auth.ts` | Auth state (React Query backed) |
| `useUserAccount` | `src/hooks/useUserAccount.ts` | Resolves current user's account |
| `useCachedSourceData` | `src/hooks/dataSources/useCachedSourceData.ts` | Cache-first data source rows |
| `usePerformanceTableData` | `src/hooks/performanceTable/usePerformanceTableData.ts` | Table row data |
| `usePerformanceTableViews` | `src/hooks/performanceTable/usePerformanceTableViews.ts` | Saved table views |

### Services / Lib

| Module | Location | Purpose |
|---|---|---|
| `dimensionLoader` | `src/lib/dimensionLoader.ts` | Canonical dimension loading |
| `viewSettingsMapper` | `src/lib/performanceTable/viewSettingsMapper.ts` | View settings ID resolution |
| `metricsCalculations` | `src/lib/metricsCalculations.ts` | KPI derivation |
| `monthUtils` | `src/lib/monthUtils.ts` | Month/date range utilities |
| `refreshWorkflow` | `src/lib/refreshWorkflow.ts` | Data sync entry point |
| `resync-all-dimensions/` | `src/lib/resync-all-dimensions/` | Canonical dimension resync (resyncReportDataSources, resyncDimensionData, etc.); `resync-dimensions.ts` re-exports for backward compatibility |
| `utils/` | `src/lib/utils/` | `retry.ts` (retryWithBackoff), `dimensionFilter.ts` (filterDimensionsByFilterSettings, filterDimensionsByVisibility) |
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
- **Theme policy:** Light default; dark mode via theme toggle (persisted in `localStorage` key `roomstay-theme`). `ThemeProvider` in `src/lib/theme.tsx` and `ThemeToggle` in header/auth/standalone pages.
- **Typography:** DM Sans is loaded in `index.html` and used as the default Tailwind `font-sans`.
- **Design rules:** See `docs/DESIGN_SYSTEM.md` for token reference and component standards. **Visual source of truth:** `docs/DESIGN_SYSTEM_RULES.md` — all new pages, components, and refactors must follow it (tokens only, no hardcoded colors, no decorative shadows).

### Naming

- Hooks: `use[Feature][Noun].ts` (e.g. `usePerformanceTableData`)
- Lib utilities: `[noun][Verb].ts` or `[noun]Utils.ts`
- Components: PascalCase; co-locate sub-components in a folder when complex

### Data access

- Never call Supabase directly from a UI component. Use hooks.
- Never call external APIs (Google Sheets, FX) from the browser. Use Edge Functions.
- Use React Query for all async data. Prefer `staleTime` + `gcTime` for caching strategy.

### Apply / Cancel behavior (modals and sheets)

- **Apply** = persist (where applicable) + close modal/sheet.
- **Cancel** = revert local state + close modal/sheet.

### Date filter (Data Studio)

- `DateRangeFilter` keeps all selections (preset, custom range, compare toggle/type) in **draft state** until the user presses **Apply**. No parent state changes until Apply.
- On Apply, `FiltersRow` calls a single `onDateApply` callback that commits the full payload to `useDataStudioFilters`, which updates `customDateRange`, `selectedYear`, `selectedMonth`, and `comparisonType` atomically.
- The trigger button label always reflects the **committed** `dateRange`/`datePreset`, not the in-popover draft.
- Saved views restore `customDateRange` from `selected_year`/`selected_month` so the label, filtering, and fetch scope stay aligned.

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

Supabase anon key and project URL are hardcoded in `src/integrations/supabase/client.ts` (auto-generated by Supabase tooling).

---

## Refactor Notes

See `docs/REFACTOR.md` for the full refactor plan, phase-by-phase progress, and the Verify → Migrate → Delete protocol.

**Looker Studio Refactor — completed 2026-03-18:**
- Dropped AI summary tables: `ai_summary_cards`, `ai_summary_budgets`, `ai_summary_forecasts`, `slide_report_summaries`
- Dropped legacy pivot cache tables: `slide_report_channel_*`, `slide_report_monthly_data`, `monthly_dimension_data`, `aggregated_breakdown_data`, `sheet_data`, `report_api_data`
- Dropped legacy view tables: `report_views`, `slide_report_views` (replaced by `views`)
- Deleted 12 retired edge functions (AI summary, legacy pivot cache, vlookup, sheet migration)
- Deleted ~30 dead frontend files (Kanban cluster, AI components, legacy pivot engine, dead hooks)
- Migrated `SharedReport.tsx` + `CreateShareLinkModal.tsx` to `views` table
- Removed `report_api_data` fast-path from `get-performance-data`
- `useSlideReportPage` now uses `useFilteredSlideData` directly (no intermediate passthrough hook)

---

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| One account per user | Simplifies routing; no account selector UI needed | 2026-03-18 |
| `dimension_data` as canonical fact table | Single typed, dimension-id-keyed store; replaces all legacy pivot caches | 2026-03-18 |
| Data Studio as the only report view | Removes parallel report systems (Brady, Master Report, AI summary) | 2026-03-18 |
| `views` as canonical view settings table | Single source of truth for column/KPI visibility, ordering, and filter presets | 2026-03-18 |
| No AI summary features | Replaced by Looker Studio-style direct data exploration | 2026-03-18 |
