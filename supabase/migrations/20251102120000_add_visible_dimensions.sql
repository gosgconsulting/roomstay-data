-- Add visible_dimensions to track which dimensions are activated for the report
ALTER TABLE public.report_views
ADD COLUMN IF NOT EXISTS visible_dimensions UUID[] DEFAULT ARRAY[]::UUID[];

-- Create an index for faster querying
CREATE INDEX IF NOT EXISTS idx_report_views_visible_dimensions ON public.report_views(report_id) WHERE visible_dimensions IS NOT NULL;
