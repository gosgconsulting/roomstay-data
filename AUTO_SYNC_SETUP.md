# Auto-Sync Setup Instructions

The auto-sync feature has been implemented with the following components:

## Database Changes
- Added `sync_frequency`, `sync_time`, `sync_timezone`, and `last_synced_at` columns to the `data_sources` table
- Sync frequency options: Manual (default), Daily, Weekly (Sundays), Monthly (1st of month)

## Edge Function
- Created `auto-sync-data-sources` edge function that checks and syncs data sources based on their schedule

## UI Updates
- Added auto-sync settings to the Edit Data Source modal:
  - Sync Frequency dropdown
  - Sync Time picker (UTC-based)
  - Timezone selector with common timezones

## Setting Up the Cron Job

To enable automatic syncing, you need to set up a cron job in Supabase using `pg_cron`:

### 1. Enable Extensions
First, enable the required extensions in your Supabase SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### 2. Create the Cron Job
Run this SQL to create a cron job that runs every 15 minutes:

```sql
SELECT cron.schedule(
  'auto-sync-data-sources',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT
    net.http_post(
        url:='https://zcxxwpwheevwavdcgfht.supabase.co/functions/v1/auto-sync-data-sources',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer <YOUR_SERVICE_ROLE_KEY_OR_JWT>"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
```

### 3. Verify the Cron Job
Check if the cron job is running:

```sql
SELECT * FROM cron.job;
```

### 4. View Cron Job Logs
Monitor the cron job execution:

```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-sync-data-sources')
ORDER BY start_time DESC
LIMIT 10;
```

### 5. Remove/Update the Cron Job (if needed)
To remove the cron job:

```sql
SELECT cron.unschedule('auto-sync-data-sources');
```

## How It Works

1. The cron job runs every 15 minutes
2. The edge function checks all data sources with `sync_frequency` != 'manual'
3. For each data source, it calculates if the current time matches the scheduled sync time (within a 15-minute window)
4. If it's time to sync:
   - Fetches latest data from Google Sheets
   - Deletes existing dimension_data for that data source
   - Inserts the new data
   - Updates the `last_synced_at` timestamp

## Timezone Handling

The sync times are stored in the database and the edge function converts them to UTC for comparison. The 15-minute window ensures syncs don't get missed if the cron job timing is slightly off.

## Monitoring

You can check the edge function logs in the Supabase dashboard to see sync activity:
https://supabase.com/dashboard/project/zcxxwpwheevwavdcgfht/functions/auto-sync-data-sources/logs
