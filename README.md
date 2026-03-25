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
- **Dedupe data sources:** If a report has multiple CSV or Google Sheets sources (e.g. duplicate metasearch sources), run `supabase/scripts/dedupe_data_sources.sql` to keep one per `(report_id, source_type)` and delete the rest **before** applying the unique index migration. Migration: `supabase/migrations/20260319000000_unique_data_sources.sql` (`data_sources_report_id_source_type_key`). Canonical duplicate mapping for sync, charts, and reports is summarized under **Refactor process** below.

### 3. Data Studio / Report View

- **Entry point:** `/` renders `SlideViewPage` directly — Data Studio is the app homepage.
- **Orchestrator hook:** `src/hooks/useSlideReportPage.ts` — composes sub-hooks for report identity, raw rows, filtered data, views, budgets, and mutations.
- **Raw rows:** `src/hooks/useDataStudioRawRows.ts` — reads via `get-cached-report-data` edge function. The canonical source is `dimension_data`; **smart caching enabled** (React Query `staleTime: 5min`, `gcTime: 10min`) for fast subsequent loads while keeping data fresh. **Multi-year fetch:** when `customDateRange` spans multiple calendar years (e.g. Nov 2025 → Feb 2026), `useSlideReportPage` fetches each intersecting year in parallel (up to 3 years via fixed hook slots) and merges the rows before filtering. Helper: `getYearsInDateRange()` in `monthUtils.ts`.
- **Filtered data:** `src/hooks/useFilteredSlideData.ts` — pure client-side filtering and aggregation. Single source of truth for KPI totals, monthly chart data, and filtered raw rows.
- **Filter state:** `src/hooks/useDataStudioFilters.ts` — canonical owner of `filterValues`, `customDateRange`, `comparisonType`, `filterConfigs`. Restores view filters via `applyView`. All consumers (KPI cards, charts, breakdown tables) read from the same `filterValues` and use a shared `configuredDimensionNames` map for global-to-report dimension ID resolution. Exact custom date ranges stay page-controlled even when the initial value is `undefined`, so applying a sub-month range updates KPI cards, charts, and tables together. The default top date filter is **month to date** (1st of current month → today) via `getCurrentMonthToDateRange()` and preset id `DEFAULT_REPORT_DATE_PRESET` (`month_to_date`) in `monthUtils.ts`. The UI labels that preset **“This Month”**; **“Full month”** (`this_month`) selects the entire calendar month.
- **Filter flow:** saved view → `applyView` → `filterValues` (+ comparison, etc.) → `useFilteredSlideData` + charts + breakdown tables. **Owner UI:** choosing a saved view from the sidebar calls `applyView(..., { skipDateRestore: true })` so the **top date range stays as already selected** (switching views does not snap to the view row’s stored date). **Master** reset (`applyView(null)`) clears filters and restores month-to-date. **Share bootstrap:** `share_view_id_*` in sessionStorage applies the linked view with share-specific date options; the query string is **not** used for `viewId` (no `?viewId=` sync or URL-driven re-apply). All paths resolve filter IDs via `filterRawDataRows(..., combinedDimNames)`. **Filter format:** `filterValues` is ALWAYS channel-based (`{ metasearch: {}, sem: {}, social: {} }`), never report-based (`{ [reportId]: {} }` — deprecated format auto-converted in `SharedReport.tsx`).
- **Same-named dimension IDs:** If a channel has multiple data sources, `dimension_values` may use **different UUIDs** for the same column label (e.g. two “Hotel” dimensions). Filter dropdown options and `filterRawDataRows` read every key that shares the same display name in the merged map (`getRowKeysForSameNamedDimension` / `readRowTextDimensionValue` in `slideViewHelpers.ts`) so metasearch Hotel lists and applied filters stay aligned with breakdown rows.
- **Performance table:** `src/components/PerformanceTable/` + `src/hooks/performanceTable/`.
- **View settings:** stored in `views` table (canonical, replaces legacy `report_views` + `slide_report_views`).
- **Layout:** `flex h-screen overflow-hidden` root → `ReportSidebar` (left nav: tabs + Actions/Manage/Tools sections) + main column (`flex-col flex-1`) → topbar + tab content rendered inside `SlideViewPage.tsx` (back, report name, Data Sources, Dimensions, Share, Refresh Data) + scrollable tab content.
- **Filters:** `FiltersRow` component (date range + channel filters); uses `DateRangeFilter` from `src/components/filters/`.
- **Chart controls:** Overview and channel charts share two dropdowns in the chart header: a KPI metric selector (Revenue, Impressions, Clicks, Cost, Bookings, CTR, Conversion Rate, CPC, AOV, ROAS, Cost of Sale) and a granularity selector (`Month`, `Week`, `Day`). The chart date scope is no longer independent; it always follows the top date filter, and the granularity dropdown only changes bucket size. **Cross-year labels:** day/week bucket labels include a 2-digit year suffix (`MMM d, yy`) only when the selected range spans multiple calendar years to avoid duplicate tick labels. **Comparison merge:** chart comparison overlay is merged by bucket-label key (not array index) so granularity switches cannot misalign the two series.

