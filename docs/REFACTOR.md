# REFACTOR PLAN

## 1. Objective

**Goal**
- Improve system clarity, remove duplication, and simplify architecture

**Problems**
- Duplicate systems
- Inconsistent structure
- Hard-to-maintain logic
- Dead or unused code

**Target Outcome**
- Single source of truth per feature
- Clean architecture
- No duplicate logic
- Stable system

---

## 2. Current System Audit

### 2.1 Routes

| Route | Component | Type |
|-------|-----------|------|
| `/` | SlideViewPage | Canonical (Data Studio) |
| `/landing` | Navigate to="/" | Alias |
| `/auth` | Auth | Public |
| `/shared/:slug` | SharedReport | Public |
| `/tools/data-sources`, `.../:accountId` | DataSourcesPage | Protected |
| `/tools/dimensions`, `.../:accountId` | DimensionsPage | Protected |
| `/tools/forecasting`, `.../:accountId`, `.../scenario/:id` | ForecastingDashboard, ForecastScenarioPage | Protected |
| `/tools/price-widget`, `.../:accountId`, `.../:widgetId` | PriceWidgetPage, PriceWidgetDetailPage | Protected |
| `/integrations` | Integrations | Protected |
| `/tools/reports`, `/tools/data`, `/tools/reports/:accountId`, `/tools/reports/:accountId/data-studio` | Navigate to="/" | Legacy redirect |
| `/:slug` | SharedReport | Catch-all slug |
| `*` | NotFound | 404 |

---

### 2.2 Systems

- **Dimension:** dimensionLoader.ts, dimensions table, dimension_data (canonical writer: resync-data-source).
- **Data ingestion:** refreshWorkflow.ts → run-refresh-workflow → resync-data-source, fetch-google-sheets, fetch-csv-url.
- **Data Studio:** SlideViewPage, useSlideReportPage, useDataStudioRawRows, useFilteredSlideData, ReportSidebar, FiltersRow.
- **Filters (Data Studio):** FiltersRow (date + presets) in SlideViewPage.
- **Filters (Shared / legacy table):** FiltersBar, FilterState type — SharedReport, PerformanceTable.
- **KPI / metrics:** metricsCalculations.ts, useKPICards, useReportKPICards (single hook file).
- **Sharing:** SharedReport, share_links table, /shared/:slug.
- **Theme:** ThemeProvider, useTheme, ThemeToggle (single system).
- **UI:** shadcn/ui, DESIGN_SYSTEM_RULES.md tokens.

---

### 2.3 Duplicate Mapping

| Feature | Implementations | Canonical | Status |
|--------|-----------------|-----------|--------|
| Report filters (Data Studio) | FiltersRow (legacy FilterControls removed) | FiltersRow | **Done** — `FilterControls.tsx` deleted (Phase 1). |
| Report dropdowns / selector | (legacy DataStudioDropdowns removed) | N/A | **Done** — `DataStudioDropdowns.tsx` deleted (Phase 1). |
| KPI cards hook | useKPICards.ts (single file) | useKPICards.ts | No duplicate. |
| Data source sync | Client sync removed; Edge path only | runRefreshWorkflow → run-refresh-workflow → resync-data-source | **Done** — `sync-utils.ts` removed; Data Studio / data sources use `runRefreshWorkflow` only. |
| Data sources per report | Multiple rows per report_id + source_type allowed | One per (report_id, source_type) via script | Use `supabase/scripts/dedupe_data_sources.sql` when duplicates exist; DB unique constraint per unify migration. |

---

### 2.4 Issues

- **Dead code:** FilterControls.tsx (no imports). DataStudioDropdowns.tsx (no imports).
- **Potential duplication:** FiltersRow (SlideViewPage) vs FiltersBar (SharedReport) serve different contexts (Data Studio vs shared report); not duplicate, different entry points.
- **Documentation:** REFACTOR.md was template-only; audit filled in Phase 1.

---

## 3. Target Architecture

### 3.1 Canonical Systems

- **Dimensions:** dimensionLoader.ts + dimensions table; writer: resync-data-source.
- **Data:** dimension_data table; reader: useDataStudioRawRows / get-performance-data; filter: useFilteredSlideData.
- **Data Studio UI:** SlideViewPage → ReportSidebar + topbar (in page) + FiltersRow + tab content.
- **Shared report:** SharedReport + FiltersBar; slug: /shared/:slug.
- **Theme:** ThemeProvider + useTheme + ThemeToggle; persistence: localStorage roomstay-theme.
- **Refresh:** refreshWorkflow.ts → run-refresh-workflow edge function.

---

### 3.2 Core Routes (must remain)

