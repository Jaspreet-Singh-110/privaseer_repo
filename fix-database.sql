-- Privaseer Database Setup
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/llffqxdhpgsqnpzeznaq/sql/new

-- Create tables
CREATE TABLE IF NOT EXISTS user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL,
  feedback_text text NOT NULL,
  url text,
  domain text,
  extension_version text,
  browser_version text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  extension_version text NOT NULL,
  browser_version text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_feedback_installation_id ON user_feedback(installation_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_installation_id ON telemetry_events(installation_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_type ON telemetry_events(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at ON telemetry_events(created_at DESC);

-- Enable RLS
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Allow anonymous feedback submission" ON user_feedback;
DROP POLICY IF EXISTS "Allow service role to read feedback" ON user_feedback;
DROP POLICY IF EXISTS "Allow anonymous telemetry submission" ON telemetry_events;
DROP POLICY IF EXISTS "Allow service role to read telemetry" ON telemetry_events;

-- Create new policies
CREATE POLICY "Allow anonymous feedback submission"
  ON user_feedback FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow service role to read feedback"
  ON user_feedback FOR SELECT TO service_role USING (true);

CREATE POLICY "Allow anonymous telemetry submission"
  ON telemetry_events FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow service role to read telemetry"
  ON telemetry_events FOR SELECT TO service_role USING (true);
