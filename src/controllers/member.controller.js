import { getOrCreateMember } from '../services/member.service.js';
import { getEntitlements } from '../services/entitlement.service.js';

export async function getMe(req, res) {
  try {
    // TEST: Fake Shopify Customer (später ersetzen wir das!)
    const fakeCustomer = {
      id: 123456,
      email: 'test@test.de',
      firstName: 'Test',
      lastName: 'User',
      tags: ['premium-define']
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