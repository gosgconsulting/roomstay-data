-- Drop legacy tables that are no longer used in the canonical pipeline.
-- All reads/writes have been migrated or removed before this migration runs.
--
-- Canonical replacement for all of these: dimension_data (fact rows) + views (settings)
--
-- Tables dropped here:
--   report_views              → replaced by public.views (migration 20260318170000)
--   slide_report_channel_year_data   → legacy pivot cache (gated since Phase 7)
--   slide_report_channel_month_data  → legacy pivot cache
--   slide_report_channel_raw_rows    → legacy pivot cache
--   slide_report_monthly_data        → legacy pivot cache
--   monthly_dimension_data           → unused cache (Phase 8-F5 confirmed)
--   aggregated_breakdown_data        → unused (Phase 8-F6 confirmed)
--   sheet_data                       → pre-mapping raw rows; replaced by dimension_data

BEGIN;

-- report_views: all frontend code already migrated to public.views (migration 20260318170000)
DROP TABLE IF EXISTS public.report_views CASCADE;

-- Slide report pivot cache tables (writers gated since Phase 7; no active readers)
DROP TABLE IF EXISTS public.slide_report_channel_year_data CASCADE;
DROP TABLE IF EXISTS public.slide_report_channel_month_data CASCADE;
DROP TABLE IF EXISTS public.slide_report_channel_raw_rows CASCADE;
DROP TABLE IF EXISTS public.slide_report_monthly_data CASCADE;

-- Unused cache tables (confirmed no frontend/edge reads or writes)
DROP TABLE IF EXISTS public.monthly_dimension_data CASCADE;
DROP TABLE IF EXISTS public.aggregated_breakdown_data CASCADE;

-- Legacy raw sheet rows (pre-mapping); replaced by dimension_data
DROP TABLE IF EXISTS public.sheet_data CASCADE;

COMMIT;
