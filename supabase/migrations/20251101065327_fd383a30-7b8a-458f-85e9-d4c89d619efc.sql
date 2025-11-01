-- Add columns to report_views table for KPI settings
ALTER TABLE report_views
ADD COLUMN IF NOT EXISTS visible_kpis text[] DEFAULT ARRAY['Impressions', 'Clicks', 'CTR', 'Conversions', 'Conversion rate', 'CPC', 'Cost', 'Revenue', 'ROAS', 'Cost of sale'],
ADD COLUMN IF NOT EXISTS kpi_order text[] DEFAULT ARRAY['Impressions', 'Clicks', 'CTR', 'Conversions', 'Conversion rate', 'CPC', 'Cost', 'Revenue', 'ROAS', 'Cost of sale'];