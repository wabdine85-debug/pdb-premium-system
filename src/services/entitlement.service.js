import { pool } from '../config/pool.js';
import { PACKAGE_RULES } from '../utils/packageRules.js';
import { getBookingMonth } from '../utils/dates.js';

/**
 * Berechnet, was der Kunde diesen Monat noch darf
 */
export async function getEntitlements(member) {
  const bookingMonth = getBookingMonth();

  // Alle Buchungen im aktuellen Monat holen
  const result = await pool.query(
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

  // Limits aus Regeln holen
  const rules = PACKAGE_RULES[member.package_key];

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