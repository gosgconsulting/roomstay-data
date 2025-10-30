-- Add date_granularity column to report_views table
ALTER TABLE report_views
ADD COLUMN date_granularity text DEFAULT 'none';