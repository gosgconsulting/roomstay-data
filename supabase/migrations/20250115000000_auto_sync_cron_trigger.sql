-- ============================================================================
-- Auto-Sync Cron Job Trigger Migration
-- ============================================================================
-- This migration is IDEMPOTENT - safe to run multiple times without errors.
-- 
-- It creates:
-- 1. Trigger functions to manage cron jobs when data_sources are updated
-- 2. Triggers on data_sources table for UPDATE and DELETE operations
-- 3. Helper functions for timezone conversion and configuration
-- 
-- The migration handles:
-- - Automatic cron job creation when sync_frequency is set to 'daily', 'weekly', or 'monthly'
-- - Automatic cron job removal when sync_frequency is set to 'manual' or data source is deleted
-- - Timezone conversion from sync_timezone to UTC for cron scheduling
-- - Error handling to prevent failures if extensions or tables don't exist
-- ============================================================================

-- Enable required extensions (idempotent - safe to run multiple times)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to convert timezone-aware time to UTC for cron scheduling
CREATE OR REPLACE FUNCTION convert_time_to_utc_cron(
  sync_time TIME,
  sync_timezone TEXT
) RETURNS TEXT AS $$
DECLARE
  utc_time TIME;
  hour_part INT;
  minute_part INT;
  cron_schedule TEXT;
BEGIN
  -- Convert the time from the specified timezone to UTC
  -- We'll use a timestamp with today's date to do the conversion
  SELECT (timezone('UTC', 
    (CURRENT_DATE || ' ' || sync_time::TEXT)::TIMESTAMP AT TIME ZONE sync_timezone
  ))::TIME INTO utc_time;
  
  -- Extract hour and minute
  hour_part := EXTRACT(HOUR FROM utc_time)::INT;
  minute_part := EXTRACT(MINUTE FROM utc_time)::INT;
  
  -- Build cron expression: minute hour * * * (daily at specific time)
  cron_schedule := minute_part || ' ' || hour_part || ' * * *';
  
  RETURN cron_schedule;
END;
$$ LANGUAGE plpgsql;

-- Function to get Supabase URL and anon key
-- These can be set as database settings using:
-- ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET app.supabase_anon_key = 'your-anon-key';
-- Or they will use the fallback values below
CREATE OR REPLACE FUNCTION get_supabase_config()
RETURNS TABLE(url TEXT, anon_key TEXT) AS $$
DECLARE
  config_url TEXT;
  config_anon_key TEXT;
BEGIN
  -- Try to get from database settings first, then use fallback
  -- Use exception handling in case settings don't exist
  BEGIN
    config_url := current_setting('app.supabase_url', true);
    IF config_url IS NULL OR config_url = '' THEN
      config_url := NULL;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      config_url := NULL;
  END;
  
  BEGIN
    config_anon_key := current_setting('app.supabase_anon_key', true);
    IF config_anon_key IS NULL OR config_anon_key = '' THEN
      config_anon_key := NULL;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      config_anon_key := NULL;
  END;
  
  -- Return with fallback values
  RETURN QUERY
  SELECT 
    COALESCE(
      config_url,
      'https://fkemumodynkaeojrrkbj.supabase.co'  -- Fallback: Update this with your project URL
    )::TEXT as url,
    COALESCE(
      config_anon_key,
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrZW11bW9keW5rYWVvanJya2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwMzYyOTcsImV4cCI6MjA2MjYxMjI5N30.xI2Hkw7OZIPOR2jwGh8EkSF3p3lEpTYeKKVTGF5G8vM'  -- Fallback: Update this with your anon key
    )::TEXT as anon_key;
END;
$$ LANGUAGE plpgsql;

-- Function to create or update cron job for data source
CREATE OR REPLACE FUNCTION manage_data_source_cron_job()
RETURNS TRIGGER AS $$
DECLARE
  job_name TEXT;
  cron_schedule TEXT;
  supabase_url TEXT;
  supabase_anon_key TEXT;
  edge_function_url TEXT;
  request_body JSONB;
  existing_job_id BIGINT;
