import { getOrCreateMember } from '../services/member.service.js';
import { getEntitlements } from '../services/entitlement.service.js';

export async function getMe(req, res) {
  try {
    console.log('SHOPIFY_PROXY_QUERY', req.query);
    
    const fakeCustomer = {
  id: 7562346135816,
  email: 'test@pdb.de',
  firstName: 'Test',
  lastName: 'User',
  tags: ['premium-pure']
};

    const member = await getOrCreateMember(fakeCustomer);
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