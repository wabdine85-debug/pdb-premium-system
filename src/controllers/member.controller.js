import { getOrCreateMember } from '../services/member.service.js';
import { getEntitlements } from '../services/entitlement.service.js';

export async function getMe(req, res) {
  try {
    console.log('SHOPIFY_PROXY_QUERY', req.query);

    const shopifyCustomerId = req.query.logged_in_customer_id;

    if (!shopifyCustomerId) {
      return res.status(401).json({ error: 'CUSTOMER_NOT_LOGGED_IN' });
    }

    cconst member = await getOrCreateMember({
  id: shopifyCustomerId,
  email: null,
  firstName: null,
  lastName: null,
  tags: []
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