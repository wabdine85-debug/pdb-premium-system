import {
  getEntitlements,
  getEntitlementsForMonth
} from '../services/entitlement.service.js';
import { pool } from '../config/pool.js';
import { getNextBookingMonth } from '../utils/dates.js';
import { getMemberBookingAccess } from '../services/bookingAccess.service.js';
import {
  getAuthorizedMember,
  isMemberAuthorizationError
} from '../services/memberAuthorization.service.js';

export async function getMe(req, res) {
  try {
    const shopifyCustomerId = req.shopifyProxy.customerId;

    if (!shopifyCustomerId) {
      return res.status(401).json({ error: 'CUSTOMER_NOT_LOGGED_IN' });
    }

    const member = await getAuthorizedMember(shopifyCustomerId);
    const bookingAccess = await getMemberBookingAccess(member.id);

    const entitlements = await getEntitlements(member);

    res.json({
      member,
      entitlements,
      bookingAccess
    });
  } catch (err) {
    console.error(err);
    const authorizationError = isMemberAuthorizationError(err);
    res.status(authorizationError ? 403 : 500).json({
      error: authorizationError ? err.message : 'Server error'
    });
  }
}

export async function getAllowed(req, res) {
  try {
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');

    const shopifyCustomerId = req.shopifyProxy.customerId;

    if (!shopifyCustomerId) {
      return res.status(401).json({ ok: false, error: 'CUSTOMER_NOT_LOGGED_IN' });
    }

    const member = await getAuthorizedMember(shopifyCustomerId);
    const bookingAccess = await getMemberBookingAccess(member.id);

    const [entitlements, nextMonthEntitlements] = await Promise.all([
      getEntitlements(member),
      getEntitlementsForMonth(member, getNextBookingMonth())
    ]);

    const result = await pool.query(`
  SELECT
    id,
    treatment_key,
    title,
    category_key,
    salonized_url,
    COALESCE(shopify_product_handle, treatment_key) AS shopify_product_handle,
    '/products/' || COALESCE(shopify_product_handle, treatment_key) AS premium_product_url
  FROM treatments
  WHERE is_active = true
  ORDER BY id ASC
`);

    const allowedCategories = [
      ...new Set([
        ...entitlements.allowedCategories,
        ...nextMonthEntitlements.allowedCategories
      ])
    ];
    const treatments = result.rows.filter(t =>
      allowedCategories.includes(t.category_key)
    );

    res.json({
      ok: true,
      member,
      entitlements,
      nextMonthEntitlements,
      bookingAccess,
      treatments
    });
  } catch (err) {
    console.error('getAllowed error:', err);
    const authorizationError = isMemberAuthorizationError(err);
    const status = authorizationError ? 403 : 500;
    res.status(status).json({
      ok: false,
      error: authorizationError ? err.message : 'SERVER_ERROR'
    });
  }
}
