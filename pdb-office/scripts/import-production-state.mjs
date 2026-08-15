import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { getStorageRevision } from "../services/storageRevision.js";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL fehlt.");

const root = process.cwd();
const sources = [
  ["crm", path.join(root, "data", "crm-data-v1.json")],
  ["member_finance", path.join(root, "public", "member-finance-data.json")],
];

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  for (const [documentKey, file] of sources) {
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    const revision = documentKey === "crm" ? getStorageRevision(payload) : 0;
    const result = await client.query(
      `INSERT INTO pdb_office.documents (document_key, payload, revision, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (document_key) DO UPDATE
       SET payload = EXCLUDED.payload,
           revision = EXCLUDED.revision,
           updated_at = NOW()
       WHERE pdb_office.documents.revision <= EXCLUDED.revision
       RETURNING document_key, revision`,
      [documentKey, JSON.stringify(payload), revision],
    );
    if (!result.rowCount) {
      throw new Error(`${documentKey}: Datenbank enthält bereits eine neuere Revision.`);
    }
    console.log(`${documentKey}: Revision ${revision} importiert`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
