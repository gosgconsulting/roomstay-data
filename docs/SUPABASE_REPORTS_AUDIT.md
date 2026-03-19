# Supabase reports audit — Data Studio and saved data

This doc lists **all report names and Supabase tables** used for getting data into (and saving data from) the app, with **Data Studio** called out first.

---

## 1. Reports used for Data Studio (in order)

Data Studio is the single report view. It reads from one **slide report** and up to three **channel reports** in Supabase.

### 1.1 Slide report (container)

| Source | Table | Identifier | Notes |
|--------|--------|------------|--------|
| **Data Studio** | `slide_reports` | `name = 'Data Studio'` | Single active slide report per account used for Data Studio. Holds `report_ids` (JSON) mapping channel keys to report UUIDs. |

- **How it’s chosen**: `useSlideReportPage` / `useSlideReports` prefer the active slide report with `name === 'Data Studio'`; if none exists, one is auto-created with `name: 'Data Studio'`.
- **Columns that matter for Data Studio**: `id`, `name`, `account_id`, `report_ids`, `configuration`, `pivot_data`, `is_active`.

### 1.2 Channel reports (data sources)

Data Studio’s **metrics and breakdowns** come from the reports whose IDs are in `slide_reports.report_ids`. Those IDs point to rows in `reports`. Report **names** are used only to **match** which report is Metasearch, SEM, or Social (see `accountReportIds.ts`).

| Channel key | Report name(s) matched (examples) | Table | How resolved |
|-------------|-----------------------------------|--------|--------------|
| **metasearch** | `Metasearch`, `metasearch`, `Meta Search`, `MetaSearch`, `META SEARCH` | `reports` | `findReportByChannelName(accountId, 'metasearch')` — by `account_id` + name match |
| **sem** | `SEM`, `sem`, `Search Engine Marketing`, `Search Engine`, etc. | `reports` | `findReportByChannelName(accountId, 'sem')` |
| **social** | `Social`, `social`, `Social Media`, `SocialMedia`, `SOCIAL` | `reports` | `findReportByChannelName(accountId, 'social')` |

- **Table**: `reports`  
  **Columns**: `id`, `name`, `channel`, `account_id`, `user_id`, `created_at`, `updated_at`.
- **Flow**:  
  - Account’s channel report IDs come from `getAccountReportIds(accountId)` (or from `slide_reports.report_ids` when present).  
  - Data Studio uses these IDs to fetch rows from `dimension_data` per report (and from `dimensions` for the dimension map).  
  - So the **list of reports that actually feed Data Studio** is: **the slide report “Data Studio”** (1 row in `slide_reports`) **plus up to three reports** in `reports` whose IDs are in that slide report’s `report_ids` (metasearch, sem, social).

**Summary — reports used for Data Studio**

1. **Slide report**: one row in `slide_reports` with **name** `"Data Studio"`.
2. **Channel reports**: up to three rows in `reports`, identified by **ID** in `slide_reports.report_ids`, and by **name** (Metasearch / SEM / Social) when resolving IDs per account.

---

## 2. Supabase tables that read/write report-related data (used by or affecting Data Studio)

### 2.1 Core report and slide report tables

| Table | Role | Key columns | Used for Data Studio? |
|-------|------|-------------|------------------------|
| **reports** | One row per “report” (e.g. Metasearch, SEM, Social). | `id`, `name`, `channel`, `account_id` | Yes — channel report IDs in `slide_reports.report_ids` point here. |
| **slide_reports** | One row per “slide report” (e.g. Data Studio). | `id`, `name`, `account_id`, `report_ids` (JSON), `configuration`, `pivot_data`, `is_active` | Yes — Data Studio uses the slide report named “Data Studio”. |

### 2.2 Tables that store data by `report_id` (channel reports)

| Table | Role | Key columns | Used for Data Studio? |
|-------|------|-------------|------------------------|
| **dimension_data** | Canonical fact store: one row per fact row per report. | `report_id`, `data_source_id`, `dimension_values`, `row_number` | Yes — main source for Data Studio raw rows. |
| **dimensions** | Dimension definitions per report/account/global. | `id`, `name`, `type`, `report_id`, `account_id`, `scope` | Yes — dimension maps for each channel report. |
| **data_sources** | CSV/Sheets sources per report. | `id`, `report_id`, `source_type`, `column_mappings`, etc. | Yes — each channel report has data sources; sync writes to `dimension_data`. |

