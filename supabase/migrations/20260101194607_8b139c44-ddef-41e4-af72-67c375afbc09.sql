-- Drop the unique constraint that requires account_id
ALTER TABLE public.report_daily_metrics DROP CONSTRAINT report_daily_metrics_account_id_report_id_date_key;

-- Create a new unique constraint that handles NULL account_id
CREATE UNIQUE INDEX idx_report_daily_metrics_unique ON public.report_daily_metrics (report_id, date);

-- Now re-insert all data
INSERT INTO public.report_daily_metrics (account_id, report_id, report_name, date, impressions, clicks, cost, revenue, conversions, ctr, cpc, roas, conversion_rate, row_count)
SELECT 
  r.account_id,
  r.id as report_id,
  r.name as report_name,
  (dd.dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9')::date as date,
  COALESCE(SUM(NULLIF(dd.dimension_values->>'33366963-8c93-48ea-b015-6e96228485af', '')::numeric), 0) as impressions,
  COALESCE(SUM(NULLIF(dd.dimension_values->>'649a4929-32e3-4a95-a9e4-a1dbcdf70c68', '')::numeric), 0) as clicks,
  COALESCE(SUM(NULLIF(dd.dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290', '')::numeric), 0) as cost,
  COALESCE(SUM(NULLIF(dd.dimension_values->>'38544dae-6043-484a-8156-93675c9d60b6', '')::numeric), 0) as revenue,
  COALESCE(SUM(NULLIF(dd.dimension_values->>'b3fcdd93-8107-476d-997a-27c1946189a7', '')::numeric), 0) as conversions,
  CASE 
    WHEN SUM(NULLIF(dd.dimension_values->>'33366963-8c93-48ea-b015-6e96228485af', '')::numeric) > 0 
    THEN ROUND(SUM(NULLIF(dd.dimension_values->>'649a4929-32e3-4a95-a9e4-a1dbcdf70c68', '')::numeric) / NULLIF(SUM(NULLIF(dd.dimension_values->>'33366963-8c93-48ea-b015-6e96228485af', '')::numeric), 0) * 100, 2)
    ELSE 0 
  END as ctr,
  CASE 
    WHEN SUM(NULLIF(dd.dimension_values->>'649a4929-32e3-4a95-a9e4-a1dbcdf70c68', '')::numeric) > 0 
    THEN ROUND(SUM(NULLIF(dd.dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290', '')::numeric) / NULLIF(SUM(NULLIF(dd.dimension_values->>'649a4929-32e3-4a95-a9e4-a1dbcdf70c68', '')::numeric), 0), 2)
    ELSE 0 
  END as cpc,
  CASE 
    WHEN SUM(NULLIF(dd.dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290', '')::numeric) > 0 
    THEN ROUND(SUM(NULLIF(dd.dimension_values->>'38544dae-6043-484a-8156-93675c9d60b6', '')::numeric) / NULLIF(SUM(NULLIF(dd.dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290', '')::numeric), 0), 2)
    ELSE 0 
  END as roas,
  CASE 
    WHEN SUM(NULLIF(dd.dimension_values->>'649a4929-32e3-4a95-a9e4-a1dbcdf70c68', '')::numeric) > 0 
    THEN ROUND(SUM(NULLIF(dd.dimension_values->>'b3fcdd93-8107-476d-997a-27c1946189a7', '')::numeric) / NULLIF(SUM(NULLIF(dd.dimension_values->>'649a4929-32e3-4a95-a9e4-a1dbcdf70c68', '')::numeric), 0) * 100, 2)
    ELSE 0 
  END as conversion_rate,
  COUNT(*) as row_count
FROM reports r
JOIN dimension_data dd ON dd.report_id = r.id
WHERE dd.dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9' IS NOT NULL
  AND dd.dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9' != ''
GROUP BY r.account_id, r.id, r.name, (dd.dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9')::date
ON CONFLICT (report_id, date) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  impressions = EXCLUDED.impressions,
  clicks = EXCLUDED.clicks,
  cost = EXCLUDED.cost,
  revenue = EXCLUDED.revenue,
  conversions = EXCLUDED.conversions,
  ctr = EXCLUDED.ctr,
  cpc = EXCLUDED.cpc,
  roas = EXCLUDED.roas,
  conversion_rate = EXCLUDED.conversion_rate,
  row_count = EXCLUDED.row_count,
  updated_at = now();