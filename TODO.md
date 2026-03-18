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

### Date filter UX improvements (2026-03-18)

- [x] **DF-1** — Removed `reportId` URL param from `useSlideReportPage`: since there is one "Data Studio" report per account, the `reportId` search param is no longer read from the URL on load. The hook now always resolves the canonical "Data Studio" report directly.
- [x] **DF-2** — Added `customDateRange` state to `SlideViewPage` (exact `DateRange` from/to). When set, all filtering (breakdown table, KPI totals, monthly data) uses precise dates instead of month boundaries.
- [x] **DF-3** — Extended `monthUtils.ts` with `exactDateRangeFromDayPicker`, `derivePresetFromDateRange`, `dateRangeFromPreset` helpers.
- [x] **DF-4** — Updated `FiltersRow` to accept `customDateRange` + `setCustomDateRange` props. Preset list expanded to include Today, Yesterday, Last 7/14/30 Days, This Month, Last Month, This Year, Last Year, All Time.
- [x] **DF-5** — `useFilteredSlideData` and `useSlideReportPage` updated to accept and use `customDateRange` for exact date filtering.
- [x] **DF-6** — `UnifiedBreakdownTable` and `ChannelTab` updated to accept and use `customDateRange`.
- [x] **DF-7** — Calendar in `DateRangeFilter` now shows 2 months side-by-side for easier cross-month range selection.

**Verification:** `npm run build` ✅ (exit 0), `npm run lint` ✅ (0 errors, 86 warnings — all pre-existing)

---

### Dead code removal — pages not in router

**Goal:** Delete page files that are no longer referenced in `App.tsx`.

- [x] **DC-1** — Deleted `SlidesPage.tsx` (not in router; zero imports).
- [ ] **DC-2** — **Not a dead page:** `ForecastingPage.tsx` is used by `ForecastingDashboard` (keep).
- [x] **DC-3** — Deleted `ReportDashboard.tsx` (not in router; zero imports; only referenced in comments/metadata).

**Note:** References to ReportDashboard that remain are comments/metadata only (safe).

---

### AI summary consolidation

**Goal:** One canonical AI summary display component.

- [x] **AI-1** — Confirmed `FormattedAISummary` has no imports in `src/` (safe to remove).
- [x] **AI-2** — Removed `FormattedAISummary.tsx` (canonical display is `AISummaryDisplay.tsx`).

---

### Phase 6-DB — Document dimension_data as single read path

**Goal:** Complete the documentation and verification steps for Phase 6.

- [x] **6-DB1** — Documented `dimension_data` as the single read path in `README.md` + `docs/REFACTOR.md`.
- [x] **6-DB2** — Verified canonical writer is `resync-data-source`; confirmed no frontend writes; documented other legacy functions that touch `dimension_data` as deprecated/gated in `docs/REFACTOR.md`.

**Verification:** `npm run build` ✅, `npm run lint` ✅

---

### Phase 7 — Legacy pivot cache + edge function cleanup

**Goal:** Stop all writes to legacy `slide_report_*` pivot cache tables; retire the edge functions that serve them.

- [ ] **7-EF1** — Remove `SLIDE_REPORT_CACHE_ENABLED` gate from `refresh-slide-report`; mark function as retired (return 410 or delete). Confirm Data Studio covers all use cases first.
- [ ] **7-EF2** — Same for `refresh-slide-report-channel`.
- [ ] **7-EF3** — Retire `get-slide-report-data` (return 410 or delete). Verify no frontend callers.
- [ ] **7-EF4** — Retire `get-slide-report-display-data`. Verify no frontend callers.
- [ ] **7-EF5** — Audit `get-consolidated-performance-data` — determine if distinct from `get-performance-data`; remove if redundant.
- [ ] **7-EF6** — Audit `run-refresh-workflow` — remove legacy `slideReportId` refresh branch; keep only `resync-data-source` orchestration.
- [ ] **7-EF7** — Retire `sync-report-api-data` + `get-report-api-data` if `report_api_data` cache is no longer needed (verify `get-performance-data` reads `dimension_data` directly).
- [ ] **7-EF8** — Retire `migrate-sheet-data` edge function (one-time migration; safe to remove after confirming no remaining `sheet_data` consumers).
- [ ] **7-EF9** — Retire `clear-and-resync` edge function (no longer used by `run-refresh-workflow`; keep as 410 or delete after confirming no external callers).
- [ ] **7-EF10** — Audit `apply-vlookup-mappings` — verify if absorbed into `resync-data-source`; remove if redundant.
- [x] **7-SEC1** — Removed hardcoded `ANTHROPIC_API_KEY` fallback from `supabase/functions/generate-ai-summary` (must be configured via Edge Function env vars).
- [ ] **7-F1** — Verify `slideReportChannelDataMerge.ts` has no remaining imports; delete.
- [ ] **7-F2** — Verify `refreshPivotDataHelpers.ts` has no remaining imports; delete.
- [ ] **7-F3** — Verify `slideReportPivotComputation.ts` has no remaining imports; delete.
- [ ] **7-F4** — Audit `slideRefreshHelpers.ts` — remove helpers that only serve the legacy pivot refresh path.
- [ ] **7-F5** — Migrate `useSlideReportSummaries` reads to `ai_summary_cards`; remove `slide_report_summaries` reads.
- [ ] **7-DB1** — Verify `deprecated_at` columns exist on `slide_report_channel_year_data`, `slide_report_channel_month_data`, `slide_report_channel_raw_rows`, `slide_report_monthly_data` (migration already applied — confirm).
- [ ] **7-DB2** — Document `report_api_data` deprecation path; add `deprecated_at` column (additive migration).

