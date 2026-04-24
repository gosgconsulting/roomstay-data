ALTER TABLE share_links ADD COLUMN IF NOT EXISTS custom_report_id uuid REFERENCES custom_reports(id) ON DELETE CASCADE;
