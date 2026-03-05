-- Allow master account and same-account users to view slide report views
DROP POLICY IF EXISTS "Users can view their own slide report views" ON public.slide_report_views;

CREATE POLICY "Users can view slide report views in their account"
ON public.slide_report_views
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_master_account(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.slide_reports sr
    JOIN public.accounts a ON a.id = sr.account_id
    WHERE sr.id = slide_report_views.slide_report_id
    AND (a.user_id = auth.uid())
  )
);