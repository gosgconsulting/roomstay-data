-- Add filter settings columns to report_views table
ALTER TABLE public.report_views 
ADD COLUMN IF NOT EXISTS filter_dimensions text[] DEFAULT ARRAY[]::text[],
ADD COLUMN IF NOT EXISTS filter_values jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS date_range_start date,
ADD COLUMN IF NOT EXISTS date_range_end date,
ADD COLUMN IF NOT EXISTS date_range_preset text DEFAULT 'this_month';