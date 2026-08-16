BEGIN;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS entitlement_multiplier SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'members_entitlement_multiplier_check'
      AND conrelid = 'members'::regclass
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_entitlement_multiplier_check
      CHECK (entitlement_multiplier BETWEEN 1 AND 12);
  END IF;
END $$;

COMMIT;
