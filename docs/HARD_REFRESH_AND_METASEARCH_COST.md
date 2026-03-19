# Hard refresh and metasearch cost fix

## Problem

Metasearch Cost may show only part of the total (e.g. ~343 instead of ~1.3k) when:

- The report has **multiple data sources** for metasearch and each source used a different Cost dimension ID; or
- A previous sync wrote Cost under a non–account-scoped dimension ID that the UI aggregates correctly only when the dimension map is built from **all** rows (see TODO.md “Metasearch cost showing ~300 instead of ~1.3k”).

## Recommended: run a full refresh

The intended way to fix this is to **hard refresh** so data is re-fetched from Google Sheets and re-written into `dimension_data` with the correct (account-scoped) dimension IDs.

1. Open the app and go to **Data Studio** (homepage `/`).
2. In the top bar, click **Refresh Data**.
3. In the modal, choose **Full Refresh** (not “Last 2 Months”).
4. Click **Start Refresh** and wait until all steps complete (Clear → Fetch from sources → Update cache).

This runs the `run-refresh-workflow` edge function with `clearFirst: true` and `refreshMode: 'full'`: it deletes all `dimension_data` for the report(s), then calls `resync-data-source` for each data source so every row is re-inserted with the correct column → dimension mapping (including Cost → account Cost dimension).

After a full refresh, metasearch Cost should reflect the full total, and no direct DB changes are required.

## Optional: fix data directly in Supabase

If you cannot run a full refresh (e.g. no UI access or you need a one-off fix without re-fetching from sheets), you can normalize Cost in `dimension_data` so that **all** Cost-like dimension IDs for the metasearch report are merged into the **canonical** (account-scoped) Cost dimension ID.

Use the script:

- **`supabase/scripts/fix_metasearch_cost_dimension_data.sql`**

**How to run:**

1. **Via Supabase MCP (linked project):**  
   If Cursor is using the Supabase MCP and the project is linked, ask the AI agent to run Option B. The agent will call `execute_sql` with the contents of `supabase/scripts/fix_metasearch_cost_dimension_data.sql`. See `docs/MCP_SUPABASE.md`.

2. **From the repo (Supabase CLI linked):**  
   Run `supabase link` if you haven’t already, then:  
   `npm run fix:metasearch-cost`  
   This runs the script against your linked project’s database.

3. **Supabase Dashboard (no CLI/MCP needed):**  
   Open your project in [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor** → **New query**.  
   Paste the full contents of `supabase/scripts/fix_metasearch_cost_dimension_data.sql` and click **Run**.

The script:

1. Finds the metasearch report from `slide_reports.report_ids->>'metasearch'`.
2. Resolves the account’s canonical Cost dimension (account-scoped “Cost”).
3. For each row in `dimension_data` for that report, sums any Cost dimension values (from all Cost-like dimension IDs) and writes that sum under the canonical Cost ID, then removes the other Cost keys.

After running the script, reload the Data Studio report; metasearch Cost should show the full total.

See the script header for how to target a specific `slide_report_id` or account.
