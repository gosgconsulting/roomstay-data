-- Create slide_report_views table for storing saved filter views
CREATE TABLE IF NOT EXISTS public.slide_report_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_report_id UUID NOT NULL REFERENCES public.slide_reports(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  
  -- View configuration (filter state)
  selected_year TEXT NOT NULL,
  selected_month TEXT NOT NULL,
  comparison_type TEXT NOT NULL CHECK (comparison_type IN ('none', 'previous_period', 'previous_year')),
  chart_time_range TEXT CHECK (chart_time_range IN ('this_year', 'last_12_months', 'last_6_months', 'last_3_months')),
  filter_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure: { "metasearch": { "dimensionId": ["value1", "value2"] }, "sem": {...}, "social": {...} }
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint: one view name per slide report
  UNIQUE(slide_report_id, name)
);

-- Enable Row Level Security
ALTER TABLE public.slide_report_views ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own slide report views" 
ON public.slide_report_views 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own slide report views" 
ON public.slide_report_views 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own slide report views" 
ON public.slide_report_views 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own slide report views" 
ON public.slide_report_views 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_slide_report_views_slide_report_id ON public.slide_report_views(slide_report_id);
CREATE INDEX idx_slide_report_views_account_id ON public.slide_report_views(account_id);
CREATE INDEX idx_slide_report_views_user_id ON public.slide_report_views(user_id);
CREATE INDEX idx_slide_report_views_name ON public.slide_report_views(slide_report_id, name);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_slide_report_views_updated_at
BEFORE UPDATE ON public.slide_report_views
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
