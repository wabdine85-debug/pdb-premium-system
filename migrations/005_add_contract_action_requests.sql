BEGIN;

CREATE TABLE IF NOT EXISTS contract_action_requests (
  id UUID PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (action_type IN ('withdrawal', 'cancellation')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mandate_reference TEXT NOT NULL DEFAULT '',
  communication_email TEXT NOT NULL,
  cancellation_type TEXT CHECK (cancellation_type IN ('ordinary', 'extraordinary')),
  cancellation_reason TEXT,
  requested_end_on DATE,
  matched_application_id UUID REFERENCES membership_applications(id) ON DELETE SET NULL,
  receipt_token_hash TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewed', 'processed', 'rejected')),
  request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contract_action_requests_reference_idx
  ON contract_action_requests (mandate_reference, email, created_at DESC);

CREATE INDEX IF NOT EXISTS contract_action_requests_status_idx
  ON contract_action_requests (status, created_at ASC);

COMMIT;
