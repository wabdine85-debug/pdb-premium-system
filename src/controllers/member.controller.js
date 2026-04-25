import { getOrCreateMember } from '../services/member.service.js';
import { getEntitlements } from '../services/entitlement.service.js';
import { pool } from '../config/pool.js';

export async function getMe(req, res) {
  try {
    console.log('SHOPIFY_PROXY_QUERY', req.query);

    const shopifyCustomerId = req.query.logged_in_customer_id;

    if (!shopifyCustomerId) {
      return res.status(401).json({ error: 'CUSTOMER_NOT_LOGGED_IN' });
    }

    const member = await getOrCreateMember({
      id: shopifyCustomerId,
      email: 'test@pdb.de',
      firstName: 'Test',
      lastName: 'User',
      tags: ['premium-pure']
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
    console.log('SHOPIFY_PROXY_QUERY_ALLOWED', req.query);

    const shopifyCustomerId = req.query.logged_in_customer_id;

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

    const entitlements = await getEntitlements(member);

    const result = await pool.query(`
  SELECT
    id,
    treatment_key,
    title,
    category_key,
    salonized_url,
    '/products/' || treatment_key AS premium_product_url
  FROM treatments
  WHERE is_active = true
  ORDER BY id ASC
`);

    const treatments = result.rows.filter(t =>
      entitlements.allowedCategories.includes(t.category_key)
    );

    res.json({
      ok: true,
      member,
      entitlements,
      treatments
    });
  } catch (err) {
    console.error('getAllowed error:', err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}