- `/` (SlideViewPage), `/auth`, `/shared/:slug`, `/tools/data-sources`, `/tools/dimensions`, `/tools/forecasting`, `/tools/forecasting/scenario/:scenarioId`, `/tools/price-widget`, `/tools/price-widget/:accountId/:widgetId`, `/integrations`. Legacy redirects to `/` as per README.

---

### 3.3 Architecture Rules

- Follow README.md (no secrets in browser, one account per user, one report per account, dimension precedence).
- Single responsibility per module; shared components in src/components; hooks in src/hooks; lib in src/lib.
- One entry point per feature; no parallel report systems.

---

## 4. Refactor Rules

### 4.1 Single Source of Truth
- one implementation per feature

---

### 4.2 No Parallel Systems
- no duplicate APIs, routes, or services

---

### 4.3 Prefer Rewrite Over Patch
- rewrite messy logic instead of patching

---

### 4.4 Verify → Migrate → Delete

#### Verify
- check usage across system

#### Migrate
- move required logic

#### Delete
- remove safely

---

### 4.5 Architecture Consistency
- follow README.md structure

---

### 4.6 Remove Dead Code
- delete unused files, imports, logic

---

### 4.7 Safe Refactoring
- do not break core features

---

### 4.8 Route Discipline
- one entry point per feature

---

### 4.9 Data Consistency
- one data model per entity

---

### 4.10 Dependency Control
- remove unused dependencies

---

### 4.11 Naming Consistency
- keep naming clear and consistent

---

### 4.12 Continuous Validation
- build must pass
- lint must pass

---

### 4.13 Documentation Alignment
- update docs after changes

---

## 5. Phases

### Phase 1 — Audit
- map system
- identify duplicates

---

### Phase 2 — Canonical Definition
- choose main systems

---

### Phase 3 — Migration
- unify logic and data

---

### Phase 4 — Cleanup
- remove duplicates
- delete unused code

---

### Phase 5 — Stabilization
- fix errors
- ensure system stability

---

## 6. Execution Framework

### Verify → Migrate → Delete

- apply for every feature

---

## 7. Progress Tracker

- [x] Phase 1 — Audit
- [x] Phase 2 — Canonical
- [x] Phase 3 — Migration
- [x] Phase 4 — Cleanup
- [x] Phase 5 — Stabilization

---

## 8. Change Log

### Chart date-source unification (2026-03-20)

**Changes**
- Removed the active split between top date filters and chart-specific time range state.
- Data Studio charts now use the same top date filter as KPI cards, tables, and breakdowns; only chart granularity remains local to the chart UI.
- Reworked `useChannelChartDataFromRawRows` to bucket filtered canonical `rawDataRows` by `month` / `week` / `day`.
- Removed the active legacy comparison/fallback chart path in `SlideViewPage` that depended on pivot-style monthly blobs and separate chart-range assumptions.

**Replaced By**
- Single chart path: `SlideViewPage` → `useChannelChartDataFromRawRows` using top date filter + chart granularity.

**Verification**
- `npx tsc --noEmit` ✅ exit 0
- `npm run build` ✅ exit 0

### Refresh blank-page stabilization (2026-03-19)

**Changes**
- Removed stale `dynamicChannelTotals` reference from `useChannelMetrics` dependencies (leftover after state/path removal).
- Removed stale dual totals callback path:
  - `ChannelTab` no longer passes `onTotalsChange` with deleted `setBreakdownTotals`.
  - `BreakdownTableSection` no longer runs the orphaned `onTotalsChange` effect.
- Refresh flow now keeps Data Studio mounted after sync and cache refetch without channel-tab runtime crashes.

**Verification**
- `npm run build` ✅ exit 0
- `npm run lint` ✅ 0 errors (warnings only)

### Phase 1 (2026-03-19)

**Changes**
- Populated §2 Current System Audit (routes, systems, duplicate mapping, issues).
- Populated §3 Target Architecture (canonical systems, core routes, architecture rules).
- Identified dead code: FilterControls.tsx, DataStudioDropdowns.tsx (no imports).

**Removed**
- `src/components/slides/FilterControls.tsx` (unused; no imports).
- `src/components/DataStudioDropdowns.tsx` (unused; no imports).

**Replaced By**
- N/A.

**Verification**
- `npm run build` ✅ exit 0. `npm run lint` ✅ 0 errors (warnings only). 

### Data source dedupe + single sync path (2026-03-19)

**Changes**
- One canonical sync path: EditDataSourceModal now uses `runRefreshWorkflow` (reportId + clearFirst + full) instead of deprecated `syncDataSource` from sync-utils. Resolve accountId from props or from `reports.account_id` when missing.
- Script to dedupe `data_sources`: `supabase/scripts/dedupe_data_sources.sql` keeps one source per `(report_id, source_type)` (latest `updated_at`), deletes the rest. Use when a report (e.g. metasearch) has multiple CSV or Google Sheets sources.