### 4. KPI / Metrics System

- **KPI derivation:** `src/lib/metricsCalculations.ts` — ROAS, CPC, AOV (revenue / bookings), cost-of-sale, etc.
- **Derived row KPIs:** `src/lib/slideViewHelpers.ts` — `calculateDerivedMetrics`; Performance Model view adds **Commissions Paid**, **Commissions Free**, **Gross Profit** (see below).
- **Performance Model view only** (saved view name case-insensitive `Performance Model`): Metasearch splits commission by **Link Type** on each raw row — **Paid** (15%): label contains `paid` (and not overridden by free signals); **Free** (3%): contains `free`, `organic`, or **Google + (uni \| universal)** (covers “Google Uni…”, “Google Universal”, free organic–style labels without the word “free”). Other link types → 15% paid. SEM/Social use 15% of channel revenue as paid, 0 free. **Gross profit** = commissions paid + commissions free − cost. Implemented in `computePerformanceModelCommissionSplit` + `SlideViewPage` / `useKPICards` (cards hidden on other views).
- **Breakdown Analysis table** (`UnifiedBreakdownTable` in `BreakdownTableSection.tsx`): includes a **Gross Profit** column (per group row, expanded drill-down, and total). With Performance Model active, per-row commission split matches KPI math (`isPerformanceModelView` from `SlideViewPage` → `ChannelTab`); otherwise gross profit uses `calculateDerivedMetrics` (15% revenue − cost). Cost of Sale, CPC, and AOV use extra decimals only for small **non-zero** values; true zeros render as `0.00%` and two-decimal currency (not `0.0000%` / `$0.0000`) via helpers in `slideViewHelpers.ts`.
- **Default KPIs:** `getAccountDefaultKPIs()` returns exact KPI names matched case-insensitively from available dimensions.
- **KPI repair:** default view creation / updates in `usePerformanceTableViews` keep `kpi_order` aligned with account-visible KPIs (`visible_kpis`).

### 5. Refresh / Sync Workflow

- **Entry point:** `src/lib/refreshWorkflow.ts` → `run-refresh-workflow` edge function.
- **Workflow:** the UI always passes `clearFirst: true`, so the workflow first deletes all `dimension_data` for the target report(s), then calls `resync-data-source` for each data source. Erase-then-replace prevents duplicate or stale rows. After resync, the workflow pre-warms `get-cached-report-data` (`forceRefresh=true`) per report for the current year. The Refresh Data modal shows “Clearing and resetting data” before “Fetching from sources”. Full Refresh uses `refreshMode: 'full'`. Column→dimension mapping in `resync-data-source` includes header synonyms (e.g. Spend → Cost) so full resync recovers missing Cost after dimension churn. After refresh completes, the app awaits a refetch of `data-studio-raw-rows` so KPIs/charts are not stale.
- **Supabase MCP:** When the project is linked in Cursor, agents can use MCP tools (`execute_sql`, `apply_migration`, `deploy_edge_function`, `list_tables`, etc.) against the linked project. See **Runbooks** below for metasearch Cost fixes.

