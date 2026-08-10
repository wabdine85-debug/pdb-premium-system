import { getOrCreateMember } from '../services/member.service.js';
import {
  getEntitlements,
  getEntitlementsForMonth
} from '../services/entitlement.service.js';
import { pool } from '../config/pool.js';
import { getNextBookingMonth } from '../utils/dates.js';

export async function getMe(req, res) {
  try {
    const shopifyCustomerId = req.shopifyProxy.customerId;

    if (!shopifyCustomerId) {
      return res.status(401).json({ error: 'CUSTOMER_NOT_LOGGED_IN' });
    }

    const member = await getOrCreateMember({
      id: shopifyCustomerId,
      email: req.query.email || null,
      firstName: req.query.firstName || null,
      lastName: req.query.lastName || null,
      tags: req.query.tags ? String(req.query.tags).split(',').map(tag => tag.trim()).filter(Boolean) : []
    });

    const entitlements = await getEntitlements(member);

    res.json({
      member,
      entitlements
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getAllowed(req, res) {
  try {
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');

    const shopifyCustomerId = req.shopifyProxy.customerId;

    if (!shopifyCustomerId) {
      return res.status(401).json({ ok: false, error: 'CUSTOMER_NOT_LOGGED_IN' });
    }

    const member = await getOrCreateMember({
  id: shopifyCustomerId,
  email: req.query.email || null,
  firstName: req.query.firstName || null,
  lastName: req.query.lastName || null,
  tags: req.query.tags ? String(req.query.tags).split(',').map(t => t.trim()).filter(Boolean) : []
});

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
      treatments
    });
  } catch (err) {
    console.error('getAllowed error:', err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
