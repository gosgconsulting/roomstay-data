-- Dedupe data_sources: keep one source per (report_id, source_type), delete the rest.
-- Use when a report (e.g. metasearch) has multiple CSV or Google Sheets sources and you want
-- a single canonical source per type. Keeps the most recently updated row per (report_id, source_type);
-- deletes others. dimension_data rows for deleted data_sources are removed by CASCADE.
--
-- Run in Supabase Dashboard → SQL Editor (or via MCP execute_sql).
-- Optional: run the SELECT below first to preview what would be deleted.

-- Preview: list duplicate data_sources (same report_id + source_type, more than one row)
-- SELECT report_id, source_type, COUNT(*), array_agg(id ORDER BY updated_at DESC) AS ids, array_agg(name) AS names
-- FROM data_sources
-- GROUP BY report_id, source_type
-- HAVING COUNT(*) > 1;

-- Delete duplicate data_sources: keep the one with latest updated_at per (report_id, source_type)
DELETE FROM data_sources
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY report_id, source_type ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST) AS rn
    FROM data_sources
  ) sub
  WHERE rn > 1
);

-- Optional: add a unique constraint to prevent future duplicates (one source per report per type).
-- Uncomment if you want to enforce at most one google_sheets and one csv_url per report:
-- CREATE UNIQUE INDEX IF NOT EXISTS data_sources_report_id_source_type_key
--   ON data_sources (report_id, source_type);
