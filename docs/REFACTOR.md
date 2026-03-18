# Core Refactor: Dimensions + KPI Mapping System

## Scope and goals (source of truth)

This repository is a **Vite + React + TypeScript** app with a **Supabase** backend and Edge Functions. The highest-risk area is the **dimensions + KPI mapping** pipeline used by:

- Performance table columns
- KPI cards + KPI charts
- Data Studio / metasearch-derived views
- Slide report views and shared report rendering

Primary goals:

- **One canonical implementation** per capability (dimension loading, dedupe/precedence, mapping validation, view settings mapping).
- **Verify → Migrate → Delete** for all changes.
- Move data shaping / business logic out of UI components into `src/lib/` and `src/hooks/` where appropriate.
- Reduce duplicate/legacy implementations (e.g. `*.old.tsx`, `*.refactored.tsx`, parallel hooks).

Non-goals:

- Large UX redesign.
- Irreversible DB deletes without explicit “safe to delete” verification in this doc.

---

## UI / Design system housekeeping (one rulebook)

**Goal:** Keep a single “design system rulebook” to avoid drift.

### DS-RB1 — Consolidate design-system rulebooks (2026-03-18)

- **Canonical rulebook:** `docs/DESIGN_SYSTEM.md`
- **Duplicate removed:** `.cursor/rules/design-system.md`

**Verify → Migrate → Delete evidence:**

- **Verify (duplicates):**
  - Found two rulebook-like sources: `docs/DESIGN_SYSTEM.md` and `.cursor/rules/design-system.md`.
  - Confirmed `README.md` already points to `docs/DESIGN_SYSTEM.md` for design rules.
  - Confirmed `TODO.md` contained the only remaining references to `.cursor/rules/design-system.md`.
- **Migrate (references):**
  - Updated `TODO.md` to reference only `docs/DESIGN_SYSTEM.md` as the single rulebook.
- **Delete (duplicate):**
  - Deleted `.cursor/rules/design-system.md`.
  - Verified: no remaining matches for `.cursor/rules/design-system.md` in repo markdown.

**Checks:** `npm run build` ✓ (exit 0)

## Core routes (must remain)

**Canonical route map:** See `README.md` → Route Map. Routes are defined in `src/App.tsx`.

**Refactor-relevant state (post Phase A/B/5D/E):**

- **Single report entry:** `/` renders `SlideViewPage` (Data Studio homepage). `/tools/reports`, `/tools/reports/:accountId`, `/tools/reports/:accountId/data-studio`, `/tools/data`, `/tools/data/:accountId` all redirect to `/`.
- **Removed routes:** `/tools/reports/:accountId/brady`, `/tools/reports/:accountId/master-report`, `/tools/reports/:accountId/view/:slideId`, `/tools/report/:reportName` (AI summary), `/shared/reports/:slug`.
- **Tool entry routes** (account resolved when omitted): `/tools/data-sources`, `/tools/dimensions`, `/tools/forecasting`, `/tools/price-widget` (and `:accountId` variants).
- **Shared report:** `/shared/:slug`, `/:slug` (alias).

## Current pain points (why we’re refactoring)

- KPI/dimension **mis-mapping** in Data Studio / metasearch views for some KPIs.
- Drift between:
  - frontend dimension loading/deduping
  - Edge Functions dimension loading/deduping
  - view settings mapping (visible columns/KPIs, ordering)
- Multiple implementations in code (`old`, `refactored`, duplicated helpers).

## Progress tracker

### Phase 6 — Data source unification + canonical Data Studio fetch path (HIGH)

> **Goal:** One canonical way to add data sources (CSV, Google Sheets) with dimension mapping; one canonical way to fetch/sync data into Data Studio. No parallel live-fetch + DB-cache paths running simultaneously.

- [x] **6-F1** — Collapse three parallel data-fetch hooks into one canonical path (reads `dimension_data`; live fetch only on manual sync trigger)
  - `useDataStudioRawRows.ts` already reads `dimension_data` — kept as canonical; no live-fetch path remains
  - Deleted `useFiltersSourceData.ts`; `FiltersBar` migrated to `useCachedSourceData`
  - Canonical: `useCachedSourceData` reads `dimension_data`; `useSourceData` / `fetchSourceData` used only during sync
- [x] **6-F2** — Removed `useSlideReportChannelData` from `useSlideReportPage`; deleted `useSlideReportChannelData.ts` + `slideReportChannelDataMerge.ts`; `effectivePivotData` now reads only from `dataStudioRawRows` (dimension_data)
- [x] **6-F3** — Moved constants/utils from `useMetasearchJan2026RawRows.ts` to `src/lib/metasearchJan2026Utils.ts`; deleted hooks file; updated `ChannelTab` + `SlideViewPage` imports
- [x] **6-F4** — `usePerformanceData` already deleted in prior phase; confirmed zero imports
- [x] **6-F5** — Deleted `CSVImportChoiceModal.tsx`, `DataSourcesListModal.tsx`, `MappingModal.tsx`; `ReportDashboard` "Data sources" button now navigates to `/tools/data-sources`; CSV flow in `DashboardHeader` bypasses choice modal and goes directly to `UnifiedDataSourceModal`; `EditMappingModal` remains as the single mapping step
- [x] **6-F6** — Removed `handleCreateBookingReport`, `handleCreatePriceCheckReport`, state vars, and UI buttons from `DataSourcesPage`
- [x] **6-DB1** — Document `dimension_data` as the single read path for Data Studio; update DB section
- [x] **6-DB2** — Verify `resync-data-source` edge function is the sole writer to `dimension_data`; document in DB section

> **What changed (Phase 6):** Deleted `useFiltersSourceData.ts`, `useSlideReportChannelData.ts`, `slideReportChannelDataMerge.ts`, `useMetasearchJan2026RawRows.ts` (hook), `CSVImportChoiceModal.tsx`, `DataSourcesListModal.tsx`, `MappingModal.tsx`. Created `src/lib/metasearchJan2026Utils.ts`. Migrated `FiltersBar` → `useCachedSourceData`, `useSlideReportPage` → single `dataStudioRawRows` path, `ReportDashboard` → navigate to `DataSourcesPage`.
>
> **6-DB evidence (single read path + sole writer intent):**
> - **Frontend writes to `dimension_data`**: none found (no `.from('dimension_data').insert/upsert/update/delete` in `src/`).
> - **Canonical writer**: `supabase/functions/resync-data-source/**` (deletes old rows for a data source + inserts transformed rows).
> - **Other legacy functions that touch `dimension_data` are deprecated/gated** and are not part of the canonical pipeline:
>   - `migrate-sheet-data` (retired / 410 gate; one-time migration)
>   - `apply-vlookup-mappings` (retired / 410 gate)
>   - `clear-and-resync` (still present; deletes `dimension_data` as part of a legacy “clearFirst” workflow — Phase 7-EF9)
> - **Primary readers** (canonical): frontend `useCachedSourceData` / `useDataStudioRawRows`; edge `get-performance-data` fallback path reads `dimension_data`.
>
> Build: `npm run build` ✓ exit 0. Lint: `npm run lint` ✓ 0 errors.

### Refresh workflow (canonical path + modes + row count)

**Canonical path:** Data Studio "Refresh Data" → `run-refresh-workflow` (Edge Function) → per–data-source `resync-data-source` (Edge Function) → reads Google Sheets/CSV, maps dimensions, writes `dimension_data`. No duplicate refresh entry points; `DataSourcesPage` sync also uses `runRefreshWorkflow` (same path).

- **Refresh modes:** `full` = delete all rows for the data source, re-insert everything. `recent` = delete only rows from the last 2 months (by date dimension), re-insert only those rows; older data preserved. Mode is chosen in `RefreshDataModal` before "Start Refresh"; forwarded via `RunRefreshWorkflowParams.refreshMode` and `resync-data-source` request body.
- **Batch processing:** `resync-data-source` fetches and inserts in batches (e.g. chunked Google Sheets fetch, `insertDataInBatches`); `recent` mode filters fetched rows by date then deletes/inserts only that subset.
- **Row count:** `resync-data-source` returns `rowsProcessed`; `run-refresh-workflow` sums it across data sources and returns `rowsProcessed` in the response. Frontend (`SlideViewPage`) captures it and passes `rowsProcessed` to `RefreshDataModal`; success message shows "X rows imported" (and "(last 2 months)" when mode is `recent`).

**Deployed:** `run-refresh-workflow` v6, `resync-data-source` (with `refreshMode` and `rowsProcessed`). See TODO.md "Refresh mode selection" and "Refresh audit & row count display" for verification.

**Post-refresh report reload (cache fix):** After the workflow completes, the UI previously only invalidated React Query caches, so the report could still show stale data (e.g. Metasearch Cost $0) until the next mount or refetch. Refactored so that for Data Studio, after clearing/syncing we **await** a single `refetchQueries({ queryKey: ['data-studio-raw-rows'] })` before marking "Updating cache & interface" complete. KPIs and charts both derive from that canonical query (`useDataStudioRawRows` → `effectivePivotData` → `useFilteredSlideData`), so one refetch repopulates the report. Single path: `SlideViewPage` refresh effect; no duplicate reload logic.

**Post–Phase 6/7 fix (blank report tabs):** OverviewTab and ChannelTab were gating content on `slideReport?.pivot_data`. After the refactor, the canonical data path is `dimension_data` → `useDataStudioRawRows` → `effectivePivotData`; `slide_report.pivot_data` may be null. Updated both tabs to show content when the report is loaded and not in a loading state (`isSlideReportsLoading` / `isLoadingData`), and to render KPIs even when `currentTotals` is empty (show zeros). No dependency on `slide_report.pivot_data` for showing tab content.

