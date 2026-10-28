import { pool } from '../config/pool.js';
import { getTreatmentEntitlementsForMonth } from './entitlement.service.js';
import { BODY_SCULPT_KEY, getBodySculptBookingError } from '../utils/bodySculptRules.js';

// Hold a quota before Apntly creates the external appointment. The token's existing
// expiry releases abandoned holds without a background job or a fake appointment.
export async function reserveBodySculptSlot(member, token, bookingMonth, option) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT bt.used_at, NOW() > bt.expires_at AS is_expired
      FROM booking_tokens bt
      JOIN members m ON m.id = bt.member_id
      JOIN treatments t ON t.id = bt.treatment_id
      WHERE bt.token = $1 AND m.id = $2 AND m.status = 'active'
        AND m.package_key = 'private' AND t.is_active = TRUE
        AND t.treatment_key = $3
      FOR UPDATE OF bt, m`, [token, member.id, BODY_SCULPT_KEY]);
    const heldToken = result.rows[0];
    let error = !heldToken ? 'TOKEN_NOT_FOUND' : heldToken.is_expired
      ? 'TOKEN_EXPIRED' : heldToken.used_at ? 'TOKEN_ALREADY_USED' : null;
    let entitlements;
    if (!error) {
      entitlements = await getTreatmentEntitlementsForMonth(member,
        { category_key: 'private', treatment_key: BODY_SCULPT_KEY }, bookingMonth,
        client, { excludeBookingToken: token });
      error = (entitlements.remaining.private <= 0 ? 'LIMIT_REACHED' : null) ||
        getBodySculptBookingError(BODY_SCULPT_KEY, option, entitlements);
    }
    if (error) {
      await client.query('ROLLBACK');
      return { error };
    }
    await client.query(`UPDATE booking_tokens SET body_sculpt_option = $2,
      reserved_booking_month = $3 WHERE token = $1`, [token, option, bookingMonth]);
    await client.query('COMMIT');
    return { entitlements };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
