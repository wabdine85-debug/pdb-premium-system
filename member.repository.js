import { pool } from '../db/pool.js';

export async function findMemberByShopifyId(shopifyCustomerId) {
  const result = await pool.query(
    `SELECT * FROM members WHERE shopify_customer_id = $1 LIMIT 1`,
    [shopifyCustomerId]
  );

  return result.rows[0] || null;
}

export async function createMember({
  shopifyCustomerId,
  email,
  firstName,
  lastName,
  packageKey
}) {
  const result = await pool.query(
    `
    INSERT INTO members (
      shopify_customer_id,
      email,
      first_name,
      last_name,
      package_key,
      status,
      started_at
    )
    VALUES ($1,$2,$3,$4,$5,'active',NOW())
    RETURNING *
    `,
    [shopifyCustomerId, email, firstName, lastName, packageKey]
  );

  return result.rows[0];
}