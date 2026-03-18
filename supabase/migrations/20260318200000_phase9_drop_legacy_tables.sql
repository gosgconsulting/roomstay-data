-- Phase 9: Drop confirmed-unused legacy tables
-- All tables below have passed the full "Used in current stack?" checklist:
--   - No frontend reads/writes (only in generated types.ts or comments)
--   - No edge function reads/writes (only in comments)
--   - No tests depend on them
--   - No active migrations depend on them (only creation migrations)
--
-- Verified 2026-03-18:
--   sheet_data             — no .from('sheet_data') in src/ or supabase/functions/
--   slide_report_channel_year_data  — no reads; refresh-slide-report gated (410)
--   slide_report_channel_month_data — no reads; refresh-slide-report-channel gated (410)
--   slide_report_channel_raw_rows   — no reads
--   slide_report_monthly_data       — hardcoded [] in useSlideReportPage (comment only)
--   monthly_dimension_data          — no reads/writes found anywhere
--   aggregated_breakdown_data       — no reads/writes found anywhere
--   report_api_data                 — sync/get-report-api-data edge functions deleted; auto-sync no-op

-- Drop in safe order (FKs first if any)

DROP TABLE IF EXISTS public.aggregated_breakdown_data CASCADE;
DROP TABLE IF EXISTS public.monthly_dimension_data CASCADE;
DROP TABLE IF EXISTS public.report_api_data CASCADE;
DROP TABLE IF EXISTS public.sheet_data CASCADE;
DROP TABLE IF EXISTS public.slide_report_channel_raw_rows CASCADE;
DROP TABLE IF EXISTS public.slide_report_channel_month_data CASCADE;
DROP TABLE IF EXISTS public.slide_report_channel_year_data CASCADE;
DROP TABLE IF EXISTS public.slide_report_monthly_data CASCADE;

-- slide_report_summaries: AI summaries removed; no reads/writes in src/ or supabase/functions/
DROP TABLE IF EXISTS public.slide_report_summaries CASCADE;

-- slide_report_views: all reads/writes migrated to public.views (mode='slide_view')
-- FKs from budgets.view_id and share_links.view_id already repointed to public.views
DROP TABLE IF EXISTS public.slide_report_views CASCADE;
