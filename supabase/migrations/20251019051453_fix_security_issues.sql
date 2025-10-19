/*
  # Fix Security Issues

  ## Changes Made

  1. **Remove Unused Indexes**
     - Drop unused telemetry indexes that are not being used
     - Drop unused burner_emails indexes that are not being used
     - Keep only essential indexes (installation_id for lookups, email for uniqueness)

  2. **Secure Function Search Path**
     - Fix mutable search path vulnerability in cleanup_old_telemetry function
     - Set explicit schema qualification to prevent search_path attacks

  ## Security Improvements
  - Reduces attack surface by removing unused database objects
  - Prevents potential SQL injection via search_path manipulation
  - Improves database performance by removing index maintenance overhead
*/

-- Drop unused telemetry indexes
DROP INDEX IF EXISTS idx_telemetry_events_installation;
DROP INDEX IF EXISTS idx_telemetry_events_created;
DROP INDEX IF EXISTS idx_telemetry_events_type;
DROP INDEX IF EXISTS idx_telemetry_sessions_installation;
DROP INDEX IF EXISTS idx_telemetry_statistics_date;

-- Drop unused burner_emails indexes
DROP INDEX IF EXISTS idx_burner_emails_domain;
DROP INDEX IF EXISTS idx_burner_emails_created_at;

-- Fix function search path vulnerability if cleanup_old_telemetry exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'cleanup_old_telemetry'
  ) THEN
    -- Drop and recreate function with secure search_path
    DROP FUNCTION IF EXISTS public.cleanup_old_telemetry();
    
    CREATE OR REPLACE FUNCTION public.cleanup_old_telemetry()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    BEGIN
      -- Delete telemetry events older than 90 days
      DELETE FROM public.telemetry_events
      WHERE created_at < NOW() - INTERVAL '90 days';
      
      -- Delete telemetry sessions older than 90 days
      DELETE FROM public.telemetry_sessions
      WHERE started_at < NOW() - INTERVAL '90 days';
      
      -- Delete telemetry statistics older than 1 year
      DELETE FROM public.telemetry_statistics
      WHERE created_at < NOW() - INTERVAL '1 year';
    END;
    $func$;
  END IF;
END $$;
