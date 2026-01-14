-- Add view_id column to share_links table
-- This allows sharing a specific slide report view with locked filters
ALTER TABLE public.share_links 
ADD COLUMN view_id UUID REFERENCES public.slide_report_views(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_share_links_view_id ON public.share_links(view_id);
