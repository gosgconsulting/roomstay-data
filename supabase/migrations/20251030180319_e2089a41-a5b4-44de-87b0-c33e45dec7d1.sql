-- Add date_order column to report_views table
ALTER TABLE public.report_views 
ADD COLUMN IF NOT EXISTS date_order text DEFAULT 'desc';