**Verification:** `npm run build` ✅, `npm run lint` ✅, no frontend reads of `slide_report_channel_*` or `slide_report_monthly_data`.

---

### Phase 8 — View settings + resync consolidation

**Goal:** One view-settings table (`report_views`); one resync utility path.

- [ ] **8-F1** — Unify view settings: `report_views` canonical; audit `slide_report_views` usage + plan migration
  - Documented current coupling + unification plan in `docs/REFACTOR.md` (cannot delete `slide_report_views` yet: budgets/share_links/summaries FKs)
- [ ] **8-F2** — DEFERRED: `resync-dimensions.ts` still imported by `resync-all-dimensions.ts` + `EditMappingModal.tsx`; `resync-all-dimensions.ts` still imported by `ReportDashboard.tsx` + `resync-all-dimensions/hooks.ts`. Both flat files are active.
- [x] **8-F3** — DEFERRED: `data-loading-fix.ts` still imported by `KPIChart.tsx`; cannot delete until KPIChart migrated.
- [x] **8-F4** — Deleted `large-dataset-optimizer.ts` (zero external imports confirmed).
- [x] **8-F5** — Audit `monthly_dimension_data` table — no frontend reads; only cleared by legacy `clear-and-resync` path; treat as legacy cache (Phase 9 candidate after proof).
- [x] **8-F6** — Audit `aggregated_breakdown_data` table — no frontend/edge reads or writes found; Phase 9 candidate after proof.
- [ ] **8-DB1** — Document `slide_report_views` deprecation path; confirm `report_views` is the only view-settings table going forward.
- [ ] **8-DC1** — Dead code removal: `SlidesPage.tsx`, `ForecastingPage.tsx`, `ReportDashboard.tsx` (not in router). See "Dead code removal" active task above.
- [ ] **8-DC2** — AI summary consolidation: `FormattedAISummary` → `AISummaryDisplay`. See "AI summary consolidation" active task above.

---

### Phase 9 — DB table drops (after proof)

**Goal:** Drop confirmed-unused legacy tables. Each requires the full "Used in current stack?" checklist.

- [ ] **9-DB1** — Drop `sheet_data` (after verifying zero frontend reads and zero edge function writes).
- [ ] **9-DB2** — Drop `slide_report_channel_year_data` (after Phase 7 edge function removal).
- [ ] **9-DB3** — Drop `slide_report_channel_month_data` (after Phase 7).
- [ ] **9-DB4** — Drop `slide_report_channel_raw_rows` (after Phase 7).
- [ ] **9-DB5** — Drop `slide_report_monthly_data` (after Phase 7).
- [ ] **9-DB6** — Drop `slide_report_summaries` (after Phase 7-F5).
- [ ] **9-DB7** — Drop `slide_report_views` (after Phase 8-F1 migration complete).
- [ ] **9-DB8** — Drop `report_api_data` (after Phase 7-EF7 confirmed).
- [ ] **9-DB9** — Drop `monthly_dimension_data` (after Phase 8-F5 confirmed).
- [ ] **9-DB10** — Drop `aggregated_breakdown_data` (after Phase 8-F6 confirmed).

**Pre-requisite for each drop:** Full "Used in current stack?" checklist (no frontend reads, no edge writes, no tests, no migrations depend on it) + DB backup.

