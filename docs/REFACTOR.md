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

## Core routes (must remain)

Routes are defined in `src/App.tsx` and are treated as a contract.

**Current:**

- `/` and `/landing`
- `/auth`
- `/tools/data-sources/:accountId`
- `/tools/dimensions/:accountId`
- `/tools/data`
- `/tools/data/:accountId`
- `/tools/reports/:accountId`
- `/tools/reports/:accountId/view/:slideId`
- `/tools/reports/:accountId/brady` — **to remove** (Phase B)
- `/tools/reports/:accountId/master-report` — **to remove** (Phase B)
- `/tools/reports/:accountId/data-studio`
- `/tools/forecasting`
- `/tools/forecasting/scenario/:scenarioId`
- `/tools/forecasting/:accountId`
- `/tools/price-widget/:accountId`
- `/tools/price-widget/:accountId/:widgetId`
- `/tools/report/:reportName`
- `/tools/report/:accountId/:summaryId` (legacy support)
- `/integrations`
- `/shared/:slug`
- `/shared/reports/:slug`
- `/:slug` (shared report alias)

**After Phase A/B:** `accountId` is resolved from the logged-in user (no selector). Routes above that use `:accountId` stay; links are built with the resolved account. Only the two report view routes `brady` and `master-report` are removed; single entry is Data Studio.

## Current pain points (why we’re refactoring)

- KPI/dimension **mis-mapping** in Data Studio / metasearch views for some KPIs.
- Drift between:
  - frontend dimension loading/deduping
  - Edge Functions dimension loading/deduping
  - view settings mapping (visible columns/KPIs, ordering)
- Multiple implementations in code (`old`, `refactored`, duplicated helpers).

## Progress tracker

### Phase 1 — Verify DB integrity + mapping references (HIGH)

- [x] Audit `report_views` / slide views for **broken dimension references**
- [x] Add/confirm DB constraints preventing future duplicates (safe, additive)
- [x] Add server-side + client-side **mapping validation** (detect invalid IDs and self-heal where safe)

### Phase 2 — Canonical dimension loading + settings mapping (HIGH)

- [ ] Define a single canonical dimension loading API (frontend) with precedence rules
- [ ] Align Edge Functions to use the same rules (shared logic or identical implementation)
- [ ] Canonicalize view settings mapping (visible columns/KPIs/orders)

### Phase 3 — Remove duplicate implementations (MED)

- [ ] Migrate consumers to canonical PerformanceTable implementation
- [ ] Delete legacy/duplicate table implementations and hooks after verification
- [ ] Standardize “Apply” behavior across settings modals

### Phase 4 — Testing + regression harness (MED/LOW)

- [ ] Add unit tests for dimension dedupe + mapping validation
- [ ] Add integration tests around a representative report view

### Phase 5 — Cleanup (LOW)

- [ ] Delete unused utilities/assets guarded by “Used in current stack?” checklist

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

- **Phase 3 / C4–C5 (Remove duplicate table/hooks) — 2026-03-18:** Deleted unused PerformanceTable and data hook duplicates.
  - **Used in current stack?** Verified: no imports of PerformanceTable.old, PerformanceTable.refactored, or usePerformanceTableDataFixed in src/ (grep). Canonical: PerformanceTable.tsx and usePerformanceTableData.ts.
  - **Deleted:** PerformanceTable.old.tsx, PerformanceTable.refactored.tsx, usePerformanceTableDataFixed.ts. No migration needed; consumers already use PerformanceTable and usePerformanceTableData.
  - **Verification:** npm run build ✅, npm run lint ✅ (warnings only).

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

- [ ] **C1** — Phase 2: Canonical dimension loading API + precedence rules (frontend).
- [ ] **C2** — Phase 2: Align Edge Functions to same dimension rules.
- [ ] **C3** — Phase 2: Canonicalize view settings mapping (visible columns/KPIs/orders).
- [x] **C4** — Phase 3: Migrate to canonical PerformanceTable; delete PerformanceTable.old and PerformanceTable.refactored after verification.
- [x] **C5** — Phase 3: Delete or consolidate usePerformanceTableDataFixed; one canonical data hook.
- [ ] **C6** — Phase 3: Standardize “Apply” behavior across settings modals.
- [ ] **C7** — Phase 4: Unit tests for dimension dedupe + mapping validation.
- [ ] **C8** — Phase 5: Delete unused utilities per “Used in current stack?” checklist.

### D. Database

- [ ] **D1** — Confirm one-account-per-user (or first-account) policy; document in DB section; no schema change if already `accounts.user_id`.
- [ ] **D2** — Optional: migration to ensure every user has exactly one account (e.g. create default account if none)—only if product decision is “auto-create one account per user.”
- [ ] **D3** — No destructive migrations for account removal; only additive (e.g. indexes) or application-level “ignore multiple accounts” until product confirms.
- [ ] **D4** — slide_reports: document which report name/type is canonical for “Data Studio”; optional cleanup migration to merge or rename Master Report → Data Studio (only after B4/B5 and backup).

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

---

## Database

### Assumptions

- **User ↔ account:** Data is linked to the user via Supabase auth. The app assumes **one account per user** for the post-login experience: resolve `accountId` as the first (or only) row in `accounts` where `user_id = session.user.id`. Schema remains `accounts.user_id`; no FK change required.
- **Reports / slide_reports:** Still keyed by `account_id` (and optionally report_id). No removal of `account_id` from tables without explicit product and migration plan.

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

