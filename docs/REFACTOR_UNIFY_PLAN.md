# Refactor & Unify — Plan and Brief

> Plan and short “fix brief” for unifying reports, view storage, sync path, and schema.  
> Use with project-doc-planner: read README/TODO/REFACTOR first; prefer reuse; update docs after changes.

---

## 1. Current state (findings)

- **Reports:** Two layers — `reports` (channel reports: Metasearch, SEM, Social) and `slide_reports` (one “Data Studio” per account). Data Studio uses one slide report whose `report_ids` (JSON) point to up to three `reports` rows. No single “report” table; naming is implicit (name match in `accountReportIds.ts`).
- **Views:** Unified `views` table exists and is used by SharedReport and CreateShareLinkModal. README says `report_views` and `slide_report_views` were dropped. Some code still references `report_views` or query keys `slide_report_views` (e.g. SlideViewPage invalidation, useSlideReportViews key, usePerformanceTableColumns logs, resync-report-views).
- **Sync:** Single canonical path is `runRefreshWorkflow` → `run-refresh-workflow` → `resync-data-source`. `sync-utils.ts` still exports `syncDataSource`; EditDataSourceModal and DataSourcesPage already use `runRefreshWorkflow`. Any remaining callers of `syncDataSource` are legacy.
- **Data sources:** Multiple rows per `(report_id, source_type)` are allowed. Dedupe is script-only (`dedupe_data_sources.sql`); no unique constraint.
- **Tables:** Core for Data Studio are `dimension_data`, `dimensions`, `data_sources`, `reports`, `slide_reports`, `views`, `budgets`, `share_links`. Legacy/cache tables (e.g. `slide_report_channel_*`, `aggregated_breakdown_data`, `report_daily_metrics`) were dropped or are optional.

---

## 2. Refactor options (with brief fixes)

### Option A — Unify report identity (optional; no new table)

**Goal:** One clear concept of “report” for Data Studio instead of report_ids JSON + name matching.

**Brief:**

- Keep `reports` and `slide_reports` as-is (no new table).
- Add a single source of truth for “which report IDs feed Data Studio”: always derive from `slide_reports.report_ids` for the “Data Studio” slide report; use `getAccountReportIds` only when creating that slide report or when `report_ids` is empty.
- Document in code and in `docs/SUPABASE_REPORTS_AUDIT.md` that channel keys (metasearch, sem, social) are fixed and that report names in `reports` are for display and matching only.
- Optionally add a `reports.channel` or `reports.report_type` column (e.g. `'metasearch' | 'sem' | 'social'`) and backfill from current names; then resolve channel report by `account_id + channel` instead of name matching. **Migration:** one additive column + backfill script; no table split.

**New table:** No. **Data migration:** Optional (backfill `channel` if added).

---

### Option B — Unify view storage (recommended; no new table)

**Goal:** All view reads/writes use `views` only; remove references to `report_views` and `slide_report_views`.

**Brief:**

- Confirm in DB that `report_views` and `slide_report_views` are dropped (per README). If either still exists, add a migration to drop it only after all code is migrated.
- Audit: `useSlideReportViews`, `usePerformanceTableViews`, `usePerformanceTableColumns`, `SlideViewPage`, `resync-report-views.ts`, any other view load/save. Ensure they read/write only `views` (and correct columns).
- Replace query keys and invalidation: use a single key pattern for views (e.g. `['views', slideReportId]` or `['views', reportId]`) and remove `slide_report_views` / `report_views` from keys and invalidation.
- If `resync-report-views` is still needed, make it resync `views` (and optionally remove if no longer needed).
- Update tests and docs that mention `report_views` or `slide_report_views` to reference `views`.

**New table:** No. **Data migration:** None if tables are already dropped; otherwise migrate any remaining rows from `report_views` / `slide_report_views` into `views` then drop old tables.

---

### Option C — Remove sync-utils sync path (recommended; no new table)

**Goal:** Single sync path only: `runRefreshWorkflow` → Edge Functions. Remove or deprecate `syncDataSource` in `sync-utils.ts`.

**Brief:**

- Grep for `syncDataSource` and `SyncOptions` usages. Migrate any remaining callers to `runRefreshWorkflow` (same as EditDataSourceModal/DataSourcesPage).
- Remove or stub out `syncDataSource` (and any helpers used only by it) in `sync-utils.ts`. Keep in `sync-utils` only what is still used (e.g. column mapping helpers if any).
- Update README/REFACTOR to state that the only sync entry is `refreshWorkflow.runRefreshWorkflow`.

