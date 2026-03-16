# Roomstay Refresh Workflow MCP Server

MCP server that exposes a single tool **`run_refresh_workflow`** to trigger the Roomstay refresh workflow (clear optional → resync data sources → refresh slide report). Use it from Cursor or any MCP client to refresh data without duplicating logic.

## Setup

1. **Install dependencies** (from repo root or `mcp/`):

   ```bash
   cd mcp && npm install
   ```

2. **Environment variables** (required when running the server):

   - `SUPABASE_URL` — your Supabase project URL (e.g. `https://xxxx.supabase.co`).
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key so the server can call the `run-refresh-workflow` Edge Function.

   Do not commit these; pass them when starting the server or via your MCP client config.

## Running

From the `mcp` directory:

```bash
SUPABASE_URL=https://your-project.supabase.co SUPABASE_SERVICE_ROLE_KEY=your-key npm start
```

Or from repo root:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node mcp/index.js
```

## Cursor configuration

Add the server to your Cursor MCP settings (e.g. in Cursor Settings → MCP, or `.cursor/mcp.json`) so the tool is available:

```json
{
  "mcpServers": {
    "roomstay-refresh": {
      "command": "node",
      "args": ["/absolute/path/to/roomstay/mcp/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```

Use the absolute path to `mcp/index.js` on your machine.

## Tool: `run_refresh_workflow`

- **accountId** (required): Account UUID.
- **reportId** (optional): Limit clear/resync to this report.
- **slideReportId** (optional): If set, after resync the workflow runs `refresh-slide-report` for this slide.
- **clearFirst** (optional): If `true`, clear stored data before resyncing. Default `false`.
- **skipResync** (optional): If `true`, skip resync (e.g. refresh-only). Default `false`.
- **skipRefresh** (optional): If `true` and `slideReportId` is set, resync only (no `refresh-slide-report`). Use for Data Studio. Default `false`.

Returns the workflow result JSON (success, cleared, resynced count, resyncErrors, refreshSuccess).
