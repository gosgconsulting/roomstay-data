-- Verify Social KPI (and other channels) against Supabase
-- Run in Supabase SQL Editor. Replace YOUR_SLIDE_REPORT_ID with your report UUID.
--
-- How to get slide_report_id:
--   - From URL when viewing the slide report (e.g. /slide-report/<slide_report_id> or in query params)
--   - Or run "Option B" below and copy the id for "Brady Hotels 2025" (or your report name)
--
-- Your UI shows: Account "Brady Hotels 2025", Year 2026, Month January.
-- Expected: Cost $4,643.28, Revenue $82,325.39, Impressions 540,738, Clicks 3,814, Bookings 152, etc.
--
-- Important: If you have a VIEW filter (e.g. only "Brady Hotels 2025"), the frontend KPI is
-- computed from breakdown rows for that filter; the stored row here is the full month total.
-- So compare either with no filter (all accounts) or compare breakdown sum to dimension_data.
--
-- Option A: Use a specific slide_report_id (replace the UUID below)
-- Option B: List your slide reports and copy the id from the report you're viewing

-- =============================================================================
-- OPTION B: List slide reports (to find your slide_report_id)
-- =============================================================================
-- SELECT id, name, report_ids->>'social' AS social_report_id, last_refreshed_at
-- FROM slide_reports
-- ORDER BY last_refreshed_at DESC NULLS LAST
-- LIMIT 20;

-- =============================================================================
-- OPTION A: Compare Social (and SEM/Metasearch) KPIs for Jan 2026
-- Replace 'YOUR_SLIDE_REPORT_ID' with the actual UUID from your slide report URL.
-- =============================================================================
DO $$
DECLARE
  v_slide_report_id uuid := 'YOUR_SLIDE_REPORT_ID'::uuid;
  v_row record;
  v_month_key text := '2026-01';
  v_month_json jsonb;
BEGIN
  RAISE NOTICE '=== Slide report: % ===', v_slide_report_id;
  FOR v_row IN
    SELECT channel, year, month, data
    FROM slide_report_channel_month_data
    WHERE slide_report_id = v_slide_report_id
      AND year = 2026
      AND month = 1
  LOOP
    v_month_json := v_row.data->'monthly'->v_month_key;
    IF v_month_json IS NOT NULL THEN
      RAISE NOTICE '--- Channel: % (year=%, month=%) ---', v_row.channel, v_row.year, v_row.month;
      RAISE NOTICE '  Impressions: %', v_month_json->>'impressions';
      RAISE NOTICE '  Clicks: %', v_month_json->>'clicks';
      RAISE NOTICE '  Cost: %', v_month_json->>'cost';
      RAISE NOTICE '  Revenue: %', v_month_json->>'revenue';
      RAISE NOTICE '  Bookings: %', v_month_json->>'bookings';
      RAISE NOTICE '  CTR: %', v_month_json->>'ctr';
      RAISE NOTICE '  CPC: %', v_month_json->>'cpc';
      RAISE NOTICE '  ROAS: %', v_month_json->>'roas';
      RAISE NOTICE '  Cost of Sale: %', v_month_json->>'costOfSale';
    ELSE
      RAISE NOTICE '--- Channel: % (year=%, month=%) --- (no monthly key %)', v_row.channel, v_row.year, v_row.month, v_month_key;
      RAISE NOTICE '  data.monthly keys: %', (SELECT jsonb_object_keys(v_row.data->'monthly') LIMIT 1);
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- Same as above but as a SELECT (easier to read in SQL editor result grid)
-- Replace YOUR_SLIDE_REPORT_ID with your slide report UUID.
-- =============================================================================
SELECT
  m.channel,
  m.year,
  m.month,
  (m.data->'monthly'->'2026-01')->>'impressions' AS impressions,
  (m.data->'monthly'->'2026-01')->>'clicks'      AS clicks,
  (m.data->'monthly'->'2026-01')->>'cost'       AS cost,
  (m.data->'monthly'->'2026-01')->>'revenue'    AS revenue,
  (m.data->'monthly'->'2026-01')->>'bookings'   AS bookings,
  (m.data->'monthly'->'2026-01')->>'ctr'        AS ctr,
  (m.data->'monthly'->'2026-01')->>'cpc'        AS cpc,
  (m.data->'monthly'->'2026-01')->>'roas'       AS roas,
  (m.data->'monthly'->'2026-01')->>'costOfSale' AS cost_of_sale
FROM slide_report_channel_month_data m
WHERE m.slide_report_id = 'YOUR_SLIDE_REPORT_ID'::uuid
  AND m.year = 2026
  AND m.month = 1;
