import { pool } from '../config/pool.js';

export async function ensureContractActionSchema(db = pool) {
  await db.query(`
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
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS contract_action_requests_reference_idx
      ON contract_action_requests (mandate_reference, email, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS contract_action_requests_status_idx
      ON contract_action_requests (status, created_at ASC)
  `);
}

export async function ensureMemberMonthlyUsageImportSchema(db = pool) {
  await db.query(`
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
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS member_monthly_usage_imports_month_idx
      ON member_monthly_usage_imports (booking_month, category_key, member_id)
  `);
}
