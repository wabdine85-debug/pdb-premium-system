BEGIN;

CREATE TABLE IF NOT EXISTS contract_action_rate_limits (
  source_hash TEXT NOT NULL,
  window_name TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (source_hash, window_name)
);

CREATE TABLE IF NOT EXISTS contract_action_used_tokens (
  token_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

COMMIT;
