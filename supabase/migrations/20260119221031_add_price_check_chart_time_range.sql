-- Add price_check_chart_time_range field to slide_report_views table
-- This allows price-check tab to have its own independent chart time range

ALTER TABLE public.slide_report_views
ADD COLUMN IF NOT EXISTS price_check_chart_time_range TEXT 
CHECK (price_check_chart_time_range IN ('this_year', 'last_12_months', 'last_6_months', 'last_3_months'));

-- Add comment to document the field
COMMENT ON COLUMN public.slide_report_views.price_check_chart_time_range IS 
'Chart time range specifically for the price-check tab. Independent from the main chart_time_range used by other tabs.';
