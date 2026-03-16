/**
 * Client for the composio-proxy Edge Function.
 * All Composio API access goes through the proxy so the API key stays server-side.
 */

import { supabase } from '@/integrations/supabase/client';

const FUNCTION_NAME = 'composio-proxy';

export interface OpenAIStyleTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties?: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface GetToolsResult {
  tools: OpenAIStyleTool[];
}

export interface ExecuteToolResult {
  data?: unknown;
  successful?: boolean;
  error?: string;
  logId?: string;
  sessionInfo?: unknown;
  [key: string]: unknown;
}

/**
 * Fetch Composio actions as OpenAI-style tools for the given apps.
 */
export async function getTools(
  apps: string[],
  limit?: number
): Promise<GetToolsResult> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action: 'getTools', apps, limit: limit ?? 20 },
  });

  if (error) {
    throw new Error(data?.error ?? error.message ?? 'Failed to fetch Composio tools');
  }
  if (data?.error) {
    throw new Error(String(data.error));
  }
  return { tools: data?.tools ?? [] };
}

/**
 * Execute a Composio action. Uses current user as entityId when userId is omitted (proxy uses JWT sub).
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  userId?: string
): Promise<ExecuteToolResult> {
  const body: Record<string, unknown> = {
    action: 'executeTool',
    toolName,
    params,
  };
  if (userId !== undefined) body.userId = userId;

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body,
  });

  if (error) {
    throw new Error(data?.error ?? error.message ?? 'Failed to execute Composio tool');
  }
  if (data?.error && !data?.successful) {
    throw new Error(String(data.error));
  }
  return data as ExecuteToolResult;
}

/**
 * Passthrough call to Composio API (e.g. GET /apps for testing connection).
 */
export async function passthrough(
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<unknown> {
  const payload: Record<string, unknown> = { endpoint, method };
  if (body !== undefined) payload.body = body;

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: payload,
  });

  if (error) {
    throw new Error(data?.error ?? error.message ?? 'Composio passthrough failed');
  }
  if (data?.error) {
    throw new Error(String(data.error));
  }
  return data;
}
