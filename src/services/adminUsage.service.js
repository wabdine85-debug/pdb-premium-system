import dayjs from 'dayjs';
import { getTreatmentEntitlementsForMonth } from './entitlement.service.js';
import { getAllowedCategoriesForPackage } from '../utils/packageRules.js';

export class AdminUsageError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'AdminUsageError';
    this.code = code;
    this.status = status;
  }
}

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function formatBookingMonth(value) {
  if (value instanceof Date) return dayjs(value).format('YYYY-MM-DD');
  return String(value || '').slice(0, 10);
}

export function normalizeAdminBookingMonth(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-01$/.test(normalized)) return null;

  const parsed = dayjs(normalized);
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== normalized) return null;
  return normalized;
}

export function getFollowingAdminBookingMonth(bookingMonth) {
  const normalized = normalizeAdminBookingMonth(bookingMonth);
  return normalized ? dayjs(normalized).add(1, 'month').format('YYYY-MM-DD') : null;
}

export function validateManualUsageInput(input = {}) {
  const treatmentKey = cleanText(input.treatment_key, 120);
  const bookingMonth = normalizeAdminBookingMonth(input.booking_month);
  const actor = cleanText(input.actor, 120);
  const reason = cleanText(input.reason, 500);

  if (!treatmentKey) throw new AdminUsageError('TREATMENT_KEY_REQUIRED');
  if (!bookingMonth) throw new AdminUsageError('BOOKING_MONTH_INVALID');
  if (actor.length < 2) throw new AdminUsageError('ADMIN_ACTOR_REQUIRED');
  if (reason.length < 3) throw new AdminUsageError('ADMIN_REASON_REQUIRED');

  return { treatmentKey, bookingMonth, actor, reason };
}

export async function recordManualUsage(memberId, input, db) {
  const id = Number(memberId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AdminUsageError('MEMBER_ID_INVALID');
  }

  const { treatmentKey, bookingMonth, actor, reason } = validateManualUsageInput(input);
  const memberResult = await db.query(
    `SELECT id, shopify_customer_id, email, first_name, last_name, package_key, status
     FROM members
     WHERE id = $1
     FOR UPDATE`,
    [id]
  );
  const member = memberResult.rows[0];
  if (!member) throw new AdminUsageError('MEMBER_NOT_FOUND', 404);

  const treatmentResult = await db.query(
    `SELECT id, treatment_key, title, category_key
     FROM treatments
     WHERE treatment_key = $1 AND is_active = TRUE
     LIMIT 1`,
    [treatmentKey]
  );
  const treatment = treatmentResult.rows[0];
  if (!treatment) throw new AdminUsageError('TREATMENT_NOT_FOUND', 404);

  const allowedCategories = getAllowedCategoriesForPackage(member.package_key);
  if (!allowedCategories.includes(treatment.category_key)) {
    throw new AdminUsageError('TREATMENT_NOT_ALLOWED', 403);
  }

  const before = await getTreatmentEntitlementsForMonth(
    member,
    treatment,
    bookingMonth,
    db
  );
  if ((before.remaining?.[treatment.category_key] ?? 0) <= 0) {
    throw new AdminUsageError('LIMIT_REACHED', 409);
  }

  const bookingResult = await db.query(
    `INSERT INTO bookings (
       member_id,
       treatment_id,
       booking_month,
       status,
       source,
       admin_actor,
       admin_reason,
       booked_at
     ) VALUES ($1, $2, $3, 'confirmed', 'admin_manual', $4, $5, NOW())
     RETURNING id, member_id, treatment_id, booking_month, status, source,
       admin_actor, admin_reason, booked_at, cancelled_at`,
    [member.id, treatment.id, bookingMonth, actor, reason]
  );
  const booking = bookingResult.rows[0];

  await db.query(
    `INSERT INTO booking_admin_events (
       booking_id, member_id, event_type, actor, reason, metadata
     ) VALUES ($1, $2, 'manual_usage_created', $3, $4, $5::jsonb)`,
    [
      booking.id,
      member.id,
      actor,
      reason,
      JSON.stringify({
        bookingMonth,
        treatmentKey: treatment.treatment_key,
        categoryKey: treatment.category_key
      })
    ]
  );

  const entitlements = await getTreatmentEntitlementsForMonth(
    member,
    treatment,
    bookingMonth,
    db
  );

  return { member, treatment, booking, entitlements };
}

export async function cancelManualUsage(bookingId, input, db) {
  const id = Number(bookingId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AdminUsageError('BOOKING_ID_INVALID');
  }

  const actor = cleanText(input?.actor, 120);
  const reason = cleanText(input?.reason, 500);
  if (actor.length < 2) throw new AdminUsageError('ADMIN_ACTOR_REQUIRED');
  if (reason.length < 3) throw new AdminUsageError('ADMIN_REASON_REQUIRED');

  const bookingResult = await db.query(
    `SELECT
       b.*,
       t.treatment_key,
       t.title AS treatment_title,
       t.category_key,
       m.package_key,
       m.shopify_customer_id,
       m.email,
       m.first_name,
       m.last_name
     FROM bookings b
     JOIN treatments t ON t.id = b.treatment_id
     JOIN members m ON m.id = b.member_id
     WHERE b.id = $1
     FOR UPDATE`,
    [id]
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw new AdminUsageError('BOOKING_NOT_FOUND', 404);
  if (booking.source !== 'admin_manual') {
    throw new AdminUsageError('BOOKING_NOT_MANUAL', 409);
  }
  if (!['reserved', 'confirmed'].includes(booking.status)) {
    throw new AdminUsageError('BOOKING_NOT_CANCELLABLE', 409);
  }

  const updatedResult = await db.query(
    `UPDATE bookings
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE id = $1
     RETURNING id, member_id, treatment_id, booking_month, status, source,
       admin_actor, admin_reason, booked_at, cancelled_at`,
    [id]
  );
  const updatedBooking = updatedResult.rows[0];

  await db.query(
    `INSERT INTO booking_admin_events (
       booking_id, member_id, event_type, actor, reason, metadata
     ) VALUES ($1, $2, 'manual_usage_cancelled', $3, $4, $5::jsonb)`,
    [
      booking.id,
      booking.member_id,
      actor,
      reason,
      JSON.stringify({ previousStatus: booking.status })
    ]
  );

  const member = {
    id: booking.member_id,
    package_key: booking.package_key,
    shopify_customer_id: booking.shopify_customer_id,
    email: booking.email,
    first_name: booking.first_name,
    last_name: booking.last_name
  };
  const treatment = {
    id: booking.treatment_id,
    treatment_key: booking.treatment_key,
    title: booking.treatment_title,
    category_key: booking.category_key
  };
  const entitlements = await getTreatmentEntitlementsForMonth(
    member,
    treatment,
    formatBookingMonth(booking.booking_month),
    db
  );

  return { booking: updatedBooking, entitlements };
}