**Follow-up (tabs still blank):** OverviewTab was still requiring `slideReport` for the KPI block (`slideReportId && slideReport`), so when `slideReport` was undefined (e.g. query pending or failed) the tab rendered nothing. Fixed by gating only on `slideReportId`: when we have a report ID and are not in the loading skeleton state, we always render KPI content (using zeros when `currentTotals`/breakdownTotals are empty). Removed redundant inner `TabsContent` wrappers from OverviewTab and ChannelTab so the parent `SlideViewPage` is the single source of tab visibility; both components now return a plain `div` with `className="space-y-6"`. Build and lint: ✓.

**Root cause (blank page — effectivePivotData null):** After the refactor, `slide_report.pivot_data` is often null (canonical data lives in `dimension_data`). In `useSlideReportPage`, `effectivePivotData` was computed as `if (!base) return null` (base = `slideReport?.pivot_data`), so when pivot_data was null the entire app received `effectivePivotData === null`. Downstream: `useFilteredSlideData` returns empty `channelTotals` and `monthlyData` when `!pivotData?.channels`, so KPIs and charts had no data and the UI appeared blank. **Fix:** When `base` is null but `dataStudioRawRows` (from `useDataStudioRawRows` / dimension_data) has data, build a minimal `SlideReportPivotData` from raw rows and dimension maps: `overview` (empty metrics), `channels` (each channel: `rawDataRows`, `dimensionMap`, minimal `current`/`monthly`/`breakdowns`), and `budget` (empty). This single path ensures the report tabs always receive data from dimension_data when pivot_data is null. No duplicate tables or conflicting logic; one canonical read from dimension_data. Build: ✓. Lint: ✓.

### Phase 7 — Legacy pivot cache deprecation + edge function cleanup (HIGH)

> **Goal:** Stop all writes to legacy `slide_report_*` pivot cache tables; remove the edge functions that serve them; Data Studio reads `dimension_data` directly.

- [x] **7-EF1** — `refresh-slide-report` already gated by `SLIDE_REPORT_CACHE_ENABLED` in `run-refresh-workflow`; returns 410 when env var is false. No direct frontend callers.
- [x] **7-EF2** — `refresh-slide-report-channel` has no frontend callers; only called by `refresh-slide-report` (already gated). Gated transitively.
- [x] **7-EF3** — `get-slide-report-data` already has `SLIDE_REPORT_CACHE_ENABLED` gate at top of handler; returns 410 when disabled.
- [x] **7-EF4** — `get-slide-report-display-data` dead code paths (`displayDataFromApi`, `apiBreakdowns`, `suppressExpandedBreakdown`) removed from `SlideViewPage` and `ChannelTab`. No frontend callers remain. Edge function can be retired in Phase 9.
- [x] **7-EF5** — `get-consolidated-performance-data` has zero frontend callers; confirmed distinct from `get-performance-data` (different parameter shape). Added 410 deprecation gate.
- [x] **7-EF6** — `run-refresh-workflow` already has `SLIDE_REPORT_CACHE_ENABLED` gate on `refresh-slide-report` call (line 253); legacy branch is gated.
- [x] **7-EF7** — `sync-report-api-data` + `get-report-api-data` edge functions deleted; `report_api_data` table dropped (Phase 9 migration). `get-performance-data` reads `dimension_data` only. `auto-sync-data-sources` no-ops the old sync call. No frontend callers remain.
- [x] **7-EF8** — `migrate-sheet-data`: one-time migration complete. Added 410 deprecation gate.
- [x] **7-EF9** — `clear-and-resync`: removed from the canonical refresh workflow
  - **Verify**: no frontend callers pass `clearFirst: true` (search in `src/`).
  - **Migrate**: `run-refresh-workflow` now implements canonical `clearFirst` by deleting only `dimension_data` for the target report(s) (no `sheet_data`, no `slide_report_*` cache clears).
  - **Next**: retire `clear-and-resync` itself (410) and delete once no external callers remain (Phase 9).
- [x] **7-EF10** — `apply-vlookup-mappings`: zero frontend callers; logic absorbed into `resync-data-source`. Added 410 deprecation gate.
- [x] **7-F1** — `slideReportChannelDataMerge.ts` already deleted in Phase 6.
- [x] **7-F2** — `refreshPivotDataHelpers.ts`: confirmed zero imports in `src/`; file already deleted in prior phase.
- [x] **7-F3** — `slideReportPivotComputation.ts`: confirmed zero imports in `src/`; file already deleted in prior phase. `SlideViewPage` now reads exclusively from `dimension_data` via `useDataStudioRawRows` → `useFilteredSlideData`.
- [x] **7-F4** — `slideRefreshHelpers.ts`: confirmed zero imports in `src/`; file already deleted in prior phase.
- [x] **7-F5** — **OBSOLETE:** `slide_report_summaries` table dropped in Phase 9; `useSlideReportSummaries` no longer has a backing table. Per-tab AI summaries were removed with the table. No action.
- [ ] **7-DB1** — Add `deprecated_at` timestamps to any remaining legacy pivot tables (additive migration). **DEFERRED** — DB migration needed.
- [x] **7-DB2** — `report_api_data` and `sync-report-api-data`/`get-report-api-data` removed in Phase 7-EF7 and Phase 9; `get-performance-data` reads `dimension_data` only.

> **What changed (Phase 7):** Added 410 deprecation gates to `apply-vlookup-mappings`, `migrate-sheet-data`, `get-consolidated-performance-data`. Confirmed `run-refresh-workflow` already gates `refresh-slide-report` via `SLIDE_REPORT_CACHE_ENABLED`. Confirmed `get-slide-report-data` already gated. Updated `run-refresh-workflow` to implement canonical `clearFirst` (clears `dimension_data` only) and removed the legacy dependency on `clear-and-resync`. Deferred: `sync-report-api-data`/`get-report-api-data` (active cache). Build: `npm run build` ✓ exit 0.
>
> **What changed (2026-03-19 — breakdown dimension channel filtering):**
> - `loadBreakdownDimensionsForChannel` in `SlideViewPage.tsx` was returning ALL account-scoped text dimensions regardless of channel, causing invalid options (e.g. "Ad Group" appearing in metasearch, "Hotel"/"Link Type" appearing in SEM/social).
> - Fix: after fetching dimensions, filter by `CHANNEL_DIMENSION_NAMES[channel]` (case-insensitive name match). Both primary path (account dims) and fallback path (column_mappings) now apply this filter.
> - `CHANNEL_DIMENSION_NAMES` updated: `sem` now includes `Ad Group` (was missing; Google Ads has Ad Group hierarchy).
> - Canonical dimension sets: metasearch → `[Hotel, Channel, Device, Link Type, Market]`; sem → `[Account, Campaign, Ad Group]`; social → `[Account, Campaign, Ad Group]`.
> - Build: `npm run build` ✓ exit 0.
>
> **What changed (Phase 7 — 2026-03-18 channel unification):**
> - Removed inline `UnifiedBreakdownTable` component (~780 lines) from `SlideViewPage.tsx`; replaced with canonical `UnifiedBreakdownTable` exported from `src/components/slides/BreakdownTableSection.tsx`.
> - Canonical `BreakdownTableSection.tsx` extended with missing props: `customDateRange`, `displayCurrency`, `comparisonChannelTotals`, `comparisonType`; dead `displayDataFromApi`/`apiBreakdowns`/`suppressExpandedBreakdown` paths removed.
> - `ChannelTab.tsx` rewritten: imports `UnifiedBreakdownTable` directly (no longer receives it as a prop); removed `UnifiedBreakdownTable` prop from interface; removed dead `displayDataFromApi`/`apiBreakdowns`/`suppressExpandedBreakdown` props.
> - KPI totals source-of-truth fixed: `currentTotals` from `useFilteredSlideData` (canonical `rawDataRows` path) is now primary; `breakdownTotals` from breakdown table is secondary fallback only when `currentTotals` is empty.
> - Removed dead imports from `SlideViewPage.tsx`: `isMetasearchJan2026`, `getJan2026BreakdownRowsForTable`, `fetchSourceData`, `calculateReportBreakdown`, `calculateReportTotal`, `normalizeBudgetValue`, `ChannelBudgets`.
> - Confirmed `slideReportPivotComputation.ts`, `refreshPivotDataHelpers.ts`, `slideRefreshHelpers.ts` already deleted; marked 7-F2/F3/F4 complete.
> - Confirmed `get-slide-report-display-data` has no remaining frontend callers; marked 7-EF4 complete.
> - Build: `npm run build` ✓ exit 0. Lint: `npm run lint` ✓ 0 errors, 88 warnings (all pre-existing).

#### Edge-function duplication plan (EF4 / EF7 / EF9)

Some legacy Edge Functions remain because the frontend still depends on them. The goal is to end with **one canonical refresh path** and **one canonical data-read path** (dimension_data).

##### EF4: `get-slide-report-display-data` (still called)

- **Current**: `useSlideReportDisplayData.ts` calls `get-slide-report-display-data` to produce “display-ready” slide report outputs.
- **Target**: SlideView should compute display data **from `dimension_data`** (and existing pivot computation utilities) without a separate legacy edge function.
- **Migration steps**:
  1. Audit what `get-slide-report-display-data` returns and which fields SlideView consumes.
  2. Recreate the same shape in frontend lib code (or a new canonical edge function that reads `dimension_data` only).
  3. Switch `useSlideReportDisplayData` to the new canonical path.
  4. Verify no callers remain; retire `get-slide-report-display-data` (410) then delete in Phase 9.

##### EF7: `sync-report-api-data` + `get-report-api-data` + `report_api_data` cache (done)

