-- Create cluster dimensions table for grouping dimension values
CREATE TABLE IF NOT EXISTS public.cluster_dimensions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cluster_dimension_name TEXT NOT NULL,
  source_dimension_id UUID NOT NULL REFERENCES public.dimensions(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_dimension_id UUID REFERENCES public.dimensions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cluster_dimension_name, source_dimension_id, user_id)
);

-- Create cluster mappings table for storing which values map to which cluster
CREATE TABLE IF NOT EXISTS public.cluster_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cluster_dimension_id UUID NOT NULL REFERENCES public.cluster_dimensions(id) ON DELETE CASCADE,
  source_values TEXT[] NOT NULL,
  cluster_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on cluster_dimensions
ALTER TABLE public.cluster_dimensions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cluster_dimensions
CREATE POLICY "Users can view their own cluster dimensions"
  ON public.cluster_dimensions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cluster dimensions"
  ON public.cluster_dimensions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cluster dimensions"
  ON public.cluster_dimensions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cluster dimensions"
  ON public.cluster_dimensions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable RLS on cluster_mappings
ALTER TABLE public.cluster_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cluster_mappings
CREATE POLICY "Users can view their cluster mappings"
  ON public.cluster_mappings
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cluster_dimensions cd
    WHERE cd.id = cluster_mappings.cluster_dimension_id
    AND cd.user_id = auth.uid()
  ));

CREATE POLICY "Users can create their cluster mappings"
  ON public.cluster_mappings
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cluster_dimensions cd
    WHERE cd.id = cluster_mappings.cluster_dimension_id
    AND cd.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their cluster mappings"
  ON public.cluster_mappings
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM cluster_dimensions cd
    WHERE cd.id = cluster_mappings.cluster_dimension_id
    AND cd.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their cluster mappings"
  ON public.cluster_mappings
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM cluster_dimensions cd
    WHERE cd.id = cluster_mappings.cluster_dimension_id
    AND cd.user_id = auth.uid()
  ));

-- Indexes for better performance
CREATE INDEX idx_cluster_dimensions_user ON public.cluster_dimensions(user_id);
CREATE INDEX idx_cluster_dimensions_report ON public.cluster_dimensions(report_id);
CREATE INDEX idx_cluster_dimensions_account ON public.cluster_dimensions(account_id);
CREATE INDEX idx_cluster_dimensions_source_dim ON public.cluster_dimensions(source_dimension_id);
CREATE INDEX idx_cluster_mappings_cluster_dim ON public.cluster_mappings(cluster_dimension_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cluster_dimensions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cluster_dimensions_updated_at
BEFORE UPDATE ON public.cluster_dimensions
FOR EACH ROW
EXECUTE FUNCTION update_cluster_dimensions_updated_at();

CREATE TRIGGER cluster_mappings_updated_at
BEFORE UPDATE ON public.cluster_mappings
FOR EACH ROW
EXECUTE FUNCTION update_cluster_dimensions_updated_at();