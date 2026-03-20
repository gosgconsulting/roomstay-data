# TODO

> Source of truth for active tasks, next steps, blockers, and verification.
> Update this file after every coding session.

---

## Instructions for agents

Always read `README.md` and `TODO.md` before making changes.

- `README.md` = source of truth for architecture, systems, conventions, and decisions.
- `TODO.md` = source of truth for active tasks, next steps, and verification.

Before adding anything new:
- Check if it already exists.
- Check if a similar system already exists.
- Avoid duplicate routes, logic, components, hooks, services, schemas, and docs.
- Prefer reusing or unifying existing systems.

Before coding, provide:
1. Findings
2. Plan
3. Docs to update

After coding:
- Update `README.md` if architecture or system behavior changed.
- Update `TODO.md` with done / next / blockers / verification.
- Verify build, lint, and impacted flows.

---

## Active tasks

### Exclusive Channel Filtering (2026-03-20)

- [x] **FLT-5** — Updated `useFilteredSlideData` to zero out metrics for unfiltered channels when global filters exist (`hasFilters && !hasChannelFilters`).
- [x] **FLT-6** — Updated `useChannelChartDataFromRawRows` to exclude unfiltered channels from chart processing.
- [x] **FLT-7** — Updated `useChannelMetrics` to return `ZERO_METRICS` for excluded channels in comparisons.
- [x] **FLT-8** — Removed `channelAvailableValues` check from `hasActiveFiltersForChannel`, `hasAnyActiveFilters`, and `getChannelsWithFilters` to prevent cache-restricted available options from overriding explicit user filters as "no filter".

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0), `vitest run src/lib/__tests__/slideViewHelpers.test.ts` ✅ (21/21 passed).

---

### Move Budget to DEV section (2026-03-20)

- [x] **DEV-1** — Moved `Budget` out of the main `Reports` tabs list in `ReportSidebar.tsx`.
- [x] **DEV-2** — Placed `Budget` under the `DEV` section in `ReportSidebar.tsx` while preserving its tab functionality (`onTabChange("budget")`) and active state styling.

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0).

---

### Metasearch (and all channels) missing from table after cache refactor (2026-03-20)

- [x] **CHAN-1** — Root cause: `useEffect` in `SlideViewPage` that syncs `selectedDimensions` from `slideReport.configuration.selectedChannels` was filtering by `availableChannels` at sync time. Since `accountReportIds` hasn't resolved when the effect first fires, `availableChannels` is `[]`, so all channels get set to `false`. This makes `selectedChannels = []`, which hides all channel tabs and table data. Fixed: restore `selectedDimensions` directly from `config.selectedChannels` without filtering — the `selectedChannels` memo already gates on `accountReportIds` so stale IDs are safe.

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0).

---

### Cache miss fallback fix (2026-03-20)

- [x] **CACHE-FIX-1** — `useDataStudioRawRows` now has a hard fallback to direct DB fetching (`dimension_data` + RPC path) when `get-cached-report-data` fails or cold miss returns 0 rows. This prevents zero-data screens when cache is unavailable.
- [x] **CACHE-FIX-2** — `run-refresh-workflow` cache warm-up now pre-warms both current year and previous year per report (`forceRefresh=true`) so comparison (`previous_year`) is fast after refresh.

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0), `ReadLints` ✅ (no new errors).

---

### Server-side data caching for Data Studio (2026-03-20)

- [x] **CACHE-1** — Added DB migration `20260320000000_create_query_cache.sql` to create `query_cache` with `cache_key`, `report_id`, `payload`, `expires_at`, `cache_version`, and indexes.
- [x] **CACHE-2** — Added edge function `get-cached-report-data`: cache-aside read path (cache hit from `query_cache`, miss computes from `dimension_data` + RPC, `forceRefresh=true` invalidates and re-populates).
- [x] **CACHE-3** — Updated `useDataStudioRawRows` to call `get-cached-report-data` per channel and changed React Query settings to `staleTime=5m`, `gcTime=10m`, `refetchOnWindowFocus=false`.
- [x] **CACHE-4** — Updated `run-refresh-workflow` to warm cache after resync (`get-cached-report-data` with `forceRefresh=true` per report, current year).
- [x] **CACHE-5** — Updated `README.md` to document `query_cache`, `get-cached-report-data`, and post-refresh warm-cache behavior.

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0), `ReadLints` on edited files ✅ (no new errors).

---

### Remove comparison % from breakdown and channel perf tables (2026-03-20)

- [x] **CMP-1** — Removed `renderPercentChange` / `PercentChangeBadge` from the **Breakdown Analysis** table (`BreakdownTableSection.tsx`). All rows and the total row now show plain metric values. Deleted dead `comparisonBreakdownDateRange`, `comparisonGroupedDataMap`, `compTotals`, `totalComparisonMetrics` `useMemo` hooks — no wasted computation.
- [x] **CMP-2** — Removed `PercentChangeBadge` from the **Channel Performance** table (`OverviewTab.tsx`). Deleted `PercentChangeBadge` function, unused `calculatePercentChange` / `ArrowUpRight` / `ArrowDownRight` imports, and dead comparison data aggregation inside that table.
- [x] **CMP-3** — Comparison % is still shown in **KPI cards** only — the correct and canonical place.

**Feasibility note:** No loading implications — purely rendering-layer removal. KPI cards already display comparison % correctly via `KPICardsSection`.

**Verification:** `npm run build` ✅ (exit 0, 8.75s). `ReadLints` ✅ on both edited files.

---

### Sidebar DEV section update (2026-03-20)

- [x] **SD-1** — Updated `ReportSidebar` menu structure: removed `Forecast` from the sidebar tools list.
- [x] **SD-2** — Moved `Booking` and `Price Check` out of the main `Reports` tabs.
- [x] **SD-3** — Added a dedicated `DEV` section with `Booking`, `Prie check`, and `Widget` entries.
- [x] **SD-4** — Marked DEV tools as not-ready in UI behavior: `Booking`, `Prie check`, and `Widget` are disabled.
- [x] **SD-5** — Removed obsolete menu callback wiring from `SlideViewPage` → `ReportSidebar` (`onForecast`, `onPriceWidget`).

**Verification:** `ReadLints` run on edited files; no new sidebar-related errors introduced. One existing workspace diagnostic remains in `SlideViewPage.tsx` (`@/components/slides/ChannelTab` module resolution).

---

### Auth redirect + sidebar sign-out UX (2026-03-20)

- [x] **AS-1** — Confirmed `/` remains protected by `ProtectedRoute` in `src/App.tsx`, so unauthenticated users are redirected to `/auth`.
- [x] **AS-2** — Updated `ReportSidebar` to a minimalist identity block: `Data Studio` + `by <user>`.
- [x] **AS-3** — Added a text-only `Sign out` action in `ReportSidebar` and wired it to `supabase.auth.signOut()` from `SlideViewPage`.
- [x] **AS-4** — Updated the no-account fallback sign-out control in `SlideViewPage` to use the same sign-out handler.

**Verification:** `npm run build` ✅ (exit 0), `ReadLints` ✅ (no new errors in edited files).

---

### Compare Previous Year + View comparison fixes (2026-03-20)

Two follow-up bugs reported after the initial comparison refactor:

**Bug 1 — Previous year showed zeros:** `useDataStudioRawRows` only fetched the current `selectedYear` via the fast RPC path. When `comparisonType = 'previous_year'`, filtering for previous-year dates against current-year-only rows returned nothing. Fix: added a second conditional `useDataStudioRawRows` call in `useSlideReportPage` scoped to `comparisonYear = selectedYear - 1`. Both years' rows are merged into `effectivePivotData.rawDataRows` per channel, so `useChannelMetrics` can apply the correct date window for either period.

**Bug 2 — Comparison didn't work on saved views:** `applyView` in `useDataStudioFilters` only set `comparisonType` when `view.comparison_type` was truthy — but `'none'` is truthy, so views saved without comparison always reset it. The real issue was the view applying its stored `comparison_type` (typically `'none'`) regardless of what the user had active before switching. Fixed: always `setComparisonTypeRaw(view.comparison_type ?? 'none')` unconditionally so view application always wins.

- [x] **CPR-6** — `useSlideReportPage.ts`: compute `comparisonYear`, add second `useDataStudioRawRows` for previous year when `comparisonType = 'previous_year'`, merge rows per channel before building `effectivePivotData`.
- [x] **CPR-7** — `useDataStudioFilters.ts` `applyView`: always restore `comparison_type` from the view, not conditionally.

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0).

---

### Compare to Previous Period / Year — full refactor (2026-03-20)

Refactored the comparison system so KPI cards, charts, banner text, and breakdown tables all derive comparison windows from the same canonical top date filter model (exact custom date ranges first, month/year fallback second).

