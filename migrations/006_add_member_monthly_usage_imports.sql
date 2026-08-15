BEGIN;

CREATE TABLE IF NOT EXISTS member_monthly_usage_imports (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  booking_month DATE NOT NULL,
  category_key TEXT NOT NULL CHECK (category_key IN ('pure', 'define', 'beyond', 'private')),
  used_count INTEGER NOT NULL CHECK (used_count >= 0 AND used_count <= 100),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, booking_month, category_key)
);

CREATE INDEX IF NOT EXISTS member_monthly_usage_imports_month_idx
  ON member_monthly_usage_imports (booking_month, category_key, member_id);

COMMIT;
