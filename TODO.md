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

### Next steps

- [ ] **NS-1** — Audit `run-refresh-workflow` edge function: remove legacy `slideReportId` refresh branch; keep only `resync-data-source` orchestration.
- [ ] **NS-2** — Migrate `debug.ts` utilities (`retryWithBackoff`, `filterDimensionsByFilterSettings`) into a more descriptive module (e.g. `src/lib/utils/retry.ts`, `src/lib/utils/dimensionFilter.ts`) and delete `debug.ts`.
- [ ] **NS-3** — Dead code removal: `ForecastingPage.tsx` (verify router status).
- [ ] **NS-4** — `resync-dimensions.ts` (flat) and `resync-all-dimensions.ts` (flat orchestrator) — consolidate into the `resync-all-dimensions/` folder module.
- [ ] **NS-5** — Delete `src/lib/sync-utils.ts` once all remaining callers (`useDataSourceHeaders.ts`, `EditDataSourceModal.tsx`, `ViewDataModal.tsx`) are migrated off `parseDate`/`parseValue`/`fetchGoogleSheetsData` to canonical alternatives in `src/lib/data-sources/`.

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

Last verified: **2026-03-19** (post KPI metrics unification)

- `npm run build` ✅ (exit 0, 8.26s)
- `npm run lint` — not re-run (pre-existing warnings only)
- E2E reports: Data Studio (/) and shared reports; loading/empty states prevent blank page when account or report is missing
