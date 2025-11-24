-- Add conditions column to dimensions table
ALTER TABLE public.dimensions
ADD COLUMN IF NOT EXISTS conditions jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.dimensions.conditions IS 'Array of filter conditions: [{dimension_id, operator, value}]';