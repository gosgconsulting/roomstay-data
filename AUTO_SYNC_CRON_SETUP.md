# Auto-Sync Cron Job Setup

This migration creates automatic cron jobs for data sources with `sync_frequency` set to 'daily', 'weekly', or 'monthly'.

## How It Works

1. **Trigger Function**: When a `data_sources` row is updated and `sync_frequency`, `sync_time`, or `sync_timezone` changes, a trigger automatically:
   - Removes any existing cron job for that data source
   - Creates a new cron job that calls the `resync-data-source` edge function at the specified time

2. **Timezone Conversion**: The trigger converts the `sync_time` from the specified `sync_timezone` to UTC for cron scheduling.

3. **Cron Schedule Formats**:
   - **Daily**: Runs every day at the specified time (e.g., `30 9 * * *` = 9:30 AM UTC daily)
   - **Weekly**: Runs every Sunday at the specified time (e.g., `30 9 * * 0` = 9:30 AM UTC on Sundays)
   - **Monthly**: Runs on the 1st of each month at the specified time (e.g., `30 9 1 * *` = 9:30 AM UTC on the 1st)

4. **Cleanup**: When a data source is deleted or `sync_frequency` is changed to 'manual', the cron job is automatically removed.

## Configuration

### Option 1: Database Settings (Recommended)

Set the Supabase URL and anon key as database settings:

```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
ALTER DATABASE postgres SET app.supabase_anon_key = 'your-anon-key';
```

### Option 2: Update Fallback Values

Edit the migration file and update the fallback values in the `get_supabase_config()` function.

## Usage

### Enable Auto-Sync for a Data Source

```sql
UPDATE data_sources
SET 
  sync_frequency = 'daily',
  sync_time = '09:00:00',
  sync_timezone = 'Asia/Singapore'
WHERE id = 'your-data-source-id';
```

The trigger will automatically create a cron job.

### Disable Auto-Sync

```sql
UPDATE data_sources
SET sync_frequency = 'manual'
WHERE id = 'your-data-source-id';
```

The trigger will automatically remove the cron job.

### Initialize Existing Data Sources

To create cron jobs for existing data sources that already have auto-sync enabled:

```sql
SELECT initialize_existing_auto_sync_jobs();
```

## Monitoring

### View All Cron Jobs

```sql
SELECT 
  jobid,
  jobname,
  schedule,
  command
FROM cron.job
WHERE jobname LIKE 'resync-data-source-%';
```

### View Cron Job Execution History

```sql
SELECT 
  j.jobname,
  jrd.start_time,
  jrd.end_time,
  jrd.status,
  jrd.return_message
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
WHERE j.jobname LIKE 'resync-data-source-%'
ORDER BY jrd.start_time DESC
LIMIT 20;
```

### Remove a Specific Cron Job Manually

```sql
SELECT cron.unschedule('resync-data-source-<data-source-id>');
```

## Troubleshooting

### Cron Job Not Created

1. Check if extensions are enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');
   ```

2. Check trigger logs:
   ```sql
   -- Enable logging to see NOTICE messages
   SET client_min_messages TO NOTICE;
   ```

3. Verify the data source has required fields:
   ```sql
   SELECT id, sync_frequency, sync_time, sync_timezone
   FROM data_sources
   WHERE id = 'your-data-source-id';
   ```

### Cron Job Not Executing

1. Check if pg_cron is running:
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE 'resync-data-source-%';
   ```

2. Check for errors in cron job runs:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'resync-data-source-<id>')
   ORDER BY start_time DESC
   LIMIT 5;
   ```

3. Verify the edge function URL is correct and accessible.

## Notes

- Cron jobs run in UTC time. The trigger automatically converts your specified timezone to UTC.
- Each data source gets its own cron job with the name pattern: `resync-data-source-<data-source-id>`
- If you update a data source's sync settings, the old cron job is removed and a new one is created automatically.
- The cron job calls the `resync-data-source` edge function with the `dataSourceId` in the request body.