- [x] **CPR-1** — Added `buildComparisonDateRangeFromExact` in `src/lib/monthUtils.ts` for exact from/to comparisons (`previous_period` and `previous_year`).
- [x] **CPR-2** — `useChannelMetrics.ts` now accepts `customDateRange` and computes `comparisonTotals` from exact date ranges when present.
- [x] **CPR-3** — `SlideViewPage.tsx` now passes `customDateRange` into `useChannelMetrics` and uses the shared comparison date utility for chart comparison ranges (removed inline duplicate date-shift logic).
- [x] **CPR-4** — `ComparisonBanner.tsx` now supports custom date ranges and renders exact current-vs-comparison labels for both compare modes.
- [x] **CPR-5** — `BreakdownTableSection.tsx` comparison output extended beyond total revenue: percent change now appears across all metric columns in grouped rows and totals row when comparison is active; comparison grouping is computed from comparison-period filtered raw rows.

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0).

---

### Fix: all-time fetch timeout causing zero data (2026-03-20)

Root cause: CH-1 changed `useSlideReportPage` to pass `'all'` to `useDataStudioRawRows`, which triggered `fetchAllRowsParallel` for 134k+ rows (27+ batches per channel, 80+ parallel requests). The query never completed — metasearch (58k rows) and SEM (48k rows) timed out, so `rawRows` stayed `undefined` forever. All KPI cards, tables, charts, and overview showed zeros because `effectivePivotData` was never populated.

- [x] **ZD-1** — Reverted `selectedYear` from `'all'` to the actual `selectedYear` in `useSlideReportPage`, restoring the fast RPC path (`fetchByDateRpc`) for year-filtered fetches. With `selectedYear='2026'`, data loads in ~8s (social 3.5k rows/4s, SEM 5.4k rows/6s, metasearch 27.4k rows/8s) instead of never completing.

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0). Browser verified: Overview KPIs (1.64M impressions, $1.66M revenue), Metasearch ($57.8K rev), SEM ($1.47M rev), Social ($134K rev) all load correctly.

---

### Chart date-source unification refactor (2026-03-20)

Root cause: after adding separate chart range controls (`This Year`, `Last 6 Months`, etc.), Data Studio ended up with two competing date systems. KPI cards, tables, and breakdowns used the top date filter, while charts used an independent chart-range state. That split made the graph show partial data while other components stayed at zero. A second leftover issue was legacy comparison/fallback logic still assuming pivot-style monthly chart data instead of canonical `rawDataRows`.

- [x] **CDU-1** — Removed chart-owned date-range state from `SlideViewPage.tsx`; charts now derive their full date scope from the top date filter only (`customDateRange` or `selectedYear`/`selectedMonth`).
- [x] **CDU-2** — Added `ChartGranularity` (`month` / `week` / `day`) in `src/types/slideView.ts`.
- [x] **CDU-3** — Rewrote `useChannelChartDataFromRawRows.ts` to bucket canonical filtered raw rows by exact top-filter date range + granularity, instead of anchoring to relative presets.
- [x] **CDU-4** — Updated `OverviewTab.tsx` and `ChannelTab.tsx`: removed the chart time-range dropdown and replaced it with a granularity dropdown.
- [x] **CDU-5** — Removed remaining active legacy comparison/fallback chart path in `SlideViewPage.tsx` that depended on separate chart-range assumptions or pivot monthly blobs, and deleted orphaned `src/hooks/useChartData.ts`.
- [x] **CDU-6** — Updated README + REFACTOR docs to record the single-date-source chart architecture.

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0).

---

### Data Studio zero-data chart fix (2026-03-20)

Root cause: Data Studio still ran two chart pathways in parallel. The legacy `useChartData` fallback path in `chartDataCalculations.ts` used `channelData.monthly` in no-filter mode, but that blob is empty after the refactor (`rawDataRows` is canonical). This produced zero charts even when DB rows existed. A second issue was `useChannelChartDataFromRawRows` receiving `filterValues` but not applying them, so chart filters diverged from KPI/table filters.

- [x] **DZ-1** — `useChannelChartDataFromRawRows.ts`: wired `filterValues` into chart aggregation with `filterRawDataRows` and merged `configuredDimensionNames` so global filter IDs resolve to report row keys.
- [x] **DZ-2** — `chartDataCalculations.ts`: replaced no-filter `channelData.monthly` reads in `processOverviewChartData` and `processChannelChartData` with canonical raw-row monthly aggregation.
- [x] **DZ-3** — `chartDataCalculations.ts`: removed hardcoded revenue-only fallback expression in `buildOverviewChartDataFromMonthlyData`; added metric-aware fallback resolver for available monthly aggregates.
- [x] **DZ-4** — `SlideViewPage.tsx`: removed duplicate `useOverviewChartData` / `useAllChannelChartData` path, promoted `useChannelChartDataFromRawRows` as chart source of truth, and simplified effective chart fallback logic.
- [x] **DZ-5** — README updated to document the single chart path (`useChannelChartDataFromRawRows`) in Data Studio flow + hooks table.

**Verification:** `npx tsc --noEmit` ✅ (exit 0), `npm run build` ✅ (exit 0).

---

### Chart feature enhancements (2026-03-20)

- [x] **CH-1** — Fixed chart data completeness for rolling ranges: Data Studio raw rows for charts now fetch all history (`useSlideReportPage` passes `'all'` to `useDataStudioRawRows`) so `Last 12/6/3 Months` always has cross-year data.
- [x] **CH-2** — Improved all-time raw-row fetch throughput: increased `fetchAllRowsParallel` batch size from `1000` to `5000` in `useDataStudioRawRows`.
- [x] **CH-3** — Updated default chart range to `This Year` and decoupled chart anchor from global date filter (`chartAnchorDate` now uses current date), so chart ranges are always relative to today.
- [x] **CH-4** — Added `This Month` chart range and daily granularity support for overview + channel charts.
- [x] **CH-5** — Added chart KPI metric dropdown (before time range dropdown) with base + derived KPI options: Revenue, Impressions, Clicks, Cost, Bookings, CTR, Conversion Rate, CPC, AOV, ROAS, Cost of Sale.
- [x] **CH-6** — Reworked raw-row chart aggregation to compute chart values for selected KPI (including derived formulas) per bucket; overview and channel charts now both read from the same metric-aware pipeline.

**Verification:** `npm run build` ✅ (exit 0)

### Refresh blank page hotfix (2026-03-19)

- [x] **RB-1** — Fixed runtime crash in `useChannelMetrics`: removed stale `dynamicChannelTotals` dependency reference left after refactor.
- [x] **RB-2** — Eliminated stale dual-totals callback path: removed `onTotalsChange`/`setBreakdownTotals` usage from `ChannelTab` and removed leftover `onTotalsChange` effect block from `BreakdownTableSection`.
- [x] **RB-3** — End-to-end refresh path stabilized for Data Studio tabs (overview + channel breakdown rendering no longer references deleted state callbacks).

**Verification:** `npm run build` ✅ (exit 0), `npm run lint` ✅ (0 errors, warnings only).

---

### Project doc planner — Next steps implemented (2026-03-19)

- [x] **NS-2** — debug.ts → `src/lib/utils/retry.ts` + `src/lib/utils/dimensionFilter.ts`; deleted debug.ts.
- [x] **NS-3** — ForecastingPage verified in use (ForecastingDashboard).
- [x] **NS-4** — resync-dimensions logic moved to `resync-all-dimensions/resyncReportDataSources.ts`; resync-dimensions.ts re-exports.
- [x] **NS-5** — useDataSourceHeaders, ViewDataModal, EditDataSourceModal now use `@/lib/data-sources` for extractSpreadsheetId, fetchGoogleSheetsData, DataSource.

**Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors).

---

### Refactor Phase 1 + Cleanup (2026-03-19)

Per `docs/REFACTOR.md` and refactor skill:

- [x] **RF-1** — Phase 1 Audit: populated REFACTOR.md §2 (routes, systems, duplicate mapping, issues) and §3 (target architecture).
- [x] **RF-2** — Removed dead code: `src/components/slides/FilterControls.tsx`, `src/components/DataStudioDropdowns.tsx` (no imports; Verify → Delete).
- [x] **RF-3** — Progress: Phase 1 marked complete; Phase 4 cleanup (two files) executed; build + lint pass.

**Next:** Phase 2 (Canonical Definition) or further Phase 4 cleanup as needed. See `docs/REFACTOR.md` Progress Tracker.

---

### Dark mode toggle (2026-03-19)

- [x] **DM-1** — Added `ThemeProvider` and `useTheme` in `src/lib/theme.tsx`; theme persisted to `localStorage` (`roomstay-theme`), applied via `document.documentElement.classList` (`dark`).
- [x] **DM-2** — Real dark mode CSS variables in `src/index.css` (`.dark`: dark backgrounds, light text, same hierarchy).
- [x] **DM-3** — Inline script in `index.html` to apply saved theme before React hydrate (no flash).
- [x] **DM-4** — `ThemeToggle` component (Sun/Moon icon, tooltip); added to SlideViewHeader, Auth, Integrations, NotFound, SharedReport.
- [x] **DM-5** — README: theme policy updated for light/dark toggle.

**Verification:** Run `npm run build` and `npm run lint`.

