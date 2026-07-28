import { pool } from '../config/pool.js';
import { PACKAGE_RULES } from '../utils/packageRules.js';
import { getBookingMonth } from '../utils/dates.js';

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

  if (!member || !rules) {
    return {
      month: bookingMonth,
      usage: {
        pure: 0,
        define: 0,
        beyond: 0
      },
      remaining: {
        pure: 0,
        define: 0,
        beyond: 0
      },
      allowedCategories: []
    };
  }

  // Alle Buchungen im aktuellen Monat holen
  const result = await db.query(
    `
    SELECT t.category_key
    FROM bookings b
    JOIN treatments t ON t.id = b.treatment_id
    WHERE b.member_id = $1
    AND b.booking_month = $2
    AND b.status IN ('reserved', 'confirmed')
    `,
    [member.id, bookingMonth]
  );

  const bookings = result.rows;

  // Zählen nach Kategorie
  const usage = {
    pure: 0,
    define: 0,
    beyond: 0
  };

  for (const b of bookings) {
    usage[b.category_key]++;
  }

  const remaining = {
    pure: Math.max(0, rules.limits.pure - usage.pure),
    define: Math.max(0, rules.limits.define - usage.define),
    beyond: Math.max(0, rules.limits.beyond - usage.beyond)
  };

  // Erlaubte Kategorien bestimmen
  const allowedCategories = Object.keys(remaining).filter(
    (key) => remaining[key] > 0
  );

  return {
    month: bookingMonth,
    usage,
    remaining,
    allowedCategories
  };
}
