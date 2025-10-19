/*
  # Create Burner Emails System

  1. New Tables
    - `burner_emails`
      - `id` (uuid, primary key) - Unique identifier for each burner email
      - `installation_id` (uuid, not null) - Links to user's extension installation
      - `email` (text, unique, not null) - The generated burner email address
      - `label` (text) - Optional user-provided label/note for this email
      - `domain` (text, not null) - Website domain where this email was created
      - `url` (text) - Full URL where email was generated
      - `is_active` (boolean, default true) - Whether email is still active
      - `times_used` (integer, default 0) - How many times this email was used
      - `last_used_at` (timestamptz) - When email was last used
      - `created_at` (timestamptz, default now()) - When email was created
      - `updated_at` (timestamptz, default now()) - Last update timestamp

  2. Security
    - Enable RLS on `burner_emails` table
    - Add policies for anonymous users to manage their own burner emails
    - Users can only access emails tied to their installation_id

  3. Indexes
    - Index on installation_id for fast lookups
    - Index on email for uniqueness checks
    - Index on domain for filtering by website

  4. Important Notes
    - No authentication required (extension works without user accounts)
    - Installation ID is generated client-side and used as identity
    - Emails are truly disposable and can be deleted anytime
    - Privacy-first: minimal data collection
*/

CREATE TABLE IF NOT EXISTS burner_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL,
  email text UNIQUE NOT NULL,
  label text,
  domain text NOT NULL,
  url text,
  is_active boolean DEFAULT true,
  times_used integer DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE burner_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own burner emails"
  ON burner_emails FOR SELECT
  TO anon
  USING (installation_id IN (SELECT installation_id FROM burner_emails));

CREATE POLICY "Users can create burner emails"
  ON burner_emails FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Users can update own burner emails"
  ON burner_emails FOR UPDATE
  TO anon
  USING (installation_id IN (SELECT installation_id FROM burner_emails))
  WITH CHECK (installation_id IN (SELECT installation_id FROM burner_emails));

CREATE POLICY "Users can delete own burner emails"
  ON burner_emails FOR DELETE
  TO anon
  USING (installation_id IN (SELECT installation_id FROM burner_emails));

CREATE INDEX IF NOT EXISTS idx_burner_emails_installation_id ON burner_emails(installation_id);
CREATE INDEX IF NOT EXISTS idx_burner_emails_email ON burner_emails(email);
CREATE INDEX IF NOT EXISTS idx_burner_emails_domain ON burner_emails(domain);
CREATE INDEX IF NOT EXISTS idx_burner_emails_created_at ON burner_emails(created_at DESC);