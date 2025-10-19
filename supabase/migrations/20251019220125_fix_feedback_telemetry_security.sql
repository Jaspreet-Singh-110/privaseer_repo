/*
  # Fix Feedback and Telemetry Security

  ## Problem
  Users could view their own feedback and telemetry data, which is incorrect.
  Feedback and telemetry should ONLY be visible to the company (admin), not users.

  ## Solution
  - Drop existing SELECT policies that allowed users to read data
  - Keep INSERT policies so users can submit data
  - Only company admins with service_role or authenticated access can view data
  - Anonymous users can ONLY write, never read

  ## Security Model
  - Anonymous users: INSERT only (submit feedback/telemetry)
  - Company (you): Full access via Supabase dashboard with admin credentials
  - Users never see the backend database
*/

-- Drop the incorrect SELECT policies that allowed users to view data
DROP POLICY IF EXISTS "Users can view own feedback" ON user_feedback;
DROP POLICY IF EXISTS "Users can view own telemetry" ON telemetry_events;

-- Policies remain:
-- "Users can submit feedback" - allows anon to INSERT into user_feedback
-- "Users can submit telemetry" - allows anon to INSERT into telemetry_events

-- Note: With only INSERT policies for anon role, users can submit data but CANNOT read anything.
-- Company admins access data through Supabase dashboard with service_role/authenticated credentials.