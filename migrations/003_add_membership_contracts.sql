BEGIN;

CREATE TABLE IF NOT EXISTS membership_applications (
  id UUID PRIMARY KEY,
  shopify_customer_id BIGINT NOT NULL,
  shop_domain TEXT NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  city TEXT NOT NULL,
  package_key TEXT NOT NULL CHECK (package_key IN ('pure', 'define', 'beyond', 'private')),
  monthly_price_cents INTEGER NOT NULL CHECK (monthly_price_cents > 0),
  setup_fee_cents INTEGER NOT NULL DEFAULT 3900 CHECK (setup_fee_cents >= 0),
  minimum_total_cents INTEGER NOT NULL CHECK (minimum_total_cents > 0),
  starts_on DATE NOT NULL,
  debit_day SMALLINT NOT NULL CHECK (debit_day BETWEEN 1 AND 28),
  status TEXT NOT NULL DEFAULT 'sepa_pending'
    CHECK (status IN ('sepa_pending', 'active', 'rejected', 'cancel_requested', 'cancelled')),
  mandate_reference TEXT UNIQUE NOT NULL,
  iban_ciphertext TEXT NOT NULL,
  iban_iv TEXT NOT NULL,
  iban_auth_tag TEXT NOT NULL,
  iban_last4 TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  agb_accepted_at TIMESTAMPTZ NOT NULL,
  withdrawal_received_at TIMESTAMPTZ NOT NULL,
  sepa_accepted_at TIMESTAMPTZ NOT NULL,
  early_start_requested_at TIMESTAMPTZ,
  public_token_hash TEXT UNIQUE NOT NULL,
  activated_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  cancellation_requested_at TIMESTAMPTZ,
  cancellation_effective_on DATE,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS membership_applications_customer_idx
  ON membership_applications (shopify_customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS membership_applications_status_idx
  ON membership_applications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS membership_contract_events (
  id BIGSERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES membership_applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'admin', 'system')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS membership_contract_events_application_idx
  ON membership_contract_events (application_id, created_at ASC);

COMMIT;
