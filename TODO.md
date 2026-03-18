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

### Phase 6-DB — Document dimension_data as single read path

**Goal:** Complete the documentation and verification steps for Phase 6.

- [ ] **6-DB1** — Add a "Data sources" section to `README.md` (or update the Data Flow section) explicitly documenting `dimension_data` as the single read path for Data Studio and PerformanceTable.
- [ ] **6-DB2** — Verify `resync-data-source` is the sole writer to `dimension_data`; search for any other edge functions or frontend code that upserts/inserts into `dimension_data`; document findings in `README.md` and `docs/REFACTOR.md`.

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
- [ ] **7-EF9** — Retire `clear-and-resync` edge function (clears `sheet_data`; only relevant while `sheet_data` exists).
- [ ] **7-EF10** — Audit `apply-vlookup-mappings` — verify if absorbed into `resync-data-source`; remove if redundant.
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

- [ ] **8-F1** — Audit all `slide_report_views` reads in frontend; migrate `useSlideReportViews` to `report_views` or document why both are needed. Document `budgets.view_id` FK migration path.
- [ ] **8-F2** — Verify `resync-dimensions.ts` (flat file) is superseded by `resync-all-dimensions/` folder; delete flat file. Verify `resync-all-dimensions.ts` (flat orchestrator) is superseded; delete if so.
- [ ] **8-F3** — Audit `data-loading-fix.ts` — verify if logic absorbed into canonical data loading; delete if unused.
- [ ] **8-F4** — Audit `large-dataset-optimizer.ts` — verify if superseded by `useCachedSourceData` batched fetch; delete if unused.
- [ ] **8-F5** — Audit `monthly_dimension_data` table — determine which edge function writes it and whether it is still needed; document or deprecate.
- [ ] **8-F6** — Audit `aggregated_breakdown_data` table — determine writer + consumers; document or deprecate.
- [ ] **8-DB1** — Document `slide_report_views` deprecation path; confirm `report_views` is the only view-settings table going forward.

**Verification:** `npm run build` ✅, `npm run lint` ✅, single view-settings read path confirmed.

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

Last verified: **2026-03-18**

- `npm run build` ✅
- `npm run lint` ✅ (warnings only, no errors)
- `npm run test -- --run` ✅ (49 tests passing)