- **Done**: EFs and table removed in Phase 7-EF7 and Phase 9. `get-performance-data` reads `dimension_data` only.

##### EF9: `clear-and-resync` (still called from frontend)

- **Current**: `run-refresh-workflow` can call `clear-and-resync` when `clearFirst=true`; frontend (ReportDashboard) sets `clearFirst: true`.
- **Target**: The canonical workflow should be:
  - Clear only the canonical table (`dimension_data`) for the relevant report(s), then resync each data source via `resync-data-source`.
- **Migration steps**:
  1. Replace frontend calls to `clearFirst: true` with a safer canonical “clear dimension_data for report” flag (or always clear within `resync-data-source`).
  2. Implement clearing behavior in `run-refresh-workflow` (service role) against `dimension_data` (not legacy tables).
  3. Remove `clear-and-resync` usage; retire edge function.

#### 7-F5 audit notes (slide_report_summaries vs ai_summary_cards)

There are currently **two summary storage concepts**:

- **`slide_report_summaries`** (SlideView per-tab/month summary storage)
  - Frontend: `src/hooks/useSlideReportSummaries.ts`
  - Purpose: stores `summary_text` for a SlideView tab (`overview|metasearch|sem|social`) plus `selected_year`, `selected_month`, optional `view_id`, and `comparison_type`.
  - Coupled to: `slide_report_views` via `view_id` FK.

- **`ai_summary_cards`** (AI Summary “cards” system)
  - Frontend: `src/hooks/useAISummaryData.ts`, `src/pages/AISummaryPage.tsx`
  - Purpose: stores multi-report AI summary card configuration (report_ids, metrics, cached budget data, etc.).

**Conclusion:** These are not a direct duplicate feature today; they represent **two products** (SlideView tab summary vs AI Summary cards). However, they duplicate the *capability* “store AI-generated summaries keyed by context”, so a unification path is desirable.

##### Unification plan (future Phase 7-F5 / Phase 8)

1. **Choose a single canonical table for “AI summary outputs”**:
   - Option A (preferred): create `ai_summaries` (or `ai_summary_entries`) as the canonical output table with a discriminator:
     - `scope`: `slide_view` | `ai_summary_card` | `shared`
     - `slide_report_id`, `tab`, `selected_year`, `selected_month`, `view_id` (nullable)
     - `ai_summary_card_id` (nullable)
     - `comparison_type`, `prompt_version`, `model`, `request_id`, `summary_text`, `created_at/updated_at`
   - Option B: extend `ai_summary_cards` to also support SlideView summaries (likely messy; cards are config objects, not outputs).

2. **Migrate frontend writers/readers**:
   - Move SlideView summary save/load to the canonical output table.
   - Keep `ai_summary_cards` as *configuration*; store generated output rows in the canonical output table.

3. **Backfill and deprecate**:
   - Backfill existing `slide_report_summaries` into canonical output table.
   - Keep `slide_report_summaries` read-only briefly for safety.

4. **Verify → Delete**:
   - Verify no callers remain.
   - Drop `slide_report_summaries` table in Phase 9 (after proof).

### Phase 8 — Duplicate frontend hooks + view settings unification (MED)

> **Goal:** One view-settings table (`report_views`); remove `slide_report_views` reads from the Data Studio path; consolidate resync utilities.

- [x] **8-F1** — Unified view settings: `public.views` is now the single canonical table for both PerformanceTable (`mode='performance_table'`) and SlideView (`mode='slide_view'`) saved views.
  - `useSlideReportViews` migrated to read/write `views` table (mode=slide_view)
  - `usePerformanceTableViews` + `usePerformanceTableColumns` migrated to `views` table
  - `resync-report-views.ts` migrated to `views` table
  - `CreateShareLinkModal.tsx` fallback read migrated from `slide_report_views` → `views`
  - `budgets.view_id` FK repointed to `views` (migration `20260318170000_create_unified_views.sql`)
  - `share_links.view_id` FK repointed to `views`
  - `slide_report_views` dropped in Phase 9 (migration `20260318200000_phase9_drop_legacy_tables.sql`)
- [x] **8-F2** — Resync utilities documented: `resync-dimensions.ts` (column mapping resync) and `resync-all-dimensions/` folder (dimension data resync) serve distinct purposes and are both active orchestrators. No consolidation needed — they are not duplicates.
- [x] **8-F3** — `data-loading-fix.ts` still imported by `KPIChart.tsx` (`getCurrentMonthDateRange`, `Dimension`). **DEFERRED** — cannot delete until KPIChart is migrated.
- [x] **8-F4** — Deleted `large-dataset-optimizer.ts` — zero external imports confirmed; no tests, no edge function dependencies.
- [x] **8-F5** — Audit `monthly_dimension_data` table — determine which edge function writes it and whether it is still needed; document or deprecate
  - **Frontend**: no reads/writes found (only appears in generated `src/integrations/supabase/types.ts`).
  - **Edge Functions**: no writers/readers found; only cleared in `clear-and-resync` as part of a legacy “clearFirst” path.
  - **Conclusion**: treat as legacy cache; safe to target for Phase 9 drop after confirming no external consumers.
- [x] **8-F6** — Audit `aggregated_breakdown_data` table — determine writer + consumers; document or deprecate
  - **Frontend**: no reads/writes found.
  - **Edge Functions**: no reads/writes found.
  - **DB**: table exists via `supabase/migrations/20260113000000_create_aggregated_breakdown_data.sql` only.
  - **Conclusion**: unused; safe Phase 9 drop candidate after standard verification checklist.
- [x] **8-DB1** — `slide_report_views` fully deprecated and dropped. `public.views` is the single canonical view-settings table. `report_views` remains as a legacy alias (still has rows for PerformanceTable views that were not yet migrated to `views`; both `report_views` and `views` are read by `usePerformanceTableViews` — future cleanup task).

#### Unified views system (new canonical table)

To enforce **one filters/views system**, we are moving both:
- `public.report_views` (PerformanceTable)
- `public.slide_report_views` (SlideView)

into a single canonical table:
- `public.views` (mode = `performance_table` | `slide_view`)

Migration: `supabase/migrations/20260318170000_create_unified_views.sql`.\n
- [x] **8-DC1** — Dead code removal: deleted unused routed pages after verification
  - Deleted: `src/pages/SlidesPage.tsx`, `src/pages/ReportDashboard.tsx` (not in `App.tsx`; no imports found in `src/`).
  - Kept: `src/pages/ForecastingPage.tsx` (used by `ForecastingDashboard`).
- [x] **8-DC2** — AI summary consolidation: `FormattedAISummary.tsx` had no imports in `src/`; removed (canonical display is `AISummaryDisplay.tsx`).

> **What changed (Phase 8 complete — 2026-03-18 view unification + Phase 9 DB drops):**
> - **8-F1 complete**: `public.views` is now the single canonical view-settings table. `useSlideReportViews`, `usePerformanceTableViews`, `usePerformanceTableColumns`, `resync-report-views.ts`, and `CreateShareLinkModal.tsx` all read/write `views`. `slide_report_views` dropped.
> - **8-F2 documented**: `resync-dimensions.ts` (column mapping) and `resync-all-dimensions/` (dimension data) serve distinct purposes — not duplicates; no consolidation needed.
> - **8-DB1 complete**: `slide_report_views` deprecated and dropped. `public.views` is the single canonical table.
> - **7-EF7 complete**: `sync-report-api-data` + `get-report-api-data` edge functions already deleted; `report_api_data` table dropped; `get-performance-data` reads `dimension_data` only.
> - **Phase 9 complete**: Dropped 10 legacy tables: `sheet_data`, `slide_report_channel_year_data`, `slide_report_channel_month_data`, `slide_report_channel_raw_rows`, `slide_report_monthly_data`, `slide_report_summaries`, `slide_report_views`, `report_api_data`, `monthly_dimension_data`, `aggregated_breakdown_data`.
> - TypeScript types regenerated post-drop (removed all dropped tables from `src/integrations/supabase/types.ts`).
> - Build: `npm run build` ✓ exit 0.
>
> **What changed (Phase 8 partial — 2026-03-18 layout redesign):**
> - Deleted `src/lib/large-dataset-optimizer.ts` (zero consumers).
> - Deleted `src/pages/Index.tsx` (not in router; zero imports; dead code).
> - Removed unused `TabsList`/`TabsTrigger` imports from `SlideViewPage` (tab switching now handled by `ReportSidebar`).
> - Created `src/components/slides/ReportSidebar.tsx` — left nav with Reports tabs (Overview, Metasearch, SEM, Social, Budget, Booking, Price Check) + Actions (Refresh, Share) + Manage (Data Sources, Dimensions) + Tools (Forecast, Price Widget).
> - Rewrote `src/components/slides/SlideViewHeader.tsx` — topbar with back button, report name + last refreshed, Data Sources, Dimensions, Share, Refresh Data.
> - Created `src/components/slides/FiltersRow.tsx` — extracted date range + channel filter dropdowns from `SlideViewPage`.
> - Created `src/components/slides/AISummaryDisplay.tsx` — canonical markdown AI summary card with design system styling (replaces `FormattedAISummary.tsx`).
> - Created `src/components/filters/DateRangeFilter.tsx` — date range picker with preset sidebar + calendar + compare toggle. Canonical implementation: left preset list + right two-month calendar; no "Custom Range" preset in SlideView usage. `calendar-with-presets.tsx` is the sole calendar primitive (old `calendar.tsx` deleted). `twMerge` ensures className overrides work correctly when embedded in popovers.
> - Created `src/lib/monthUtils.ts` — multi-month selection utilities (moved from inline in `SlideViewPage`).
> - Refactored `src/index.css` — full design system token rewrite: HSL vars, DM Sans font, light-only theme, luxury minimalist palette (primary `#FF0068`, accent `#7C39FF`).
> - Route simplification: `/` now renders `SlideViewPage` directly (Data Studio is the homepage). All `/tools/reports/*` and `/tools/data/*` routes redirect to `/`. `ReportDashboard`, `SlidesPage`, `Landing` removed from router.
> - `src/App.tsx` rewritten to reflect new route structure.
> - Cleanup + tooling:
>   - Deleted unused pages: `src/pages/SlidesPage.tsx`, `src/pages/ReportDashboard.tsx` (post-verification).
>   - Restored missing Edge Function entrypoint: `supabase/functions/generate-ai-summary/index.ts` (410 retired stub) to keep tooling/lint stable.
>   - ESLint: ignore `server.js` (non-module Node script; caused parse error during `eslint .`).
> - Security fixes:
>   - Removed hardcoded Anthropic API key fallback from `supabase/functions/generate-ai-summary/index.ts` (now env-only: `ANTHROPIC_API_KEY`).
>   - Scrubbed documentation examples that included a real JWT (`AUTO_SYNC_SETUP.md`) and replaced with placeholders.
>   - Sanitized committed `.env` values to placeholders (project ref/anon key/url) to prevent leaking environment specifics in repo history.
> - Build: `npm run build` ✓ exit 0 (bundle -45KB). Lint: `npm run lint` ✓ 0 errors, 114 warnings.

