-- Update the dimensions table type constraint to allow the correct dimension types
-- Remove the old constraint if it exists
ALTER TABLE dimensions DROP CONSTRAINT IF EXISTS dimensions_type_check;

-- Add the correct constraint with valid dimension types
ALTER TABLE dimensions ADD CONSTRAINT dimensions_type_check 
CHECK (type IN ('text', 'date', 'number', 'currency', 'percentage'));

-- Update any existing 'vlookup' type dimensions to 'text' type
UPDATE dimensions SET type = 'text' WHERE type = 'vlookup';