BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS appointment_date DATE;

ALTER TABLE booking_admin_events
  DROP CONSTRAINT IF EXISTS booking_admin_events_event_type_check;

ALTER TABLE booking_admin_events
  ADD CONSTRAINT booking_admin_events_event_type_check
  CHECK (event_type IN (
    'manual_usage_created',
    'manual_usage_cancelled',
    'booking_cancelled',
    'booking_rescheduled'
  ));

CREATE INDEX IF NOT EXISTS bookings_appointment_date_idx
  ON bookings (appointment_date, status);

COMMIT;