#### 8-F1 audit notes (duplicate view systems)

There are currently **two view systems** that look similar but are not yet unified:

- **Canonical PerformanceTable view settings**: `report_views`
  - Used by: `src/hooks/performanceTable/usePerformanceTableViews.ts`
  - Stores: table column/KPI visibility, grouping/breakdowns, ordering, and filter settings for the PerformanceTable/Data dashboard.

- **Legacy SlideView “saved filter views”**: `slide_report_views`
  - Used by: `src/hooks/useSlideReportViews.ts` and consumed by `src/hooks/useSlideReportPage.ts`
  - Stores: year/month, comparison type, tab, and `filter_values` keyed by channel/dimension for the SlideView report experience.
  - **DB coupling (cannot delete yet):**
    - `budgets.view_id` references `public.slide_report_views(id)` (migration `20260116000000_add_view_id_to_budgets.sql`)
    - `share_links.view_id` references `public.slide_report_views(id)` (migration `20260115000000_add_view_id_to_share_links.sql`)
    - `slide_report_summaries.view_id` references `public.slide_report_views(id)` (migration `20260120000000_create_slide_report_summaries.sql`)

**Conclusion:** `slide_report_views` is currently a **used system** with DB foreign keys and distinct semantics. It is a duplicate “views” concept, but not a drop-in duplicate of `report_views`. We must **unify via migration**, not delete in place.

##### Unification plan (future Phase 8-F1)

1. **Define the canonical “view” contract** (single table) and decide where SlideView-specific fields live:
   - Option A (preferred): extend `report_views` with a nullable `mode` enum (e.g. `performance_table` | `slide_view`) and add SlideView fields (`tab`, `selected_year`, `selected_month`, `comparison_type`, `chart_time_range`, `price_check_chart_time_range`, `filter_values`).
   - Option B: introduce `views` table as the canonical abstraction and migrate both `report_views` and `slide_report_views` into it (larger change; more migrations).

2. **Add additive migrations**:
   - Add new columns to the canonical table for SlideView fields (or create new canonical table).
   - Add new FK columns:
     - `budgets.view_id` → canonical table (new column, backfill, then swap)
     - `share_links.view_id` → canonical table
     - `slide_report_summaries.view_id` → canonical table

3. **Backfill + dual-read period**:
   - Copy existing `slide_report_views` rows into canonical table, preserving IDs via mapping table (or store legacy_id).
   - Update frontend to read/write the canonical table while still supporting legacy IDs for shared links during transition.

4. **Verify → Delete**:
   - Verify no frontend reads/writes to `slide_report_views`.
   - Verify no edge functions or RLS policies depend on it.
   - Only then: drop legacy FKs, drop `slide_report_views` table in Phase 9.

### Phase 9 — DB table drops + final edge function removal (LOW — after proof)

> **Goal:** Drop confirmed-unused legacy tables after all reads/writes have been removed and verified. Additive-only until each table passes the full "Used in current stack?" checklist.

- [x] **9-DB1** — `sheet_data` dropped (migration `20260318200000_phase9_drop_legacy_tables.sql`). Zero frontend reads; zero edge function writes confirmed.
- [x] **9-DB2** — `slide_report_channel_year_data` dropped. No reads; `refresh-slide-report` gated (410).
- [x] **9-DB3** — `slide_report_channel_month_data` dropped. No reads; `refresh-slide-report-channel` gated (410).
- [x] **9-DB4** — `slide_report_channel_raw_rows` dropped. No reads.
- [x] **9-DB5** — `slide_report_monthly_data` dropped. Hardcoded `[]` in `useSlideReportPage` (comment only); no DB reads.
- [x] **9-DB6** — `slide_report_summaries` dropped. AI summaries removed; no reads/writes in `src/` or `supabase/functions/`.
- [x] **9-DB7** — `slide_report_views` dropped. All reads/writes migrated to `public.views` (Phase 8-F1 complete).
- [x] **9-DB8** — `report_api_data` dropped. `sync-report-api-data`/`get-report-api-data` edge functions deleted; `auto-sync-data-sources` no-ops the old call.
- [x] **9-DB9** — `monthly_dimension_data` dropped. No reads/writes found anywhere.
- [x] **9-DB10** — `aggregated_breakdown_data` dropped. No reads/writes found anywhere.

> Migration: `supabase/migrations/20260318200000_phase9_drop_legacy_tables.sql` — applied 2026-03-18. TypeScript types regenerated post-drop.

### Remaining work (next steps)

Aligned with `TODO.md` next steps. No duplicate systems; one canonical path per capability.

- [ ] **NS-1** — Audit `run-refresh-workflow`: remove legacy `slideReportId` → `refresh-slide-report` branch; keep only `resync-data-source` orchestration.
- [ ] **NS-2** — Migrate `debug.ts` utilities (`retryWithBackoff`, `filterDimensionsByFilterSettings`) to descriptive modules (e.g. `src/lib/utils/retry.ts`, `src/lib/utils/dimensionFilter.ts`); delete `debug.ts`.
- [ ] **NS-3** — Dead code: verify `ForecastingPage.tsx` router status; remove if unused.
- [ ] **NS-4** — Consolidate `resync-dimensions.ts` (flat) and `resync-all-dimensions.ts` (flat) into `resync-all-dimensions/` folder module.
- [ ] **NS-5** — Delete `src/lib/sync-utils.ts` once callers (`useDataSourceHeaders.ts`, `EditDataSourceModal.tsx`, `ViewDataModal.tsx`) are migrated off `parseDate`/`parseValue`/`fetchGoogleSheetsData` to `src/lib/data-sources/`.

---

### Phase 1 — Verify DB integrity + mapping references (HIGH)

- [x] Audit `report_views` / slide views for **broken dimension references**
- [x] Add/confirm DB constraints preventing future duplicates (safe, additive)
- [x] Add server-side + client-side **mapping validation** (detect invalid IDs and self-heal where safe)

### Phase 2 — Canonical dimension loading + settings mapping (HIGH)

- [x] Define a single canonical dimension loading API (frontend) with precedence rules
- [x] Align Edge Functions to use the same rules (shared logic or identical implementation)
- [x] Canonicalize view settings mapping (visible columns/KPIs/orders)

### Phase 3 — Remove duplicate implementations (MED)

- [x] Migrate consumers to canonical PerformanceTable implementation
- [x] Delete legacy/duplicate table implementations and hooks after verification
- [x] Standardize “Apply” behavior across settings modals

### Phase 4 — Testing + regression harness (MED/LOW)

- [x] Add unit tests for dimension dedupe + mapping validation
- [x] Add integration tests around a representative report view

### Phase 5 — Cleanup (LOW)

- [x] Fix data-fetching mapping bugs: comparison keying, column ordering, duplicate mapper, debug logs, type-detection threshold
- [x] Delete unused utilities/assets guarded by “Used in current stack?” checklist

#### Phase 5 evidence (Verify → Delete)

Deleted unused one-off repair scripts (not imported; no runtime route usage; no tests; not used by Edge Functions):

- `src/lib/fix-diji-sem-views.ts`
- `src/lib/fix-diji-social-views.ts`
- `src/lib/force-refresh-views.ts`
- `src/lib/metasearch-resync-fix.ts`
- `src/lib/dimension-sync-auto-fix.ts`
- `src/lib/debug-report-issues.ts`

Verification notes:

- **No imports in `src/`**: confirmed via repo search for each filename/module name prior to deletion.
- **No runtime references**: these were not referenced by routes, lazy imports, or dynamic requires.
- **No tests depend on it**: no matches found outside the files themselves.
- **No Edge Functions depend on it**: nothing under `supabase/functions/` referenced these modules.

#### Route + shared-link contract updates

- Shared report links **stay on** `/shared/:slug` and do **not** redirect into `/tools/*` routes.
- Internal navigation no longer generates `/tools/*/${accountId}` links for AI summaries; deep links can use `/tools/report/:uuid` (resolved to the owning account server-side by lookup).

#### Build/lint verification

- `npm run build` ✅ (2026-03-18)
- `npm run lint` ✅ (2026-03-18, warnings only)

### 2026-03-18 (Supabase unification: canonical storage/fetch)

