-- Drop the problematic RLS policy
DROP POLICY IF EXISTS "Users can view their own and shared reports" ON reports;

-- Create a new policy that uses profiles instead of auth.users
CREATE POLICY "Users can view their own and shared reports" 
ON reports 
FOR SELECT 
USING (
  user_id = auth.uid() 
  OR 
  EXISTS (
    SELECT 1
    FROM report_shares rs
    JOIN profiles p ON p.email = rs.shared_with_email
    WHERE rs.report_id = reports.id 
    AND p.id = auth.uid()
  )
  OR
  -- Master account can see all reports
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'contact@gosgconsulting.com'
  )
);

-- Also update the report_shares policy to use profiles
DROP POLICY IF EXISTS "Users can view shares for their reports" ON report_shares;

CREATE POLICY "Users can view shares for their reports" 
ON report_shares 
FOR SELECT 
USING (
  created_by = auth.uid() 
  OR 
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = shared_with_email
  )
  OR
  -- Master account can see all shares
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'contact@gosgconsulting.com'
  )
);