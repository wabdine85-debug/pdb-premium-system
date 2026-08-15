BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS admin_actor TEXT,
  ADD COLUMN IF NOT EXISTS admin_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_source_check'
      AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_source_check
      CHECK (source IN ('online', 'admin_manual'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS booking_admin_events (
  id BIGSERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('manual_usage_created', 'manual_usage_cancelled')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS booking_admin_events_member_idx
  ON booking_admin_events (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bookings_member_month_idx
  ON bookings (member_id, booking_month, status);

COMMIT;