- **Canonical DB source of truth:** `dimension_data` (typed, dimension-id keyed rows).
- **Documented canonical vs legacy tables:** added “Canonical data model (single unified version)” section under Database.
- **Deprecated slide-report persistence:** added runtime gates to disable slide cache writers/readers by default (set `SLIDE_REPORT_CACHE_ENABLED=true` to allow temporarily):
  - `supabase/functions/refresh-slide-report`
  - `supabase/functions/refresh-slide-report-channel`
  - `supabase/functions/run-refresh-workflow` (blocks `slideReportId` refresh when gate is off)
  - `supabase/functions/get-slide-report-data`
  - `supabase/functions/get-slide-report-display-data`
- **Unified Data Studio row source:** `src/hooks/useDataStudioRawRows.ts` now reads from `dimension_data` (no origin Google Sheets/CSV fetch path).
- **Removed deprecated hook:** deleted `src/hooks/performanceTable/usePerformanceData.ts` (no remaining imports).
- **Aligned edge dimension precedence with frontend:** `supabase/functions/get-performance-data/index.ts` now loads dimensions with canonical precedence (account > custom (report-scoped or null) > global, plus legacy report_id safety include).
- **DB guardrails (additive migration):** added `supabase/migrations/20260318090000_dimension_data_indexes_and_slide_deprecation.sql`:\n  - indexes: `idx_dimension_data_report_row_number`, `idx_dimension_data_report_data_source`\n  - `deprecated_at` columns on `slide_report_*` tables.
- **Checks run:**\n  - `npm run build` ✅ (2026-03-18)\n  - `npm run lint` ✅ (2026-03-18, warnings only)

---

## Verify → Migrate → Delete protocol (required)

For any candidate module to delete:

### Used in current stack? (checklist)

- [ ] No imports found in `src/` (search)
- [ ] No runtime references (routes, lazy imports, dynamic requires)
- [ ] No tests depend on it
- [ ] No Edge Functions depend on it
- [ ] If it affects DB schema/migrations: **additive-only** unless explicitly marked safe to delete

Only after all above are checked, proceed to deletion.

---

## Phase execution log

### 2026-03-18

- Initialized this doc as the single source of truth for the refactor in this repo.
- Phase 1 completed:
  - KPI name mapping fix: `getAccountDefaultKPIs()` now returns **exact KPI names from available dimensions** (case-insensitive match, canonical casing) so persisted `report_views.visible_kpis` / `kpi_order` no longer store “almost matching” strings.
  - Self-heal: `resyncReportViews()` now also normalizes and repairs `kpi_order` to stay consistent with `visible_kpis` (drops invalids, preserves order, appends missing).
  - DB guardrail: added `supabase/migrations/20260318000100_dimensions_unique_per_scope.sql` with `dimensions_unique_name_per_context` unique index to prevent future duplicate dimension names within the same context.
  - Checks run:
    - `npm run build` ✅
    - `npm run lint` ✅ (warnings remain; no errors)

- **Phase A (UX/UI) — 2026-03-18:** Account removal & post-login index.
  - **A1:** Added `src/hooks/useUserAccount.ts`: fetches `accounts` for current user via `useUser()`, returns first account as `account` plus `accounts`, `isLoading`, `error`. Used for one-account-per-user resolution without UI selection.
  - **A2/A3:** Landing rewritten: no Select Account, no account list, no Create/Edit/Delete account UI. Removed `CreateAccountModal`, `DeleteAccountDialog`, `EditAccountModal` from Landing. After auth, Landing uses `useUserAccount()`; if no account, shows “No account linked. Contact support.”; if account exists, shows only three tool cards (Reports, Forecast, Price Widget) with links using `account.id`. Auth page unchanged (only “Create Account” there is sign-up; no business-account creation).
  - **A4:** `accountId` resolved in Landing via `useUserAccount().account.id`; routes still use `:accountId`, links built from resolved account.
  - **A5:** Back/nav links updated to `navigate("/")` and tooltip to “Back to dashboard” in: SlidesPage, ReportDashboard, PriceWidgetPage, ForecastingDashboard, AISummaryPage.
  - **Verification:** `npm run build` ✅, `npm run lint` ✅ (warnings only). CreateAccountModal, EditAccountModal, DeleteAccountDialog are no longer imported in Landing; they remain in codebase for potential removal in a later cleanup (see “Used in current stack?” when deleting).

- **Phase B (Single Data Studio) — 2026-03-18:** Reports consolidated to one Data Studio view.
  - **B1:** SlidesPage shows a single "Data Studio" card only. Removed Master Report card, Other Reports collapsible, CreateChildReportModal usage, and Master Report cleanup. One effect creates a Data Studio slide_report if none exists.
  - **B2:** Removed routes brady and master-report from App.tsx. Kept data-studio and view/:slideId.
  - **B3:** useSlideReportPage: slideType only 'default'; report resolution prefers "Data Studio". SlideViewPage: slideType always 'default'; removed master-report/brady logic, currency/fx, Brady dimension filters.
  - **B4/B5:** One "Data Studio" report per account when missing; Edit Source uses name "Data Studio". Canonical report type is Data Studio.
  - **Verification:** npm run build and lint pass (warnings only).

- **Route simplification (Index = Report) — 2026-03-18:**
  - `/` now renders `SlideViewPage` directly (report is the homepage).
  - Legacy report entry routes now **redirect to `/`**:
    - `/landing`
    - `/tools/reports`, `/tools/reports/:accountId`, `/tools/reports/:accountId/data-studio`
    - `/tools/data`, `/tools/data/:accountId`
  - Report sidebar now includes quick access items for **Forecast** and **Price Widget**.

- **Phase 3 / C4–C5 (Remove duplicate table/hooks) — 2026-03-18:** Deleted unused PerformanceTable and data hook duplicates.
  - **Used in current stack?** Verified: no imports of PerformanceTable.old, PerformanceTable.refactored, or usePerformanceTableDataFixed in src/ (grep). Canonical: PerformanceTable.tsx and usePerformanceTableData.ts.
  - **Deleted:** PerformanceTable.old.tsx, PerformanceTable.refactored.tsx, usePerformanceTableDataFixed.ts. No migration needed; consumers already use PerformanceTable and usePerformanceTableData.
  - **Verification:** npm run build ✅, npm run lint ✅ (warnings only).

- **Phase 2 (Canonical dimension loading + view settings) — 2026-03-18:**
  - **C1 — Canonical dimension loading API:** `src/lib/dimensionLoader.ts` is the single source of truth. Precedence: account > custom > global. Extended `loadDimensionsForUser(userId, reportId?, options)` with optional `accountId` (avoids resolving from report when already known), and `typeFilter: 'text'` for MasterFilter. Migrated: `usePerformanceTableDimensions` now calls `loadDimensionsForUser` and adds budget/fallback/essential KPIs on top; `DimensionsListModal` and `MasterFilter` use `loadDimensionsForUser` instead of inline fetches.
  - **C2 — Edge Functions:** Documented in `supabase/functions/resync-data-source/utils/dimensions.ts` that precedence matches frontend (account → custom → global). No behavior change; already aligned.
  - **C3 — View settings mapping:** Documented in `src/lib/performanceTable/viewSettingsMapper.ts` as the canonical module for mapping visible_columns, visible_kpis, kpi_order to account-scoped dimensions. usePerformanceTableViews and resync-report-views already use it.
  - **Verification:** `pnpm run build` ✅, `pnpm run lint` ✅ (0 errors, warnings only).

- **Phase 3 C6 (Standardize Apply behavior) — 2026-03-18:**
  - **Standard:** Apply = persist (where applicable) + close modal/sheet; Cancel = revert local state + close.
  - **KPISettingsModal:** Cancel now calls `onOpenChange(false)` after reverting state so the sheet closes (previously only reverted, sheet stayed open).
  - **DimensionsListModal:** Cancel now calls `onOpenChange(false)` after reverting so the dialog closes.
  - **ColumnVisibilitySheet:** Sheet is now controlled from TableHeader (`open` + `onOpenChange`). Apply and Cancel both call `onOpenChange(false)` after their action so the sheet closes. TableHeader holds `columnSheetOpen` state and passes it to ColumnVisibilitySheet.
  - **Verification:** `pnpm run build` ✅, `pnpm run lint` ✅ (0 errors, warnings only).

- **Phase 4 (Testing + regression harness) — 2026-03-18:**
  - **Unit tests — dimension dedupe:** Exported pure `dedupeDimensionsByName<T>(dimensions: T[])` from `src/lib/dimensionLoader.ts` and added `src/lib/__tests__/dimensionLoader.test.ts` (5 tests: empty input, unique names, first-occurrence precedence, order preservation, case-sensitivity).
  - **Unit tests — mapping validation:** Added `src/lib/__tests__/utils.kpi.test.ts` for `sortKPIsByDefaultOrder` and `getAccountDefaultKPIs` (9 tests: priority order, Roomstay exact casing, fallback for non-Roomstay, no duplicate KPIs).
  - **Integration tests — report view:** Added `src/pages/__tests__/reportView.integration.test.tsx`: PerformanceTable (core report view) rendered with QueryClientProvider and minimal props; two tests (renders without crashing, shows loading or content when reportId is null).
  - **Verification:** `pnpm run test -- --run` 49 tests passed; `pnpm run build` ✅; `pnpm run lint` ✅ (0 errors, warnings only).

