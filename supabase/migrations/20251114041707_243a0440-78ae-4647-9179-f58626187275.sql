-- Create dimension mappings table for vlookup functionality
CREATE TABLE IF NOT EXISTS public.dimension_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  source_value TEXT NOT NULL,
  target_dimension_id UUID NOT NULL,
  target_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dimension_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own dimension mappings"
  ON public.dimension_mappings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own dimension mappings"
  ON public.dimension_mappings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dimension mappings"
  ON public.dimension_mappings
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dimension mappings"
  ON public.dimension_mappings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_dimension_mappings_report ON public.dimension_mappings(report_id);
CREATE INDEX idx_dimension_mappings_account ON public.dimension_mappings(account_id);
CREATE INDEX idx_dimension_mappings_user ON public.dimension_mappings(user_id);