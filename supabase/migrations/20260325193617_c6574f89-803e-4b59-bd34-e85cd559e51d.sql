CREATE POLICY "Anon can read dimensions for shared reports"
ON public.dimensions FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.data_sources ds
    JOIN public.reports r ON r.id = ds.report_id
    JOIN public.slide_reports sr ON sr.account_id = r.account_id
    JOIN public.share_links sl ON sl.slide_report_id = sr.id
    WHERE ds.id = dimensions.data_source_id
  )
  OR scope = 'global'
);