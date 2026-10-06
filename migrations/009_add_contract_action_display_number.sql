BEGIN;

CREATE SEQUENCE IF NOT EXISTS contract_action_display_number_seq;

ALTER TABLE contract_action_requests
  ADD COLUMN IF NOT EXISTS display_number BIGINT;

ALTER TABLE contract_action_requests
  ALTER COLUMN display_number SET DEFAULT nextval('contract_action_display_number_seq');

CREATE UNIQUE INDEX IF NOT EXISTS contract_action_requests_display_number_idx
  ON contract_action_requests (display_number);

COMMIT;
