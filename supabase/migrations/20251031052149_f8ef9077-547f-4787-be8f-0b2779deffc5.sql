-- Remove master account access from has_report_access function
CREATE OR REPLACE FUNCTION public.has_report_access(_user_id uuid, _report_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
$$;

-- Update reports RLS policy to remove master account check
DROP POLICY IF EXISTS "Users can view their own and shared reports" ON public.reports;
CREATE POLICY "Users can view their own and shared reports"
ON public.reports
FOR SELECT
USING (
  (user_id = auth.uid()) 
  OR 
  (EXISTS (
    SELECT 1
    FROM report_shares rs
    JOIN profiles p ON p.email = rs.shared_with_email
    WHERE rs.report_id = reports.id
    AND p.id = auth.uid()
  ))
);

-- Update data_sources policies to remove master account checks
DROP POLICY IF EXISTS "Users can create data sources for their reports" ON public.data_sources;
CREATE POLICY "Users can create data sources for their reports"
ON public.data_sources
FOR INSERT
WITH CHECK (owns_report(auth.uid(), report_id));

DROP POLICY IF EXISTS "Users can delete data sources for their reports" ON public.data_sources;
CREATE POLICY "Users can delete data sources for their reports"
ON public.data_sources
FOR DELETE
USING (owns_report(auth.uid(), report_id));

-- Update dimensions policy to remove master account check
DROP POLICY IF EXISTS "Users can view dimensions for accessible reports" ON public.dimensions;
CREATE POLICY "Users can view dimensions for accessible reports"
ON public.dimensions
FOR SELECT
USING (
  (auth.uid() = user_id) 
  OR 
  ((report_id IS NOT NULL) AND has_report_access(auth.uid(), report_id))
);

-- Update report_shares policies to remove master account checks
DROP POLICY IF EXISTS "Users can view shares for their reports" ON public.report_shares;
CREATE POLICY "Users can view shares for their reports"
ON public.report_shares
FOR SELECT
USING (
  (created_by = auth.uid()) 
  OR 
  (EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = report_shares.shared_with_email
  ))
);

DROP POLICY IF EXISTS "Users can create shares for their reports" ON public.report_shares;
CREATE POLICY "Users can create shares for their reports"
ON public.report_shares
FOR INSERT
WITH CHECK (owns_report(auth.uid(), report_id));

-- Update share_links policies to remove master account checks
DROP POLICY IF EXISTS "Users can view their own share links" ON public.share_links;
CREATE POLICY "Users can view their own share links"
ON public.share_links
FOR SELECT
USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update their own share links" ON public.share_links;
CREATE POLICY "Users can update their own share links"
ON public.share_links
FOR UPDATE
USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete their own share links" ON public.share_links;
CREATE POLICY "Users can delete their own share links"
ON public.share_links
FOR DELETE
USING (auth.uid() = created_by);