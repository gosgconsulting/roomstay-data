-- Update dimension_data UPDATE and DELETE policies to allow shared report access
DROP POLICY IF EXISTS "Users can update dimension data for their reports" ON dimension_data;
DROP POLICY IF EXISTS "Users can delete dimension data for their reports" ON dimension_data;

CREATE POLICY "Users can update dimension data for accessible reports" 
ON dimension_data 
FOR UPDATE 
USING (
  public.has_report_access(auth.uid(), report_id)
);

CREATE POLICY "Users can delete dimension data for accessible reports" 
ON dimension_data 
FOR DELETE 
USING (
  public.has_report_access(auth.uid(), report_id)
);