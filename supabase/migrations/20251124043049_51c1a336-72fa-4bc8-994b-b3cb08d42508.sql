-- Update has_report_access function to include master account check
CREATE OR REPLACE FUNCTION public.has_report_access(_user_id uuid, _report_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    -- Master account has access to all reports
    is_master_account(_user_id)
    OR EXISTS (
      -- User owns the report
      SELECT 1
      FROM public.reports
      WHERE id = _report_id
      AND user_id = _user_id
    )
    OR EXISTS (
      -- Report is shared with user
      SELECT 1
      FROM public.report_shares rs
      JOIN public.profiles p ON p.email = rs.shared_with_email
      WHERE rs.report_id = _report_id
      AND p.id = _user_id
    )
$function$;

-- Update accounts RLS policy to allow master account to view all accounts
DROP POLICY IF EXISTS "Users can view their own accounts" ON public.accounts;
CREATE POLICY "Users can view their own accounts or master can view all"
ON public.accounts
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  OR is_master_account(auth.uid())
);

-- Update reports RLS policy to allow master account to view all reports
DROP POLICY IF EXISTS "Users can view their own and shared reports" ON public.reports;
CREATE POLICY "Users can view their own and shared reports or master can view all"
ON public.reports
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR is_master_account(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM report_shares rs
    JOIN profiles p ON p.email = rs.shared_with_email
    WHERE rs.report_id = reports.id 
    AND p.id = auth.uid()
  )
);