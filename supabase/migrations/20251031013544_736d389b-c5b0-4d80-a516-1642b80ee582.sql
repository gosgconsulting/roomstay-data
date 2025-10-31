-- Update report_views SELECT policy to allow shared report access
DROP POLICY IF EXISTS "Users can view their own report views" ON report_views;

CREATE POLICY "Users can view report views for accessible reports" 
ON report_views 
FOR SELECT 
USING (
  auth.uid() = user_id
  OR
  public.has_report_access(auth.uid(), report_id)
);