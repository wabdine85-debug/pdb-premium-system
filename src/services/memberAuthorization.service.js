import { findMemberByShopifyId } from '../repositories/member.repository.js';
import { findActiveApplicationForBooking } from '../repositories/contract.repository.js';
import { getShopifyCustomer } from './shopifyAdmin.service.js';
import { getOrCreateMember } from './member.service.js';

export function canUseLocalMemberFallback(member, activeApplication) {
  if (!member || member.status !== 'active') return false;

  // All memberships that existed before the new contract workflow were BEYOND.
  if (member.package_key === 'beyond') return true;

  return Boolean(
    activeApplication &&
    activeApplication.status === 'active' &&
    activeApplication.package_key === member.package_key
  );
}

export function isMemberAuthorizationError(error) {
  return ['PREMIUM_TAG_REQUIRED', 'PREMIUM_ACCESS_NOT_VERIFIED'].includes(
    String(error?.message || '')
  );
}

export async function getAuthorizedMember(shopifyCustomerId, db) {
  try {
    const customer = await getShopifyCustomer(shopifyCustomerId);
    return await getOrCreateMember(customer);
  } catch (error) {
    if (!String(error?.message || '').startsWith('SHOPIFY_')) throw error;

    const member = await findMemberByShopifyId(shopifyCustomerId, db);
    if (!member) throw error;

    const activeApplication = await findActiveApplicationForBooking(member.id, db);
    if (!canUseLocalMemberFallback(member, activeApplication)) {
      throw new Error('PREMIUM_ACCESS_NOT_VERIFIED');
    }

    const safeErrorCode = String(error.message || 'SHOPIFY_ERROR').split(':')[0].slice(0, 80);
    console.warn(`Shopify customer verification unavailable (${safeErrorCode}); using verified local membership fallback.`);
    return member;
  }
}
