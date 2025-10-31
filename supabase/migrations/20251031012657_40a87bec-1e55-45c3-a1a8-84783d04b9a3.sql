-- Update dimension_data policies to use has_report_access for viewing and master account for modifications

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert dimension data for their reports" ON dimension_data;
DROP POLICY IF EXISTS "Users can update dimension data for their reports" ON dimension_data;
DROP POLICY IF EXISTS "Users can delete dimension data for their reports" ON dimension_data;

-- Allow insert for report owners and master account
CREATE POLICY "Users can insert dimension data for their reports" 
ON dimension_data 
FOR INSERT 
WITH CHECK (
  public.owns_report(auth.uid(), report_id)
  OR
  public.is_master_account(auth.uid())
);

-- Allow update for report owners and master account
CREATE POLICY "Users can update dimension data for their reports" 
ON dimension_data 
FOR UPDATE 
USING (
  public.owns_report(auth.uid(), report_id)
  OR
  public.is_master_account(auth.uid())
);

-- Allow delete for report owners and master account
CREATE POLICY "Users can delete dimension data for their reports" 
ON dimension_data 
FOR DELETE 
USING (
  public.owns_report(auth.uid(), report_id)
  OR
  public.is_master_account(auth.uid())
);