---

### Design system refactor (2026-03-19)

Refactored UI to follow `docs/DESIGN_SYSTEM_RULES.md`: tokens only, no decorative shadows.

- [x] **DSR-1** — Replaced hardcoded colors with design tokens: `text-green-600`/`text-red-600` → `text-success`/`text-destructive` (OverviewTab, BudgetTab, TableBody, TableRow, DataSourcesPage, DimensionSelectorGroup, BreakdownTableSection, useKPICards, RefreshStepIndicator).
- [x] **DSR-2** — Replaced `bg-white`/`border-gray-*`/`bg-gray-*`/`text-gray-*` with `bg-card`/`bg-popover`/`bg-muted`/`border-border`/`text-muted-foreground` (DimensionModal dropdown, Integrations, NotFound, KPISettingsModal).
- [x] **DSR-3** — SlideDataBrowser channel pills: `bg-primary/10 text-primary`, `bg-success/10 text-success`, `bg-muted text-muted-foreground`.
- [x] **DSR-4** — Removed decorative shadows from cards and layout (PerformanceTable Card, KPIChart Cards, LoadingToast, SlideViewPage fixed bar, TableHeader date tab).
- [x] **DSR-5** — README: design rules now reference `docs/DESIGN_SYSTEM_RULES.md` as visual source of truth.

**Verification:** Run `npm run build` and `npm run lint` after changes.

---

### Hard refresh and metasearch cost (direct Supabase fix) (2026-03-19)

When metasearch Cost shows only part of the total (e.g. 343 instead of ~1.3k):

- [x] **HR-1** — **Recommended:** Run a **Full Refresh** from the app (Data Studio → Refresh Data → Full Refresh → Start Refresh). This clears `dimension_data` and re-syncs from sources so Cost is written with the correct account-scoped dimension ID. See `docs/HARD_REFRESH_AND_METASEARCH_COST.md`.
- [x] **HR-2** — **Optional (direct DB):** Added `supabase/scripts/fix_metasearch_cost_dimension_data.sql` to normalize Cost in `dimension_data`. Run via Supabase MCP (`execute_sql`), Dashboard SQL Editor, or `npm run fix:metasearch-cost` when linked. See `docs/HARD_REFRESH_AND_METASEARCH_COST.md` and `docs/MCP_SUPABASE.md`.

**Verification:** After full refresh or running the SQL script, reload Data Studio; metasearch Cost should show the full total. (Frontend already builds the dimension map from all rows — MS-1/MS-2 — so once data uses the correct Cost key(s), aggregation is correct.)

### Supabase MCP (linked project) (2026-03-19)

- [x] **MCP-1** — Added `docs/MCP_SUPABASE.md`: how to use the Supabase MCP when the project is linked (execute SQL, deploy Edge Functions, list tables/migrations, advisors, branches). Option B (metasearch cost fix) can be run via MCP `execute_sql`.
- [x] **MCP-2** — Ran Option B fix via MCP `execute_sql` against the linked database. README and HARD_REFRESH doc updated to reference MCP.

### Data source dedupe + single sync path (2026-03-19)

- [x] **DS-1** — Added `supabase/scripts/dedupe_data_sources.sql`: for each (report_id, source_type) keeps the row with latest `updated_at`, deletes the rest (CASCADE removes their dimension_data). Run in SQL Editor or via MCP when a report has duplicate CSV/Sheets sources (e.g. metasearch).
- [x] **DS-2** — EditDataSourceModal "Save and sync" now uses `runRefreshWorkflow` instead of `syncDataSource` (sync-utils). Single canonical path: run-refresh-workflow → resync-data-source. accountId resolved from prop or from reports.account_id.

**Verification:** `npm run build` and `npm run lint` after changes.

---

### Data Studio cache removed — always fresh data (2026-03-19)

Backend metasearch cost data was correct (single Cost key, 57,997 rows); wrong KPI (e.g. 343) was from stale React Query cache.

