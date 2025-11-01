-- Add column_order field to report_views to store custom column ordering
ALTER TABLE public.report_views 
ADD COLUMN IF NOT EXISTS column_order uuid[] DEFAULT ARRAY[]::uuid[];