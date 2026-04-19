/**
 * Edge function for secure share-link password operations.
 *
 * Actions:
 *   "hash"   — accepts { action: "hash", password: string }
 *              Returns { hash: string } (bcrypt, 10 rounds).
 *
 *   "verify" — accepts { action: "verify", slug: string, password: string }
 *              Fetches the share_link by slug (service-role, bypasses RLS),
 *              compares the supplied password against the stored bcrypt hash.
 *              Returns { valid: true/false }.
 *
 *   "check"  — accepts { action: "check", slug: string }
 *              Returns { has_password: true/false } without exposing the hash.
 *              Used by the frontend to decide whether to show the password gate.
 *
 * Both "verify" and "check" are intentionally unauthenticated so public
 * share-link viewers can access them without a Supabase session.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';
import { genSaltSync, hashSync, compareSync } from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'hash') {
      // ---- HASH a plaintext password ----
      const { password } = body;
      if (!password || typeof password !== 'string' || password.length < 1) {
        return jsonResponse({ error: 'Password is required' }, 400);
      }

      const salt = genSaltSync(10);
      const hash = hashSync(password, salt);
      return jsonResponse({ hash });
    }

    if (action === 'verify') {
      // ---- VERIFY a password against a stored hash ----
      const { slug, password } = body;
      if (!slug || !password) {
        return jsonResponse({ error: 'slug and password are required' }, 400);
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: link, error } = await admin
        .from('share_links')
        .select('password_hash')
        .eq('slug', slug)
        .single();

      if (error || !link) {
        return jsonResponse({ error: 'Share link not found' }, 404);
      }

      const storedHash: string = link.password_hash ?? '';
      if (!storedHash) {
        // No password set — treat as open link (shouldn't normally reach here)
        return jsonResponse({ valid: true });
      }

      const valid = compareSync(password, storedHash);
      return jsonResponse({ valid });
    }

    if (action === 'check') {
      // ---- CHECK if a share link has a password (without exposing the hash) ----
      const { slug } = body;
      if (!slug) {
        return jsonResponse({ error: 'slug is required' }, 400);
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: link, error } = await admin
        .from('share_links')
        .select('password_hash')
        .eq('slug', slug)
        .single();

      if (error || !link) {
        return jsonResponse({ error: 'Share link not found' }, 404);
      }

      const has_password = !!(link.password_hash && link.password_hash !== '');
      return jsonResponse({ has_password });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[share-link-auth] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
