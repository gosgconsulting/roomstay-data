-- Additive guardrails for canonical reporting + legacy slide deprecation markers.
-- Canonical fact table: dimension_data.
-- Legacy caches: slide_report_* tables (being deprecated; keep temporarily for backward compatibility).

-- Canonical query indexes (dimension_data)
CREATE INDEX IF NOT EXISTS idx_dimension_data_report_row_number
  ON public.dimension_data (report_id, row_number);

CREATE INDEX IF NOT EXISTS idx_dimension_data_report_data_source
  ON public.dimension_data (report_id, data_source_id);

COMMENT ON INDEX idx_dimension_data_report_row_number IS
  'Speeds up canonical reads of dimension_data by report ordered by row_number.';

COMMENT ON INDEX idx_dimension_data_report_data_source IS
  'Speeds up canonical reads and maintenance by report_id + data_source_id.';

-- Deprecation markers (legacy slide-report persistence)
ALTER TABLE public.slide_reports
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz;

ALTER TABLE public.slide_report_views
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz;

ALTER TABLE public.slide_report_summaries
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz;

ALTER TABLE public.slide_report_channel_year_data
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz;

ALTER TABLE public.slide_report_channel_month_data
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz;

ALTER TABLE public.slide_report_channel_raw_rows
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz;

ALTER TABLE public.slide_report_monthly_data
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz;

COMMENT ON COLUMN public.slide_reports.deprecated_at IS
  'Set when the legacy slide-report persistence path is deprecated (no new writes expected).';

COMMENT ON COLUMN public.slide_report_views.deprecated_at IS
  'Set when the legacy slide-report persistence path is deprecated (no new writes expected).';

COMMENT ON COLUMN public.slide_report_summaries.deprecated_at IS
  'Set when the legacy slide-report persistence path is deprecated (no new writes expected).';

COMMENT ON COLUMN public.slide_report_channel_year_data.deprecated_at IS
  'Set when the legacy slide-report cache tables are deprecated (no new writes expected).';

COMMENT ON COLUMN public.slide_report_channel_month_data.deprecated_at IS
  'Set when the legacy slide-report cache tables are deprecated (no new writes expected).';

COMMENT ON COLUMN public.slide_report_channel_raw_rows.deprecated_at IS
  'Set when the legacy slide-report cache tables are deprecated (no new writes expected).';

COMMENT ON COLUMN public.slide_report_monthly_data.deprecated_at IS
  'Set when the legacy slide-report cache tables are deprecated (no new writes expected).';

