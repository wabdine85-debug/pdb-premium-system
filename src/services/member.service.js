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
  if (!packageKey) {
  throw new Error('PREMIUM_TAG_REQUIRED');
}

  const safeEmail = email || `shopify-${id}@premium.local`;
const safeFirstName = firstName || '';
const safeLastName = lastName || '';

  let member = await findMemberByShopifyId(id);

  if (!member) {
    member = await createMember({
  shopifyCustomerId: id,
  email: safeEmail,
  firstName: safeFirstName,
  lastName: safeLastName,
  packageKey
});

    return member;
  }

  // Nur updaten wenn echte Daten vorhanden sind
if (email || firstName || lastName || packageKey) {
  member = await updateMemberByShopifyId(id, {
    email: email || member.email,
    firstName: firstName || member.first_name,
    lastName: lastName || member.last_name,
    packageKey: packageKey || member.package_key
  });
}

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