---

## Completed

### Layout redesign — Left sidebar + topbar for Data Studio (2026-03-18)

- [x] **L-1** — Created `src/components/slides/ReportSidebar.tsx` — left nav with Reports tabs + Actions/Manage/Tools sections.
- [x] **L-2** — Rewrote `src/components/slides/SlideViewHeader.tsx` — topbar with back, report name, Data Sources, Dimensions, Share, Refresh Data.
- [x] **L-3** — `SlideViewPage` layout restructured: `flex h-screen overflow-hidden` root → sidebar + main column (topbar + scrollable content).
- [x] Extracted `FiltersRow` component from `SlideViewPage`.
- [x] Created `AISummaryDisplay.tsx` — canonical markdown AI summary card.
- [x] Created `DateRangeFilter` component in `src/components/filters/`.
- [x] Created `src/lib/monthUtils.ts` — multi-month selection utilities.
- [x] Deleted `src/pages/Index.tsx` — not in router, zero imports, dead code.

**Verification:** `npm run build` ✅ exit 0 (bundle -45KB), `npm run lint` ✅ 0 errors, 114 warnings

---

### Design system — Light-only luxury minimalist theme (2026-03-18)

- [x] **DS-1** — Refactored `src/index.css` HSL tokens: primary `#FF0068`, accent `#7C39FF`, neutral borders, white background.
- [x] **DS-2** — Added DM Sans font; set Tailwind `font-sans` default.
- [x] **DS-3** — Removed `dark:` branches; Sonner toaster light-only.
- [x] **DS-4** — Date picker UX: preset sidebar + range calendar (`CalendarWithPresets`).
- [x] **DS-5** — Minimalist primitives: `Button` outline/ghost → `muted` hover; `Card` no shadow; `Sidebar` no shadow.
- [x] **DS-6** — `docs/DESIGN_SYSTEM.md` added as the single design-system rulebook.

**Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors)

### Design system audit — Simplify color usage (2026-03-18)

- [x] **DS-A1** — `--accent` token changed from purple brand color (`#7C39FF`) to neutral hover surface (slightly darker grey). Purple is now chart-only via `--chart-5`.
- [x] **DS-A2** — Added `--chart-1` → `--chart-5` tokens (pink → purple gradient) for chart series colors.
- [x] **DS-A3** — `ReportSidebar` active tab changed from solid `bg-primary` (hot pink fill) to `bg-primary/10 text-primary` (subtle tint). All `hover:bg-accent` → `hover:bg-muted`.
- [x] **DS-A4** — `Checkbox` unchecked border changed from `border-primary` (pink) to `border-input` (neutral grey). Checked state still uses `bg-primary`.
- [x] **DS-A5** — `RadioGroupItem` unchecked border changed from `border-primary` to `border-input`. Checked state still uses `border-primary`.
- [x] **DS-A6** — `docs/DESIGN_SYSTEM.md` updated with new rules (single rulebook).

**Verification:** `npm run build` ✅ (exit 0, 11s)

### KPI cards unification — minimalist style (2026-03-18)

**Goal:** One canonical KPI card component. Remove colored left bar, remove icons.

- [x] **KPI-1** — Rewrote `src/components/slides/KPICardsSection.tsx` as canonical presentational component (`KPICardItem`, `KPICardsSkeleton`, `KPICardsSection`). No icons, no `border-l-4`, no colored left bar.
- [x] **KPI-2** — `renderKPICards` in `SlideViewPage.tsx` now delegates to `KPICardsSection`. Removed inline card JSX.
- [x] **KPI-3** — `KPIMetricsCards.tsx` card rendering updated to use `KPICardItem` / `KPICardsSkeleton`. Removed icon/color maps.
- [x] **KPI-4** — `README.md` updated: `KPICardsSection` documented as canonical component.

**Verification:** `npm run build` ✅ (exit 0)

---

### Route simplification — Data Studio as homepage (2026-03-18)

- [x] `/` now renders `SlideViewPage` directly (Data Studio is the homepage).
- [x] `/landing`, `/tools/reports/*`, `/tools/data/*` all redirect to `/`.
- [x] `ReportDashboard`, `SlidesPage`, `Landing` removed from `App.tsx` router.
- [x] `ReportSidebar` includes Forecast + Price Widget quick-access items.

**Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors)

---

### Phase 6 — Data source unification + canonical Data Studio fetch path

