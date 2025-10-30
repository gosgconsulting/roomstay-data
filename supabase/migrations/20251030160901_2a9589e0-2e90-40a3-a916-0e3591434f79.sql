-- Create table to store the actual data from Google Sheets
CREATE TABLE public.sheet_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  row_data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(data_source_id, row_number)
);

-- Enable RLS
ALTER TABLE public.sheet_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can access sheet data for their reports
CREATE POLICY "Users can view sheet data for their reports"
ON public.sheet_data
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.data_sources ds
    JOIN public.reports r ON r.id = ds.report_id
    WHERE ds.id = sheet_data.data_source_id
    AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert sheet data for their reports"
ON public.sheet_data
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.data_sources ds
    JOIN public.reports r ON r.id = ds.report_id
    WHERE ds.id = sheet_data.data_source_id
    AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update sheet data for their reports"
ON public.sheet_data
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.data_sources ds
    JOIN public.reports r ON r.id = ds.report_id
    WHERE ds.id = sheet_data.data_source_id
    AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete sheet data for their reports"
ON public.sheet_data
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.data_sources ds
    JOIN public.reports r ON r.id = ds.report_id
    WHERE ds.id = sheet_data.data_source_id
    AND r.user_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_sheet_data_updated_at
BEFORE UPDATE ON public.sheet_data
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create index for better query performance
CREATE INDEX idx_sheet_data_data_source_id ON public.sheet_data(data_source_id);
CREATE INDEX idx_sheet_data_row_number ON public.sheet_data(data_source_id, row_number);