-- Create aggregated_breakdown_data table for pre-computed breakdown data
-- This table stores cross-tabulated breakdown data (primary × secondary dimensions)
-- with all available metrics, filtered by year, month, channel, and breakdown dimensions

CREATE TABLE public.aggregated_breakdown_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('metasearch', 'sem', 'social')),
  year INTEGER NOT NULL CHECK (year >= 2024),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  primary_dimension_id UUID NOT NULL REFERENCES public.dimensions(id) ON DELETE CASCADE,
  primary_dimension_value TEXT NOT NULL,
  secondary_dimension_id UUID REFERENCES public.dimensions(id) ON DELETE CASCADE,
  secondary_dimension_value TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure: { "Impressions": 1000, "Clicks": 50, "Cost": 100.50, "Revenue": 250.00, "Bookings": 5, ... }
  derived_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure: { "ctr": 5.0, "conversionRate": 10.0, "cpc": 2.01, "roas": 2.5, "costOfSale": 40.0 }
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(report_id, channel, year, month, primary_dimension_id, primary_dimension_value, COALESCE(secondary_dimension_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(secondary_dimension_value, ''))
);

-- Enable Row Level Security
ALTER TABLE public.aggregated_breakdown_data ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
-- Users can view aggregated data for reports they have access to
CREATE POLICY "Users can view aggregated breakdown data for their reports" 
ON public.aggregated_breakdown_data 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = aggregated_breakdown_data.report_id
    AND (r.user_id = auth.uid() OR r.account_id IN (
      SELECT account_id FROM public.accounts WHERE user_id = auth.uid()
    ))
  )
);

-- Users can insert aggregated data for their reports
CREATE POLICY "Users can insert aggregated breakdown data for their reports" 
ON public.aggregated_breakdown_data 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = aggregated_breakdown_data.report_id
    AND (r.user_id = auth.uid() OR r.account_id IN (
      SELECT account_id FROM public.accounts WHERE user_id = auth.uid()
    ))
  )
);

-- Users can update aggregated data for their reports
CREATE POLICY "Users can update aggregated breakdown data for their reports" 
ON public.aggregated_breakdown_data 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = aggregated_breakdown_data.report_id
    AND (r.user_id = auth.uid() OR r.account_id IN (
      SELECT account_id FROM public.accounts WHERE user_id = auth.uid()
    ))
  )
);

-- Users can delete aggregated data for their reports
CREATE POLICY "Users can delete aggregated breakdown data for their reports" 
ON public.aggregated_breakdown_data 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = aggregated_breakdown_data.report_id
    AND (r.user_id = auth.uid() OR r.account_id IN (
      SELECT account_id FROM public.accounts WHERE user_id = auth.uid()
    ))
  )
);

-- Create indexes for better performance
-- Composite index for common query pattern: report + channel + year + month + primary dimension
CREATE INDEX idx_aggregated_breakdown_report_channel_year_month 
  ON public.aggregated_breakdown_data(report_id, channel, year, month, primary_dimension_id);

-- Index for filtering by primary dimension value
CREATE INDEX idx_aggregated_breakdown_primary_value 
  ON public.aggregated_breakdown_data(primary_dimension_value);

-- Index for filtering by secondary dimension value (partial index for non-null values)
CREATE INDEX idx_aggregated_breakdown_secondary_value 
  ON public.aggregated_breakdown_data(secondary_dimension_value) 
  WHERE secondary_dimension_value IS NOT NULL;

-- Index for year/month queries
CREATE INDEX idx_aggregated_breakdown_year_month 
  ON public.aggregated_breakdown_data(year, month);

-- GIN index for JSONB queries on metrics
CREATE INDEX idx_aggregated_breakdown_metrics 
  ON public.aggregated_breakdown_data USING gin(metrics);

-- GIN index for JSONB queries on derived_metrics
CREATE INDEX idx_aggregated_breakdown_derived_metrics 
  ON public.aggregated_breakdown_data USING gin(derived_metrics);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_aggregated_breakdown_data_updated_at
BEFORE UPDATE ON public.aggregated_breakdown_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
