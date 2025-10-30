-- Add indices to improve query performance for large datasets

-- Index on dimension_data for faster filtering by report_id
CREATE INDEX IF NOT EXISTS idx_dimension_data_report_id 
ON public.dimension_data (report_id);

-- Index on dimension_data for faster filtering by data_source_id
CREATE INDEX IF NOT EXISTS idx_dimension_data_data_source_id 
ON public.dimension_data (data_source_id);

-- GIN index on dimension_values JSONB column for faster lookups
CREATE INDEX IF NOT EXISTS idx_dimension_data_dimension_values 
ON public.dimension_data USING GIN (dimension_values);

-- Index on dimensions for faster filtering by report_id
CREATE INDEX IF NOT EXISTS idx_dimensions_report_id 
ON public.dimensions (report_id);

-- Index on dimensions for faster filtering by type
CREATE INDEX IF NOT EXISTS idx_dimensions_type 
ON public.dimensions (type);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_dimension_data_report_source 
ON public.dimension_data (report_id, data_source_id);

-- Add comment explaining the indices
COMMENT ON INDEX idx_dimension_data_report_id IS 'Improves performance when filtering dimension data by report';
COMMENT ON INDEX idx_dimension_data_dimension_values IS 'Improves performance when querying specific dimension values in JSONB column';