### 6. Sharing System

**Table:** `share_links`

- `slug` (text, unique) — public URL path (e.g. `/shared/my-report`)
- `password_hash` (text, nullable) — optional password protection
- `report_ids` (uuid[], nullable) — array of report IDs to share
- `dimension_filters` (jsonb) — pre-applied dimension filters
- `view_id` (uuid, nullable) — references `views` table for saved filter configuration
- `slide_report_id` (uuid, nullable) — references `slide_reports` for Data Studio shares
- `account_id` (uuid, nullable) — account context for the share link
- `locked_dimension_ids` (uuid[]) — array of dimension IDs that viewers cannot change (typically the main dimension)
- `selected_year` (text, nullable) — year selection for the shared view (e.g., "2026" or "all")
- `selected_month` (text, nullable) — month selection for the shared view (e.g., "January" or "all")
- `custom_date_range` (jsonb, nullable) — custom date range with from/to ISO date strings
- `date_preset` (text, nullable) — date preset ID (e.g., "month_to_date", "this_month")

**Table:** `views` (unified view storage)

- `main_dimension_id` (uuid, nullable) — primary dimension for this view (e.g., Account for SEM/Social, Hotel for Metasearch)
- `main_dimension_name` (text, nullable) — display name of the main dimension
- When a view is shared, its `main_dimension_id` is copied to `share_links.locked_dimension_ids`

**Routes:**
- `/shared/:slug` — public shared report view (password-protected if set)
  - Classic dashboard (KPI cards, chart, table) for `report_ids`-only shares
  - Redirects to `/shared/:slug/studio` for Data Studio shares (when `slide_report_id` or `view_id` is set)
- `/shared/:slug/studio` — public Data Studio embed (anonymous access, read-only)
- `/:slug` — catch-all alias for share links

**Components:**
- `SharedReport.tsx` — password gate and router; navigates to studio for slide/view shares
- `SlideViewPage.tsx` — Data Studio UI; supports public share studio mode via path detection and sessionStorage bootstrap
- `ShareModal.tsx` — lists existing share links
- `CreateShareLinkModal.tsx` — create/edit share links; automatically populates `locked_dimension_ids` from view's `main_dimension_id`. **Data Studio** (`slide_report_id`): single-step flow (no per-report dimension picker); optional **View to Share** lists saved views passed from `SlideViewPage` via `ShareModal.availableViews`. Stored filters prefer the selected view’s `filter_values`, then fall back to current Data Studio filters.
- `SaveViewDialog.tsx` — captures main dimension when saving views; shows dropdown to select Account or Hotel
- `FiltersBar.tsx` — legacy filter component; supports `lockedDimensionIds` prop; guards views writes when `isSharedView`
- `FiltersRow.tsx` — canonical Data Studio filter component; supports `lockedDimensionIds` prop for selective read-only
- `DimensionFilter.tsx` — filter dropdown; supports `disabled` prop to render locked state with lock icon
- `KPIMetricsCards.tsx`, `KPIChart.tsx` — load dimensions and owner settings for anonymous users

