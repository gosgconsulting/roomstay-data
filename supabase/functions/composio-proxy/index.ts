/**
 * Composio proxy Edge Function.
 * Forwards getTools, executeTool, and passthrough requests to Composio API v2.
 * Requires Supabase JWT; uses COMPOSIO_API_KEY from secrets. Never expose the key to the client.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v2';

const getCorsHeaders = (req?: Request) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  if (req) {
    const requested = req.headers.get('Access-Control-Request-Headers');
    headers['Access-Control-Allow-Headers'] = requested || 'authorization, x-client-info, apikey, content-type';
  } else {
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
  }
  return headers;
};

async function validateAuth(req: Request): Promise<{ ok: true; userId: string } | { ok: false; status: number; body: unknown }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!bearer || !supabaseUrl || !anonKey) {
    return { ok: false, status: 401, body: { error: 'Missing or invalid Authorization header.' } };
  }

  try {
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user }, error } = await client.auth.getUser(bearer);
    if (error || !user) {
      return { ok: false, status: 401, body: { error: 'Unauthorized: invalid or expired token.' } };
    }
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, status: 401, body: { error: 'Unauthorized.' } };
  }
}

function jsonResponse(data: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Map Composio action to OpenAI-style tool (name, description, parameters). */
function toOpenAITool(action: { name?: string; displayName?: string; description?: string; parameters?: unknown }): {
  type: 'function';
  function: { name: string; description: string; parameters: { type: 'object'; properties?: Record<string, unknown>; required?: string[] } };
} {
  const name = (action.name ?? action.displayName ?? 'unknown').toString();
  const description = (action.description ?? '').toString();
  const params = action.parameters as { properties?: Record<string, unknown>; required?: string[] } | undefined;
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: params?.properties ?? {},
        required: params?.required ?? [],
      },
    },
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  const auth = await validateAuth(req);
  if (!auth.ok) {
    return jsonResponse(auth.body, auth.status, cors);
  }
  const userId = auth.userId;

  const apiKey = Deno.env.get('COMPOSIO_API_KEY');
  if (!apiKey) {
    return jsonResponse(
      { error: 'Composio not configured. Set COMPOSIO_API_KEY in Edge Function secrets.' },
      503,
      cors
    );
  }

  const composioHeaders: Record<string, string> = {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  let body: Record<string, unknown> = {};
  try {
    if (req.method === 'POST' && req.body) {
      body = (await req.json()) as Record<string, unknown>;
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400, cors);
  }

  const action = body.action as string | undefined;

  if (action === 'getTools') {
    const apps = (body.apps as string[] | undefined) ?? [];
    const limit = typeof body.limit === 'number' ? body.limit : 20;
    const appNames = apps.length ? apps.join(',') : '';
    const url = new URL(`${COMPOSIO_BASE}/actions`);
    if (appNames) url.searchParams.set('appNames', appNames);
    url.searchParams.set('limit', String(limit));

    try {
      const res = await fetch(url.toString(), { method: 'GET', headers: composioHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return jsonResponse({ error: data?.message ?? data?.error ?? 'Composio actions request failed', composio: data }, res.status, cors);
      }
      const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      const tools = items.map((a: Record<string, unknown>) => toOpenAITool(a));
      return jsonResponse({ tools }, 200, cors);
    } catch (e) {
      return jsonResponse({ error: 'Composio request failed', details: String(e) }, 502, cors);
    }
  }

  if (action === 'executeTool') {
    const toolName = body.toolName as string | undefined;
    const params = (body.params as Record<string, unknown>) ?? {};
    const entityId = (body.userId as string | undefined) ?? userId;

    if (!toolName) {
      return jsonResponse({ error: 'Missing toolName.' }, 400, cors);
    }

    const url = `${COMPOSIO_BASE}/actions/${encodeURIComponent(toolName)}/execute`;
    const composioBody = { input: params, entityId };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: composioHeaders,
        body: JSON.stringify(composioBody),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return jsonResponse(
          { error: data?.message ?? data?.error ?? 'Composio execute failed', composio: data },
          res.status,
          cors
        );
      }
      return jsonResponse(data, 200, cors);
    } catch (e) {
      return jsonResponse({ error: 'Composio execute request failed', details: String(e) }, 502, cors);
    }
  }

  // Passthrough: body.endpoint, body.method, optional body.body
  const endpoint = body.endpoint as string | undefined;
  const method = ((body.method as string) ?? 'GET').toUpperCase();
  const passthroughBody = body.body;

  if (!endpoint) {
    return jsonResponse(
      { error: 'Missing action or passthrough endpoint. Use action: "getTools" | "executeTool" or endpoint + method for passthrough.' },
      400,
      cors
    );
  }

  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${COMPOSIO_BASE}${path}`;

  try {
    const opts: RequestInit = { method, headers: composioHeaders };
    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && passthroughBody !== undefined) {
      opts.body = JSON.stringify(passthroughBody);
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return jsonResponse({ error: data?.message ?? data?.error ?? 'Composio passthrough failed', composio: data }, res.status, cors);
    }
    return jsonResponse(data, 200, cors);
  } catch (e) {
    return jsonResponse({ error: 'Composio passthrough request failed', details: String(e) }, 502, cors);
  }
});
