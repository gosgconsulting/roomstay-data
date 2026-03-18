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

### Next steps

- [ ] **NS-1** — Audit `run-refresh-workflow` edge function: remove legacy `slideReportId` refresh branch; keep only `resync-data-source` orchestration.
- [ ] **NS-2** — Migrate `debug.ts` utilities (`retryWithBackoff`, `filterDimensionsByFilterSettings`) into a more descriptive module (e.g. `src/lib/utils/retry.ts`, `src/lib/utils/dimensionFilter.ts`) and delete `debug.ts`.
- [ ] **NS-3** — Dead code removal: `SlidesPage.tsx`, `ForecastingPage.tsx` (verify router status), `ReportDashboard.tsx` (not in router).
- [ ] **NS-4** — `resync-dimensions.ts` (flat) and `resync-all-dimensions.ts` (flat orchestrator) — consolidate into the `resync-all-dimensions/` folder module.

---

## Completed

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

Last verified: **2026-03-18** (post Looker Studio Refactor)

- `npm run build` ✅ (exit 0, 6.96s)
- `npm run lint` — not re-run post-refactor (pre-existing warnings only)
- `npm run test -- --run` — not re-run post-refactor (49 tests passing pre-refactor)
