-- Add channel column to reports to identify report type ('metasearch', 'sem', 'social')
-- This prevents relying solely on name matching.

BEGIN;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS channel text;

-- Backfill channel based on name matching
UPDATE reports
SET channel = CASE
  WHEN name ILIKE '%metasearch%' THEN 'metasearch'
  WHEN name ILIKE '%sem%' THEN 'sem'
  WHEN name ILIKE '%social%' THEN 'social'
  ELSE NULL
END
WHERE channel IS NULL;

COMMIT;
