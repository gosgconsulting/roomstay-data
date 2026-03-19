-- Create a unique index on data_sources to ensure only one source per report per type
CREATE UNIQUE INDEX IF NOT EXISTS data_sources_report_id_source_type_key ON data_sources (report_id, source_type);
