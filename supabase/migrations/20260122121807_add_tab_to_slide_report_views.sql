-- Add tab column to slide_report_views table
-- This tracks which tab (overview, metasearch, sem, social) the view was created on
-- This ensures AI summaries use the correct tab data when a view is selected

ALTER TABLE public.slide_report_views
ADD COLUMN IF NOT EXISTS tab TEXT 
CHECK (tab IN ('overview', 'metasearch', 'sem', 'social'));

-- Add comment to document the field
COMMENT ON COLUMN public.slide_report_views.tab IS 
'Tab where the view was created. Used to ensure AI summaries use the correct tab data when generating summaries for a specific view.';
