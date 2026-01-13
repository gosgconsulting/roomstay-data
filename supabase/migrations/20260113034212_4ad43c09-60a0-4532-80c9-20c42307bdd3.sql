-- Add dimension_filters column to share_links table
-- This stores the dimension filter configuration per report for shared links
-- Format: { "report_id": { "dimension_id": ["value1", "value2"] } }
ALTER TABLE public.share_links 
ADD COLUMN dimension_filters jsonb DEFAULT '{}'::jsonb;