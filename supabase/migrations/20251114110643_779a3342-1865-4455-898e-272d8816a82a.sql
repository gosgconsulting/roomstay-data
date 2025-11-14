-- Add target_dimension_name column to dimension_mappings table
ALTER TABLE dimension_mappings 
ADD COLUMN IF NOT EXISTS target_dimension_name TEXT;

-- Backfill existing data with dimension names
UPDATE dimension_mappings dm
SET target_dimension_name = d.name
FROM dimensions d
WHERE dm.target_dimension_id = d.id
AND dm.target_dimension_name IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_dimension_mappings_target_dim_name 
ON dimension_mappings(target_dimension_name);