**Behavior:**
- Share links can be password-protected (base64 encoded - NOTE: not cryptographically secure, consider proper hashing)
- **Main dimension is locked:** When saving a view, users select a main dimension (Account/Hotel). This dimension is locked when the view is shared publicly. Locked filters show a lock icon, are disabled (cannot be changed), and display a tooltip: "This filter is locked by the report owner". Filter options are still derived from rawDataRows so viewers can see available values.
- **Selective read-only:** Viewers can change date range, comparison period, and non-locked filter values (Device, Market, Link Type, Campaign, Ad Group) locally. Locked dimensions (Account/Hotel) remain disabled. Structural changes (save view, share, refresh, dimension configuration) are disabled.
- **Default date filter:** Owner and shared reports default to **month to date** (preset `month_to_date`, UI label “This Month”) on initial load; **Full month** remains a separate preset for the full calendar month.
- **Smart defaults:** Metasearch → Hotel, SEM/Social → Account (inferred from active tab when saving view)
- Locked filters render with a lock icon and disabled state
- Slide report shares use `slide_report_id` + `view_id` for configuration
- **Anonymous access:** Classic single-report shares (`SharedReport` + `FiltersBar`) resolve dimension definitions and filter settings from the report owner's account, allowing anonymous viewers to see correct KPI/chart/table data
- **Cross-year date ranges:** Data Studio shares (`/shared/:slug/studio`) fully support cross-year custom date ranges because they reuse the same `SlideViewPage` multi-year fetch infrastructure as the owner view. Classic single-report shares (`SharedReport`) use separate `KPIChart` / `KPIMetricsCards` components with their own data paths and may have limitations with cross-year ranges.
- **SessionStorage contract for public studio:**
  - `share_auth_${slug}` — "true" when authenticated
  - `share_account_id_${slug}` — account UUID
  - `share_slide_report_id_${slug}` — slide report UUID
  - `share_locked_dimension_ids_${slug}` — JSON array of locked dimension UUIDs
  - `share_filters_${slug}` — JSON channel-based filter values
  - `share_date_${slug}` — JSON date selection (year, month, customRange, preset)
- **Loading: owner (master) vs shared (first load):**
  - **Owner `/` (Data Studio):** `ProtectedRoute` → `useUser` + `useUserAccount` → `useSlideReportPage` resolves or creates the account’s `slide_reports` row, then `useDataStudioRawRows` + filtered aggregates. Primary loading signal for the tab surface is `isFetchingRawRows` (top-edge pulse in `SlideViewPage`). Filter options come from in-memory raw rows via `useDataStudioFilters` (no separate “filter values” network round-trip for dropdowns).
  - **Shared studio `/shared/:slug/studio`:** Not behind `ProtectedRoute`. `SharedReport` (or returning session) writes session keys and `navigate`s here. `SlideViewPage` checks `share_auth_${slug}` first; missing auth redirects to `/shared/:slug`. `shareAccountId`, `shareSlideReportId`, and `shareLockedDimensionIds` are read **synchronously** from sessionStorage via lazy `useState` initializers — IDs are always populated on the first render, eliminating the null-gap that could lock an empty React Query result into cache for the full 5-minute `staleTime`. The bootstrap `useEffect` still re-reads on mount as a guard against HMR double-invoke and applies share filters. `slide_report_id` drives `useSlideReport` + `useDataStudioRawRows` (same pipeline as owner once IDs exist). Anonymous users skip `loadOrCreateSlideReport` in `useSlideReportPage` (`user` is null). **UI/filter state is local-only:** debounced persistence of `groupByDimension`, `breakdownByDimension`, chart settings, and filter values is skipped when `!user || isPublicShareStudio` (guards against RLS-rejected `slide_reports` UPDATEs from anonymous viewers). **Date:** Shared views always open on **month-to-date** — identical to master view. `SharedReport.tsx` writes `share_date_${slug}` as the current MTD range unconditionally; pinned date fields on `share_links` (`selected_year`, `custom_date_range`, `date_preset`) are intentionally ignored so viewers always see current data. `SlideViewPage` uses **lazy state initialization** (function-based `useState`) to read sessionStorage before the first render. The linked saved view is applied once from `share_view_id_${slideReportId}` after `SharedReport` runs; **`?viewId=` in the URL is ignored** (no query-string sync or reapplies). Applying the shared view uses `applyView(..., { skipDateRestore: true })` in public studio so the view row cannot override session. **Cache verification:** `useDataStudioRawRows` checks the cached result after each render; if the query is enabled with real IDs but all channels returned 0 rows (stale empty cache from a prior null-ID render), it calls `queryClient.invalidateQueries` once to force a fresh fetch.
  - **Classic shared `/shared/:slug`:** `FiltersBar` + `KPIMetricsCards` + `KPIChart` + `PerformanceTable` each fetch/load independently; parent tracks `loadingComponents` / `isDataLoading` (global loading toast is currently disabled). First load depends on owner-id resolution for dimensions when the viewer is anonymous.
  - **Passwordless links:** Treat empty / null `password_hash` as open access: auto-persist session and call `initializeReport` so visitors are not stuck behind the password card (see `SharedReport.tsx`).
  - **Session recovery:** On return to `/shared/:slug` with `share_auth` set but `share_data` missing or corrupt, `SharedReport` re-fetches `share_links` from Supabase and rewrites the session (bootstrap uses `bootstrapDoneRef` to prevent double-invocation). On DB failure, stale auth is cleared and the user sees the password card with a "Session expired" toast.
  - **Classic shared error resilience:** Account fetch inside `initializeReport` is raced against a 15 s timeout; on error or timeout `accountLoadState` becomes `'error'` and the full-screen spinner is replaced by an inline error card with a Retry button.
  - **Filter session helper:** `src/lib/shareSession.ts` exports `readShareFiltersFromSession(slug)` and `readShareDateFromSession(slug)` / `writeShareDateToSession(slug, dateSelection)` — used by both the public-studio bootstrap effect and the legacy `?shared=true` branch in `SlideViewPage`; eliminates duplicated `sessionStorage.getItem` / `JSON.parse` blocks.
  - **Classic KPI stack (deferred):** Merging `KPIMetricsCards` / `KPIChart` into the Data Studio hook stack (`useFilteredSlideData`, `useChannelChartDataFromRawRows`) is explicitly out of scope for the current effort. Classic shared uses legacy parallel loaders; cross-year date ranges and comparison parity are not guaranteed on that path.
