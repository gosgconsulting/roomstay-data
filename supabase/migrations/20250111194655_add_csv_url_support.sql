-- Add source_type and csv_url fields to data_sources table
-- This migration adds support for CSV URL data sources alongside Google Sheets

-- Create enum type for source_type
CREATE TYPE data_source_type AS ENUM ('google_sheets', 'csv_url');

-- Add source_type column with default 'google_sheets' for existing rows
ALTER TABLE public.data_sources
ADD COLUMN source_type data_source_type NOT NULL DEFAULT 'google_sheets';

-- Add csv_url column (nullable, only used for CSV sources)
ALTER TABLE public.data_sources
ADD COLUMN csv_url TEXT;

-- Make Google Sheets specific fields nullable (since CSV doesn't need them)
ALTER TABLE public.data_sources
ALTER COLUMN google_sheets_url DROP NOT NULL,
ALTER COLUMN spreadsheet_id DROP NOT NULL,
ALTER COLUMN tab_name DROP NOT NULL;

-- Add check constraint to ensure data integrity
-- For google_sheets: google_sheets_url, spreadsheet_id, and tab_name must be provided
-- For csv_url: csv_url must be provided
ALTER TABLE public.data_sources
ADD CONSTRAINT data_sources_source_type_check 
CHECK (
  (source_type = 'google_sheets' AND google_sheets_url IS NOT NULL AND spreadsheet_id IS NOT NULL AND tab_name IS NOT NULL) OR
  (source_type = 'csv_url' AND csv_url IS NOT NULL)
);

