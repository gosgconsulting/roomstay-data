-- Create master_report_daily_aggregates table for daily aggregated data (last 90 days)
CREATE TABLE public.master_report_daily_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  group_by_dimension_id UUID NOT NULL REFERENCES public.dimensions(id) ON DELETE CASCADE,
  group_by_value TEXT NOT NULL,
  date DATE NOT NULL,
  cost NUMERIC DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  clicks NUMERIC DEFAULT 0,
  impressions NUMERIC DEFAULT 0,
  conversions NUMERIC DEFAULT 0,
  bookings NUMERIC,
  cpc NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  roas NUMERIC DEFAULT 0,
  cost_of_sale NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(report_id, group_by_dimension_id, group_by_value, date)
);

-- Create master_report_monthly_aggregates table for monthly aggregated data (last 2 years)
CREATE TABLE public.master_report_monthly_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  group_by_dimension_id UUID NOT NULL REFERENCES public.dimensions(id) ON DELETE CASCADE,
  group_by_value TEXT NOT NULL,
  year_month TEXT NOT NULL CHECK (year_month ~ '^\d{4}-\d{2}$'),
  cost NUMERIC DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  clicks NUMERIC DEFAULT 0,
  impressions NUMERIC DEFAULT 0,
  conversions NUMERIC DEFAULT 0,
  bookings NUMERIC,
  cpc NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  roas NUMERIC DEFAULT 0,
  cost_of_sale NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(report_id, group_by_dimension_id, group_by_value, year_month)
);

-- Create indexes for daily aggregates
CREATE INDEX idx_daily_aggregates_report_group_date ON public.master_report_daily_aggregates(report_id, group_by_dimension_id, date);
CREATE INDEX idx_daily_aggregates_account_date ON public.master_report_daily_aggregates(account_id, date) WHERE account_id IS NOT NULL;
CREATE INDEX idx_daily_aggregates_date ON public.master_report_daily_aggregates(date);

-- Create indexes for monthly aggregates
CREATE INDEX idx_monthly_aggregates_report_group_month ON public.master_report_monthly_aggregates(report_id, group_by_dimension_id, year_month);
CREATE INDEX idx_monthly_aggregates_account_month ON public.master_report_monthly_aggregates(account_id, year_month) WHERE account_id IS NOT NULL;
CREATE INDEX idx_monthly_aggregates_year_month ON public.master_report_monthly_aggregates(year_month);

-- Enable RLS
ALTER TABLE public.master_report_daily_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_report_monthly_aggregates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily aggregates
CREATE POLICY "Users can view daily aggregates for their reports"
ON public.master_report_daily_aggregates
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = master_report_daily_aggregates.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert daily aggregates for their reports"
ON public.master_report_daily_aggregates
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = master_report_daily_aggregates.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update daily aggregates for their reports"
ON public.master_report_daily_aggregates
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = master_report_daily_aggregates.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete daily aggregates for their reports"
ON public.master_report_daily_aggregates
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = master_report_daily_aggregates.report_id
    AND reports.user_id = auth.uid()
  )
);

-- RLS Policies for monthly aggregates
CREATE POLICY "Users can view monthly aggregates for their reports"
ON public.master_report_monthly_aggregates
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = master_report_monthly_aggregates.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert monthly aggregates for their reports"
ON public.master_report_monthly_aggregates
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = master_report_monthly_aggregates.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update monthly aggregates for their reports"
ON public.master_report_monthly_aggregates
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = master_report_monthly_aggregates.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete monthly aggregates for their reports"
ON public.master_report_monthly_aggregates
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = master_report_monthly_aggregates.report_id
    AND reports.user_id = auth.uid()
  )
);

-- Create trigger for updated_at on daily aggregates
CREATE TRIGGER update_daily_aggregates_updated_at
BEFORE UPDATE ON public.master_report_daily_aggregates
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create trigger for updated_at on monthly aggregates
CREATE TRIGGER update_monthly_aggregates_updated_at
BEFORE UPDATE ON public.master_report_monthly_aggregates
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Function to clean up daily aggregates older than 90 days
CREATE OR REPLACE FUNCTION public.cleanup_old_daily_aggregates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.master_report_daily_aggregates
  WHERE date < CURRENT_DATE - INTERVAL '90 days';
  
  RAISE NOTICE 'Cleaned up daily aggregates older than 90 days';
END;
$$;

-- Create a scheduled job to run cleanup daily (using pg_cron if available)
-- Note: This requires pg_cron extension to be enabled
-- SELECT cron.schedule('cleanup-daily-aggregates', '0 2 * * *', 'SELECT public.cleanup_old_daily_aggregates();');
