import { pool } from '../config/pool.js';
import { listAdminMembers } from '../repositories/adminMember.repository.js';
import {
  createMember,
  findMemberByShopifyId,
  updateMemberByShopifyId
} from '../repositories/member.repository.js';
import { listShopifyCustomersByTag } from './shopifyAdmin.service.js';
import { getBookingMonth } from '../utils/dates.js';

export class MemberReconciliationError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'MemberReconciliationError';
    this.code = code;
    this.status = status;
  }
}

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
      email: normalizeEmail(person?.email || membership.memberEmail) || null,
      start_date: membership.startDate || null
    };
    current.membership_ids.push(membership.id);
    if (membership.startDate && (!current.start_date || membership.startDate < current.start_date)) {
      current.start_date = membership.startDate;
    }
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
      shopify_first_name: shopifyCustomer?.firstName || null,
      shopify_last_name: shopifyCustomer?.lastName || null,
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
    month: getBookingMonth(),
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

export function buildBeyondUsagePlan(reconciliation, availableCrmMemberIds = []) {
  const eligibleRows = (reconciliation?.rows || []).filter((row) =>
    ['linked', 'ready'].includes(row.state)
  );
  const eligibleIds = new Set(eligibleRows.map((row) => String(row.crm_member_id)));
  const availableIds = new Set(availableCrmMemberIds.map(String));

  for (const crmMemberId of availableIds) {
    if (!eligibleIds.has(crmMemberId)) {
      throw new MemberReconciliationError('AVAILABLE_MEMBER_NOT_ELIGIBLE', 409);
    }
  }

  return eligibleRows.map((row) => ({
    ...row,
    imported_used_count: availableIds.has(String(row.crm_member_id)) ? 0 : 1,
    august_remaining: availableIds.has(String(row.crm_member_id)) ? 1 : 0
  }));
}

export async function applyBeyondUsagePlan({
  reconciliation,
  availableCrmMemberIds,
  actor = 'admin'
}, db) {
  const plan = buildBeyondUsagePlan(reconciliation, availableCrmMemberIds);
  const reason = 'Bestandsübernahme des bisherigen Monatskontingents';
  const applied = [];

  for (const row of plan) {
    let member = await findMemberByShopifyId(row.shopify_customer_id, db);
    if (!member) {
      member = await createMember({
        shopifyCustomerId: row.shopify_customer_id,
        email: row.shopify_email || row.email,
        firstName: row.shopify_first_name || row.name.split(' ')[0] || '',
        lastName: row.shopify_last_name || row.name.split(' ').slice(1).join(' '),
        packageKey: 'beyond'
      }, db);
    } else {
      member = await updateMemberByShopifyId(row.shopify_customer_id, {
        email: row.shopify_email || member.email,
        firstName: row.shopify_first_name || member.first_name,
        lastName: row.shopify_last_name || member.last_name,
        packageKey: 'beyond'
      }, db);
    }

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(row.start_date || ''))
      ? row.start_date
      : null;
    await db.query(
      `UPDATE members
       SET status = 'active',
           started_at = CASE WHEN $2::date IS NULL THEN started_at ELSE $2::date END,
           updated_at = NOW()
       WHERE id = $1`,
      [member.id, startDate]
    );
    await db.query(
      `INSERT INTO member_monthly_usage_imports (
         member_id, booking_month, category_key, used_count, actor, reason
       ) VALUES ($1, $2, 'beyond', $3, $4, $5)
       ON CONFLICT (member_id, booking_month, category_key)
       DO UPDATE SET
         used_count = EXCLUDED.used_count,
         actor = EXCLUDED.actor,
         reason = EXCLUDED.reason,
         updated_at = NOW()`,
      [member.id, reconciliation.month, row.imported_used_count, actor, reason]
    );

    applied.push({
      crm_member_id: row.crm_member_id,
      member_id: member.id,
      name: row.name,
      remaining: row.august_remaining
    });
  }

  return {
    month: reconciliation.month,
    applied,
    available: applied.filter((row) => row.remaining === 1).length,
    exhausted: applied.filter((row) => row.remaining === 0).length
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