- [x] **DC-1** — `useDataStudioRawRows`: `gcTime: 0`, `refetchOnMount: true`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`. No retention of raw rows; Data Studio always fetches fresh on mount and when returning to tab.
- [x] **DC-2** — `useCachedSourceData`: `staleTime: 0`, `gcTime: 0`, `refetchOnMount: true`, `refetchOnWindowFocus: true`. Table/charts/filters that use this hook no longer see stale cached dimension_data.
- [x] **DC-3** — README: Data Studio raw rows described as no long-lived cache.

---

### Metasearch cost showing ~300 instead of ~1.3k (QA fix 2026-03-19)

**Root cause:** The dimension map used for aggregating Cost (and other KPIs) was built from only the **first 20 rows** (RPC path) or **first 200 rows** (all-time path). When a report has **multiple data sources** for the same channel (e.g. metasearch), each data source can use different dimension IDs (e.g. different Cost dimension IDs). Rows from the second data source only appear later in the result set. The small sample never saw those dimension IDs, so `buildMetricNameToIdsMap` / `getMetricKeys('cost')` only returned the Cost ID from the first source. Aggregation therefore only summed cost from rows keyed by that ID, under-counting (e.g. ~300 from one source, missing ~1k from the other).

**Fix applied:**
- [x] **MS-1** — `useDataStudioRawRows.ts` (RPC path): after fetching the full year via `fetchByDateRpc`, rebuild the dimension map from **all** fetched rows (collect every dimension ID from every row, then `buildDimensionNameMap`). This ensures Cost (and all metrics) from every data source are included in the map and aggregated.
- [x] **MS-2** — `useDataStudioRawRows.ts` (all-time path): build dimension map from **all** `cachedRows` instead of the first 200.

**Verification:** `npm run build` ✅. After deploy, metasearch "this month" Cost should reflect the full total (~1.3k) when the report has multiple data sources.

---

### Dimension ID alignment fix (2026-03-18)

Root cause: `slide_report.configuration` was saved with **global** dimension IDs but `dimension_data` rows use **account-scoped** dimension IDs. Fixed by:

- [x] **DIM-1** — Updated `loadAvailableDimensions` in `SlideViewPage.tsx` to fetch account-scoped dimensions first (account > global precedence), matching the canonical `dimensionLoader.ts` rule. The modal Step 2 (Value Dimensions) now shows account-scoped IDs.
- [x] **DIM-2** — Updated `loadBreakdownDimensionsForChannel` to query account-scoped text dimensions directly (primary path), falling back to `column_mappings` only if no account dims found. Modal Step 4 now shows dimensions.
- [x] **DIM-3** — Updated both `slide_reports` rows for `performance@dijitally.com` (account `3998a594`) via SQL to use account-scoped dimension IDs in `selectedValueDimensionIds`, `breakdownConfigs`, `filterConfigs`, and `channelConfigs.dimensionId`.

**Dimension mapping applied (account `3998a594-c07c-46b2-937d-fe477b6e9ce7`):**

| KPI | Account-scoped ID |
|-----|-------------------|
| Impressions | `89c229d9-8a6e-4d94-a0d2-a4b43b6f3fe1` |
| Clicks | `1caad3eb-3d5e-405c-9df7-1c96971171c5` |
| Cost | `fb281b3f-c800-48f4-b34b-02d4f0244b07` |
| Revenue | `7f4cb2e9-52a3-4110-803a-58d2e7afacb5` |
| Bookings | `79aeb7f7-a9c6-43cd-bd05-ff7df81babf1` |
| CPC | `8962dff5-bb0f-4ab1-ace7-e5dc5eb4fdcc` |
| Cost of sale | `3486d423-f75c-402e-8fb2-285b6e7e22ec` |
| CTR | `ff046f06-10ee-4420-a02f-d4089e5f75a6` |
| ROAS | `9f49f7f5-0081-478d-b6d7-8decf260a390` |
| Impression Share | `bfde7232-89ab-46ba-80ed-015a4d73bae5` |

**Breakdown/Filter dims per channel:**
- Metasearch: Hotel, Link Type, Channel, Market, Device
- SEM: Account, Campaign
- Social: Account, Campaign, Ad Group

**Verification:** `npm run build` ✅, data in `dimension_data` confirmed (Metasearch 57,997 rows, SEM 48,581, Social 26,986, all synced Mar 18 2026)

---

### Date filter UX improvements (2026-03-18)

- [x] **DF-1** — Removed `reportId` URL param from `useSlideReportPage`.
- [x] **DF-2** — Added `customDateRange` state to `SlideViewPage`.
- [x] **DF-3** — Extended `monthUtils.ts` with date range helpers.
- [x] **DF-4** — Updated `FiltersRow` with expanded preset list.
- [x] **DF-5** — `useFilteredSlideData` and `useSlideReportPage` use `customDateRange`.
- [x] **DF-6** — `UnifiedBreakdownTable` and `ChannelTab` use `customDateRange`.
- [x] **DF-7** — Calendar shows 2 months side-by-side.

**Verification:** `npm run build` ✅, `npm run lint` ✅

---

### Dimension settings UI (2026-03-18)

- [x] **UI-1** — Added minimalist 3-dots settings control to configure:
  - filter dimensions per channel (which filter dropdowns show)
  - breakdown dimensions per channel (which dimensions are available for Group by / Breakdown by)
  Settings persist to `slide_reports.configuration` via `updateSlideReport`.

**Verification:** `npm run lint` ✅

---

### Breakdown Analysis table fix (2026-03-18)

- [x] **BD-1** — Fixed "Data Studio" `slide_report.configuration` for Roomstay account (`ce7528cc`): replaced global dimension IDs with account-scoped IDs in `breakdownConfigs`, `filterConfigs`, `channelConfigs`, and `selectedValueDimensionIds`. Root cause: config was saved with global IDs but `dimension_data` rows are keyed by account-scoped IDs.
- [x] **BD-2** — Made `groupByDimension` / `breakdownByDimension` per-channel (was a single shared string). New state: `Record<channel, string>` with smart defaults — `metasearch → hotel`, `sem → account`, `social → account`.
- [x] **BD-3** — Updated `BreakdownTableSection` auto-select logic: resolves dimension name hints (e.g. `'hotel'`, `'account'`) to actual IDs using case-insensitive name match before falling back to `availableDimensions[0]`.
- [x] **BD-4** — Moved `DEFAULT_GROUPBY` / `DEFAULT_BREAKDOWNBY` constants outside the component to avoid re-creation on every render.

**Account-scoped dimension IDs used (Roomstay `3998a594`):**
- Hotel: `093ac487-dd90-4466-9972-ac51d110e91e`
- Account: `277ec940-a91b-4c95-b1e2-4a8fd5814d04`
- Campaign: `745b7d51-76be-4042-bc88-790fc53de865`
- Link Type: `6c553ea6-e3bb-4946-bb56-069d39a3c5c0`
- Channel: `970c0d99-7ec4-48db-893c-15957122b9cc`
- Market: `febc1239-37e9-47db-bccc-77763d95c598`
- Device: `6955d48a-0425-48f6-b77a-31aa11dc8eb3`
- Ad Group: `b864ad95-3b65-4610-a8ef-cba9cebabf5b`

**Verification:** `npm run build` ✅ exit 0

---

### End-to-end reports / blank page fix (2026-03-18)

- [x] **E2E-1** — Auto-create Data Studio `slide_report` when account has data sources but no slide report: in `useSlideReportPage`, when `slide_reports` list is empty and `accountReportIds` has at least one channel, create a "Data Studio" slide report and set `slideReportId` so the report page is never blank.
- [x] **E2E-2** — Loading and empty states in `SlideViewPage`: show full-screen "Loading your account…" when `isResolvingAccount`; show "No account" card when user is logged in but has no account; show "Setting up Data Studio…" when report is being auto-created; show "Get started" + link to Data Sources when account has no data sources (so no report is created).

**Verification:** `npm run build` ✅ (exit 0)

---

### Breakdown Analysis: Group by / settings not showing or saving (2026-03-18)

- [x] **BA-1** — Load breakdown dimensions when switching to a channel tab: effect now includes `selectedTab` so SEM/Social/Metasearch tab loads its breakdown dimensions even if not in `selectedChannels` yet.
- [x] **BA-2** — Fallback when saved config IDs don’t match loaded dimensions: if `breakdownConfigs[channel].breakdownDimensionIds` has IDs but `breakdownDimensions[channel]` doesn’t (e.g. scope mismatch), fetch those dimensions by ID from `dimensions` and merge so Group by / Breakdown by dropdowns get options.
- [x] **BA-3** — Dimension Settings Apply feedback: success toast when settings are saved, destructive toast on failure.
- [x] **BA-4** — ChannelTab empty state: message updated to “Use the ⋯ menu above to choose which dimensions are available for Group by / Breakdown by.” (no longer references Edit Source).

**Verification:** `npm run build` ✅ (exit 0)

---

### Remove channel filters + fix breakdown table data (2026-03-18)

- [x] **RF-1** — Channel filter dropdowns (FILTER: …) removed from FiltersRow; they were not working reliably (disabled via `false &&` so they no longer render). View selector and date range remain.
- [x] **RF-2** — Breakdown table now resolves Group by / Breakdown by from raw rows correctly: raw rows are keyed by dimension **ID** (UUID); added `getDimensionValueFromRow()` to look up by ID then by dimension name via `dimensionMap`, and resolve group/breakdown dimension by name (case-insensitive) when only a name hint is passed so the table shows data instead of "No breakdown data available".

**Verification:** `npm run build` ✅ (exit 0)

---

### Blank report tabs fix (2026-03-18)

- [x] **TAB-1** — OverviewTab and ChannelTab were requiring `slideReport?.pivot_data` to show content; after refactor data comes from `dimension_data` (effectivePivotData), so pivot_data can be null and tabs stayed in skeleton/blank. Fixed by: show content when report is loaded and not loading (`isSlideReportsLoading` / `isLoadingData` only); show KPIs when `slideReportId && slideReport` (render with zeros if no data). Chart skeleton condition in OverviewTab updated to drop `!slideReport?.pivot_data`.

**Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors)

---

### Breakdown dimension channel filtering — definitive fix (2026-03-19)

Root cause analysis: three separate paths were bypassing the channel filter, causing cross-channel dims (e.g. Hotel/Channel in SEM, Ad Group in Metasearch) to appear in the Group by / Breakdown by dropdowns.

- [x] **BDF-4** — `ChannelTab.tsx`: removed dual read path (`slideReport.configuration.breakdownConfigs` vs local `breakdownConfigs`). Now reads only from local `breakdownConfigs` prop (already synced from DB). Removed the intersection with raw DB config IDs that was the primary source of cross-channel leakage. Falls back to showing all channel-valid dims when no IDs are configured yet (prevents blank table on first load).
- [x] **BDF-5** — `SlideViewPage.tsx`: `breakdownDimensions` prop passed to `ChannelTab` is now pre-filtered at the prop boundary — each channel's dim list is filtered by `CHANNEL_DIMENSION_NAMES[channel]` before being passed. This is the final defense-in-depth guard regardless of what's in state.

**Verification:** `npm run build` ✅ exit 0

---

### Breakdown dimension channel filtering — complete fix (2026-03-19)

- [x] **BDF-1** — Moved `CHANNEL_DIMENSION_NAMES` to module scope (outside component) so it can be referenced by all effects including the auto-config initializer.
- [x] **BDF-2** — Fixed BA-2 fallback `useEffect` (lines ~2002): when fetching missing dimension IDs from saved `breakdownConfigs`, now filters fetched dims by `CHANNEL_DIMENSION_NAMES[channel]` before merging into state. Previously this path bypassed channel filtering and re-introduced cross-channel dims (e.g. "Ad Group" in metasearch) even after the primary load was fixed.
- [x] **BDF-3** — Fixed auto-config initializer (runs on first load when no saved config): was setting the same flat `breakdownDimIds` for all channels. Now computes per-channel `channelTextDimIds` filtered by `CHANNEL_DIMENSION_NAMES[ch]` so initial config is already channel-correct.

**Canonical dimension sets:**
- metasearch → `[Hotel, Channel, Device, Link Type, Market]`
- sem → `[Account, Campaign, Ad Group]`
- social → `[Account, Campaign, Ad Group]`

**Verification:** `npm run build` ✅ exit 0

---

### Refresh audit & row count display (2026-03-19)

- [x] **RA-1** — `run-refresh-workflow` now collects `rowsProcessed` from each `resync-data-source` response and returns `rowsProcessed: totalRowsProcessed` in its own response. Previously the per-source row count was silently discarded.
- [x] **RA-2** — `RunRefreshWorkflowResult` type in `refreshWorkflow.ts` extended with `rowsProcessed?: number`.
- [x] **RA-3** — `SlideViewPage` captures the workflow result and stores `rowsProcessed` in `refreshRowsProcessed` state, passed to `RefreshDataModal`.
- [x] **RA-4** — `RefreshDataModal` success message now shows row count: "X rows imported (last 2 months)" or "X rows imported".
- [x] **RA-5** — `RefreshDataModal` cleaned up: React import moved to top, mode reset on re-open, duplicate `isDataStudio` mode label unified.

**Deployed:** `run-refresh-workflow` v6.

**Verification:** `npm run build` ✅ (exit 0)

---

### Refresh mode selection (2026-03-19)

Added two refresh modes to the refresh workflow:

- [x] **RM-1** — `resync-data-source` edge function: added `refreshMode: 'full' | 'recent'` param. `full` = delete all rows + re-insert everything (existing behavior). `recent` = delete only rows from the last 2 months (by date dimension), then re-insert only those rows. Older historical data is preserved.
- [x] **RM-2** — `run-refresh-workflow` edge function: accepts and forwards `refreshMode` to each `resync-data-source` call.
- [x] **RM-3** — `src/lib/refreshWorkflow.ts`: added `refreshMode?: 'full' | 'recent'` to `RunRefreshWorkflowParams`.
- [x] **RM-4** — `RefreshDataModal`: redesigned with a mode selection step (step 0) before refresh starts. User picks "Last 2 Months" (default) or "Full Refresh". Modal shows mode label during progress. "Close (runs in background)" button shown while running.
- [x] **RM-5** — `SlideViewPage`: added `activeRefreshMode` state, `handleStartRefresh(mode)` callback. Modal opens in selection mode; refresh only starts when user clicks "Start Refresh".

**Deployed:** `run-refresh-workflow` v5, `resync-data-source` v210.

**Verification:** `npm run build` ✅ (exit 0), no lint errors.

---

### Metasearch sync — erase and replace (2026-03-19)

Root cause: refresh was run with `clearFirst: false`, so `dimension_data` was never cleared before resync. Each `resync-data-source` only deletes rows by `data_source_id`; if a channel had multiple data sources or stale rows from a previous sync, the report showed duplicate or outdated data (e.g. March cost 1362 not updating after sync).

- [x] **MS-1** — Set `clearFirst: true` in `SlideViewPage` when calling `runRefreshWorkflow` (Data Studio "Refresh Data").
- [x] **MS-2** — Set `clearFirst: true` in `DataSourcesPage` when syncing a data source. Workflow clears all `dimension_data` for the target report(s) first, then resyncs each source — full erase-then-replace.
- [x] **MS-3** — Fixed `useDataStudioRawRows`: removed use of undefined `selectedMonth` in `fetchChannelRows` call and console.log.

**Verification:** `npm run build` ✅ (exit 0).

---

### Refactor plan doc audit (2026-03-19)

- [x] **REFACTOR.md** audited and updated: routes section aligned with README; Phase 7 deferred items (7-F5, 7-DB2) corrected; Database section updated (Phase 9 dropped tables, legacy EFs); Refresh workflow subsection and row-count flow documented; Remaining work (NS-1–NS-5) added; Master TODO E/F/G/H marked complete; 2026-03-19 execution log entry for refresh modes + row count.

### Full refresh + metasearch 0 cost + clear step (2026-03-19)

- [x] **FR-1** — **Full refresh:** Workflow already clears all `dimension_data` for target report(s) then resyncs every data source. When user selects "Full Refresh", `refreshMode: 'full'` is passed; `resync-data-source` fetches all rows from each sheet. No code change; confirmed behavior.
- [x] **FR-2** — **Clear step in UI:** Added explicit Step 1 "Clearing and resetting data" in `RefreshDataModal` (Data Studio). Step 2 = Fetching from sources, Step 3 = Updating cache. `SlideViewPage` sets `refreshStepStatus[0]` so the clear step shows loading/complete.
- [x] **FR-3** — **Metasearch 0 cost (Supabase/resync):** In `resync-data-source` `buildDimensionMappingWithAutoDetection`, when a column's stored `dimensionId` pointed at a dimension that was just deleted by `deleteCustomDimensions` (full mode), the dimension name lookup failed and the column (e.g. Cost) was not re-mapped, so no cost was written. Fixed by: (1) if dimension-by-ID lookup returns no name but mapping has dimensionId, use `mapping.column` as dimension name and resolve (account-scoped); (2) final fallback: resolve by `mapping.column.trim()` so headers like "Cost" map to account Cost dimension. Ensures Cost/Revenue etc. are written after full resync for all channels.
- [x] **FR-4** — **Workflow audit:** Added `docs/REFRESH_WORKFLOW_AUDIT.md` listing shared workflow for SEM, Social, Metasearch and the gap (deleted dimension ID in mappings). No structural difference between channels; fix in dimension resolution applies to all.

**Verification:** `npm run build` ✅ (exit 0).

---

### Post-refresh report reload (cache / stale KPIs) (2026-03-19)

- [x] **RL-1** — After Data Studio refresh completed we only invalidated React Query caches; the report could still show stale data (e.g. Metasearch Cost $0) until next refetch. Refactored so we **await** a single `queryClient.refetchQueries({ queryKey: ['data-studio-raw-rows'] })` before marking "Updating cache & interface" complete. KPIs and charts both derive from that query; one refetch repopulates the report. Documented in `docs/REFACTOR.md` (Refresh workflow — "Post-refresh report reload").

**Verification:** `npm run build` ✅ (exit 0).

---

### Metasearch Cost/CPC zero — header synonym resolution (2026-03-19)

- [x] **MC-1** — In `resync-data-source` `utils/dimensions.ts`: added `COLUMN_HEADER_TO_STANDARD` (Spend/Amount spent → Cost, etc.) and `getStandardDimensionNameForHeader(header)` so sheet columns named "Spend" or "cost" resolve to the account "Cost" dimension. When dimension-by-ID fails we use `standardName || header`; in the final fallback we try header, then standard synonym, then title-case. Aligned with frontend `buildMetricNameToIdsMap` variations. Documented in `docs/REFACTOR.md` and `docs/REFRESH_WORKFLOW_AUDIT.md`.

**Verification:** `npm run build` ✅ (exit 0). Deploy `resync-data-source` edge function and run Full Refresh to verify Cost/CPC for Metasearch.

---

### Refactor / Unify (plan only — see docs/REFACTOR_UNIFY_PLAN.md)

- [x] **UNIFY-B** — Unify view storage: all code uses `views` only; remove `report_views` / `slide_report_views` references and query keys.
- [x] **UNIFY-C** — Single sync path: migrate any remaining `syncDataSource` callers to `runRefreshWorkflow`; remove or stub in sync-utils.
- [x] **UNIFY-D** — Run dedupe script, then add unique constraint on `data_sources(report_id, source_type)`.
- [x] **UNIFY-A** — Document report identity; added `reports.channel` and backfilled.

Full plan, brief fixes, and new-table/migration notes: **docs/REFACTOR_UNIFY_PLAN.md**.

---

### Dead code removal — hooks (2026-03-19)

- [x] **DC-4** — Deleted unused hooks: `useDimensionSelector.ts`, `useMonthlyDataFiltering.ts`, `useDimensionOperations.ts`, `useDimensionGranularities.ts`, `useDimensionFilters.ts`, `useSlideViewFilters.ts` (all completely orphaned, no imports).

**Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors).

---

### Unified view filters — breakdown & chart alignment (2026-03-20)

Root cause: saved view filters (e.g. Brady view filtering by Hotel) were not applied to breakdown tables or charts. Three separate issues:
1. `BreakdownTableSection` disabled dimension filters on the overview tab (`selectedChannel !== 'overview'` guard).
2. `BreakdownTableSection` called `filterRawDataRows` without the merged dimension-name map, so global/configured filter UUIDs could not resolve to report-specific row keys.
3. `chartDataCalculations.ts` also called `filterRawDataRows` without the merged dimension-name map.
4. `handleApplyView` did not reset chart time range and tab when switching to master view, leaving stale visual state.

- [x] **UVF-1** — `BreakdownTableSection`: removed `selectedChannel !== 'overview'` guard. Each channel's filters now apply independently via per-channel `hasActiveFiltersForChannel` check. Overview breakdown aggregates filtered rows from all channels.
- [x] **UVF-2** — `BreakdownTableSection`: added `configuredDimensionNames` prop. All `filterRawDataRows` calls now receive `combinedDimNames` (`dimensionMap + configuredDimensionNames`) for proper global-ID → row-key resolution.
- [x] **UVF-3** — `chartDataCalculations.ts`: `processOverviewChartData` and `processChannelChartData` accept `configuredDimensionNames` and pass to `filterRawDataRows`.
- [x] **UVF-4** — `useChartData.ts`: all chart hooks thread `configuredDimensionNames` through.
- [x] **UVF-5** — `ChannelTab.tsx`: accepts and passes `configuredDimensionNames` to `UnifiedBreakdownTable`.
- [x] **UVF-6** — `SlideViewPage.tsx`: passes `configuredDimensionNames` to chart hooks and `ChannelTab`.
- [x] **UVF-7** — `handleApplyView`: master reset now resets `chartTimeRange` to `'last_6_months'`, `priceCheckChartTimeRange` to `'last_6_months'`, and `selectedTab` to `'overview'`.
- [x] **UVF-8** — Added 7 regression tests to `slideViewHelpers.test.ts` for `filterRawDataRows`: direct ID filtering, global-ID resolution via `dimensionIdToName`, date range, combined filters, empty filters, exclude-all, and AND logic across multiple dimensions.

**Verification:** `npx tsc --noEmit` ✅ (0 errors), `npm run build` ✅ (exit 0), `vitest run slideViewHelpers.test.ts` ✅ (27/27), `vitest run monthUtils.test.ts` ✅ (17/17).

---

### Top filter options scoped to active view filters (2026-03-20)

Root cause: the top inline filter dropdown options were derived from all raw rows in the selected channel. Even when a saved view (e.g. Brady) was applied and data/table were filtered, the hotel dropdown still showed the full unfiltered hotel list.

- [x] **UVF-9** — `useDataStudioFilters.ts`: filter option derivation now scopes rows with `filterRawDataRows` using:
  - active **other** filter dimensions for that channel (excluding the dimension currently being rendered),
  - active date scope (`customDateRange` or `selectedYear`/`selectedMonth`),
  - merged dimension name map (`dimensionMap + configuredDimensionNames`) for global ID resolution.
- [x] **UVF-10** — Kept the canonical single-path architecture: no new state pathway added; top filter options now follow the same filter scope as KPI cards and breakdown table data.
- [x] **UVF-11** — Regression fix after first UVF-9 rollout: empty-array selections in inline filter UI represent “All” mode and must not be treated as hard filters when deriving options. Reworked option derivation to normalize out empty arrays and self-filter exclusion (`dimId` excluded) so data no longer collapses to zero while options still remain view-scoped.
- [x] **UVF-12** — Root-cause fix in canonical filter engine (`slideViewHelpers.ts`): aligned filter semantics with UI by treating empty arrays as “All / no filter” in both `hasActiveFiltersForChannel` and `filterRawDataRows`. This prevents zero-data states when view/filter payloads contain `[]`.

**Verification:** `npx tsc --noEmit` ✅ (0 errors), `npm run build` ✅ (exit 0), `vitest run src/lib/__tests__/slideViewHelpers.test.ts` ✅ (27/27), `ReadLints` on `useDataStudioFilters.ts` ✅ (no errors).

---

### AOV (Average Order Value) KPI (2026-03-20)

Added AOV as a computed derived metric (Revenue / Bookings) across the entire system.

- [x] **AOV-1** — Extended `DerivedMetrics` type with `aov: number` in `src/types/slideView.ts`.
- [x] **AOV-2** — Computed AOV in `calculateDerivedMetrics` (`src/lib/slideViewHelpers.ts`): `bookings > 0 ? revenue / bookings : 0`.
- [x] **AOV-3** — Added AOV card before Revenue in `useKPICards` and `useReportKPICards` (`src/hooks/useKPICards.ts`).
- [x] **AOV-4** — Added AOV to `KPIMetricsCards` (`src/components/KPIMetricsCards.tsx`): formula metric, default KPI list, derived calculation, display formatting.
- [x] **AOV-5** — Added AOV column before Revenue in `BreakdownTableSection` (`src/components/slides/BreakdownTableSection.tsx`): header, data rows, expanded rows, totals row.
- [x] **AOV-6** — Updated `SlideViewPage.renderKPICards` to format AOV with 2 decimal places.
- [x] **AOV-7** — Removed OverviewTab's inline KPI card array exception; Overview now always renders the canonical `KPI_CARDS` from `useKPICards` (includes AOV) via `renderKPICards`, so AOV appears in the overview main KPI section with the same ordering/format pipeline as channel tabs.

**Verification:** `npx tsc --noEmit` ✅ (0 errors), `npm run build` ✅ (exit 0), `npm run lint` ✅ (0 errors, warnings only).

---

### Filter system rebuild (2026-03-20)

- [x] **FLT-1** — Created `src/hooks/useDataStudioFilters.ts`: canonical owner of all Data Studio filter state (`filterValues`, `customDateRange`, `comparisonType`, `filterConfigs`, `filterPanelOpen`). Options derived in-memory from `rawDataRows` only — no DB or pivot fallback. Supports externally-controlled state to avoid circular dependency with `useSlideReportPage`.
- [x] **FLT-2** — Created `src/components/slides/FilterPanel.tsx`: sliding Sheet UI for filter dropdowns. Per-channel multi-select with search, active count badge, clear-all. No async loading — receives options via props.
- [x] **FLT-3** — Rewired `SlideViewPage`: removed ~200 lines of fragmented filter state and loading logic (`filterDimensionValues`, `pendingFilterValues`, `filterSearchTerms`, `openFilterPopovers`, `filterDimensionNames`, `loadFilterDimensionValues`, `loadFilterDimensionValuesAfterSave`, two loading `useEffect` blocks). Wired `dsFilters` as canonical state; `handleApplyView` delegates to `dsFilters.applyView`; `FilterPanel` rendered in JSX.
- [x] **FLT-4** — Updated `FiltersRow`: accepts `activeFilterCount` prop, shows badge + highlights Filters button when active. Removed unused dead imports.

**Verification:** `npx tsc --noEmit` ✅ (0 errors).

---

### Column mapping — Filter & Breakdown inline (2026-03-20)

Moved Filter and Breakdown configuration out of the "Report Settings" wizard and into the column mapping modal directly on Data Sources.

- [x] **CM-1** — `ColumnMapping` type extended with `isFilter?: boolean` and `isBreakdown?: boolean` in `src/lib/data-sources/types.ts`.
- [x] **CM-2** — `ColumnMappingStep.tsx` redesigned: added **Filter** and **Breakdown** checkbox columns to the mapping table. Only text-type dimensions can be checked. Dimension type badge shown inline. Summary badges at top show active filter/breakdown count.
- [x] **CM-3** — `EditMappingModal.tsx` rewritten: loads `slide_reports.configuration` on open, enriches existing `column_mappings` with `isFilter`/`isBreakdown` from `filterConfigs`/`breakdownConfigs`. On save, writes both `data_sources.column_mappings` AND updates `slide_reports.configuration.filterConfigs` + `breakdownConfigs` to reflect the checkbox state. Improved header UX with description and settings note.
- [x] **CM-4** — `EditSourceModal` (Report Settings wizard) reduced from 5 steps to 3: removed Breakdown (step 4) and Filters (step 5). Info note on step 3 points users to the column mapping modal. `useEditSourceModal.handleNext` now saves on step 3. `SlideViewPage.handleNext` / `handleBack` simplified accordingly.
- [x] **CM-5** — `DataSourcesPage` actions updated: Settings icon opens `EditMappingModal` (column mappings with filter/breakdown inline). Ghost button style, cleaner action row.

**Verification:** `npx tsc --noEmit` ✅ (0 errors), `npm run build` ✅ (exit 0, 13.93s).

---

### Filter panel redesign — inline dropdowns + dimension toggle (2026-03-20)

- [x] **FP-1** — `FilterPanel.tsx` redesigned: left-side channel tabs (Metasearch / SEM / Social) with active-count badges; right panel split into two zones: **Filter dimensions** (checkbox list to activate/deactivate which dimensions appear as filter dropdowns) and **Apply filters** (value multi-select dropdowns for active dims). Replacing the old flat single-column Sheet.
- [x] **FP-2** — `FilterPanel` accepts two new props: `availableDimensions` (text dims per channel from `breakdownDimensions`) and `onToggleDimension` (calls existing `handleFilterDimensionToggle`). Toggling a checkbox updates `slide_reports.configuration.filterConfigs` immediately via `persistFilterConfigs`.
- [x] **FP-3** — `FiltersRow.tsx` redesigned: active filter dropdowns now render **inline next to the date range pill** (separated by a divider). New props: `filterConfigs`, `filterOptions`, `filterValues`, `dimensionNames`, `onToggleFilterValue`, `onClearFilter`. Dropdowns only appear when a dimension has available options derived from raw data rows.
- [x] **FP-4** — `SlideViewPage` wired: `FiltersRow` and `FilterPanel` both receive the new props. `availableDimensions` sourced from `breakdownDimensions` (text-only). No duplicate state introduced.

**Verification:** `npx tsc --noEmit` ✅ (0 errors), `npm run build` ✅ (exit 0, 18.89s).

---

### Date filter Apply fix (2026-03-20)

Root cause: `DateRangeFilter` mixed two state models — calendar clicks stayed in `pendingRange` (draft), but preset clicks and compare changes called parent callbacks immediately, bypassing the Apply button. The trigger label read committed props while the popover body showed draft state, so selecting new dates didn't update the label until the parent state changed. Additionally, `applyView` in `useDataStudioFilters` restored `selected_year`/`selected_month` without clearing or reconstructing `customDateRange`, so a stale custom range could override the view's date in both the label and filtering. `dateRangeToSlideSelection` returned `all/all` for ranges with only `from` (no `to`), which over-broadened fetch scope during transitions.

- [x] **DFA-1** — Refactored `DateRangeFilter.tsx`: all state (preset, custom range, compare toggle, compare type) now stays in local draft until Apply. `handlePresetClick` no longer calls `onDatePresetChange` immediately — it updates `pendingPreset` and derives `pendingRange` from `dateRangeFromPreset`. Compare toggle/type update `pendingCompareEnabled`/`pendingCompareType`. `handleApply` commits everything via a single `onApply` callback (or falls back to legacy individual callbacks for backward compat with `FiltersBar`/SharedReport).
- [x] **DFA-2** — Simplified `FiltersRow.tsx`: replaced four individual date/compare callbacks with a single `onDateApply` prop. `FiltersRow` no longer contains date-to-selection conversion logic — that responsibility moved to the page-level handler.
- [x] **DFA-3** — Added `handleDateApply` in `SlideViewPage.tsx` that commits via `dsFilters.setCustomDateRange` (canonical path which syncs `selectedYear`/`selectedMonth` via `dateRangeToSlideSelection`).
- [x] **DFA-4** — Fixed `useDataStudioFilters.applyView`: now reconstructs `customDateRange` from the view's `selected_year`/`selected_month` using `slideSelectionToDateRange`. Master reset now clears `customDateRange` to current month instead of leaving it stale.
- [x] **DFA-5** — Fixed `dateRangeToSlideSelection` in `monthUtils.ts`: a range with only `from` (no `to`) now maps to that single month instead of falling back to `all/all`.
- [x] **DFA-6** — Added `src/lib/__tests__/monthUtils.test.ts`: 17 regression tests covering partial ranges, multi-month (June–Dec) ranges, cross-year ranges, preset roundtrips, and slide selection conversions.

**Verification:** `npx tsc --noEmit` ✅ (0 errors), `npm run build` ✅ (exit 0, 10.38s), `vitest run monthUtils.test.ts` ✅ (17/17 pass). 2 pre-existing failures in `useFilteredSlideData.test.ts` (legacy pivot fallback tests, unrelated).

---

### Next steps

- [x] **NS-1** — Audit `run-refresh-workflow`: removed legacy `refresh-slide-report` branch; workflow now only resyncs data sources (no slide_report_* cache refresh). See REFACTOR.md Remaining work.
- [x] **NS-2** — Migrated `debug.ts`: `retryWithBackoff` → `src/lib/utils/retry.ts`, `filterDimensionsByFilterSettings` / `filterDimensionsByVisibility` → `src/lib/utils/dimensionFilter.ts`. Deleted `debug.ts`. KPIChart and FiltersBar updated.
- [x] **NS-3** — Verified `ForecastingPage.tsx`: used by `ForecastingDashboard` (not dead); keep.
- [x] **NS-4** — Consolidated resync: implementation moved to `src/lib/resync-all-dimensions/resyncReportDataSources.ts`; `resync-dimensions.ts` is now a re-export; `resync-all-dimensions.ts` imports from folder.
- [x] **NS-5** — Migrated callers off `sync-utils` for fetch/ID/types: `useDataSourceHeaders` → `extractSpreadsheetId` from `@/lib/data-sources`; `ViewDataModal` → `DataSource` from `@/lib/data-sources`; `EditDataSourceModal` → `extractSpreadsheetId`, `fetchGoogleSheetsData`, `DataSource` from `@/lib/data-sources`. `sync-utils.ts` retained for `syncDataSource`/`SyncOptions` until that flow is replaced by runRefreshWorkflow.

---

## Completed

### KPI metrics unification + single source of truth (2026-03-19)

Root cause: `useChannelMetrics` had a broken "no-filter fast path" that tried `channelData.monthly` / `channelData.yearly` / `channelData.current` — all always empty `{}` / zeros post-refactor since `effectivePivotData` only populates `rawDataRows`. Additionally, three separate inline metric extraction implementations used case-sensitive `metricNameToIdMap['Cost']` lookups that silently returned 0 when dimension names didn't match Title Case exactly. A second root cause was that `filterRawDataRows` excluded rows with no date field when a date range was applied, silently dropping data.

- [x] **KPI-1** — Added `aggregateRowsToMetrics(rows, dimensionMap)` to `src/lib/slideViewHelpers.ts` as the single canonical metric aggregation utility. Uses `buildMetricNameToIdsMap` + `getMetricKeys` — case-insensitive, handles all name variations (cost/spend/amount spent, etc.).
- [x] **KPI-2** — Rewrote `useChannelMetrics` `currentTotals` useMemo: `rawDataRows` is now the primary path for all channels (not a fallback). Removed the broken `monthly`/`yearly`/`current` fast path. All channels now go through the same code path via `aggregateChannelRows` helper.
- [x] **KPI-3** — Rewrote `useChannelMetrics` `comparisonTotals` useMemo: replaced all inline `metricNameToIdMap['Cost']` patterns with `aggregateRowsToMetrics`. Simplified from ~80 lines to ~20 lines.
- [x] **KPI-4** — Fixed `BreakdownTableSection`: replaced inline `metricNameToIdMap['Cost']` pattern with `aggregateRowsToMetrics`. Removed the manual `metricNameToIdMap` construction block.
- [x] **KPI-5** — Removed duplicate `comparisonTotals` useMemo from `SlideViewPage.tsx` that fell back to stale `channelData.previous_period` / `previous_year` blobs. `comparisonTotals` now comes exclusively from `useChannelMetrics` (rawDataRows-based, date-filtered).
- [x] **KPI-6** — Fixed `filterRawDataRows`: rows with no date field now pass through (included) instead of being excluded when a date range is applied. This prevents silent data loss for rows that don't have a date column.
- [x] **KPI-7** — Single source of truth: `currentTotals` (KPI cards) comes exclusively from `useFilteredSlideData → filteredData.channelTotals`. `useChannelMetrics` is used only for `comparisonTotals`.

**Verification:** `npm run build` ✅ (exit 0)

---

### Sync refactor & bug fixes (2026-03-19)

- [x] **SY-1** — Fixed metasearch breakdown data disappearing after sync: removed `breakdowns: {}` hardcode from `effectivePivotData` in `useSlideReportPage.ts` (both the `pivot_data=null` branch and the merge branch). The `BreakdownTableSection` primary path reads `rawDataRows` correctly; the `aggregateChannelTotalsFromBreakdowns` fallback in `useFilteredSlideData` is no longer blocked by an empty object.
- [x] **SY-2** — Replaced deprecated client-side `syncDataSource` (from `sync-utils.ts`) in `DataSourcesPage.tsx` with canonical server-side `runRefreshWorkflow`. Sync now runs through `run-refresh-workflow` → `resync-data-source` edge functions (same path as the "Refresh Data" button). React Query caches (`data-studio-raw-rows`, `cached-dimension-data`) are invalidated after sync.
- [x] **SY-3** — Added missing date presets to `monthUtils.ts`: `last_90_days`, `month_to_date`, `quarter_to_date`, `last_quarter`, `year_to_date` — both in `dateRangeFromPreset` and `derivePresetFromDateRange`. These presets were shown in `DateRangeFilter` but previously fell through to `undefined` (silently showing all data).

**Verification:** `npm run build` ✅ (exit 0, 8.26s)

---

### Looker Studio Refactor (2026-03-18)

Full cleanup of the codebase to a pure Looker Studio-style reporting dashboard — no AI, no legacy pivot caches, no duplicate systems.

**DB migrations applied:**
- [x] Dropped AI summary tables: `ai_summary_cards`, `ai_summary_budgets`, `ai_summary_forecasts`, `slide_report_summaries` (migration 20260318150000)
- [x] Created unified `views` table; backfilled from `report_views` + `slide_report_views`; repointed FKs (migration 20260318170000)
- [x] Dropped legacy tables: `report_views`, `slide_report_channel_*`, `slide_report_monthly_data`, `monthly_dimension_data`, `aggregated_breakdown_data`, `sheet_data` (migration 20260318180000)
- [x] Dropped `slide_report_views` (migration 20260318190000)
- [x] Dropped `report_api_data` (migration 20260318200000)

**Edge functions retired (folders deleted, removed from config.toml):**
- [x] `generate-ai-summary`, `get-ai-summary-data` — AI summary generation
- [x] `refresh-slide-report`, `refresh-slide-report-channel` — legacy pivot cache writers
- [x] `get-slide-report-data`, `get-slide-report-display-data` — legacy pivot cache readers
- [x] `get-consolidated-performance-data` — redundant with `get-performance-data`
- [x] `sync-report-api-data`, `get-report-api-data` — `report_api_data` cache (retired)
- [x] `apply-vlookup-mappings` — absorbed into `resync-data-source`
- [x] `migrate-sheet-data` — one-time migration; no longer needed
- [x] `clear-and-resync` — no active callers

**Frontend files deleted:**
- [x] Kanban/FeaturesBoard cluster (8 files): `FeaturesBoard.tsx`, `KanbanBoard.tsx`, `KanbanColumn.tsx`, `TaskCard.tsx`, `TaskDetailsModal.tsx`, `FeatureDetailBoard.tsx`, + 2 more
- [x] `src/lib/extractMinimalAIData.ts`, `src/lib/bidManagementAlgorithm.ts` — AI dead code
- [x] `src/lib/auth-fallback.ts`, `src/lib/auth-retry.ts` — unused auth utilities
- [x] `src/components/slides/SlideRenderer.tsx`, `src/components/slides/SlideCard.tsx` — dead slide components
- [x] `src/lib/slideReportPivotComputation.ts` (47KB) — legacy pivot engine
- [x] `src/lib/slideRefreshHelpers.ts` — legacy refresh helpers
- [x] `src/lib/data-loading-fix.ts` (22KB) — migrated `getCurrentMonthDateRange` to `monthUtils.ts`, `Dimension` type to `dimensionLoader.ts`
- [x] `src/hooks/useSlideReportDisplayData.ts` — inlined into `useSlideReportPage`
- [x] `src/types/slideReportDisplayApi.ts` — types for deleted hook

**Code migrations:**
- [x] `SharedReport.tsx` — migrated `slide_report_views` query to `views` table
- [x] `CreateShareLinkModal.tsx` — migrated `slide_report_views` query to `views` table
- [x] `get-performance-data` — removed `report_api_data` fast-path cache read
- [x] `auto-sync-data-sources` — removed `sync-report-api-data` call
- [x] `useSlideReportPage` — removed `useSlideReportDisplayData` (now uses `useFilteredSlideData` directly), removed `slide_report_monthly_data` query (table dropped), removed `useRefreshSlideReportData` (called deleted pivot computation)
- [x] `useSlideReports` — removed `useRefreshSlideReportData` export
- [x] `SlideViewPage` — removed `slideRefreshHelpers` import, removed `refreshSlideReportData` destructure, removed `slideReportPivotComputation` dynamic import

**Verification:** `npm run build` ✅ (exit 0, 6.96s)

---

### Dead code removal — pages not in router

- [x] **DC-1** — Deleted `SlidesPage.tsx` (not in router; zero imports).
- [ ] **DC-2** — **Not a dead page:** `ForecastingPage.tsx` is used by `ForecastingDashboard` (keep).
- [x] **DC-3** — Deleted `ReportDashboard.tsx` (not in router; zero imports).
- [x] **DC-4** — Deleted unused hooks: `useDimensionSelector.ts`, `useMonthlyDataFiltering.ts`, `useDimensionOperations.ts`, `useDimensionGranularities.ts`, `useDimensionFilters.ts`, `useSlideViewFilters.ts`.

---

### AI summary consolidation

- [x] **AI-1** — Confirmed `FormattedAISummary` has no imports in `src/` (safe to remove).
- [x] **AI-2** — Removed `FormattedAISummary.tsx` (canonical display is `AISummaryDisplay.tsx`).

---

### Phase 6-DB — Document dimension_data as single read path

- [x] **6-DB1** — Documented `dimension_data` as the single read path in `README.md` + `docs/REFACTOR.md`.
- [x] **6-DB2** — Verified canonical writer is `resync-data-source`.

---

### Phase 6 — Data source unification + canonical Data Studio fetch path

- [x] **6-F1** — Collapsed parallel data-fetch hooks into one canonical path.
- [x] **6-F2** — Removed `useSlideReportChannelData` from `useSlideReportPage`.
- [x] **6-F3** — Moved constants/utils from `useMetasearchJan2026RawRows.ts` to `src/lib/metasearchJan2026Utils.ts`.
- [x] **6-F4** — Confirmed `usePerformanceData` deleted.
- [x] **6-F5** — Deleted `CSVImportChoiceModal.tsx`, `DataSourcesListModal.tsx`, `MappingModal.tsx`.
- [x] **6-F6** — Removed `handleCreateBookingReport`, `handleCreatePriceCheckReport` from `DataSourcesPage`.

### Phase 5 — Cleanup

- [x] Deleted unused one-off repair scripts (6 files).
- [x] Deleted `CreateAccountModal`, `EditAccountModal`, `DeleteAccountDialog`, `migrate-to-account-dimensions.ts`.
- [x] Deleted `ReportsSidebarDemo.tsx`, `DevPage.tsx`.
- [x] Deleted `priceCheckDataRaw.ts`.
- [x] Deleted `MasterReportSetupModal.tsx`, `MasterReportSettingsModal.tsx`, `MasterReportTable.tsx`.
- [x] Deleted `SlideListItem.tsx`, `CreateSlideModal.tsx`, `CreateChildReportModal.tsx`.
- [x] Deleted `useSlides.ts`.
- [x] Deleted `ReportsEntry.tsx`, `DataSourcesEntry.tsx`, `DimensionsEntry.tsx`, `PriceWidgetEntry.tsx`, `ReportTool.tsx`, `ForecastingTool.tsx`.

### Phase 4 — Testing

- [x] Unit tests: dimension dedupe, KPI mapping.
- [x] Integration test: `reportView.integration.test.tsx`.
- [x] 49 tests passing.

### Phase 3 — Remove duplicate implementations

- [x] Deleted `PerformanceTable.old.tsx`, `PerformanceTable.refactored.tsx`, `usePerformanceTableDataFixed.ts`.
- [x] Standardized Apply/Cancel behavior.

### Phase 2 — Canonical dimension loading + view settings

- [x] `src/lib/dimensionLoader.ts` as single canonical dimension loading API.
- [x] `src/lib/performanceTable/viewSettingsMapper.ts` as canonical view settings mapper.

### Phase 1 — DB integrity + mapping references

- [x] `getAccountDefaultKPIs()` returns exact KPI names from available dimensions.
- [x] `resyncReportViews()` normalizes and repairs `kpi_order`.
- [x] Added `dimensions_unique_name_per_context` unique index.

### Phase A — Account removal + post-login index

- [x] `useUserAccount()` hook.
- [x] Removed account selector.

### Phase B — Single Data Studio

- [x] One "Data Studio" report per account.
- [x] Removed `brady` and `master-report` routes.
- [x] `slideType` always `'default'`.

### Layout redesign — Left sidebar + topbar for Data Studio (2026-03-18)

- [x] Created `src/components/slides/ReportSidebar.tsx`.
- [x] Rewrote `src/components/slides/SlideViewHeader.tsx`.
- [x] `SlideViewPage` layout restructured.
- [x] Extracted `FiltersRow` component.
- [x] Created `DateRangeFilter` component.
- [x] Created `src/lib/monthUtils.ts`.

### Design system — Light-only luxury minimalist theme (2026-03-18)

- [x] **DS-1 to DS-6** — HSL tokens, DM Sans font, light-only, date picker, minimalist primitives, `docs/DESIGN_SYSTEM.md`.

### Route simplification — Data Studio as homepage (2026-03-18)

- [x] `/` now renders `SlideViewPage` directly.
- [x] All legacy routes redirect to `/`.

---

## Blockers

_None currently._

---

## Verification baseline

### Filter panel bug fixes (2026-03-20)

- [x] **FIX-1** — "Filter settings saved" toast always popped on page load and after any save. Root cause: `setFilterConfigs` alias in `SlideViewPage` was calling `dsFilters.persistFilterConfigs` (which triggers a DB write + toast), so the sync-from-slideReport `useEffect` at line 905 was triggering a spurious DB write every time the report config loaded. Also, `persistDimensionSettings` was calling both `dsFilters.persistFilterConfigs` AND its own `updateSlideReport` — causing double writes and double toasts. Fixed: `setFilterConfigs` alias now calls `dsFilters.setFilterConfigs` (local state only). `persistDimensionSettings` now calls `dsFilters.setFilterConfigs` and handles its own single DB write.
- [x] **FIX-2** — Filter dropdown buttons showed raw UUIDs instead of dimension names. Root cause: `filterDimensionNames` only mapped report-specific row IDs → names, but `filterDimensionIds` in config may store global IDs not present as keys in the dimMap. Fixed: `filterDimensionNames` memo in `useDataStudioFilters` now also resolves configured filter dimension IDs to names via `resolveFilterDimKey` (same ID-matching logic used for `filterOptions`).

**Verification:** `npx tsc --noEmit` ✅ 0 errors.

---

### Filter per-report zero-results fix (2026-03-20)

- [x] **FILT-0** — Per-report dimension filters (e.g. Metasearch → Channel = "Google") always returned zero results. Root cause: `filterValues` stores selections keyed by **global dimension UUIDs** (from `filterConfigs`), but `filterRawDataRows` only received the per-channel `dimensionMap` (report-specific ID → name). Since the global UUID is absent from that map, the resolution logic fell through and kept the unresolvable UUID as the row key — causing every row to be excluded.
- [x] **FILT-1** — Fix: added `configuredDimensionNames` param (global ID → human name, built from `breakdownDimensions`) to `UseFilteredSlideDataParams` and `UseSlideReportPageParams`. `useFilteredSlideData` now merges `configuredDimensionNames` into each channel's `dimensionMap` before calling `filterRawDataRows`, giving the resolution logic a combined map to look up global UUIDs by name and resolve them to report-specific row keys.
- [x] **FILT-2** — Moved `breakdownDimensions` state and `configuredDimensionNames` memo above `useSlideReportPage` in `SlideViewPage.tsx` so the combined map is available when the hook is called. No functional changes to rendering or effects.

**Verification:** `npx tsc --noEmit` ✅ (0 errors), `npm run build` ✅ (exit 0), monthUtils tests ✅ (17/17).

---

Last verified: **2026-03-20** (post ZD-1 all-time fetch fix)

- `npx tsc --noEmit` ✅ (0 errors, main workspace)
- `npm run build` ✅ (exit 0)
- Browser verified: Overview (1.64M impressions, $1.66M revenue), Metasearch ($57.8K), SEM ($1.47M), Social ($134K) — all channels load KPI cards, charts, and breakdown tables correctly
- Data loads in ~8s via RPC path (vs never completing with all-time fetch)
