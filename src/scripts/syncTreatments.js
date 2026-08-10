import { treatments } from "../data/treatments.data.js";
import { TREATMENT_CATEGORY_KEYS } from "../utils/packageRules.js";

export function validateTreatments() {
  const seenIds = new Set();
  const seenKeys = new Set();
  const allowedCategories = new Set(TREATMENT_CATEGORY_KEYS);

  for (const treatment of treatments) {
    if (seenIds.has(treatment.id)) {
      throw new Error(`Duplicate treatment id: ${treatment.id}`);
    }

    if (seenKeys.has(treatment.treatment_key)) {
      throw new Error(`Duplicate treatment_key: ${treatment.treatment_key}`);
    }

    if (!allowedCategories.has(treatment.category_key)) {
      throw new Error(
        `Invalid category_key "${treatment.category_key}" for ${treatment.treatment_key}`
      );
    }

    if (
      treatment.shopify_product_handle &&
      typeof treatment.shopify_product_handle !== "string"
    ) {
      throw new Error(`Invalid shopify_product_handle for ${treatment.treatment_key}`);
    }

    seenIds.add(treatment.id);
    seenKeys.add(treatment.treatment_key);
  }

  return {
    count: treatments.length,
    active: treatments.filter((treatment) => treatment.is_active).length
  };
}

export async function syncTreatments(db) {
  if (!db) {
    throw new Error("A database pool/client is required to sync treatments.");
  }

  validateTreatments();

  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "ALTER TABLE treatments ADD COLUMN IF NOT EXISTS shopify_product_handle TEXT"
    );

    for (const treatment of treatments) {
      await client.query(
        `
        INSERT INTO treatments (
          treatment_key,
          title,
          category_key,
          salonized_url,
          shopify_product_handle,
          is_active,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (treatment_key)
        DO UPDATE SET
          title = EXCLUDED.title,
          category_key = EXCLUDED.category_key,
          salonized_url = EXCLUDED.salonized_url,
          shopify_product_handle = EXCLUDED.shopify_product_handle,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        `,
        [
          treatment.treatment_key,
          treatment.title,
          treatment.category_key,
          treatment.salonized_url,
          treatment.shopify_product_handle || treatment.treatment_key,
          treatment.is_active
        ]
      );
    }

    await client.query(
      "SELECT setval(pg_get_serial_sequence('treatments', 'id'), (SELECT MAX(id) FROM treatments))"
    );

    await client.query("COMMIT");

    return {
      synced: treatments.length,
      active: treatments.filter((treatment) => treatment.is_active).length
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--validate-only")) {
    const result = validateTreatments();
    console.log(`Validated ${result.count} treatments (${result.active} active).`);
    process.exit(0);
  }

  const { pool } = await import("../config/pool.js");

  syncTreatments(pool)
    .then((result) => {
      console.log(`Synced ${result.synced} treatments (${result.active} active).`);
    })
    .catch((error) => {
      console.error("Treatment sync failed:", error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
