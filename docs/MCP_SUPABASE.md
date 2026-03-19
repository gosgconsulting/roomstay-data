# Using Supabase MCP (linked project)

This project is set up to use the **Supabase MCP** (Model Context Protocol) server when your Cursor/Supabase integration is **linked** to the same Supabase project. The MCP lets you run database and deployment operations from the IDE without opening the Dashboard or CLI.

---

## Prerequisites

- **Linked project:** The Supabase MCP server (e.g. `user-supabase-modelisation` or `plugin-supabase-supabase`) must be linked to your Supabase project. Linking is done via Cursor/Supabase integration or Supabase Dashboard.
- **Authentication:** If the MCP server shows as requiring auth, run its `mcp_auth` tool once so the agent can use the other tools.

---

## What you can do with MCP Supabase

| Task | MCP tool | Notes |
|------|----------|--------|
| **Run arbitrary SQL** | `execute_sql` | Pass a single `query` (string). Use for one-off fixes, diagnostics, or scripts (e.g. `DO $$ ... $$`). Prefer `apply_migration` for schema changes. |
| **Apply a migration (DDL)** | `apply_migration` | Pass `name` (snake_case) and `query`. Use for schema changes so they are tracked. |
| **List migrations** | `list_migrations` | No args. See what migrations are applied. |
| **List tables** | `list_tables` | Pass `schemas` (e.g. `["public"]`) and `verbose` (boolean). |
| **Deploy an Edge Function** | `deploy_edge_function` | Pass `name`, `entrypoint_path`, `verify_jwt`, and `files` (array of `{ name, content }`). Deploys or updates the function. |
| **List Edge Functions** | `list_edge_functions` | No args. |
| **Get Edge Function code** | `get_edge_function` | Pass function name to retrieve current code. |
| **Get project URL** | `get_project_url` | No args. Returns API URL for the linked project. |
| **Get publishable keys** | `get_publishable_keys` | No args. |
| **Advisors (security/performance)** | `get_advisors` | No args. Run after DDL changes to check RLS etc. |
| **Branches (dev DBs)** | `create_branch`, `list_branches`, `delete_branch`, `merge_branch`, `rebase_branch`, `reset_branch` | Create/list/delete/merge/rebase development branch databases. |
| **Search Supabase docs** | `search_docs` | Pass `graphql_query` for documentation search. |
| **Generate TypeScript types** | `generate_typescript_types` | Generate types from the linked schema. |
| **Logs** | `get_logs` | Retrieve project logs. |

---

## Running the metasearch Cost fix (Option B) via MCP

To fix metasearch Cost directly in the database (normalize Cost dimension keys in `dimension_data`):

1. **From an AI agent (Cursor):** Ask the agent to run the fix using the Supabase MCP. The agent should call `execute_sql` with the full contents of `supabase/scripts/fix_metasearch_cost_dimension_data.sql` as the `query` argument. The script is a single `DO $$ ... $$` block, so it can be executed in one call.

2. **What the script does:** It finds the metasearch report from `slide_reports`, resolves the account’s canonical Cost dimension, and for each row in `dimension_data` for that report merges all Cost dimension values into the canonical Cost ID.

3. **After running:** Reload the Data Studio report; metasearch Cost should show the full total.

See `docs/HARD_REFRESH_AND_METASEARCH_COST.md` for the full Option A (Full Refresh) and Option B (direct DB fix) flow.

---

## Deploying Edge Functions via MCP

To deploy or update an Edge Function:

1. Use **`list_edge_functions`** to see existing functions.
2. Use **`deploy_edge_function`** with:
   - `name`: function name (e.g. `run-refresh-workflow`, `resync-data-source`)
   - `entrypoint_path`: usually `index.ts`
   - `verify_jwt`: `true` for authenticated endpoints, `false` where the function does its own auth (e.g. `run-refresh-workflow` — see `supabase/config.toml`)
   - `files`: array of `{ name: "index.ts", content: "..." }` (and any other files the function needs; include `deno.json` / `deno.jsonc` if present)

The function code lives under `supabase/functions/<name>/`. You can read those files and pass their contents in the `files` array. The MCP deploys to the **linked** project.

---

## npm script vs MCP

- **`npm run fix:metasearch-cost`** runs the same SQL script via the **Supabase CLI** (`supabase db query -f ... --linked`). It requires the project to be **linked** with `supabase link` in the repo.
- **MCP `execute_sql`** runs SQL against the project that the **MCP** is linked to. No local `supabase link` needed; linking is per MCP integration. Use MCP when you’re working in Cursor and want the agent to run the fix or any other SQL.

---

## Summary

- **Linked project:** MCP and/or CLI point at the same Supabase project (project ref in `supabase/config.toml`: `zcxxwpwheevwavdcgfht`).
- **Run Option B (fix metasearch cost):** Use MCP `execute_sql` with the content of `supabase/scripts/fix_metasearch_cost_dimension_data.sql`, or use Dashboard SQL Editor, or `npm run fix:metasearch-cost` if the CLI is linked.
- **Deploy Edge Functions:** Use MCP `deploy_edge_function` with the function name and file contents from `supabase/functions/<name>/`.