**New table:** No. **Data migration:** None.

---

### Option D — Enforce one data source per (report_id, source_type) (optional; schema change)

**Goal:** Prevent duplicate data sources at DB level so dedupe script is only for one-off cleanup.

**Brief:**

- Add a unique constraint (or unique index) on `data_sources(report_id, source_type)`. If duplicates exist, run `dedupe_data_sources.sql` first, then apply migration.
- Migration: `CREATE UNIQUE INDEX ... ON data_sources (report_id, source_type);` (and document in REFACTOR/README). Application code already assumes one source per type when running refresh (e.g. one CSV per report).

**New table:** No. **Data migration:** Run dedupe script before adding constraint.

---

### Option E — New “report_config” or “data_studio_config” table (optional; larger change)

**Goal:** Move `slide_reports.report_ids` and possibly `slide_reports.configuration` into a dedicated config table for clarity and future extensibility.

**Brief:**

- Only consider if you need multiple “Data Studio” workspaces per account or versioned config. For “one Data Studio per account,” current `slide_reports` row is enough.
- If done: create `data_studio_config` (e.g. `account_id`, `channel_report_ids` JSONB, `configuration` JSONB, `updated_at`). Migrate one row per account from `slide_reports` (report_ids + configuration). Point Data Studio at this table for config and keep `slide_reports` for identity/sharing if needed, or fold identity into the new table and deprecate `slide_reports` for Data Studio. This is a larger refactor; not recommended unless product requires it.

**New table:** Yes (`data_studio_config` or equivalent). **Data migration:** Yes (from `slide_reports`).

---

## 3. Recommended order of work

1. **Option B (views)** — Unify view storage and remove legacy view references. Low risk, no new table; removes confusion and aligns code with README.
2. **Option C (sync-utils)** — Remove or deprecate `syncDataSource` and use only `runRefreshWorkflow`. Complements existing EditDataSourceModal/DataSourcesPage migration.
3. **Option D (data_sources unique)** — Run dedupe script, then add unique constraint. Small schema change; prevents future duplicates.
4. **Option A (report identity)** — Optional; do if you want clearer semantics or a `reports.channel` column.
5. **Option E (new config table)** — Defer unless product needs multiple workspaces or versioned config.

---

## 4. Docs to update after implementation

- **README.md:** Data flow, “Active DB Tables,” and any “single sync path” / “single view storage” wording.
- **TODO.md:** New “Refactor / Unify” section with checkboxes for B, C, D (and A, E if done); move completed items to “Completed.”
- **docs/REFACTOR.md:** Progress tracker (Phases 2–3); change log entry for view unification, sync path removal, and optional schema/constraint.
- **docs/SUPABASE_REPORTS_AUDIT.md:** If Option A or E is done, update “Reports used for Data Studio” and table list.

---

## 5. Verification

- `npm run build` and `npm run lint` after each option.
- For B: Open Data Studio, save a view, reload, confirm view persists; open shared report, confirm view loads.
- For C: Trigger “Refresh Data” and “Save and sync” from Edit Data Source; confirm only Edge Functions are used (no client-side sync path).
- For D: After migration, attempt to insert a second data source for same (report_id, source_type) and confirm DB rejects it.

---

## 6. One-paragraph brief (for quick reference)

**Unify view storage (B):** Use only `views` for all view reads/writes; remove or migrate every reference to `report_views` and `slide_report_views` (query keys, invalidation, resync-report-views). No new table; optional migration if old tables still exist.  
**Single sync path (C):** Migrate any remaining `syncDataSource` callers to `runRefreshWorkflow`; remove or stub `syncDataSource` in sync-utils. No new table or data migration.  
**Data source uniqueness (D):** Run `dedupe_data_sources.sql`, then add unique constraint on `data_sources(report_id, source_type)`. No new table.  
**Report identity (A):** Optional: document that Data Studio report IDs come from `slide_reports.report_ids`; optionally add `reports.channel` and backfill so channel resolution does not rely on name matching.  
**New config table (E):** Defer; only if you need multiple Data Studio workspaces or versioned config — then introduce something like `data_studio_config` and migrate from `slide_reports`.
