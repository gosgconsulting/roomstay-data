-- Drop report_api_data cache table.
-- The fast-path cache read has been removed from get-performance-data.
-- sync-report-api-data and get-report-api-data edge functions are retired (410).
-- All data reads go directly to dimension_data.

BEGIN;

DROP TABLE IF EXISTS public.report_api_data CASCADE;

COMMIT;
