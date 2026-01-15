-- Add slide_report_id to share_links table to avoid needing to query slide_report_views
-- This allows us to get the slide report ID directly from the share link without RLS issues

ALTER TABLE public.share_links 
ADD COLUMN IF NOT EXISTS slide_report_id UUID REFERENCES public.slide_reports(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_share_links_slide_report_id ON public.share_links(slide_report_id);
