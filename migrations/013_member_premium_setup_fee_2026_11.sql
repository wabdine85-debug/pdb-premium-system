-- New applications only. Existing contracts retain their agreed fee.
ALTER TABLE membership_applications
  ALTER COLUMN setup_fee_cents SET DEFAULT 4900;
