-- Create a new table to store slide report data organized by year/month
-- This enables proper data browsing with folder structure Year → Month → Channel → Breakdown
CREATE TABLE IF NOT EXISTS public.slide_report_monthly_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_report_id UUID NOT NULL REFERENCES public.slide_reports(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  channel TEXT NOT NULL, -- 'metasearch', 'sem', 'social', or 'overview'
  
  -- Channel-level metrics for this month
  metrics JSONB NOT NULL DEFAULT '{}',
  
  -- Breakdown data for this month (keyed by dimension name)
  breakdowns JSONB NOT NULL DEFAULT '{}',
  
  -- Metadata
  row_count INTEGER DEFAULT 0,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  UNIQUE(slide_report_id, year, month, channel)
);

-- Add indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_slide_report_monthly_data_slide_report_id 
  ON public.slide_report_monthly_data(slide_report_id);
CREATE INDEX IF NOT EXISTS idx_slide_report_monthly_data_year_month 
  ON public.slide_report_monthly_data(year, month);
CREATE INDEX IF NOT EXISTS idx_slide_report_monthly_data_channel 
  ON public.slide_report_monthly_data(channel);
CREATE INDEX IF NOT EXISTS idx_slide_report_monthly_data_account_id 
  ON public.slide_report_monthly_data(account_id);

-- Enable RLS
ALTER TABLE public.slide_report_monthly_data ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as slide_reports)
CREATE POLICY "Users can view their own slide report monthly data" 
  ON public.slide_report_monthly_data 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.slide_reports sr
      WHERE sr.id = slide_report_id AND sr.user_id = auth.uid()
    )
    OR is_master_account(auth.uid())
  );

CREATE POLICY "Users can insert their own slide report monthly data" 
  ON public.slide_report_monthly_data 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.slide_reports sr
      WHERE sr.id = slide_report_id AND sr.user_id = auth.uid()
    )
    OR is_master_account(auth.uid())
  );

CREATE POLICY "Users can update their own slide report monthly data" 
  ON public.slide_report_monthly_data 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.slide_reports sr
      WHERE sr.id = slide_report_id AND sr.user_id = auth.uid()
    )
    OR is_master_account(auth.uid())
  );

CREATE POLICY "Users can delete their own slide report monthly data" 
  ON public.slide_report_monthly_data 
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM public.slide_reports sr
      WHERE sr.id = slide_report_id AND sr.user_id = auth.uid()
    )
    OR is_master_account(auth.uid())
  );

-- Add trigger for updated_at
CREATE TRIGGER update_slide_report_monthly_data_updated_at
  BEFORE UPDATE ON public.slide_report_monthly_data
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();