### 2.3 Tables that reference `report_id` or `slide_report_id` (context / legacy)

| Table | Role | Key columns | Used for Data Studio? |
|-------|------|-------------|------------------------|
| **views** | Saved view configs (filter, group by, etc.). | `report_id`, `slide_report_id`, `name`, filter/group config | Indirect — FiltersBar, KPISettings, etc. can use views for a report. |
| **budgets** | Budget rows per report/month. | `report_id`, `account_id`, `slide_report_id`, month, amounts | Yes — Budget tab and Performance Table use budgets; some by report_id. |
| **share_links** | Shared links. | `slide_report_id`, `report_ids`, etc. | Yes — shared Data Studio links reference slide report and report IDs. |
| **report_shares** | Share permissions per report. | `report_id`, shared_with_email | Access control for reports. |
| **report_daily_metrics** | Pre-aggregated daily metrics per report. | `report_id`, `date`, impressions, clicks, cost, revenue, etc. | Optional / legacy — not the main Data Studio path. |
| **aggregated_breakdown_data** | Pre-aggregated breakdowns per report. | `report_id`, channel, year, month, dimensions, metrics | Optional / legacy — Data Studio prefers `dimension_data`. |
| **slide_report_channel_month_data** | Cached channel-month data per slide report. | `slide_report_id`, channel, year, month | Can back pivot_data; Data Studio can use dimension_data instead. |
| **slide_report_channel_year_data** | Cached channel-year data per slide report. | `slide_report_id`, channel, year | Same as above. |
| **slide_report_channel_raw_rows** | Cached raw rows per slide report/channel. | `slide_report_id`, channel, payload | Legacy cache; Data Studio reads from `dimension_data`. |

### 2.4 Other report-related tables (not Data Studio core)

| Table | Role | Key columns |
|-------|------|-------------|
| **ai_summary_budgets** | AI summary budget data. | `report_id` |
| **api_keys** | API keys scoped to report. | `report_id` |
| **cluster_dimensions** | Clustering config. | `report_id` |
| **forecasts** | Forecast config. | `report_id` |
| **master_report_configs** | Master report config. | `report_id` |
| **slides** | Legacy slides. | `report_id` |
| **dimension_mappings** | Dimension mapping config. | `report_id` |

---

## 3. RPCs / functions that take report IDs

| Function / RPC | Parameters | Purpose |
|----------------|------------|---------|
| **get_dimension_data_by_report_and_date** | `p_report_id`, `p_date_dim_id`, `p_year`, `p_month`, `p_max_rows` | Date-filtered fetch of `dimension_data` for one report; used by Data Studio when a year is selected. |
| **has_report_access** | `_user_id`, `_report_id` | RLS helper for report access. |
| **owns_report** | (via RLS) | RLS helper. |

---

## 4. Data flow summary for Data Studio

1. **Resolve slide report**: Load active `slide_reports` for account; pick (or create) the one with **name** `"Data Studio"`.
2. **Resolve channel report IDs**: Use `slide_reports.report_ids` (metasearch, sem, social); fill any missing from `getAccountReportIds(accountId)` (which matches **reports.name** per channel).
3. **Load raw rows**: For each channel report ID, read from `dimension_data` (and optionally RPC `get_dimension_data_by_report_and_date` when year is set).
4. **Build dimension map**: From `dimensions` for those report IDs (and account/global scope).
5. **Display**: Breakdown table, KPIs, charts, and filters use these raw rows and dimension maps; Cost/Spend and other metrics are resolved via the shared metric-key logic (e.g. `getMetricKeys` / `buildMetricNameToIdsMap`).

---

## 5. Report names that matter (for matching)

- **Slide report**: The only name that matters for “the Data Studio report” is **`"Data Studio"`** (exact string used in code).
- **Channel reports**: Names in **`reports.name`** are matched with the variants in `accountReportIds.ts` (e.g. Metasearch, SEM, Social). Actual stored names can vary (e.g. “GO SG Metasearch”); matching is case-insensitive and supports partial matches.

This audit reflects the codebase as of the last update; if you add new report types or tables, extend this doc and the “Reports used for Data Studio” list above.
