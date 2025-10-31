-- Update dimension_data INSERT policy to allow shared report access for syncing
DROP POLICY IF EXISTS "Users can insert dimension data for their reports" ON dimension_data;

CREATE POLICY "Users can insert dimension data for accessible reports" 
ON dimension_data 
FOR INSERT 
WITH CHECK (
  public.has_report_access(auth.uid(), report_id)
);