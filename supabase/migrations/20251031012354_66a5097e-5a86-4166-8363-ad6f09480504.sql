-- Create a security definer function to check if user has access to report (owns or shared)
CREATE OR REPLACE FUNCTION public.has_report_access(_user_id uuid, _report_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
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
  OR
  -- Master account has access to all reports
  public.is_master_account(_user_id)
$$;

-- Update data_sources SELECT policy to include shared reports
DROP POLICY IF EXISTS "Users can view data sources for their reports" ON data_sources;

CREATE POLICY "Users can view data sources for their reports" 
ON data_sources 
FOR SELECT 
USING (public.has_report_access(auth.uid(), report_id));

-- Update other data_sources policies to allow master account
DROP POLICY IF EXISTS "Users can create data sources for their reports" ON data_sources;

CREATE POLICY "Users can create data sources for their reports" 
ON data_sources 
FOR INSERT 
WITH CHECK (
  public.owns_report(auth.uid(), report_id)
  OR
  public.is_master_account(auth.uid())
);

DROP POLICY IF EXISTS "Users can update data sources for their reports" ON data_sources;

CREATE POLICY "Users can update data sources for their reports" 
ON data_sources 
FOR UPDATE 
USING (
  public.owns_report(auth.uid(), report_id)
  OR
  public.is_master_account(auth.uid())
);

DROP POLICY IF EXISTS "Users can delete data sources for their reports" ON data_sources;

CREATE POLICY "Users can delete data sources for their reports" 
ON data_sources 
FOR DELETE 
USING (
  public.owns_report(auth.uid(), report_id)
  OR
  public.is_master_account(auth.uid())
);