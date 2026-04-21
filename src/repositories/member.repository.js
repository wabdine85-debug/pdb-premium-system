import { pool } from '../config/pool.js';

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

export async function updateMemberByShopifyId(
  shopifyCustomerId,
  {
    email,
    firstName,
    lastName,
    packageKey
  }
) {
  const result = await pool.query(
    `
    UPDATE members
    SET
      email = $2,
      first_name = $3,
      last_name = $4,
      package_key = $5,
      updated_at = NOW()
    WHERE shopify_customer_id = $1
    RETURNING *
    `,
    [shopifyCustomerId, email, firstName, lastName, packageKey]
  );

  return result.rows[0] || null;
}