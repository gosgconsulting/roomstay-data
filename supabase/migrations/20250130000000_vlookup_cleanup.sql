-- Clean up any old vlookup-specific columns that are no longer needed
-- Vlookup dimensions are now stored as regular text dimensions

-- Ensure dimension_mappings table exists with proper structure
CREATE TABLE IF NOT EXISTS dimension_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  source_dimension_id UUID NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  source_value TEXT NOT NULL,
  target_dimension_id UUID NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  target_dimension_name TEXT NOT NULL,
  target_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on dimension_mappings
ALTER TABLE dimension_mappings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for dimension_mappings
DROP POLICY IF EXISTS "Users can view their own dimension mappings" ON dimension_mappings;
CREATE POLICY "Users can view their own dimension mappings" ON dimension_mappings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own dimension mappings" ON dimension_mappings;
CREATE POLICY "Users can create their own dimension mappings" ON dimension_mappings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own dimension mappings" ON dimension_mappings;
CREATE POLICY "Users can update their own dimension mappings" ON dimension_mappings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own dimension mappings" ON dimension_mappings;
CREATE POLICY "Users can delete their own dimension mappings" ON dimension_mappings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add updated_at trigger for dimension_mappings
DROP TRIGGER IF EXISTS update_dimension_mappings_updated_at ON dimension_mappings;
CREATE TRIGGER update_dimension_mappings_updated_at
  BEFORE UPDATE ON dimension_mappings
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_dimension_mappings_user_report ON dimension_mappings(user_id, report_id);
CREATE INDEX IF NOT EXISTS idx_dimension_mappings_user_account ON dimension_mappings(user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_dimension_mappings_target_dimension ON dimension_mappings(target_dimension_id);