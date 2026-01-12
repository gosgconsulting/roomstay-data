-- Create slide_reports table to store slide report configurations
CREATE TABLE public.slide_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT 'Slide Report',
  description text,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  
  -- Configuration for channels and data sources
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Report ID mappings (channel -> report_id)
  report_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Cached pivot data for display
  pivot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Date range for the report
  date_range jsonb,
  
  -- Active/archived state
  is_active boolean NOT NULL DEFAULT true,
  
  -- Refresh tracking
  last_refreshed_at timestamp with time zone,
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.slide_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own slide reports"
  ON public.slide_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own slide reports"
  ON public.slide_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own slide reports"
  ON public.slide_reports
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own slide reports"
  ON public.slide_reports
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updating updated_at
CREATE TRIGGER update_slide_reports_updated_at
  BEFORE UPDATE ON public.slide_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_slide_reports_account_id ON public.slide_reports(account_id);
CREATE INDEX idx_slide_reports_user_id ON public.slide_reports(user_id);
CREATE INDEX idx_slide_reports_is_active ON public.slide_reports(is_active);