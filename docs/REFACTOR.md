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
- **Data Studio:** SlideViewPage, useSlideReportPage, useDataStudioRawRows, useFilteredSlideData, ReportSidebar, SlideViewHeader, FiltersRow.
- **Filters (Data Studio):** FiltersRow (date + presets) in SlideViewPage.
- **Filters (Shared / legacy table):** FiltersBar, FilterState type — SharedReport, PerformanceTable.
- **KPI / metrics:** metricsCalculations.ts, useKPICards, useReportKPICards (single hook file).
- **Sharing:** SharedReport, share_links table, /shared/:slug.
- **Theme:** ThemeProvider, useTheme, ThemeToggle (single system).
- **UI:** shadcn/ui, DESIGN_SYSTEM_RULES.md tokens.

---

### 2.3 Duplicate Mapping

| Feature | Implementations | Canonical | Action |
|--------|-----------------|-----------|--------|
| Report filters (Data Studio) | FiltersRow, FilterControls | FiltersRow | Delete FilterControls (unused). |
| Report dropdowns / selector | DataStudioDropdowns | (none — component unused) | Delete DataStudioDropdowns (unused). |
| KPI cards hook | useKPICards.ts (single file) | useKPICards.ts | No duplicate. |

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
- **Data Studio UI:** SlideViewPage → ReportSidebar + SlideViewHeader + FiltersRow + tab content.
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
- [ ] Phase 2 — Canonical
- [ ] Phase 3 — Migration
- [ ] Phase 4 — Cleanup
- [ ] Phase 5 — Stabilization

---

## 8. Change Log

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
