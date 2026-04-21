import {
  findMemberByShopifyId,
  createMember,
  updateMemberByShopifyId
} from '../repositories/member.repository.js';

/**
 * Holt oder erstellt ein Mitglied basierend auf Shopify-Daten
 */
export async function getOrCreateMember(customer) {
  const {
    id,
    email,
    firstName,
    lastName,
    tags
  } = customer;

  const packageKey = resolvePackageFromTags(tags);

  let member = await findMemberByShopifyId(id);

  if (!member) {
    member = await createMember({
      shopifyCustomerId: id,
      email,
      firstName,
      lastName,
      packageKey
    });

    return member;
  }

  member = await updateMemberByShopifyId(id, {
    email,
    firstName,
    lastName,
    packageKey
  });

  return member;
}

/**
 * Shopify Tags → Paket
 */
function resolvePackageFromTags(tags = []) {
  if (tags.includes('premium-beyond')) return 'beyond';
  if (tags.includes('premium-define')) return 'define';
  if (tags.includes('premium-pure')) return 'pure';

  return null;
}