- **Phase 5 (Data-fetching mapping fixes) — 2026-03-18:**
  - **Fix 1 — Duplicate `mapDimensionIdsLocal`:** Removed the inline copy of `mapDimensionIds` from `usePerformanceTableViews.ts` (lines 184–230). All four call-sites (`group_by_dimensions`, `breakdown_by_dimensions`, `then_by_dimensions`, `filter_dimensions`) now call the canonical `mapDimensionIds` from `src/lib/performanceTable/viewSettingsMapper.ts` (already imported). No behavior change; single implementation maintained.
  - **Fix 2 — Comparison data map keying bug:** `compareDataMap` in `usePerformanceTableData.ts` was keyed by `String(dv[firstDimId])` — when the first `groupByDimension` was a date, comparison rows were bucketed by date string instead of channel. Fixed: introduced `buildGroupKey` that composes all `groupByDimensions` values with `||` separator, used for both building the map and looking up per-row compare data.
  - **Fix 3 — `mapVisibleColumns` column-order bug:** The original implementation appended valid IDs *after* stale-resolved IDs, breaking the persisted column order. Rewrote to: (a) batch-fetch stale IDs in one query, (b) build a `staleIdResolutionMap`, then (c) iterate the original `visibleColumnIds` in order — resolving each to its current account-scoped ID while deduplicating — so output order matches input order.
  - **Fix 4 — Remove `[testing]` debug log prefixes:** Replaced `[testing]` prefix in `viewSettingsMapper.ts` `console.log/warn/error` calls with `[viewSettingsMapper]` for consistent production log attribution.
  - **Fix 5 — `autoDetectColumnType` threshold bug:** The 70% threshold was computed against `nonEmptyValues.length` (all rows) but the loop only checked the first 10 values, so the denominator was inflated for large columns. Fixed: capped `sample = nonEmptyValues.slice(0, 10)` and computed `total = sample.length` so threshold is consistent with the actual sample inspected.
  - **Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors, warnings only — all pre-existing).

- **Phase 5 (Cleanup) — 2026-03-18:**
  - **Route cleanup:** `/tools/data` and `/tools/forecasting` were legacy “account picker + CRUD” pages. Replaced both with redirect-only pages that resolve the single account via `useUserAccount()` and navigate to `/tools/data/:accountId` and `/tools/forecasting/:accountId` respectively.
  - **Deleted (after verification):**
    - `src/components/CreateAccountModal.tsx`
    - `src/components/EditAccountModal.tsx`
    - `src/components/DeleteAccountDialog.tsx`
    - `src/lib/migrate-to-account-dimensions.ts`
  - **Used in current stack? (verification checklist):**
    - [x] No imports found in `src/` (search for `CreateAccountModal|EditAccountModal|DeleteAccountDialog|migrate-to-account-dimensions`)
    - [x] No runtime references (routes/imports): entry routes now point to redirect pages; no lazy/dynamic imports found for the deleted modules
    - [x] No tests depend on it (no matches in `src/**/__tests__` and `src/**/*.test.*`)
    - [x] No Edge Functions depend on it (no matches in `supabase/functions`)
    - [x] No DB schema/migrations impacted (pure frontend/library deletion)
  - **Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors, warnings only — all pre-existing).
  - **Deleted (after verification):**
    - `src/components/ReportsSidebarDemo.tsx`
    - `src/pages/DevPage.tsx`
  - **Route changes:** removed `/demo/sidebar` and `/dev` from `src/App.tsx`.
  - **Used in current stack? (verification checklist):**
    - [x] No imports found in `src/` besides `src/App.tsx`
    - [x] No runtime references (routes removed; no lazy/dynamic imports)
    - [x] No tests depend on it
    - [x] No Edge Functions depend on it
    - [x] No DB schema/migrations impacted
  - **Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors, warnings only — all pre-existing).
  - **Deleted (after verification):**
    - `src/lib/priceCheckDataRaw.ts`
  - **Used in current stack? (verification checklist):**
    - [x] No imports found in `src/` (search for `PRICE_CHECK_DATA_RAW` / `priceCheckDataRaw`)
    - [x] No runtime references (no routes/lazy/dynamic imports)
    - [x] No tests depend on it
    - [x] No Edge Functions depend on it
    - [x] No DB schema/migrations impacted
  - **Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors, warnings only — all pre-existing).
  - **Deleted (after verification):**
    - `src/components/MasterReportSetupModal.tsx`
    - `src/components/MasterReportSettingsModal.tsx`
    - `src/components/MasterReportTable.tsx`
  - **Unified path:** removed the legacy “Master report” UI/data pathway from `AISummaryPage.tsx` so AI summaries no longer rely on a parallel aggregation pipeline. Data Studio / PerformanceTable remains the canonical report view pipeline.
  - **Used in current stack? (verification checklist):**
    - [x] No imports found in `src/` (search for `MasterReportSetupModal|MasterReportSettingsModal|MasterReportTable`)
    - [x] No runtime references (no routes/lazy/dynamic imports)
    - [x] No tests depend on it
    - [x] No Edge Functions depend on it
    - [x] No DB schema/migrations impacted
  - **Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors, warnings only — all pre-existing).
  - **Single-view report UX:** Data Studio is the only report view now.
    - `/tools/reports/:accountId` redirects to `/tools/reports/:accountId/data-studio`
    - `/tools/reports/:accountId/view/:slideId` redirects to `/tools/reports/:accountId/data-studio`
  - **Deleted (after verification):**
    - `src/components/slides/SlideListItem.tsx`
    - `src/components/slides/CreateSlideModal.tsx`
    - `src/components/slides/CreateChildReportModal.tsx`
  - **Used in current stack? (verification checklist):**
    - [x] No imports found in `src/` (search for `SlideListItem|CreateSlideModal|CreateChildReportModal`)
    - [x] No runtime references (routes now redirect; no lazy/dynamic imports)
    - [x] No tests depend on it
    - [x] No Edge Functions depend on it
    - [x] No DB schema/migrations impacted
  - **Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors, warnings only — all pre-existing).
  - **Deleted (after verification):**
    - `src/hooks/useSlides.ts`
  - **Used in current stack? (verification checklist):**
    - [x] No imports found in `src/` (search for `@/hooks/useSlides` / `useSlides(`)
    - [x] No runtime references (route entrypoints removed; no dynamic imports)
    - [x] No tests depend on it
    - [x] No Edge Functions depend on it
    - [x] No DB schema/migrations impacted
  - **Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors, warnings only — all pre-existing).
  - **Route slug simplification:** Added short entry routes that resolve the user’s account and redirect to the account-scoped pages:
    - `/tools/reports` → `/tools/reports/:accountId/data-studio`
    - `/tools/data-sources` → `/tools/data-sources/:accountId`
    - `/tools/dimensions` → `/tools/dimensions/:accountId`
    - `/tools/price-widget` → `/tools/price-widget/:accountId`
  - **Removed legacy route:** `/tools/reports/:accountId/view/:slideId` removed from `src/App.tsx` (single-view contract).
  - **Accountless routes now render tool pages directly:** `ReportDashboard`, `ForecastingDashboard`, `DataSourcesPage`, `DimensionsPage`, `SlideViewPage`, `PriceWidgetPage` now resolve `accountId` from `useUserAccount()` when missing from the URL.
  - **No more accountId links generated:** updated in-app navigation to prefer short routes:
    - reports sidebar + dropdowns now navigate to `/tools/data?reportId=...`
    - price widget detail “back” now navigates to `/tools/price-widget`
    - shared report redirect now navigates to `/tools/reports` (single-view contract)
    - slides legacy redirect now navigates to `/tools/reports`
  - **Deleted (after verification):**
    - `src/pages/ReportsEntry.tsx`
    - `src/pages/DataSourcesEntry.tsx`
    - `src/pages/DimensionsEntry.tsx`
    - `src/pages/PriceWidgetEntry.tsx`
    - `src/pages/ReportTool.tsx`
    - `src/pages/ForecastingTool.tsx`
  - **Verification:** `npm run build` ✅, `npm run lint` ✅ (0 errors, warnings only — all pre-existing).

### 2026-03-19

- **Refresh workflow (modes + row count):**
  - `resync-data-source` and `run-refresh-workflow` support `refreshMode: 'full' | 'recent'` (full = replace all rows; recent = last 2 months only). Modal step 0 lets user choose before starting.
  - `run-refresh-workflow` aggregates `rowsProcessed` from each `resync-data-source` and returns it; frontend shows "X rows imported" (and "(last 2 months)" when recent) in `RefreshDataModal` success message.
  - Deployed: `run-refresh-workflow` v6, `resync-data-source` with `refreshMode` and `rowsProcessed`. See "Refresh workflow" subsection in Progress tracker and TODO.md.

---

## Master TODO plan

### A. Account removal & post-login index (UX refactor)

- [x] **A1** — Add user → account resolution (hook or context: one account per user from `accounts`).
- [x] **A2** — Landing: after login show only Reports / Forecast / Price widget; remove Select Account and Create Account UI.
- [x] **A3** — Remove Create Account from Auth page and remove CreateAccountModal / EditAccountModal / DeleteAccountDialog usage (or delete components if unused).
- [x] **A4** — Resolve `accountId` in app: either keep routes with `:accountId` and inject from context, or add routes without `accountId` and resolve in each page.
- [x] **A5** — Update “Back” / nav links to point to new index (e.g. `/` or `/landing`), not account selector.

### B. Single Data Studio (reports consolidation)

- [x] **B1** — SlidesPage: remove Master Report card, duplicate Data Studio card, and Other Reports; single “Data Studio” entry that opens the one view.
- [x] **B2** — App: remove routes `/tools/reports/:accountId/brady` and `/tools/reports/:accountId/master-report`; keep one report view route (e.g. `/tools/reports/:accountId/data-studio` or single view).
- [x] **B3** — SlideViewPage & useSlideReportPage: remove `master-report` and `brady`; only support single Data Studio mode (data source + dimensions).
- [x] **B4** — Slide report creation: stop creating/ensuring both “Master Report” and “Data Studio”; one report type for Data Studio only.
- [x] **B5** — Clean up slide_reports usage: ensure one canonical “Data Studio” report per account (or user); document in DB section below.

