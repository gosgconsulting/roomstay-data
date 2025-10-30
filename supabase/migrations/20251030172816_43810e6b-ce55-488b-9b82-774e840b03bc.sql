-- Create dimension_data table for storing all imported data by dimension IDs
CREATE TABLE public.dimension_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  dimension_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for faster queries
CREATE INDEX idx_dimension_data_report_id ON public.dimension_data(report_id);
CREATE INDEX idx_dimension_data_data_source_id ON public.dimension_data(data_source_id);
CREATE INDEX idx_dimension_data_dimension_values ON public.dimension_data USING gin(dimension_values);

-- Enable RLS
ALTER TABLE public.dimension_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dimension_data
CREATE POLICY "Users can view dimension data for their reports"
ON public.dimension_data
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = dimension_data.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert dimension data for their reports"
ON public.dimension_data
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = dimension_data.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update dimension data for their reports"
ON public.dimension_data
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = dimension_data.report_id
    AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete dimension data for their reports"
ON public.dimension_data
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = dimension_data.report_id
    AND reports.user_id = auth.uid()
  )
);

-- Update dimensions table to track data source
ALTER TABLE public.dimensions
ADD COLUMN data_source_id UUID REFERENCES public.data_sources(id) ON DELETE SET NULL;

-- Add trigger for updated_at on dimension_data
CREATE TRIGGER update_dimension_data_updated_at
BEFORE UPDATE ON public.dimension_data
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();