**Removed**
- None (sync-utils still present for other callers; EditDataSourceModal no longer uses it).

**Replaced By**
- EditDataSourceModal "Save and sync" → `runRefreshWorkflow` + query invalidation.

**Verification**
- Build and lint (run below).

### Database Refactor + View Unification (2026-03-19)

**Changes**
- Added unique constraint on `data_sources(report_id, source_type)` to enforce one canonical source per type per report (migration `20260319000000_unique_data_sources.sql`).
- Added `reports.channel` column to identify report type explicitly rather than name matching (migration `20260319010000_add_reports_channel.sql`).
- Dropped legacy `report_views` table from database (completed `slide_report_views` drop as well).
- Removed legacy client-side `syncDataSource` implementation from `sync-utils.ts` in favor of edge function only (`runRefreshWorkflow`).
- Replaced all frontend usages of `report_views` / `slide_report_views` query keys and caching with unified `views`.

**Removed**
- Client-side data sync pipeline code from `sync-utils.ts` (replaced with deprecation stub).
- Old table `report_views` (already dropped in UI paths previously).

**Replaced By**
- Unified `views` storage.
- Edge function `run-refresh-workflow` for sync.
- Explicit `reports.channel` column.

**Verification**
- DB constraints validated against existing accounts. Build and lint passing.

### AOV (Average Order Value) KPI (2026-03-20)

**Changes**
- Added `aov` (Average Order Value = Revenue / Bookings) as a derived metric across the entire KPI pipeline.
- `DerivedMetrics` type extended with `aov: number`.
- `calculateDerivedMetrics` computes `aov = bookings > 0 ? revenue / bookings : 0`.
- `useKPICards` and `useReportKPICards`: AOV card inserted before Revenue (format: currency with 2 decimals).
- `KPIMetricsCards` (SharedReport path): AOV added to `FORMULA_METRICS`, `defaultKPIs`, `addDerivedMetrics`, and `formatDisplay`.
- `BreakdownTableSection`: AOV column added before Revenue in header, data rows, expanded rows, and totals row.
- `SlideViewPage.renderKPICards`: AOV formatted with 2 decimal places (same as CPC).
- `OverviewTab`: removed inline/exception KPI array path and now always uses canonical `KPI_CARDS` (from `useKPICards`) passed by `SlideViewPage`, ensuring AOV is shown in the Overview main KPI section with the same shared pipeline.

**Removed**
- N/A.

**Replaced By**
- N/A.

**Verification**
- `npx tsc --noEmit` ✅ 0 errors.
- `npm run build` ✅ exit 0.
- `npm run lint` ✅ 0 errors (warnings only).

### Unified View Filters (2026-03-20)

**Changes**
- Fixed view filters (e.g. Brady) not applying to breakdown tables and charts.
- `BreakdownTableSection`: removed `selectedChannel !== 'overview'` guard that disabled dimension filters on the overview tab. Each channel's filters now apply independently regardless of which tab is selected.
- `BreakdownTableSection`: all `filterRawDataRows` calls now receive a merged `dimensionIdToName` map (`dimensionMap + configuredDimensionNames`) so global/configured filter UUIDs resolve to report-specific row keys.
- `chartDataCalculations.ts`: `processOverviewChartData` and `processChannelChartData` now accept and pass `configuredDimensionNames` to `filterRawDataRows`.
- `useChartData.ts`: all chart hooks thread `configuredDimensionNames` to the chart processing functions.
- `ChannelTab.tsx`: accepts and passes `configuredDimensionNames` to `UnifiedBreakdownTable`.
- `SlideViewPage.tsx`: passes `configuredDimensionNames` to chart hooks and `ChannelTab`.
- `handleApplyView` (master reset): chart time range, price-check chart range, and tab are now reset to defaults when switching to master view (prevents stale state from a previous view).

**Removed**
- `filterDimensionValues` no longer used inside `BreakdownTableSection` (prop kept for backward compat).
- Redundant `dimensionMap` redeclaration inside chart filter blocks.

**Replaced By**
- Single `configuredDimensionNames` prop threaded from `SlideViewPage` through all consumers.

**Verification**
- `npx tsc --noEmit` ✅ 0 errors.
- `npm run build` ✅ exit 0.
- `vitest run slideViewHelpers.test.ts` ✅ 27/27 pass (7 new filterRawDataRows tests).
- `vitest run monthUtils.test.ts` ✅ 17/17 pass.

### Top filter options scoped to active view filters (2026-03-20)

**Changes**
- Fixed top inline filter options showing unfiltered values after applying a saved view (e.g. Brady).
- `useDataStudioFilters.ts` option derivation now computes options from rows scoped by:
  - active **other** filter dimensions in the same channel (self dimension excluded),
  - active date scope (`customDateRange` or selected year/month),
  - merged dimension-name resolution map (`dimensionMap + configuredDimensionNames`) for global-ID-to-row-key mapping.
