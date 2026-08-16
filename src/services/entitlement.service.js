import { pool } from '../config/pool.js';
import {
  PACKAGE_RULES,
  createEmptyCategoryCounts
} from '../utils/packageRules.js';
import { getBookingMonth } from '../utils/dates.js';
import { getPrivateProtocolSessionLimit } from '../utils/privateProtocolRules.js';

function toCalendarMonth(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
  return String(value).match(/\d{4}-\d{2}/)?.[0] || '';
}

function isEligibleForBookingMonth(member, bookingMonth) {
  if (member?.status && member.status !== 'active') return false;

  const month = toCalendarMonth(bookingMonth);
  const startsInMonth = toCalendarMonth(member?.started_at);
  const endsInMonth = toCalendarMonth(member?.ends_at);

  if (startsInMonth && month < startsInMonth) return false;
  if (endsInMonth && month > endsInMonth) return false;
  return true;
}

/**
 * Berechnet, was der Kunde diesen Monat noch darf
 */
export async function getEntitlements(member, db = pool) {
  return getEntitlementsForMonth(member, getBookingMonth(), db);
}

/**
 * Berechnet das Kontingent für einen konkreten Kalendermonat.
 */
export async function getEntitlementsForMonth(member, bookingMonth, db = pool) {
  const rules = PACKAGE_RULES[member?.package_key];
  const entitlementMultiplier = Math.max(
    1,
    Number(member?.entitlement_multiplier) || 1
  );

  if (!member || !rules || !isEligibleForBookingMonth(member, bookingMonth)) {
    return {
      month: bookingMonth,
      usage: createEmptyCategoryCounts(),
      remaining: createEmptyCategoryCounts(),
      allowedCategories: []
    };
  }

  // Alle Buchungen im aktuellen Monat holen
  const [bookingResult, importedUsageResult] = await Promise.all([
    db.query(`
    SELECT t.category_key, t.treatment_key
    FROM bookings b
    JOIN treatments t ON t.id = b.treatment_id
    WHERE b.member_id = $1
    AND b.booking_month = $2
    AND b.status IN ('reserved', 'confirmed')
    `,
    [member.id, bookingMonth]),
    db.query(
      `SELECT category_key, used_count
       FROM member_monthly_usage_imports
       WHERE member_id = $1 AND booking_month = $2`,
      [member.id, bookingMonth]
    )
  ]);

  const bookings = bookingResult.rows;

  // Zählen nach Kategorie
  const usage = createEmptyCategoryCounts();

  for (const b of bookings) {
    if (Object.hasOwn(usage, b.category_key)) {
      usage[b.category_key]++;
    }
  }

  for (const imported of importedUsageResult.rows) {
    if (Object.hasOwn(usage, imported.category_key)) {
      usage[imported.category_key] = Math.max(
        usage[imported.category_key],
        Number(imported.used_count) || 0
      );
    }
  }

  const remaining = Object.fromEntries(
    Object.entries(rules.limits).map(([categoryKey, limit]) => [
      categoryKey,
      Math.max(
        0,
        (member.package_key === 'private' ? limit : limit * entitlementMultiplier)
          - (usage[categoryKey] || 0)
      )
    ])
  );

  let privateProtocol = null;

  if (member.package_key === 'private') {
    const privateBookings = bookings.filter(
      (booking) => booking.category_key === 'private'
    );
    const selectedTreatmentKey = privateBookings[0]?.treatment_key || null;

    if (selectedTreatmentKey) {
      const sessionLimit = getPrivateProtocolSessionLimit(selectedTreatmentKey);
      const usedSessions = privateBookings.filter(
        (booking) => booking.treatment_key === selectedTreatmentKey
      ).length;

      remaining.private = Math.max(0, sessionLimit - usedSessions);
      privateProtocol = {
        treatmentKey: selectedTreatmentKey,
        sessionLimit,
        usedSessions,
        remainingSessions: remaining.private
      };
    }
  }

  // Erlaubte Kategorien bestimmen
  const allowedCategories = Object.keys(remaining).filter(
    (key) => remaining[key] > 0
  );

  return {
    month: bookingMonth,
    usage,
    remaining,
    allowedCategories,
    privateProtocol
  };
}

export async function getTreatmentEntitlementsForMonth(
  member,
  treatment,
  bookingMonth,
  db = pool
) {
  const entitlements = await getEntitlementsForMonth(member, bookingMonth, db);

  if (
    member?.package_key !== 'private' ||
    treatment?.category_key !== 'private'
  ) {
    return entitlements;
  }

  const selectedTreatmentKey = entitlements.privateProtocol?.treatmentKey;
  const isLockedToAnotherProtocol = Boolean(
    selectedTreatmentKey && selectedTreatmentKey !== treatment.treatment_key
  );
  const sessionLimit = getPrivateProtocolSessionLimit(treatment.treatment_key);
  const usedSessions = selectedTreatmentKey
    ? entitlements.privateProtocol.usedSessions
    : 0;
  const remainingSessions = isLockedToAnotherProtocol
    ? 0
    : Math.max(0, sessionLimit - usedSessions);

  return {
    ...entitlements,
    remaining: {
      ...entitlements.remaining,
      private: remainingSessions
    },
    allowedCategories: remainingSessions > 0 ? ['private'] : [],
    privateProtocol: {
      treatmentKey: selectedTreatmentKey || treatment.treatment_key,
      sessionLimit,
      usedSessions,
      remainingSessions,
      locked: isLockedToAnotherProtocol
    }
  };
}
