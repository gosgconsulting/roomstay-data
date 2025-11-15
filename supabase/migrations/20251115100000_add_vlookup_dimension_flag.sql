-- Add flag to identify vlookup-specific dimensions
-- This allows us to hide them from regular dimension modals
ALTER TABLE dimensions 
ADD COLUMN is_vlookup_dimension BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX idx_dimensions_is_vlookup_dimension 
ON dimensions(is_vlookup_dimension);

-- Update existing vlookup dimensions to have the flag set
UPDATE dimensions 
SET is_vlookup_dimension = TRUE 
WHERE type = 'vlookup';