- **Security note:** Public read-all RLS policies on `reports`, `dimension_data`, `dimensions` (migration `20251030184608`) mean slug + password is the primary gate. Consider tightening with share-scoped policies or SECURITY DEFINER functions.

### 7. Integrations

- **Composio:** all tool execution is server-side via `composio-proxy` edge function.
- **FX rates:** `get-fx-rate` edge function.

---

## Active Edge Functions

| Function | Purpose |
|---|---|
| `resync-data-source` | Sole writer to `dimension_data` |
| `run-refresh-workflow` | Orchestrates full resync per account |
| `get-cached-report-data` | Cache-aside reader for report/year raw rows |
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
| `reports` | Report identity per account; optional `channel` (`metasearch` / `sem` / `social`) — migration `20260319010000_add_reports_channel.sql`; `accountReportIds.ts` prefers `channel` then name heuristics; `DashboardHeader` sets `channel` on create from `inferReportChannelFromName()` (`src/lib/reportChannel.ts`); renames only update `channel` when the new name implies one (generic renames keep the existing value); after create/update/delete, `DashboardHeader` calls `clearAccountReportIdsCache(accountId)` so `getAccountReportIds` refetches |
| `slide_reports` | Data Studio workspace record per account |
| `views` | Unified view settings (replaces legacy `report_views` + `slide_report_views`) |
| `share_links` | Public share link slugs |
| `budgets` | Budget data per view |
| `accounts` | Account records |
| `price_widgets` | Optional persisted configs for the Price Widget tool (`/tools/price-widget`) |
| `profiles` | Auth user profile rows (e.g. share modal display names) |
| `forecast_services` / `forecasts` | Forecasting tools |
| `fx_rates` | Cached FX rates (`get-fx-rate`) |
| `api_keys` | Keys for Express `/api/make/*` routes (`server.js`) |
| `report_shares` | Legacy/internal share records used by `DashboardHeader` |

