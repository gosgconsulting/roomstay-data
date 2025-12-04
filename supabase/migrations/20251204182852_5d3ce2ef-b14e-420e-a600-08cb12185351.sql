-- Add column to store cached pivot table data
ALTER TABLE public.ai_summary_cards 
ADD COLUMN IF NOT EXISTS cached_pivot_data jsonb DEFAULT '{}'::jsonb;

-- Add column to track when pivot data was last refreshed
ALTER TABLE public.ai_summary_cards 
ADD COLUMN IF NOT EXISTS pivot_data_refreshed_at timestamp with time zone;