### C. Dimensions & KPI mapping (existing refactor)

- [x] **C1** — Phase 2: Canonical dimension loading API + precedence rules (frontend).
- [x] **C2** — Phase 2: Align Edge Functions to same dimension rules.
- [x] **C3** — Phase 2: Canonicalize view settings mapping (visible columns/KPIs/orders).
- [x] **C4** — Phase 3: Migrate to canonical PerformanceTable; delete PerformanceTable.old and PerformanceTable.refactored after verification.
- [x] **C5** — Phase 3: Delete or consolidate usePerformanceTableDataFixed; one canonical data hook.
- [x] **C6** — Phase 3: Standardize “Apply” behavior across settings modals.
- [x] **C7** — Phase 4: Unit tests for dimension dedupe + mapping validation.
- [ ] **C8** — Phase 5: Delete unused utilities per “Used in current stack?” checklist.

### D. Database

- [ ] **D1** — Confirm one-account-per-user (or first-account) policy; document in DB section; no schema change if already `accounts.user_id`.
- [ ] **D2** — Optional: migration to ensure every user has exactly one account (e.g. create default account if none)—only if product decision is “auto-create one account per user.”
- [ ] **D3** — No destructive migrations for account removal; only additive (e.g. indexes) or application-level “ignore multiple accounts” until product confirms.
- [ ] **D4** — slide_reports: document which report name/type is canonical for “Data Studio”; optional cleanup migration to merge or rename Master Report → Data Studio (only after B4/B5 and backup).

### E. Data sources + Data Studio unification (Phase 6)

- [x] **E1** — Canonical fetch path: `useCachedSourceData` / `useDataStudioRawRows` reads `dimension_data`; `useFiltersSourceData` deleted.
- [x] **E2** — `useSlideReportChannelData` removed; `effectivePivotData` from `dataStudioRawRows` only.
- [x] **E3** — `useMetasearchJan2026RawRows` removed; utils in `metasearchJan2026Utils.ts`.
- [x] **E4** — `CSVImportChoiceModal`, `DataSourcesListModal`, `MappingModal` deleted; `EditMappingModal` single mapping step.
- [x] **E5** — `handleCreateBookingReport`, `handleCreatePriceCheckReport` removed from `DataSourcesPage`.

### F. Legacy pivot cache + edge function cleanup (Phase 7)

- [x] **F1** — `refresh-slide-report`, `refresh-slide-report-channel`, `get-slide-report-data`, `get-slide-report-display-data` gated (410 when `SLIDE_REPORT_CACHE_ENABLED` false); Data Studio reads `dimension_data`.
- [x] **F2** — `get-consolidated-performance-data`, `sync-report-api-data`, `get-report-api-data`, `migrate-sheet-data`, `clear-and-resync`, `apply-vlookup-mappings` gated or deleted; `report_api_data` dropped.
- [x] **F3** — `slideReportChannelDataMerge.ts`, `refreshPivotDataHelpers.ts`, `slideReportPivotComputation.ts` deleted.
- [x] **F4** — `slide_report_summaries` table dropped in Phase 9; `useSlideReportSummaries` obsolete (no backing table).

### G. View settings + resync consolidation (Phase 8)

- [x] **G1** — `public.views` canonical; `slide_report_views` migrated and dropped; `budgets.view_id` → `views`.
- [x] **G2** — `resync-dimensions.ts` and `resync-all-dimensions/` documented as distinct (column mapping vs dimension data); no consolidation needed.
- [x] **G3** — `large-dataset-optimizer.ts` deleted; `data-loading-fix.ts` deferred (KPIChart still uses it).
- [x] **G4** — `monthly_dimension_data`, `aggregated_breakdown_data` dropped in Phase 9.

### H. DB table drops (Phase 9 - after proof)

- [x] **H1** — `sheet_data` dropped (migration `20260318200000_phase9_drop_legacy_tables.sql`).
- [x] **H2** — `slide_report_channel_*`, `slide_report_monthly_data` dropped.
- [x] **H3** — `slide_report_summaries`, `slide_report_views` dropped.
- [x] **H4** — `report_api_data`, `monthly_dimension_data`, `aggregated_breakdown_data` dropped.

---

## SOP phases (standard operating procedure)

### SOP 0 — Pre-flight (before any phase)

1. Ensure `docs/REFACTOR.md` is read and the phase checklist is clear.
2. Create a feature branch for the phase (e.g. `refactor/phase-A-account-removal`).
3. Run and record baseline: `npm run build`, `npm run lint`; note any existing failures.
4. If DB migrations are involved: backup or snapshot DB (or ensure migrations are additive and reversible).

### SOP 1 — Phase A: Account removal & index

**Goal:** After login, user sees only Reports / Forecast / Price widget; no account selector or create account.

| Step | Action | Verification |
|------|--------|--------------|
| 1.1 | Add `useUserAccount()` (or auth context extension) that fetches `accounts` where `user_id = session.user.id`, returns first row or single account. | Logged-in user has `accountId` available without UI selection. |
| 1.2 | In Landing: remove state and UI for “Select Account,” account list, “Create Account” button; remove CreateAccountModal, DeleteAccountDialog, EditAccountModal from render. | Landing has no account picker or create/edit/delete account. |
| 1.3 | In Landing: after auth, call `useUserAccount()`; if no account, show minimal message or redirect (per product rule). If account exists, show only the three tool cards (Reports, Forecast, Price widget) using resolved `accountId` for links. | Opening `/` or `/landing` when logged in shows three cards only. |
| 1.4 | In Auth page: remove “Create Account” button/link and any create-account flow. | Auth page only has login/signup. |
| 1.5 | Update all tool links to use resolved `accountId` (from context/hook). Update “Back” from SlidesPage (and similar) to navigate to `/` or `/landing`. | No broken links; back goes to index. |
| 1.6 | Run `npm run build` and `npm run lint`; fix regressions. Update REFACTOR.md progress. | Build and lint pass. |

**Rollback:** Revert Landing and Auth to previous version; re-enable account selector and modals.

### SOP 2 — Phase B: Single Data Studio

**Goal:** One “Data Studio” with data source and dimensions; remove Master Report, Brady, and duplicate entries.

| Step | Action | Verification |
|------|--------|--------------|
| 2.1 | In SlidesPage: remove the Master Report card, the second “Data Studio” card (if duplicated), and the “Other Reports” collapsible; replace with one primary “Data Studio” (or “Reports”) that navigates to the single report view. | Reports list shows one entry only. |
| 2.2 | In App.tsx: remove `<Route path="/tools/reports/:accountId/brady" ...>` and `<Route path="/tools/reports/:accountId/master-report" ...>`. Keep `/tools/reports/:accountId/data-studio` (and optionally `/view/:slideId` if needed). | Only one report view route. |
| 2.3 | In SlideViewPage and useSlideReportPage: remove `slideType === 'master-report'` and `slideType === 'brady'` branches; treat all report view as single “Data Studio” mode (data source + dimensions). | No references to master-report or brady. |
| 2.4 | In SlidesPage and any slide report creation: ensure only one “Data Studio” report is created/used per account; remove logic that creates or ensures “Master Report” as separate entity. | One canonical report per account for Data Studio. |
| 2.5 | Run `npm run build` and `npm run lint`; manual test: open Reports → Data Studio, confirm data source and dimensions. Update REFACTOR.md. | Build/lint pass; Data Studio works. |

**Rollback:** Restore removed routes and SlidesPage cards; re-enable slideType branching.

### SOP 3 — Phase C (dimensions/KPI): Canonical dimension loading

**Goal:** One canonical dimension loading API and view settings mapping.

| Step | Action | Verification |
|------|--------|--------------|
| 3.1 | Implement single dimension-loading function or hook (precedence: custom > account > global); use in all consumers. | All dimension usage goes through one API. |
| 3.2 | Align Edge Functions to same precedence rules (shared logic or copy). | Edge dimension results match frontend. |
| 3.3 | Canonicalize view settings (visible_columns, visible_kpis, kpi_order) in one module; use in report_views and UI. | Single code path for view settings. |
| 3.4 | Run build/lint; update REFACTOR.md. | Green. |

### SOP 4 — Phase C: Remove duplicate table/hooks

**Goal:** One PerformanceTable and one table data hook.

| Step | Action | Verification |
|------|--------|--------------|
| 4.1 | Choose canonical: PerformanceTable.tsx and usePerformanceTableData.ts. | Document in REFACTOR.md. |
| 4.2 | Migrate any unique logic from PerformanceTable.old and PerformanceTable.refactored into PerformanceTable.tsx. | No behavior lost. |
| 4.3 | Migrate any unique logic from usePerformanceTableDataFixed into usePerformanceTableData. | Single data hook. |
| 4.4 | Run “Used in current stack?” for PerformanceTable.old, PerformanceTable.refactored, usePerformanceTableDataFixed. | No imports/routes left. |
| 4.5 | Delete PerformanceTable.old.tsx, PerformanceTable.refactored.tsx, usePerformanceTableDataFixed.ts. | Build/lint pass. |

### SOP 5 — Phase D: Database

**Goal:** Safe, documented DB posture for account and Data Studio refactor.

| Step | Action | Verification |
|------|--------|--------------|
| 5.1 | Document: “One account per user” = first row in `accounts` where `user_id = auth.uid()`; no schema change. | REFACTOR.md DB section updated. |
| 5.2 | If product confirms “auto-create one account per user”: add migration that creates one account per user when none exists (idempotent). | Migration runs; every user has ≥1 account. |
| 5.3 | No destructive drop of `accounts` or removal of `account_id` from reports/slide_reports until explicitly approved. | Only additive or application-level changes. |
| 5.4 | Optional: migration or script to rename/merge “Master Report” → “Data Studio” in slide_reports (after B4/B5, with backup). | Document in REFACTOR.md; run only if agreed. |

