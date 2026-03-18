-- Drop slide_report_views table.
-- All frontend code has been migrated to public.views (migration 20260318170000).
-- FKs from budgets and share_links were repointed to public.views in 20260318170000.
-- SharedReport.tsx and CreateShareLinkModal.tsx now query public.views directly.

BEGIN;

DROP TABLE IF EXISTS public.slide_report_views CASCADE;

COMMIT;
