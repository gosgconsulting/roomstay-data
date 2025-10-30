-- Create dimensions table
CREATE TABLE public.dimensions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'date', 'number', 'currency', 'percentage')),
  formula TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dimensions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view dimensions for their reports"
  ON public.dimensions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = dimensions.report_id
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create dimensions for their reports"
  ON public.dimensions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = dimensions.report_id
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update dimensions for their reports"
  ON public.dimensions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = dimensions.report_id
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete dimensions for their reports"
  ON public.dimensions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = dimensions.report_id
      AND reports.user_id = auth.uid()
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_dimensions_updated_at
  BEFORE UPDATE ON public.dimensions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();