### SOP 6 - Phase E: Data source unification + canonical Data Studio fetch path

**Goal:** One canonical data-fetch path (reads `dimension_data`); one unified data source creation flow.

| Step | Action | Verification |
|------|--------|--------------|
| 6.1 | Verify `useDataStudioRawRows` consumers; migrate to `useCachedSourceData`; delete `useDataStudioRawRows.ts`. | No imports remain. |
| 6.2 | Verify `useFiltersSourceData` consumers; migrate to `useCachedSourceData`; delete `useFiltersSourceData.ts`. | No imports remain. |
| 6.3 | Verify `useSlideReportChannelData` consumers; remove from `useSlideReportPage`; delete file. | Build/lint pass. |
| 6.4 | Verify `useMetasearchJan2026RawRows` consumers; delete file. | No imports remain. |
| 6.5 | Audit `CSVImportChoiceModal` and `DataSourcesListModal`; delete if unused. | No imports remain. |
| 6.6 | Audit `MappingModal` vs `EditMappingModal` vs `ColumnMappingStep`; consolidate to one mapping step. | Single mapping component. |
| 6.7 | Remove `handleCreateBookingReport` / `handleCreatePriceCheckReport` from `DataSourcesPage`. | DataSourcesPage has no inline report creation. |
| 6.8 | Run `npm run build` and `npm run lint`; fix regressions. Update REFACTOR.md. | Build/lint pass. |

**Rollback:** Restore deleted hooks; revert DataSourcesPage.

### SOP 7 - Phase F: Legacy pivot cache + edge function cleanup

**Goal:** Stop all writes to legacy `slide_report_*` tables; retire the edge functions that serve them.

| Step | Action | Verification |
|------|--------|--------------|
| 7.1 | Confirm Data Studio reads `dimension_data` for all use cases (channel data, monthly breakdowns). | No remaining reads of `slide_report_channel_*` or `slide_report_monthly_data` in frontend. |
| 7.2 | Remove `SLIDE_REPORT_CACHE_ENABLED` gate from `refresh-slide-report` and `refresh-slide-report-channel`; mark functions as retired (return 410 or delete). | Functions no longer write to cache tables. |
| 7.3 | Retire `get-slide-report-data` and `get-slide-report-display-data` (return 410 or delete). | No frontend callers. |
| 7.4 | Audit `get-consolidated-performance-data`; delete if redundant with `get-performance-data`. | One performance data edge function. |
| 7.5 | Audit `run-refresh-workflow`; remove `slideReportId` branch; keep `resync-data-source` orchestration only. | Workflow only triggers `resync-data-source`. |
| 7.6 | Audit `sync-report-api-data` / `get-report-api-data`; retire if `get-performance-data` reads `dimension_data` directly. | `report_api_data` no longer written. |
| 7.7 | Retire `migrate-sheet-data`, `clear-and-resync`, `apply-vlookup-mappings` after verification. | No callers; safe to remove. |
| 7.8 | Delete `slideReportChannelDataMerge.ts`, `refreshPivotDataHelpers.ts`, `slideReportPivotComputation.ts`. | Build/lint pass. |
| 7.9 | Run `npm run build` and `npm run lint`; fix regressions. Update REFACTOR.md. | Build/lint pass. |

**Rollback:** Restore edge function gates; restore deleted lib files.

### SOP 8 - Phase G: View settings + resync consolidation

**Goal:** One view-settings table (`report_views`); one resync utility path.

| Step | Action | Verification |
|------|--------|--------------|
| 8.1 | Audit `useSlideReportViews` reads of `slide_report_views`; migrate to `report_views` or document why both needed. | Single view-settings read path. |
| 8.2 | Document `budgets.view_id` FK migration path (additive; no destructive change yet). | REFACTOR.md DB section updated. |
| 8.3 | Verify `resync-dimensions.ts` (flat) is superseded by `resync-all-dimensions/` folder; delete flat file. | No imports of flat file. |
| 8.4 | Verify `resync-all-dimensions.ts` (flat orchestrator) is superseded; delete if so. | No imports. |
| 8.5 | Audit `data-loading-fix.ts` and `large-dataset-optimizer.ts`; delete if superseded. | No imports. |
| 8.6 | Document `monthly_dimension_data` and `aggregated_breakdown_data` writer + consumers; add to deprecation list if unused. | DB section updated. |
| 8.7 | Run `npm run build` and `npm run lint`; fix regressions. Update REFACTOR.md. | Build/lint pass. |

**Rollback:** Restore deleted files.

### SOP 9 - Phase H: DB table drops (after proof)

**Goal:** Drop confirmed-unused legacy tables. Each requires full `Used in current stack?` checklist.

| Step | Action | Verification |
|------|--------|--------------|
| 9.1 | For each candidate table: run `Used in current stack?` checklist (no frontend reads, no edge writes, no tests, no migrations depend on it). | All checklist items pass. |
| 9.2 | Take DB backup or snapshot before any DROP. | Backup confirmed. |
| 9.3 | Write additive migration with `DROP TABLE IF EXISTS` for confirmed tables. | Migration runs cleanly on staging. |
| 9.4 | Run `npm run build` and `npm run lint`; verify types.ts no longer references dropped tables. | Build/lint pass. |
| 9.5 | Update REFACTOR.md with evidence. | Doc updated. |

**Rollback:** Restore from backup; revert migration.

---

## Database

### Assumptions

- **User ↔ account:** Data is linked to the user via Supabase auth. The app assumes **one account per user** for the post-login experience: resolve `accountId` as the first (or only) row in `accounts` where `user_id = session.user.id`. Schema remains `accounts.user_id`; no FK change required.
- **Reports / slide_reports:** Still keyed by `account_id` (and optionally report_id). No removal of `account_id` from tables without explicit product and migration plan.

### Canonical data model (single unified version)

**Goal:** one canonical storage + one canonical fetch path for Data Studio / PerformanceTable.

#### Canonical tables (keep; source of truth)

- **`dimension_data`** (canonical fact rows)
  - **Shape**: `(report_id, data_source_id, row_number, dimension_values jsonb)`
  - **Meaning**: one row = one spreadsheet/CSV row after mapping and type-parsing; keys in `dimension_values` are **dimension IDs**.
  - **Writer**: `supabase/functions/resync-data-source/**`
  - **Primary readers**:
    - Frontend: `src/hooks/dataSources/useCachedSourceData.ts`
    - Edge: `supabase/functions/get-performance-data/index.ts`
  - **Existing guardrail**: `dimension_data_report_source_row_key` unique index on `(report_id, data_source_id, row_number)` (prevents doubled rows).

- **`dimensions`** (canonical dimension registry)
  - **Precedence rule**: account > custom > global (dedupe by name).
  - **Used by**: frontend `src/lib/dimensionLoader.ts`, edge ingestion `supabase/functions/resync-data-source/utils/dimensions.ts`, view repair `src/lib/performanceTable/viewSettingsMapper.ts`.

- **`report_views`** (canonical user view settings)
  - **Stores**: visible columns / group-by / breakdown selections; must be repaired by name when IDs drift.
  - **Reader/writer**: `src/hooks/performanceTable/usePerformanceTableViews.ts`

#### Dropped in Phase 9 (no longer exist)

- **Dropped tables:** `sheet_data`, `slide_report_channel_*`, `slide_report_monthly_data`, `slide_report_summaries`, `slide_report_views`, `report_api_data`, `monthly_dimension_data`, `aggregated_breakdown_data`. Migration: `20260318200000_phase9_drop_legacy_tables.sql`. Data Studio reads `dimension_data` only; view settings in `public.views`.

#### Legacy / deprecated edge functions (gated or retired; do not use)

- **Slide-report cache writers** (`refresh-slide-report`, `refresh-slide-report-channel`) — gated by `SLIDE_REPORT_CACHE_ENABLED`; return 410 when disabled. Tables they wrote are dropped.
- **`get-slide-report-data`**, **`get-slide-report-display-data`** — gated or dead; no frontend callers for display data path.
- **`clear-and-resync`**, **`migrate-sheet-data`**, **`apply-vlookup-mappings`**, **`get-consolidated-performance-data`** — 410 deprecation gates; canonical path is `run-refresh-workflow` → `resync-data-source`.

### “One unified report” policy (product decision)

- We do **not** want multiple parallel report systems (report dashboard + slide reports + cached pivots).
- Target: **one canonical Data Studio report per account** whose rows live in `dimension_data`.

### Safe migrations (additive only unless noted)

| Migration / action | Purpose | When |
|--------------------|--------|------|
| (Existing) `dimensions_unique_name_per_context` | Prevent duplicate dimension names per context | Done (Phase 1). |
| (Optional) “Ensure one account per user” | Create default account for users with none | Only if product decides auto-create. |
| (Optional) “Canonical Data Studio report” | Rename or merge Master Report → Data Studio in `slide_reports` | After Phase B, with backup. |

### What not to do (until explicitly approved)

- Do **not** drop table `accounts` or remove `account_id` from `reports`, `slide_reports`, or `dimensions`.
- Do **not** run destructive deletes on `report_views` or `slide_reports` without “Used in current stack?” and backup.
- Do **not** add non-null constraints on `account_id` in tables that currently allow null unless data backfill is done first.

### Verification queries (manual, for DB sanity)

```sql
-- Users with no account (after Phase A, if auto-create is not used)
SELECT id, email FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.user_id = u.id);

-- Count slide_reports by name (before/after Phase B)
SELECT name, count(*) FROM public.slide_reports GROUP BY name;
```

