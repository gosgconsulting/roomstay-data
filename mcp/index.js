#!/usr/bin/env node
/**
 * Roomstay Refresh Workflow MCP Server
 *
 * Exposes one tool: run_refresh_workflow — triggers the run-refresh-workflow Edge Function.
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or REFRESH_WORKFLOW_API_KEY if supported).
 *
 * Run: npm start (from mcp/) or node mcp/index.js
 * Configure in Cursor: add this server to your MCP settings with command "node" and args ["path/to/mcp/index.js"].
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAuthHeader() {
  if (SUPABASE_SERVICE_ROLE_KEY) {
    return { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  }
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is required. Set it in the environment for the MCP server."
  );
}

async function runRefreshWorkflow(args) {
  const url = `${SUPABASE_URL?.replace(/\/$/, "")}/functions/v1/run-refresh-workflow`;
  if (!url || url.includes("undefined")) {
    throw new Error("SUPABASE_URL is required. Set it in the environment for the MCP server.");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({
      accountId: args.accountId,
      reportId: args.reportId ?? undefined,
      slideReportId: args.slideReportId ?? undefined,
      clearFirst: args.clearFirst === true,
      skipResync: args.skipResync === true,
      skipRefresh: args.skipRefresh === true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error || res.statusText || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

const server = new Server(
  {
    name: "roomstay-refresh-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "run_refresh_workflow",
      description:
        "Run the Roomstay refresh workflow: optional clear, resync all data sources for the account/report/slide, and optionally refresh the slide report. Use this to refresh data source and slide report data without bugs (single orchestrated flow with retries).",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Required. The account ID (UUID).",
          },
          reportId: {
            type: "string",
            description: "Optional. Limit clear/resync to this report ID.",
          },
          slideReportId: {
            type: "string",
            description:
              "Optional. If provided, after resync the workflow runs refresh-slide-report for this slide.",
          },
          clearFirst: {
            type: "boolean",
            description: "Optional. If true, clear stored data before resyncing. Default false.",
          },
          skipResync: {
            type: "boolean",
            description: "Optional. If true, skip resync step (e.g. refresh-only). Default false.",
          },
          skipRefresh: {
            type: "boolean",
            description:
              "Optional. If true and slideReportId is set, resync only (no refresh-slide-report). Use for Data Studio. Default false.",
          },
        },
        required: ["accountId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "run_refresh_workflow") {
    return {
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const args = request.params.arguments || {};
  if (!args.accountId) {
    return {
      content: [{ type: "text", text: "accountId is required." }],
      isError: true,
    };
  }

  try {
    const result = await runRefreshWorkflow(args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roomstay Refresh MCP server running on stdio.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
