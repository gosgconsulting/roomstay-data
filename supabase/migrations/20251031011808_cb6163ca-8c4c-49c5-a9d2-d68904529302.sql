-- Create a security definer function to check if user is master account
CREATE OR REPLACE FUNCTION public.is_master_account(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
    AND email = 'contact@gosgconsulting.com'
  )
$$;

-- Create a security definer function to check if user owns report
CREATE OR REPLACE FUNCTION public.owns_report(_user_id uuid, _report_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reports
    WHERE id = _report_id
    AND user_id = _user_id
  )
$$;

-- Drop and recreate the report_shares INSERT policy
DROP POLICY IF EXISTS "Users can create shares for their reports" ON report_shares;

CREATE POLICY "Users can create shares for their reports" 
ON report_shares 
FOR INSERT 
WITH CHECK (
  public.owns_report(auth.uid(), report_id)
  OR
  public.is_master_account(auth.uid())
);