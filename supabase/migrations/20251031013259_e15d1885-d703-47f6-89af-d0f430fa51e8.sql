-- Update dimension_data and sheet_data SELECT policies to allow shared report access

-- Update dimension_data SELECT policy
DROP POLICY IF EXISTS "Users can view dimension data for their reports" ON dimension_data;

CREATE POLICY "Users can view dimension data for accessible reports" 
ON dimension_data 
FOR SELECT 
USING (
  public.has_report_access(auth.uid(), report_id)
);

-- Update sheet_data SELECT policy
DROP POLICY IF EXISTS "Users can view sheet data for their reports" ON sheet_data;

CREATE POLICY "Users can view sheet data for accessible reports" 
ON sheet_data 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM data_sources ds
    WHERE ds.id = sheet_data.data_source_id
    AND public.has_report_access(auth.uid(), ds.report_id)
  )
);