-- Store per-month channel pivot slices to split refresh load by month (lighter than per-year).
-- One row per (slide_report_id, channel, year, month). Main function merges month rows into pivot_data.
CREATE TABLE IF NOT EXISTS public.slide_report_channel_month_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_report_id UUID NOT NULL REFERENCES public.slide_reports(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(slide_report_id, channel, year, month)
);

CREATE INDEX IF NOT EXISTS idx_slide_report_channel_month_data_slide_report_id
  ON public.slide_report_channel_month_data(slide_report_id);
CREATE INDEX IF NOT EXISTS idx_slide_report_channel_month_data_channel_year_month
  ON public.slide_report_channel_month_data(channel, year, month);

ALTER TABLE public.slide_report_channel_month_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own slide report channel month data"
  ON public.slide_report_channel_month_data
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.slide_reports sr
      WHERE sr.id = slide_report_id AND sr.user_id = auth.uid()
    )
    OR is_master_account(auth.uid())
  );

CREATE POLICY "Users can insert their own slide report channel month data"
  ON public.slide_report_channel_month_data
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.slide_reports sr
      WHERE sr.id = slide_report_id AND sr.user_id = auth.uid()
    )
    OR is_master_account(auth.uid())
  );

CREATE POLICY "Users can update their own slide report channel month data"
  ON public.slide_report_channel_month_data
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.slide_reports sr
      WHERE sr.id = slide_report_id AND sr.user_id = auth.uid()
    )
    OR is_master_account(auth.uid())
  );

CREATE POLICY "Users can delete their own slide report channel month data"
  ON public.slide_report_channel_month_data
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.slide_reports sr
      WHERE sr.id = slide_report_id AND sr.user_id = auth.uid()
    )
    OR is_master_account(auth.uid())
  );

CREATE TRIGGER update_slide_report_channel_month_data_updated_at
  BEFORE UPDATE ON public.slide_report_channel_month_data
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