- [x] **6-F1** — Collapsed parallel data-fetch hooks into one canonical path (`useCachedSourceData` reads `dimension_data`; deleted `useFiltersSourceData.ts`).
- [x] **6-F2** — Removed `useSlideReportChannelData` from `useSlideReportPage`; deleted `useSlideReportChannelData.ts` + `slideReportChannelDataMerge.ts`; `effectivePivotData` reads only from `dataStudioRawRows`.
- [x] **6-F3** — Moved constants/utils from `useMetasearchJan2026RawRows.ts` to `src/lib/metasearchJan2026Utils.ts`; deleted hooks file.
- [x] **6-F4** — Confirmed `usePerformanceData` deleted; zero imports.
- [x] **6-F5** — Deleted `CSVImportChoiceModal.tsx`, `DataSourcesListModal.tsx`, `MappingModal.tsx`; unified data source entry flow.
- [x] **6-F6** — Removed `handleCreateBookingReport`, `handleCreatePriceCheckReport` from `DataSourcesPage`.

### Phase 5 — Cleanup

- [x] Deleted unused one-off repair scripts (6 files).
- [x] Deleted `CreateAccountModal`, `EditAccountModal`, `DeleteAccountDialog`, `migrate-to-account-dimensions.ts`.
- [x] Deleted `ReportsSidebarDemo.tsx`, `DevPage.tsx`; removed `/demo/sidebar` and `/dev` routes.
- [x] Deleted `priceCheckDataRaw.ts`.
- [x] Deleted `MasterReportSetupModal.tsx`, `MasterReportSettingsModal.tsx`, `MasterReportTable.tsx`.
- [x] Deleted `SlideListItem.tsx`, `CreateSlideModal.tsx`, `CreateChildReportModal.tsx`.
- [x] Deleted `useSlides.ts`.
- [x] Deleted `ReportsEntry.tsx`, `DataSourcesEntry.tsx`, `DimensionsEntry.tsx`, `PriceWidgetEntry.tsx`, `ReportTool.tsx`, `ForecastingTool.tsx`.
- [x] Added short entry routes; all tool pages resolve `accountId` from `useUserAccount()`.

### Phase 4 — Testing

- [x] Unit tests: dimension dedupe (`dimensionLoader.test.ts`), KPI mapping (`utils.kpi.test.ts`).
- [x] Integration test: `reportView.integration.test.tsx`.
- [x] 49 tests passing.

### Phase 3 — Remove duplicate implementations

- [x] Deleted `PerformanceTable.old.tsx`, `PerformanceTable.refactored.tsx`, `usePerformanceTableDataFixed.ts`.
- [x] Standardized Apply/Cancel behavior across `KPISettingsModal`, `DimensionsListModal`, `ColumnVisibilitySheet`.

### Phase 2 — Canonical dimension loading + view settings

- [x] `src/lib/dimensionLoader.ts` as single canonical dimension loading API.
- [x] Edge Functions aligned to same precedence rules.
- [x] `src/lib/performanceTable/viewSettingsMapper.ts` as canonical view settings mapper.
- [x] Fixed `mapDimensionIdsLocal` duplicate, comparison data map keying bug, `mapVisibleColumns` column-order bug, debug log prefixes, `autoDetectColumnType` threshold bug.

### Phase 1 — DB integrity + mapping references

- [x] `getAccountDefaultKPIs()` returns exact KPI names from available dimensions.
- [x] `resyncReportViews()` normalizes and repairs `kpi_order`.
- [x] Added `dimensions_unique_name_per_context` unique index.

### Phase A — Account removal + post-login index

- [x] `useUserAccount()` hook; Landing shows only three tool cards.
- [x] Removed account selector, CreateAccountModal, EditAccountModal, DeleteAccountDialog from Landing.
- [x] Back/nav links updated to `navigate("/")`.

### Phase B — Single Data Studio

- [x] SlidesPage: single "Data Studio" card only.
- [x] Removed `brady` and `master-report` routes from `App.tsx`.
- [x] `useSlideReportPage` / `SlideViewPage`: `slideType` always `'default'`.
- [x] One "Data Studio" report per account; canonical report type is Data Studio.

---

## Blockers

_None currently._

---

## Verification baseline

Last verified: **2026-03-18** (post layout redesign + route simplification)

- `npm run build` ✅ (bundle -45KB vs pre-layout)
- `npm run lint` ✅ (0 errors, 114 warnings — all pre-existing)
- `npm run test -- --run` ✅ (49 tests passing)
