-- Update dimensions SELECT policy to include shared report access
DROP POLICY IF EXISTS "Users can view their own dimensions" ON dimensions;

CREATE POLICY "Users can view dimensions for accessible reports" 
ON dimensions 
FOR SELECT 
USING (
  auth.uid() = user_id
  OR
  (report_id IS NOT NULL AND public.has_report_access(auth.uid(), report_id))
  OR
  public.is_master_account(auth.uid())
);

-- Update data_sources policies to allow shared users to sync and edit
DROP POLICY IF EXISTS "Users can update data sources for their reports" ON data_sources;

CREATE POLICY "Users can update data sources for their reports" 
ON data_sources 
FOR UPDATE 
USING (
  public.has_report_access(auth.uid(), report_id)
);

-- Update sheet_data policies to allow shared users to sync
DROP POLICY IF EXISTS "Users can insert sheet data for their reports" ON sheet_data;
DROP POLICY IF EXISTS "Users can update sheet data for their reports" ON sheet_data;
DROP POLICY IF EXISTS "Users can delete sheet data for their reports" ON sheet_data;

CREATE POLICY "Users can insert sheet data for accessible reports" 
ON sheet_data 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM data_sources ds
    WHERE ds.id = sheet_data.data_source_id
    AND public.has_report_access(auth.uid(), ds.report_id)
  )
);

CREATE POLICY "Users can update sheet data for accessible reports" 
ON sheet_data 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1
    FROM data_sources ds
    WHERE ds.id = sheet_data.data_source_id
    AND public.has_report_access(auth.uid(), ds.report_id)
  )
);

CREATE POLICY "Users can delete sheet data for accessible reports" 
ON sheet_data 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1
    FROM data_sources ds
    WHERE ds.id = sheet_data.data_source_id
    AND public.has_report_access(auth.uid(), ds.report_id)
  )
);