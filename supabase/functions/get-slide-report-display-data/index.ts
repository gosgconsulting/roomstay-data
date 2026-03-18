/**
 * Retired.
 *
 * Phase 7 cleanup: the frontend no longer calls this function, and display aggregates
 * are computed via the canonical in-app filtered path / `dimension_data`.
 */

function getCorsHeaders(req?: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Headers': '*',
  };
  if (req) {
    const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
    if (requestedHeaders) headers['Access-Control-Allow-Headers'] = requestedHeaders;
  }
  return headers;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  return new Response(
    JSON.stringify({ success: false, error: 'get-slide-report-display-data is retired' }),
    { status: 410, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
  );
});