-- Add source_dimension_id to dimension_mappings table
ALTER TABLE dimension_mappings
ADD COLUMN source_dimension_id uuid REFERENCES dimensions(id);

-- Add comment explaining the column
COMMENT ON COLUMN dimension_mappings.source_dimension_id IS 'The dimension that contains the source values to be mapped';