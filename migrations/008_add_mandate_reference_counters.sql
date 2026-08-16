BEGIN;

CREATE TABLE IF NOT EXISTS mandate_reference_counters (
  reference_year INTEGER PRIMARY KEY CHECK (reference_year BETWEEN 2000 AND 9999),
  last_value INTEGER NOT NULL CHECK (last_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Online- und CRM-Verträge teilen sich ab jetzt dieselbe laufende Nummer.
-- Bereits kommunizierte Referenzen bleiben unverändert.
WITH online_references AS (
  SELECT mandate_reference AS reference
  FROM membership_applications
),
crm_references AS (
  SELECT membership ->> 'mandateReference' AS reference
  FROM pdb_office.documents document
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(document.payload -> 'memberships', '[]'::jsonb)
  ) AS membership
  WHERE document.document_key = 'crm'
),
parsed AS (
  SELECT
    (regexp_match(reference, '^PDB-M-([0-9]{4})-([0-9]{4})$'))[1]::integer AS reference_year,
    (regexp_match(reference, '^PDB-M-([0-9]{4})-([0-9]{4})$'))[2]::integer AS sequence
  FROM (
    SELECT reference FROM online_references
    UNION ALL
    SELECT reference FROM crm_references
  ) all_references
  WHERE reference ~ '^PDB-M-[0-9]{4}-[0-9]{4}$'
)
INSERT INTO mandate_reference_counters (reference_year, last_value)
SELECT reference_year, MAX(sequence)
FROM parsed
GROUP BY reference_year
ON CONFLICT (reference_year) DO UPDATE
SET last_value = GREATEST(mandate_reference_counters.last_value, EXCLUDED.last_value),
    updated_at = NOW();

COMMIT;
