-- Add auto-sync settings to data_sources table
ALTER TABLE data_sources 
ADD COLUMN IF NOT EXISTS sync_frequency TEXT DEFAULT 'manual' CHECK (sync_frequency IN ('manual', 'daily', 'weekly', 'monthly')),
ADD COLUMN IF NOT EXISTS sync_time TIME DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS sync_timezone TEXT DEFAULT 'Asia/Singapore',
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;