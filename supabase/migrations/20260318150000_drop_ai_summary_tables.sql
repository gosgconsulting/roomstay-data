-- Drop AI Summary feature tables (full removal)
-- Safe to apply only after confirming no frontend/edge-function usage.

BEGIN;

-- SlideView AI summaries (legacy)
DROP TABLE IF EXISTS public.slide_report_summaries CASCADE;

-- Card-based AI summaries
DROP TABLE IF EXISTS public.ai_summary_forecasts CASCADE;
DROP TABLE IF EXISTS public.ai_summary_budgets CASCADE;
DROP TABLE IF EXISTS public.ai_summary_cards CASCADE;

COMMIT;

