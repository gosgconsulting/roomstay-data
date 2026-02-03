-- RPC to fetch dimension_data rows filtered by date in JSONB (year and optional month).
-- Caller must pass the report's date dimension ID (UUID as text) used as key in dimension_values.
-- This allows the DB to filter rows instead of fetching all and filtering in the Edge Function.
-- Returns only dimension_values (jsonb) to minimize payload. RLS on dimension_data still applies.

CREATE OR REPLACE FUNCTION public.get_dimension_data_by_report_and_date(
  p_report_id uuid,
  p_date_dim_id text,
  p_year int,
  p_month int DEFAULT NULL,
  p_max_rows int DEFAULT 100000
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT dd.dimension_values
  FROM public.dimension_data dd
  WHERE dd.report_id = p_report_id
    AND dd.dimension_values ? p_date_dim_id
    AND (dd.dimension_values->>p_date_dim_id) IS NOT NULL
    AND (dd.dimension_values->>p_date_dim_id) <> ''
    AND (dd.dimension_values->>p_date_dim_id)::date IS NOT NULL
    AND EXTRACT(YEAR FROM (dd.dimension_values->>p_date_dim_id)::date) = p_year
    AND (p_month IS NULL OR EXTRACT(MONTH FROM (dd.dimension_values->>p_date_dim_id)::date) = p_month)
  LIMIT p_max_rows;
END;
$$;

COMMENT ON FUNCTION public.get_dimension_data_by_report_and_date(uuid, text, int, int, int) IS
  'Returns dimension_values for dimension_data rows where the date dimension (p_date_dim_id) matches the given year and optional month. Used by refresh-slide-report-channel to avoid full table scan.';
