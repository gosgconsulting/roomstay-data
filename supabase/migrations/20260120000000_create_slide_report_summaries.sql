-- Create slide_report_summaries table for storing AI-generated summaries
CREATE TABLE IF NOT EXISTS public.slide_report_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_report_id UUID NOT NULL REFERENCES public.slide_reports(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Summary metadata
  tab TEXT NOT NULL CHECK (tab IN ('overview', 'metasearch', 'sem', 'social')),
  selected_year TEXT NOT NULL,
  selected_month TEXT NOT NULL,
  view_id UUID REFERENCES public.slide_report_views(id) ON DELETE SET NULL,
  comparison_type TEXT NOT NULL CHECK (comparison_type IN ('previous_period', 'previous_year', 'both')),
  
  -- Summary content (markdown format)
  summary_text TEXT NOT NULL,
  
  -- Source: 'ai' or 'algorithm'
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'algorithm')),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint: one summary per tab/year/month/view combination
  UNIQUE(slide_report_id, tab, selected_year, selected_month, COALESCE(view_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- Enable Row Level Security
ALTER TABLE public.slide_report_summaries ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own slide report summaries" 
ON public.slide_report_summaries 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own slide report summaries" 
ON public.slide_report_summaries 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own slide report summaries" 
ON public.slide_report_summaries 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own slide report summaries" 
ON public.slide_report_summaries 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_slide_report_summaries_slide_report_id ON public.slide_report_summaries(slide_report_id);
CREATE INDEX idx_slide_report_summaries_tab ON public.slide_report_summaries(tab);
CREATE INDEX idx_slide_report_summaries_account_id ON public.slide_report_summaries(account_id);
CREATE INDEX idx_slide_report_summaries_user_id ON public.slide_report_summaries(user_id);
CREATE INDEX idx_slide_report_summaries_view_id ON public.slide_report_summaries(view_id);
CREATE INDEX idx_slide_report_summaries_lookup ON public.slide_report_summaries(slide_report_id, tab, selected_year, selected_month);

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_slide_report_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_slide_report_summaries_updated_at
  BEFORE UPDATE ON public.slide_report_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_slide_report_summaries_updated_at();
