-- Create dimension_mappings table for vlookup functionality
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_dimension_mappings_user_id ON dimension_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_dimension_mappings_report_id ON dimension_mappings(report_id);
CREATE INDEX IF NOT EXISTS idx_dimension_mappings_account_id ON dimension_mappings(account_id);
CREATE INDEX IF NOT EXISTS idx_dimension_mappings_source_dimension ON dimension_mappings(source_dimension_id);
CREATE INDEX IF NOT EXISTS idx_dimension_mappings_target_dimension ON dimension_mappings(target_dimension_id);

-- Enable RLS
ALTER TABLE dimension_mappings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own dimension mappings" ON dimension_mappings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dimension mappings" ON dimension_mappings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dimension mappings" ON dimension_mappings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dimension mappings" ON dimension_mappings
  FOR DELETE USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_dimension_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_dimension_mappings_updated_at
  BEFORE UPDATE ON dimension_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_dimension_mappings_updated_at();