BEGIN
  -- Only process if sync_frequency is 'daily', 'weekly', or 'monthly'
  IF NEW.sync_frequency NOT IN ('daily', 'weekly', 'monthly') THEN
    -- If frequency changed to 'manual', remove existing cron job
    IF OLD.sync_frequency IN ('daily', 'weekly', 'monthly') AND NEW.sync_frequency = 'manual' THEN
      job_name := 'resync-data-source-' || NEW.id::TEXT;
      
      -- Find and unschedule existing job (safe - won't error if doesn't exist)
      BEGIN
        -- Check if cron.job table exists and is accessible
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
          SELECT jobid INTO existing_job_id
          FROM cron.job
          WHERE jobname = job_name;
          
          IF existing_job_id IS NOT NULL THEN
            BEGIN
              PERFORM cron.unschedule(job_name);
              RAISE NOTICE 'Removed cron job: %', job_name;
            EXCEPTION
              WHEN OTHERS THEN
                -- Job might have been removed already, which is fine
                RAISE NOTICE 'Cron job % already removed or does not exist', job_name;
            END;
          END IF;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          -- Job might not exist or cron extension not available, which is fine
          RAISE NOTICE 'No existing cron job to remove: %', job_name;
      END;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Validate required fields
  IF NEW.sync_time IS NULL OR NEW.sync_timezone IS NULL THEN
    RAISE WARNING 'sync_time and sync_timezone are required for auto-sync';
    RETURN NEW;
  END IF;
  
  -- Get Supabase configuration
  SELECT url, anon_key INTO supabase_url, supabase_anon_key
  FROM get_supabase_config();
  
  -- Build job name using data source ID
  job_name := 'resync-data-source-' || NEW.id::TEXT;
  
  -- Remove existing cron job if it exists (safe - won't error if doesn't exist)
  BEGIN
    -- Check if cron.job table exists and is accessible
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
      SELECT jobid INTO existing_job_id
      FROM cron.job
      WHERE jobname = job_name;
      
      IF existing_job_id IS NOT NULL THEN
        BEGIN
          PERFORM cron.unschedule(job_name);
          RAISE NOTICE 'Removed existing cron job: %', job_name;
        EXCEPTION
          WHEN OTHERS THEN
            -- Job might have been removed already, which is fine
            RAISE NOTICE 'Cron job % already removed or does not exist', job_name;
        END;
      END IF;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Job might not exist or cron extension not available, which is fine - continue to create new one
      RAISE NOTICE 'No existing cron job to remove: %', job_name;
  END;
  
  -- Convert time to UTC cron schedule
  -- Cron format: minute hour day_of_month month day_of_week
  IF NEW.sync_frequency = 'daily' THEN
    -- Daily: convert time to UTC and create daily cron (minute hour * * *)
    SELECT convert_time_to_utc_cron(NEW.sync_time, NEW.sync_timezone) INTO cron_schedule;
  ELSIF NEW.sync_frequency = 'weekly' THEN
    -- Weekly: Sunday at the specified time (minute hour * * 0, where 0 = Sunday)
    SELECT convert_time_to_utc_cron(NEW.sync_time, NEW.sync_timezone) INTO cron_schedule;
    -- Replace the last * (day of week, 5th field) with 0 (Sunday)
    -- Pattern: "minute hour * * *" -> "minute hour * * 0"
    cron_schedule := REGEXP_REPLACE(cron_schedule, '^(\d+ \d+ \* \* )\*$', '\10');
  ELSIF NEW.sync_frequency = 'monthly' THEN
    -- Monthly: 1st of month at the specified time (minute hour 1 * *)
    SELECT convert_time_to_utc_cron(NEW.sync_time, NEW.sync_timezone) INTO cron_schedule;
    -- Replace the day of month * (3rd field) with 1
    -- Pattern: "minute hour * * *" -> "minute hour 1 * *"
    cron_schedule := REGEXP_REPLACE(cron_schedule, '^(\d+ \d+ )\*(\s+\*\s+\*)$', '\11\2');
  END IF;
  
  -- Build edge function URL
  edge_function_url := supabase_url || '/functions/v1/resync-data-source';
  
  -- Build request body
  request_body := jsonb_build_object(
    'dataSourceId', NEW.id::TEXT
  );
  
  -- Create cron job with embedded values
  -- We need to use dynamic SQL to embed the values directly
  -- Check if job already exists before creating (double-check safety)
  BEGIN
    -- Verify cron extension is available
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
      RAISE WARNING 'pg_cron extension is not available. Cannot create cron job for data source %', NEW.id;
      RETURN NEW;
    END IF;
    
    -- Check if cron.job table exists and is accessible
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
      SELECT jobid INTO existing_job_id
      FROM cron.job
      WHERE jobname = job_name;
      
      IF existing_job_id IS NOT NULL THEN
        -- Job still exists, try to unschedule again
        BEGIN
          PERFORM cron.unschedule(job_name);
          RAISE NOTICE 'Removed duplicate cron job before creating: %', job_name;
        EXCEPTION
          WHEN OTHERS THEN
            RAISE NOTICE 'Could not remove existing job, will attempt to create anyway: %', SQLERRM;
        END;
      END IF;
    END IF;
    
    -- Create the cron job
    EXECUTE format(
      $sql$
      SELECT cron.schedule(
        %L,
        %L,
        $cron$
        SELECT
          net.http_post(
            url := %L,
            headers := %L::jsonb,
            body := %L::jsonb
          ) as request_id;
        $cron$
      );
      $sql$,
      job_name,
      cron_schedule,
      edge_function_url,
      jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || supabase_anon_key
      )::TEXT,
      request_body::TEXT
    );
    
    RAISE NOTICE 'Created cron job: % with schedule: %', job_name, cron_schedule;
  EXCEPTION
    WHEN unique_violation THEN
      -- Job might already exist with same name, try to unschedule and recreate
      BEGIN
        PERFORM cron.unschedule(job_name);
        -- Retry creating the job
        EXECUTE format(
          $sql$
          SELECT cron.schedule(
            %L,
            %L,
            $cron$
            SELECT
              net.http_post(
                url := %L,
                headers := %L::jsonb,
                body := %L::jsonb
              ) as request_id;
            $cron$
          );
          $sql$,
          job_name,
          cron_schedule,
          edge_function_url,
          jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || supabase_anon_key
          )::TEXT,
          request_body::TEXT
        );
        RAISE NOTICE 'Recreated cron job after conflict: %', job_name;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to create cron job after retry: %', SQLERRM;
      END;
    WHEN OTHERS THEN
      RAISE WARNING 'Error creating cron job: %', SQLERRM;
  END;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error managing cron job for data source %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up cron job when data source is deleted
