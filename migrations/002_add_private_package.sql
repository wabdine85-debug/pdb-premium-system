BEGIN;

ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_package_key_check;

ALTER TABLE members
  ADD CONSTRAINT members_package_key_check
  CHECK (package_key IN ('pure', 'define', 'beyond', 'private'));

ALTER TABLE treatments
  DROP CONSTRAINT IF EXISTS treatments_category_key_check;

ALTER TABLE treatments
  ADD CONSTRAINT treatments_category_key_check
  CHECK (category_key IN ('pure', 'define', 'beyond', 'private'));

COMMIT;
