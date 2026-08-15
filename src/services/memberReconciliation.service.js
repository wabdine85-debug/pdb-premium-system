import { pool } from '../config/pool.js';
import { listAdminMembers } from '../repositories/adminMember.repository.js';
import { listShopifyCustomersByTag } from './shopifyAdmin.service.js';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function displayName(person, membership) {
  return String(person?.name || membership?.memberName || '').trim() || 'Name fehlt';
}

function uniqueCandidate(items, predicate) {
  const candidates = items.filter(predicate);
  return candidates.length === 1 ? candidates[0] : null;
}

function activeBeyondCrmMembers(crmData) {
  const people = new Map((crmData?.members || []).map((person) => [person.id, person]));
  const grouped = new Map();

  for (const membership of crmData?.memberships || []) {
    if (membership?.status !== 'aktiv' || normalizeText(membership?.plan) !== 'beyond') continue;
    const person = people.get(membership.memberId) || null;
    const key = String(membership.memberId || membership.id);
    const current = grouped.get(key) || {
      crm_member_id: membership.memberId || null,
      membership_ids: [],
      name: displayName(person, membership),
      email: normalizeEmail(person?.email || membership.memberEmail) || null
    };
    current.membership_ids.push(membership.id);
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function buildBeyondReconciliation({ crmData, shopifyCustomers, onlineMembers }) {
  const crmMembers = activeBeyondCrmMembers(crmData);
  const onlineByShopifyId = new Map(
    (onlineMembers || []).map((member) => [String(member.shopify_customer_id), member])
  );
  const matchedShopifyIds = new Set();

  const rows = crmMembers.map((crmMember) => {
    const email = normalizeEmail(crmMember.email);
    let shopifyCustomer = email
      ? uniqueCandidate(shopifyCustomers, (customer) => normalizeEmail(customer.email) === email)
      : null;
    let matchMethod = shopifyCustomer ? 'email' : null;

    if (!shopifyCustomer) {
      const normalizedName = normalizeText(crmMember.name);
      shopifyCustomer = normalizedName
        ? uniqueCandidate(shopifyCustomers, (customer) =>
          normalizeText([customer.firstName, customer.lastName].filter(Boolean).join(' ')) === normalizedName)
        : null;
      if (shopifyCustomer) matchMethod = 'name';
    }

    const onlineMember = shopifyCustomer
      ? onlineByShopifyId.get(String(shopifyCustomer.id)) || null
      : null;
    if (shopifyCustomer) matchedShopifyIds.add(String(shopifyCustomer.id));

    let state = 'missing_shopify';
    if (onlineMember) state = 'linked';
    else if (shopifyCustomer && matchMethod === 'email') state = 'ready';
    else if (shopifyCustomer) state = 'review';

    return {
      ...crmMember,
      state,
      match_method: matchMethod,
      shopify_customer_id: shopifyCustomer?.id || null,
      shopify_name: shopifyCustomer
        ? [shopifyCustomer.firstName, shopifyCustomer.lastName].filter(Boolean).join(' ') || null
        : null,
      shopify_email: shopifyCustomer?.email || null,
      online_member_id: onlineMember?.id || null
    };
  });

  const shopifyOnly = (shopifyCustomers || [])
    .filter((customer) => !matchedShopifyIds.has(String(customer.id)))
    .map((customer) => ({
      shopify_customer_id: customer.id,
      name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || null,
      email: customer.email || null,
      online_member_id: onlineByShopifyId.get(String(customer.id))?.id || null
    }));

  return {
    month: '2026-08-01',
    summary: {
      crm_contracts: rows.reduce((sum, row) => sum + row.membership_ids.length, 0),
      crm_members: rows.length,
      shopify_tagged: shopifyCustomers.length,
      linked: rows.filter((row) => row.state === 'linked').length,
      ready: rows.filter((row) => row.state === 'ready').length,
      needs_review: rows.filter((row) => ['review', 'missing_shopify'].includes(row.state)).length,
      shopify_only: shopifyOnly.length
    },
    rows,
    shopify_only: shopifyOnly
  };
}

export async function getBeyondReconciliation(db = pool) {
  const documentResult = await db.query(
    `SELECT payload
     FROM pdb_office.documents
     WHERE document_key = 'crm'
     LIMIT 1`
  );
  const crmData = documentResult.rows[0]?.payload;
  if (!crmData) throw new Error('CRM_NOT_INITIALIZED');

  const [shopifyCustomers, onlineMembers] = await Promise.all([
    listShopifyCustomersByTag('premium-beyond'),
    listAdminMembers({ limit: 100 }, db)
  ]);

  return buildBeyondReconciliation({ crmData, shopifyCustomers, onlineMembers });
}
