-- Create a pre-aggregated daily metrics table for AI queries via Make.com
-- This stores minimal, aggregated data per account/report/day for efficient AI consumption

CREATE TABLE public.report_daily_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  report_name text NOT NULL,
  date date NOT NULL,
  
  -- Core metrics (pre-aggregated)
  impressions numeric DEFAULT 0,
  clicks numeric DEFAULT 0,
  cost numeric DEFAULT 0,
  revenue numeric DEFAULT 0,
  conversions numeric DEFAULT 0,
  
  -- Calculated metrics
  ctr numeric DEFAULT 0,
  cpc numeric DEFAULT 0,
  roas numeric DEFAULT 0,
  conversion_rate numeric DEFAULT 0,
  
  -- Row count for reference
  row_count integer DEFAULT 0,
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  UNIQUE(account_id, report_id, date)
);

-- Enable RLS
ALTER TABLE public.report_daily_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow public read for Make.com integration
CREATE POLICY "Public can read daily metrics"
  ON public.report_daily_metrics
  FOR SELECT
  USING (true);

-- Users can manage their own metrics
CREATE POLICY "Users can insert metrics for their reports"
  ON public.report_daily_metrics
  FOR INSERT
  WITH CHECK (report_id IN (SELECT id FROM reports WHERE user_id = auth.uid()));

CREATE POLICY "Users can update metrics for their reports"
  ON public.report_daily_metrics
  FOR UPDATE
  USING (report_id IN (SELECT id FROM reports WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete metrics for their reports"
  ON public.report_daily_metrics
  FOR DELETE
  USING (report_id IN (SELECT id FROM reports WHERE user_id = auth.uid()));

-- Index for fast queries
CREATE INDEX idx_report_daily_metrics_account_date ON public.report_daily_metrics(account_id, date);
CREATE INDEX idx_report_daily_metrics_report_date ON public.report_daily_metrics(report_id, date);

-- Trigger for updated_at
CREATE TRIGGER update_report_daily_metrics_updated_at
  BEFORE UPDATE ON public.report_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.report_daily_metrics IS 'Pre-aggregated daily metrics for AI queries via Make.com. Minimal token footprint.';