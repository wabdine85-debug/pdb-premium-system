BEGIN;

ALTER TABLE membership_applications
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_effective_on DATE;

COMMIT;
