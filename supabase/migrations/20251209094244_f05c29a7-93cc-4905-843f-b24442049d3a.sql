-- Add cached_budget_data column to store budget table metrics cache
ALTER TABLE public.ai_summary_cards 
ADD COLUMN IF NOT EXISTS cached_budget_data jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.ai_summary_cards.cached_budget_data IS 'Cached budget table metrics for fast loading - stores monthly cost/revenue data per report tab';