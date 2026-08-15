import { pool } from '../config/pool.js';

const MEMBER_COLUMNS = `
  id,
  shopify_customer_id,
  email,
  first_name,
  last_name,
  package_key,
  status,
  started_at,
  ends_at,
  created_at,
  updated_at
`;

export async function listAdminMembers({ query, status, limit = 50 }, db = pool) {
  const values = [];
  const conditions = [];
  const normalizedQuery = String(query || '').trim();
  const normalizedStatus = String(status || '').trim();

  if (normalizedQuery) {
    values.push(`%${normalizedQuery}%`);
    conditions.push(`(
      email ILIKE $${values.length}
      OR first_name ILIKE $${values.length}
      OR last_name ILIKE $${values.length}
      OR CONCAT_WS(' ', first_name, last_name) ILIKE $${values.length}
      OR shopify_customer_id::text ILIKE $${values.length}
    )`);
  }

  if (normalizedStatus) {
    values.push(normalizedStatus);
    conditions.push(`status = $${values.length}`);
  }

  values.push(Math.min(Math.max(Number(limit) || 50, 1), 100));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query(
    `SELECT ${MEMBER_COLUMNS}
     FROM members
     ${where}
     ORDER BY last_name ASC NULLS LAST, first_name ASC NULLS LAST, id ASC
     LIMIT $${values.length}`,
    values
  );

  return result.rows;
}

export async function findAdminMemberById(memberId, db = pool) {
  const result = await db.query(
    `SELECT ${MEMBER_COLUMNS}
     FROM members
     WHERE id = $1
     LIMIT 1`,
    [memberId]
  );

  return result.rows[0] || null;
}

export async function listAdminMemberBookings(memberId, months, db = pool) {
  const result = await db.query(
    `SELECT
       b.id,
       b.booking_month,
       b.status,
       b.source,
       b.admin_actor,
       b.admin_reason,
       b.booked_at,
       b.cancelled_at,
       t.id AS treatment_id,
       t.treatment_key,
       t.title AS treatment_title,
       t.category_key
     FROM bookings b
     JOIN treatments t ON t.id = b.treatment_id
     WHERE b.member_id = $1
       AND b.booking_month = ANY($2::date[])
     ORDER BY b.booking_month DESC, b.booked_at DESC, b.id DESC`,
    [memberId, months]
  );

  return result.rows;
}

export async function listAdminTreatmentsForPackage(packageKey, db = pool) {
  const result = await db.query(
    `SELECT id, treatment_key, title, category_key
     FROM treatments
     WHERE is_active = TRUE
       AND category_key = ANY($1::text[])
     ORDER BY category_key ASC, title ASC`,
    [packageKey === 'define' ? ['pure', 'define'] : [packageKey]]
  );

  return result.rows;
}

export async function listAdminMemberEvents(memberId, db = pool) {
  const result = await db.query(
    `SELECT
       e.id,
       e.booking_id,
       e.event_type,
       e.actor,
       e.reason,
       e.metadata,
       e.created_at
     FROM booking_admin_events e
     WHERE e.member_id = $1
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT 100`,
    [memberId]
  );

  return result.rows;
}
