-- Migrate budget_data structure from flat to channel-specific nested format
-- Old format: {"2025-01": 3000, "2025-02": 4500}
-- New format: {"2025-01": {"metasearch": 1000, "sem": 1000, "social": 1000}}

-- Step 1: Create a function to migrate budget data structure
CREATE OR REPLACE FUNCTION migrate_budget_data_to_channels()
RETURNS void AS $$
DECLARE
  budget_record RECORD;
  old_data JSONB;
  new_data JSONB;
  month_key TEXT;
  month_value NUMERIC;
  channel_value NUMERIC;
BEGIN
  -- Loop through all budgets
  FOR budget_record IN 
    SELECT id, budget_data
    FROM public.budgets
    WHERE budget_data IS NOT NULL 
      AND budget_data != 'null'::jsonb 
      AND budget_data != '{}'::jsonb
  LOOP
    old_data := budget_record.budget_data;
    new_data := '{}'::jsonb;
    
    -- Check if data is already in new format (has nested objects with channel keys)
    -- If any value is an object with 'metasearch', 'sem', or 'social' keys, skip this record
    IF EXISTS (
      SELECT 1 
      FROM jsonb_each(old_data) AS entry
      WHERE jsonb_typeof(entry.value) = 'object'
        AND (
          entry.value ? 'metasearch' 
          OR entry.value ? 'sem' 
          OR entry.value ? 'social'
        )
    ) THEN
      RAISE NOTICE 'Budget % already in new format, skipping', budget_record.id;
      CONTINUE;
    END IF;
    
    -- Convert each month's flat value to channel-specific structure
    FOR month_key, month_value IN 
      SELECT key, (value::text)::numeric
      FROM jsonb_each_text(old_data)
      WHERE jsonb_typeof(old_data->key) = 'number'
    LOOP
      -- Divide by 3 to get per-channel value (old logic assumption)
      channel_value := month_value / 3;
      
      -- Create new nested structure for this month
      new_data := new_data || jsonb_build_object(
        month_key,
        jsonb_build_object(
          'metasearch', channel_value,
          'sem', channel_value,
          'social', channel_value
        )
      );
      
      RAISE NOTICE 'Migrated budget % month % from % to channel-specific format', 
        budget_record.id, month_key, month_value;
    END LOOP;
    
    -- Update the budget with new structure
    IF new_data != '{}'::jsonb THEN
      UPDATE public.budgets
      SET budget_data = new_data,
          updated_at = now()
      WHERE id = budget_record.id;
      
      RAISE NOTICE 'Updated budget % with new channel-specific structure', budget_record.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Run the migration
SELECT migrate_budget_data_to_channels();

-- Step 3: Clean up the migration function (optional, keep it for potential rollback)
-- DROP FUNCTION IF EXISTS migrate_budget_data_to_channels();

-- Add comment for documentation
COMMENT ON COLUMN public.budgets.budget_data IS 'Budget data by month and channel. Format: {"2025-01": {"metasearch": 1000, "sem": 1500, "social": 500}}';