CREATE OR REPLACE FUNCTION cleanup_data_source_cron_job()
RETURNS TRIGGER AS $$
DECLARE
  job_name TEXT;
  existing_job_id BIGINT;
BEGIN
  job_name := 'resync-data-source-' || OLD.id::TEXT;
  
  -- Find and unschedule existing job (safe - won't error if doesn't exist)
  BEGIN
    -- Check if cron extension and table are available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
      SELECT jobid INTO existing_job_id
      FROM cron.job
      WHERE jobname = job_name;
      
      IF existing_job_id IS NOT NULL THEN
        BEGIN
          PERFORM cron.unschedule(job_name);
          RAISE NOTICE 'Removed cron job: %', job_name;
        EXCEPTION
          WHEN OTHERS THEN
            -- Job might have been removed already, which is fine
            RAISE NOTICE 'Cron job % already removed or does not exist', job_name;
        END;
      END IF;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Table might not exist or other error, but continue with deletion
      RAISE NOTICE 'Could not check for cron job (may not exist): %', SQLERRM;
  END;
  
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    -- Always return OLD to allow deletion to proceed even if cleanup fails
    RAISE WARNING 'Error cleaning up cron job for data source %: %', OLD.id, SQLERRM;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers on data_sources table (idempotent - safe to run multiple times)
-- Drop triggers first to ensure clean state
DROP TRIGGER IF EXISTS data_sources_auto_sync_cron_trigger ON data_sources;
DROP TRIGGER IF EXISTS data_sources_auto_sync_cron_cleanup_trigger ON data_sources;

-- Create trigger for UPDATE
CREATE TRIGGER data_sources_auto_sync_cron_trigger
  AFTER UPDATE OF sync_frequency, sync_time, sync_timezone ON data_sources
  FOR EACH ROW
  WHEN (
    -- Only trigger if sync_frequency changed or time/timezone changed
    (OLD.sync_frequency IS DISTINCT FROM NEW.sync_frequency) OR
    (OLD.sync_time IS DISTINCT FROM NEW.sync_time) OR
    (OLD.sync_timezone IS DISTINCT FROM NEW.sync_timezone)
  )
  EXECUTE FUNCTION manage_data_source_cron_job();

-- Create trigger for DELETE
CREATE TRIGGER data_sources_auto_sync_cron_cleanup_trigger
  BEFORE DELETE ON data_sources
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_data_source_cron_job();

-- Function to initialize cron jobs for existing data sources with auto-sync enabled
-- Safe to run multiple times - will update existing jobs if needed
CREATE OR REPLACE FUNCTION initialize_existing_auto_sync_jobs()
RETURNS void AS $$
DECLARE
  ds RECORD;
  job_count INT := 0;
BEGIN
  -- Process all data sources with auto-sync enabled
  FOR ds IN 
    SELECT id, sync_frequency, sync_time, sync_timezone
    FROM data_sources
    WHERE sync_frequency IN ('daily', 'weekly', 'monthly')
      AND sync_time IS NOT NULL
      AND sync_timezone IS NOT NULL
  LOOP
    BEGIN
      -- Update the row to trigger the cron job creation
      -- Using a no-op update that will trigger the cron job management
      UPDATE data_sources
      SET sync_frequency = ds.sync_frequency
      WHERE id = ds.id;
      
      job_count := job_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to initialize cron job for data source %: %', ds.id, SQLERRM;
        -- Continue with next data source
    END;
  END LOOP;
  
  RAISE NOTICE 'Initialized cron jobs for % data source(s) with auto-sync enabled', job_count;
END;
$$ LANGUAGE plpgsql;

-- Initialize cron jobs for existing data sources (optional - run manually if needed)
-- SELECT initialize_existing_auto_sync_jobs();

