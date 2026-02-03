-- Fix doubled dimension_data: remove duplicate rows and prevent future duplicates.
-- Duplicates are (report_id, data_source_id, row_number) appearing more than once;
-- we keep one row per key (smallest id) and add a unique constraint.

-- Step 1: Delete duplicate rows, keeping the row with the smallest id per (report_id, data_source_id, row_number).
DELETE FROM dimension_data
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
      row_number() OVER (
        PARTITION BY report_id, data_source_id, row_number
        ORDER BY id
      ) AS rn
    FROM dimension_data
  ) sub
  WHERE sub.rn > 1
);

-- Step 2: Add unique constraint so the same logical row cannot be inserted twice.
-- Resync/sync must use upsert (ON CONFLICT) when inserting.
CREATE UNIQUE INDEX IF NOT EXISTS dimension_data_report_source_row_key
  ON dimension_data (report_id, data_source_id, row_number);

COMMENT ON INDEX dimension_data_report_source_row_key IS
  'Ensures one row per (report_id, data_source_id, row_number) to prevent doubled metrics from duplicate inserts.';

-- After this migration: re-run slide report refresh for affected reports so pivot_data (and
-- slide_report_channel_month_data) is recomputed from deduplicated dimension_data.
