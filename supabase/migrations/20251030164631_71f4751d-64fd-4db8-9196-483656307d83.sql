-- Add column_mappings to data_sources table to store the mapping configuration
ALTER TABLE public.data_sources 
ADD COLUMN column_mappings jsonb;