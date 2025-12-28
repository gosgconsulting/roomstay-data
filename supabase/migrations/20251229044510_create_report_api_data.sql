-- Create report_api_data table to store pre-computed API data
CREATE TABLE public.report_api_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('current', 'comparison')),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX idx_report_api_data_report_id ON public.report_api_data(report_id);
CREATE INDEX idx_report_api_data_period_type ON public.report_api_data(report_id, period_type);
CREATE INDEX idx_report_api_data_dates ON public.report_api_data(date_from, date_to);

-- Enable RLS
ALTER TABLE public.report_api_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for report_api_data
CREATE POLICY "Users can view API data for their reports"
ON public.report_api_data
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = report_api_data.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert API data for their reports"
ON public.report_api_data
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = report_api_data.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update API data for their reports"
ON public.report_api_data
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = report_api_data.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete API data for their reports"
ON public.report_api_data
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = report_api_data.report_id
    AND reports.user_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_report_api_data_updated_at
  BEFORE UPDATE ON public.report_api_data
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
