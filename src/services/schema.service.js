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

export async function ensurePremiumAdminSchema(db = pool) {
  await db.query(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS entitlement_multiplier SMALLINT NOT NULL DEFAULT 1
  `);
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'members_entitlement_multiplier_check'
          AND conrelid = 'members'::regclass
      ) THEN
        ALTER TABLE members
          ADD CONSTRAINT members_entitlement_multiplier_check
          CHECK (entitlement_multiplier BETWEEN 1 AND 12);
      END IF;
    END $$
  `);
  await db.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online',
      ADD COLUMN IF NOT EXISTS admin_actor TEXT,
      ADD COLUMN IF NOT EXISTS admin_reason TEXT,
      ADD COLUMN IF NOT EXISTS appointment_date DATE
  `);
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'bookings_source_check'
          AND conrelid = 'bookings'::regclass
      ) THEN
        ALTER TABLE bookings
          ADD CONSTRAINT bookings_source_check
          CHECK (source IN ('online', 'admin_manual'));
      END IF;
    END $$
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS booking_admin_events (
      id BIGSERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      reason TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'booking_admin_events_event_type_check'
          AND conrelid = 'booking_admin_events'::regclass
          AND pg_get_constraintdef(oid) LIKE '%booking_appointment_date_added%'
      ) THEN
        ALTER TABLE booking_admin_events
          DROP CONSTRAINT IF EXISTS booking_admin_events_event_type_check;
        ALTER TABLE booking_admin_events
          ADD CONSTRAINT booking_admin_events_event_type_check
          CHECK (event_type IN (
            'manual_usage_created',
            'manual_usage_cancelled',
            'booking_cancelled',
            'booking_appointment_date_added',
            'booking_rescheduled'
          ));
      END IF;
    END $$
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS booking_admin_events_member_idx
      ON booking_admin_events (member_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS bookings_member_month_idx
      ON bookings (member_id, booking_month, status)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS bookings_appointment_date_idx
      ON bookings (appointment_date, status)
  `);
}
