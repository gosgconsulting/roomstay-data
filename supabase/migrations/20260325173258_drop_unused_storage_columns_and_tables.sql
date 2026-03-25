-- Mirrors migration applied on linked project via Supabase MCP (plugin-supabase-supabase).
-- Canonical facts live in dimension_data; slide_reports holds workspace config only.
-- query_cache was unused (edge function always recomputes; client uses React Query).

BEGIN;

ALTER TABLE public.slide_reports DROP COLUMN IF EXISTS pivot_data;

DROP TABLE IF EXISTS public.query_cache CASCADE;

COMMENT ON TABLE public.slide_reports IS
  'Data Studio workspace records. Configuration and metadata only; all fact data lives in dimension_data.';

COMMIT;
