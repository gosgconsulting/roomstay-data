-- Safer insert - only use confirmed global dimension IDs, with proper numeric checks
DELETE FROM public.report_daily_metrics;

INSERT INTO public.report_daily_metrics (account_id, report_id, report_name, date, impressions, clicks, cost, revenue, conversions, ctr, cpc, roas, conversion_rate, row_count)
SELECT 
  r.account_id,
  r.id as report_id,
  r.name as report_name,
  (dd.dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9')::date as date,
  COALESCE(SUM(
    CASE WHEN dd.dimension_values->>'33366963-8c93-48ea-b015-6e96228485af' ~ '^[0-9.]+$' 
    THEN (dd.dimension_values->>'33366963-8c93-48ea-b015-6e96228485af')::numeric ELSE 0 END
  ), 0) as impressions,
  COALESCE(SUM(
    CASE WHEN dd.dimension_values->>'649a4929-32e3-4a95-a9e4-a1dbcdf70c68' ~ '^[0-9.]+$' 
    THEN (dd.dimension_values->>'649a4929-32e3-4a95-a9e4-a1dbcdf70c68')::numeric ELSE 0 END
  ), 0) as clicks,
  COALESCE(SUM(
    CASE WHEN dd.dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290' ~ '^[0-9.]+$' 
    THEN (dd.dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290')::numeric ELSE 0 END
  ), 0) as cost,
  COALESCE(SUM(
    CASE WHEN dd.dimension_values->>'38544dae-6043-484a-8156-93675c9d60b6' ~ '^[0-9.]+$' 
    THEN (dd.dimension_values->>'38544dae-6043-484a-8156-93675c9d60b6')::numeric ELSE 0 END
  ), 0) as revenue,
  COALESCE(SUM(
    CASE WHEN dd.dimension_values->>'b3fcdd93-8107-476d-997a-27c1946189a7' ~ '^[0-9.]+$' 
    THEN (dd.dimension_values->>'b3fcdd93-8107-476d-997a-27c1946189a7')::numeric ELSE 0 END
  ), 0) as conversions,
  0 as ctr,
  0 as cpc,
  0 as roas,
  0 as conversion_rate,
  COUNT(*) as row_count
FROM reports r
JOIN dimension_data dd ON dd.report_id = r.id
WHERE dd.dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9' IS NOT NULL
  AND dd.dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9' != ''
  AND dd.dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9' ~ '^\d{4}-\d{2}-\d{2}$'
GROUP BY r.account_id, r.id, r.name, (dd.dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9')::date
ON CONFLICT (report_id, date) DO NOTHING;

-- Update calculated metrics
UPDATE public.report_daily_metrics SET
  ctr = CASE WHEN impressions > 0 THEN ROUND((clicks / impressions) * 100, 2) ELSE 0 END,
  cpc = CASE WHEN clicks > 0 THEN ROUND(cost / clicks, 2) ELSE 0 END,
  roas = CASE WHEN cost > 0 THEN ROUND(revenue / cost, 2) ELSE 0 END,
  conversion_rate = CASE WHEN clicks > 0 THEN ROUND((conversions / clicks) * 100, 2) ELSE 0 END;