BEGIN;
ALTER TABLE booking_tokens ADD COLUMN IF NOT EXISTS body_sculpt_option TEXT
  CHECK (body_sculpt_option IN ('ems', 'ems_lymph'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS body_sculpt_option TEXT
  CHECK (body_sculpt_option IN ('ems', 'ems_lymph'));
ALTER TABLE booking_tokens ADD COLUMN IF NOT EXISTS reserved_booking_month DATE;
COMMIT;
