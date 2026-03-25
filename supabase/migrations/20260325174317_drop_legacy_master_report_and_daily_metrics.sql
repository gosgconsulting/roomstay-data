-- Retired with Data Studio; Make.com reads dimension_data via Express API.
-- Mirrors migration applied on linked Sparti Data project via Supabase MCP (2026-03-26).

BEGIN;

DROP TABLE IF EXISTS public.report_daily_metrics CASCADE;
DROP TABLE IF EXISTS public.master_report_configs CASCADE;
DROP TABLE IF EXISTS public.master_report_global_configs CASCADE;

COMMIT;
