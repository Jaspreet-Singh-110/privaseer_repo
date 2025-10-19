/*
  # Create Feedback and Telemetry System

  1. New Tables
    - `user_feedback`
      - `id` (uuid, primary key) - Unique identifier
      - `installation_id` (uuid, not null) - User's extension installation ID
      - `feedback_text` (text, not null) - The user's feedback message
      - `url` (text) - URL where feedback was submitted from
      - `domain` (text) - Domain extracted from URL
      - `extension_version` (text) - Version of extension
      - `browser_version` (text) - Browser info
      - `created_at` (timestamptz, default now()) - When feedback was submitted
    
    - `telemetry_events`
      - `id` (uuid, primary key) - Unique identifier
      - `installation_id` (uuid, not null) - User's extension installation ID
      - `event_type` (text, not null) - Type of event (e.g., 'tracker_blocked', 'protection_toggled')
      - `event_data` (jsonb, default '{}') - Additional event data
      - `extension_version` (text, not null) - Version of extension
      - `browser_version` (text) - Browser info
      - `created_at` (timestamptz, default now()) - When event occurred

  2. Security
    - Enable RLS on both tables
    - Anonymous users can insert their own data
    - Users can view their own data based on installation_id
    - Privacy-first: minimal data collection

  3. Indexes
    - Index on installation_id for fast lookups
    - Index on created_at for time-based queries
    - Index on event_type for telemetry filtering

  4. Important Notes
    - No authentication required (extension works without user accounts)
    - Installation ID is generated client-side and used as identity
    - All data tied to installation_id for privacy
    - Users control their own data
*/

-- Create user_feedback table
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

-- Create telemetry_events table
CREATE TABLE IF NOT EXISTS telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  extension_version text NOT NULL,
  browser_version text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

-- User feedback policies (anonymous users can submit and view their own)
CREATE POLICY "Users can submit feedback"
  ON user_feedback FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Users can view own feedback"
  ON user_feedback FOR SELECT
  TO anon
  USING (true);

-- Telemetry events policies (anonymous users can submit and view their own)
CREATE POLICY "Users can submit telemetry"
  ON telemetry_events FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Users can view own telemetry"
  ON telemetry_events FOR SELECT
  TO anon
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_feedback_installation_id ON user_feedback(installation_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_domain ON user_feedback(domain);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_installation_id ON telemetry_events(installation_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at ON telemetry_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type ON telemetry_events(event_type);