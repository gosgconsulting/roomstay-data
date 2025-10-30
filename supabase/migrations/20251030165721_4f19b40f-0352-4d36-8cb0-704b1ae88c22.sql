-- Create table to store report view configurations
CREATE TABLE public.report_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default View',
  group_by_dimensions TEXT[] DEFAULT ARRAY[]::TEXT[],
  breakdown_by_dimensions TEXT[] DEFAULT ARRAY[]::TEXT[],
  then_by_dimensions TEXT[] DEFAULT ARRAY[]::TEXT[],
  visible_columns UUID[] DEFAULT ARRAY[]::UUID[],
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.report_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own report views"
  ON public.report_views
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own report views"
  ON public.report_views
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own report views"
  ON public.report_views
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own report views"
  ON public.report_views
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_report_views_updated_at
  BEFORE UPDATE ON public.report_views
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();