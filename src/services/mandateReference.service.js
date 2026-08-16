import { pool } from '../config/pool.js';

export function formatMandateReference(year, sequence) {
  return `PDB-M-${year}-${String(sequence).padStart(4, '0')}`;
}

export async function reserveNextMandateReference(db = pool, now = new Date()) {
  const year = now.getUTCFullYear();
  const result = await db.query(
    `INSERT INTO mandate_reference_counters (reference_year, last_value)
     VALUES ($1, 1)
     ON CONFLICT (reference_year) DO UPDATE
     SET last_value = mandate_reference_counters.last_value + 1,
         updated_at = NOW()
     RETURNING last_value`,
    [year]
  );

  return formatMandateReference(year, Number(result.rows[0].last_value));
}