**Express / Make.com API:** `GET /api/make/reports/:reportId` reads **`dimension_data`** (mapped to snake_case column names), not the removed `report_api_data` table. Default window: previous calendar month through today; `period=current|comparison|both` selects current and/or prior-year comparison ranges when a date dimension exists.

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
   → useDataStudioRawRows → get-cached-report-data (cache miss computes from `dimension_data`, cache hit returns `query_cache.payload`)
   → useFilteredSlideData → client-side filtering + aggregation
   → ReportSidebar (left nav) + `SlideViewPage` topbar + tab content
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
| `SlideViewPage` | `src/pages/SlideViewPage.tsx` | Data Studio page: topbar, filters, tabs (overview + channels) |
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
- **Design rules:** Use HSL tokens in `src/index.css` only — no hardcoded hex/rgb in components; use Tailwind classes mapped to `--background`, `--foreground`, `--primary`, `--destructive`, `--muted`, `--border`, `--chart-*`, etc. Prefer `--radius` and the spacing scale. Reserve strong color for meaning (primary actions, destructive). Support light and dark via tokens. Avoid decorative shadows; use elevation only for dialogs/popovers. Reuse shadcn variants before inventing new button or card styles.

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

> **CORS rule:** Do NOT add `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, or similar response headers to the Supabase client's `global.headers` config. The browser treats those as request headers and the CORS preflight rejects them, blocking all Edge Function calls. CORS response headers are set server-side in each Edge Function's `corsHeaders` constant only.

---

## Refactor process

**Ongoing rules:** one implementation per feature; no parallel APIs or routes; prefer rewrite over endless patches; **Verify → Migrate → Delete** before removing any module (no imports, no routes, no tests/EF deps, schema safe).

**Phases 1–5** (audit → canonical definition → migration → cleanup → stabilization) are **complete**. Recent work: unified `views`; single sync path `runRefreshWorkflow` → `run-refresh-workflow` → `resync-data-source`; client `sync-utils` removed; Data Studio charts use `useChannelChartDataFromRawRows` only; `reports.channel` + `reportChannel.ts` / `DashboardHeader` + `clearAccountReportIdsCache` on report CRUD; unique `data_sources (report_id, source_type)` after optional `dedupe_data_sources.sql`.

**Duplicate mapping (canonical vs retired):**

| Area | Canonical | Retired |
|------|-----------|---------|
| Data Studio filters | `FiltersRow` + `useDataStudioFilters` | ✅ `FiltersBar` removed (Phase 6) |
| Raw data fetch | `useDataStudioRawRows` → `get-cached-report-data` | ⏭️ `useCachedSourceData`, `useSourceData` (PerformanceTable only) |
| KPI display | `KPICardsSection` (Data Studio) | ✅ `KPIMetricsCards` removed (Phase 6) |
| Charts | `useChannelChartDataFromRawRows` → `OverviewTab` / `ChannelTab` | ✅ `KPIChart` removed (Phase 6) |
| Multi-year fetch | `getYearsInDateRange` → parallel `useDataStudioRawRows` | ✅ Single-year removed (Phase 6) |
| Shared reports | `/shared/:slug/studio` (Data Studio) | ✅ Classic dashboard removed (Phase 6) |
| Sync | `refreshWorkflow.ts` / Edge only | ✅ Client sync removed (Phase 5) |
| Saved views | `views` table | ✅ `report_views` / `slide_report_views` removed (Phase 5) |
| Channel report lookup | `reports.channel` first, then name heuristics (`accountReportIds`) | - |

**Phase 6 (2026-03-25) — Data fetching unification** ✅ **COMPLETE:**
- **Goal:** Remove duplicate data fetching systems by migrating classic shared reports to use the Data Studio pipeline.
- **What was done:**
  1. **Unified pipeline**: ALL share links (`/shared/:slug`) now redirect to Data Studio (`/shared/:slug/studio`)
  2. **Auto-migration**: Legacy `report_ids`-only links automatically create/find Data Studio slide reports
  3. **Removed duplicates**: Deleted FiltersBar (38 KB), KPIMetricsCards (17 KB), KPIChart (29 KB)
  4. **Bundle reduction**: 2029 KB → 1768 KB (-261 KB, -13%)
- **Result:** Single data pipeline, cross-year dates everywhere, multi-year parallel fetch for all shares, consistent behavior
- **Deferred:** `PerformanceTable` still uses classic hooks; can be migrated in future refactor

**Looker Studio refactor (2026-03-18) — major removals:** AI summary and legacy pivot cache tables dropped; `views` replaces `report_views` / `slide_report_views`; retired edge functions (AI, pivot cache, vlookup, sheet migration); ~30 dead frontend files removed; `useSlideReportPage` uses `useFilteredSlideData` directly.

---

## Data Studio ↔ Supabase

1. **Slide report:** one active `slide_reports` row per account with `name = 'Data Studio'` (auto-created if missing). Holds `report_ids` (metasearch / sem / social → `reports.id`), `configuration`, etc.
2. **Channel reports:** rows in `reports`; **`reports.channel`** (`metasearch` \| `sem` \| `social`) is preferred for resolution; fallback is display-name matching. `DashboardHeader` sets `channel` on create from `inferReportChannelFromName()`; on rename, updates `channel` only when the new name implies a channel.
3. **Facts:** `dimension_data` keyed by `report_id` + `data_source_id` + `row_number`; **writer** is `resync-data-source` only.
4. **Saved UI state:** `views` (filters, table mode, etc.); **budgets** / **share_links** reference slide or channel reports as implemented in app code.

RPCs such as `get_dimension_data_by_report_and_date` support year-scoped fetches. Detailed task history lives in `TODO.md`.

---

## Runbooks

**Metasearch Cost (or other metrics) under-counted:** Prefer **Data Studio → Refresh Data → Full Refresh**. That clears `dimension_data` for the report(s) and re-syncs from sources with correct column → dimension mapping. **Optional DB fix without re-fetch:** run `supabase/scripts/fix_metasearch_cost_dimension_data.sql` via Supabase SQL Editor, `npm run fix:metasearch-cost` (linked CLI), or MCP `execute_sql` with the script body. Currency strings in sheets are normalized via `parseNumericValue` / `transformSourceData` — wrong totals are usually dimension ID / multi-source issues, not formatting.

**Supabase MCP (linked project):** Use the Supabase MCP server in Cursor (`plugin-supabase-supabase`: `list_projects`, `apply_migration`, `execute_sql`, `list_migrations`, `generate_typescript_types`, etc.). **Project ref** matches `project_id` in `supabase/config.toml` (e.g. `zcxxwpwheevwavdcgfht` for Sparti Data). Use `apply_migration` for DDL on the linked database; after applying, add a matching file under `supabase/migrations/<version>_<name>.sql` when you want the same change reproducible from git / local `supabase db`. Use `execute_sql` for read-only inspection or one-off data fixes. Use `list_migrations` to confirm `supabase_migrations.schema_migrations` before assuming the DB is behind the repo.

**Legacy tables removed from the active linked project (Sparti Data, via MCP):** `ai_summary_*`, `slide_report_summaries`, `cluster_dimensions`, `cluster_mappings`, `slides`, `booking_statuses`, `master_filter_settings` (2026-03-25); plus `report_daily_metrics`, `master_report_configs`, `master_report_global_configs` (2026-03-26). App code never queried the Master Report / daily-metrics tables; `src/integrations/supabase/types.ts` matches the live schema.

**Local MCP refresh server:** see `mcp/README.md` for the optional `run_refresh_workflow` MCP tool package.

---

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| One account per user | Simplifies routing; no account selector UI needed | 2026-03-18 |
| `dimension_data` as canonical fact table | Single typed, dimension-id-keyed store; replaces all legacy pivot caches | 2026-03-18 |
| Data Studio as the only report view | Removes parallel report systems (Brady, Master Report, AI summary) | 2026-03-18 |
| `views` as canonical view settings table | Single source of truth for column/KPI visibility, ordering, and filter presets | 2026-03-18 |
| No AI summary features | Replaced by Looker Studio-style direct data exploration | 2026-03-18 |
