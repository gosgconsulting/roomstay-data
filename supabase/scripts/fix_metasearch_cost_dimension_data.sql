-- Fix metasearch Cost in dimension_data by normalizing all "Cost" dimension keys
-- into the account's canonical Cost dimension ID (so the UI shows full total).
--
-- Use when metasearch Cost shows only part of the total (e.g. ~343 instead of ~1.3k)
-- because rows use different Cost dimension IDs from multiple data sources.
--
-- Run in Supabase Dashboard → SQL Editor.
--
-- Optional: set a specific slide_report_id to fix only that report's metasearch.
-- Otherwise the script uses the first slide report that has a metasearch report_id.
--
-- To inspect current cost per Cost dimension ID (before running the fix), run:
--   SELECT d.id, d.name, d.scope, SUM((dd.dimension_values->>d.id::text)::numeric) AS total_cost
--   FROM dimensions d
--   CROSS JOIN (SELECT (report_ids->>'metasearch')::uuid AS rid FROM slide_reports WHERE report_ids->>'metasearch' IS NOT NULL LIMIT 1) r
--   JOIN dimension_data dd ON dd.report_id = r.rid AND dd.dimension_values ? d.id::text
--   WHERE d.name ILIKE 'Cost'
--   GROUP BY d.id, d.name, d.scope;

DO $$
DECLARE
  v_slide_report_id uuid;
  v_metasearch_report_id uuid;
  v_account_id uuid;
  v_canonical_cost_id uuid;
  v_cost_ids uuid[];
  v_id uuid;
  v_dv jsonb;
  v_new_dv jsonb;
  v_total numeric;
  v_row record;
  v_updated int := 0;
  v_keys_to_remove text[] := '{}';
  v_key text;
BEGIN
  -- Resolve metasearch report_id from slide_reports
  SELECT sr.id, (sr.report_ids->>'metasearch')::uuid
  INTO v_slide_report_id, v_metasearch_report_id
  FROM slide_reports sr
  WHERE sr.report_ids->>'metasearch' IS NOT NULL
    AND (sr.report_ids->>'metasearch')::uuid IS NOT NULL
  ORDER BY sr.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_metasearch_report_id IS NULL THEN
    RAISE NOTICE 'No slide report with metasearch report_id found.';
    RETURN;
  END IF;

  SELECT r.account_id INTO v_account_id
  FROM reports r
  WHERE r.id = v_metasearch_report_id;

  IF v_account_id IS NULL THEN
    SELECT sr.account_id INTO v_account_id
    FROM slide_reports sr
    WHERE sr.id = v_slide_report_id;
  END IF;

  IF v_account_id IS NULL THEN
    RAISE NOTICE 'No account_id for report % or slide report %', v_metasearch_report_id, v_slide_report_id;
    RETURN;
  END IF;

  -- Canonical Cost dimension: prefer account-scoped
  SELECT d.id INTO v_canonical_cost_id
  FROM dimensions d
  WHERE d.name ILIKE 'Cost'
    AND d.scope = 'account'
    AND d.account_id = v_account_id
  LIMIT 1;

  IF v_canonical_cost_id IS NULL THEN
    SELECT d.id INTO v_canonical_cost_id
    FROM dimensions d
    WHERE d.name ILIKE 'Cost'
      AND ( (d.scope = 'custom' AND d.report_id = v_metasearch_report_id) OR d.scope = 'global' )
    LIMIT 1;
  END IF;

  IF v_canonical_cost_id IS NULL THEN
    RAISE NOTICE 'No Cost dimension found for account %', v_account_id;
    RETURN;
  END IF;

  -- All Cost dimension IDs (account, custom for this report, global)
  SELECT ARRAY_AGG(d.id)
  INTO v_cost_ids
  FROM dimensions d
  WHERE d.name ILIKE 'Cost'
    AND ( (d.scope = 'account' AND d.account_id = v_account_id)
          OR (d.scope = 'custom' AND d.report_id = v_metasearch_report_id)
          OR d.scope = 'global' );

  IF v_cost_ids IS NULL OR array_length(v_cost_ids, 1) <= 1 THEN
    RAISE NOTICE 'Only one (or no) Cost dimension for report %; no merge needed.', v_metasearch_report_id;
    RETURN;
  END IF;

  RAISE NOTICE 'Metasearch report_id: %, account_id: %, canonical Cost id: %, all Cost ids: %',
    v_metasearch_report_id, v_account_id, v_canonical_cost_id, v_cost_ids;

  FOR v_row IN
    SELECT id, dimension_values
    FROM dimension_data
    WHERE report_id = v_metasearch_report_id
  LOOP
    v_dv := v_row.dimension_values;
    v_total := 0;
    v_keys_to_remove := '{}';

    FOREACH v_id IN ARRAY v_cost_ids
    LOOP
      v_key := v_id::text;
      IF v_dv ? v_key THEN
        v_total := v_total + COALESCE((v_dv->>v_key)::numeric, 0);
        v_keys_to_remove := array_append(v_keys_to_remove, v_key);
      END IF;
    END LOOP;

    IF array_length(v_keys_to_remove, 1) IS NULL THEN
      CONTINUE; -- no cost keys in this row
    END IF;

    -- Remove all cost keys, then set canonical to total
    v_new_dv := v_dv;
    FOREACH v_key IN ARRAY v_keys_to_remove
    LOOP
      v_new_dv := v_new_dv - v_key;
    END LOOP;
    v_new_dv := v_new_dv || jsonb_build_object(v_canonical_cost_id::text, v_total::text);

    UPDATE dimension_data
    SET dimension_values = v_new_dv,
        updated_at = now()
    WHERE id = v_row.id;

    v_updated := v_updated + 1;
  END LOOP;

  RAISE NOTICE 'Updated % rows in dimension_data for metasearch report %', v_updated, v_metasearch_report_id;
END $$;