- This keeps top filter option lists aligned with already-filtered KPI/table outputs and avoids a parallel option-generation path.
- Follow-up hardening: empty-array selections from inline “All” mode are normalized as no-filter during option derivation to prevent zero-data regressions.
- Root-cause correction in canonical helpers: `slideViewHelpers.ts` now treats empty arrays as “All/no filter” (not “exclude all”) in both active-filter detection and row filtering. This aligns helper behavior with inline filter UX and prevents accidental zero datasets.

**Removed**
- Implicit "all raw rows" option derivation for top inline filters.

**Replaced By**
- Scoped option derivation using `filterRawDataRows(...)` in `useDataStudioFilters`.
- Per-dimension scoped options from `filterRawDataRows(...)` with normalized filters (exclude empty arrays and self dimension).
- Empty-array-as-exclude-all behavior in `hasActiveFiltersForChannel` / `filterRawDataRows`.

**Verification**
- `npx tsc --noEmit` ✅ 0 errors.
- `npm run build` ✅ exit 0.
- `vitest run src/lib/__tests__/slideViewHelpers.test.ts` ✅ 27/27 pass.
- `ReadLints` on `src/hooks/useDataStudioFilters.ts` ✅ no errors.

### Filter System Rebuild (2026-03-20)

**Changes**
- Deleted all fragmented Data Studio filter state from `SlideViewPage`:
  - Removed `filterDimensionValues`, `pendingFilterValues`, `filterSearchTerms`, `openFilterPopovers`, `filterDimensionNames` state.
  - Removed `loadFilterDimensionValues` and `loadFilterDimensionValuesAfterSave` async functions (~120 lines each).
  - Removed two `useEffect` blocks for tab-switch and pivot-data filter option loading.
  - Removed old `filterConfigs` `useState` and scattered `persistDimensionSettings` / `dimensionSettingsValue` fragments.
- Created canonical `src/hooks/useDataStudioFilters.ts`:
  - Single owner of filter state: `filterValues`, `customDateRange`, `comparisonType`, `filterConfigs`, `filterPanelOpen`.
  - Options derived in-memory from `rawDataRows` only (no DB, no pivot fallback).
  - Accepts externally-controlled state (`externalFilterValues` etc.) to avoid circular dependency with `useSlideReportPage`.
  - Exposes `applyView`, `resetFilters`, `setChannelFilterValue`, `clearChannelFilter`, `persistFilterConfigs`.
- Created canonical `src/components/slides/FilterPanel.tsx`:
  - Sliding sheet with per-channel multi-select dimension dropdowns.
  - Receives all state via props from `useDataStudioFilters` — no async loading.
  - Active filter badge, clear-all, search within each dropdown.
- Wired `FilterPanel` into `SlideViewPage` via `dsFilters.filterPanelOpen`.
- Rewired `handleApplyView` to delegate to `dsFilters.applyView`.
- `FiltersRow` now accepts `activeFilterCount` prop — shows badge + highlights button when active.
- Updated `DimensionSettingsModal` integration to write through `dsFilters.persistFilterConfigs`.

**Removed**
- ~200 lines of dead/duplicate filter state and loading logic from `SlideViewPage`.
- All async filter option loading (pivot_data + DB fallback paths).

**Replaced By**
- `useDataStudioFilters` (canonical hook).
- `FilterPanel` (canonical UI).

**Verification**
- `npx tsc --noEmit` ✅ 0 errors (main workspace, post merge-conflict resolution).
- Merge conflict in `SlideViewPage.tsx` resolved: kept `FilterPanel` wiring.
- `FilterPanel.onToggleValue` prop type fixed: `string` → `string[]`.

### Phase 4 Cleanup: Dead Hooks (2026-03-19)

**Changes**
- Identified and deleted fully orphaned hooks from the `src/hooks/` directory.

**Removed**
- `src/hooks/useDimensionSelector.ts`
- `src/hooks/useMonthlyDataFiltering.ts`
- `src/hooks/useDimensionOperations.ts`
- `src/hooks/useDimensionGranularities.ts`
- `src/hooks/useDimensionFilters.ts`
- `src/hooks/useSlideViewFilters.ts`

**Replaced By**
- N/A.

**Verification**
- `npm run build` ✅ exit 0. `npm run lint` ✅ 0 errors.

---

## 9. Deletion Safety Checklist

- [ ] no imports
- [ ] no routes
- [ ] no API usage
- [ ] no DB dependency
- [ ] no UI reference

---

## 10. Decisions / Notes

- architectural decisions
- tradeoffs
- open questions
