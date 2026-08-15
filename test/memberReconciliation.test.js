import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBeyondUsagePlan,
  buildBeyondReconciliation,
  buildBeyondUsagePlan,
  MemberReconciliationError
} from '../src/services/memberReconciliation.service.js';

test('BEYOND reconciliation is read-only and keeps ambiguous matches under review', () => {
  const crmData = {
    members: [
      { id: 'crm-1', name: 'Bereits Verbunden', email: 'linked@example.com' },
      { id: 'crm-2', name: 'Bereit Für August', email: 'ready@example.com' },
      { id: 'crm-3', name: 'Nur Name', email: '' },
      { id: 'crm-4', name: 'Fehlt In Shopify', email: 'missing@example.com' }
    ],
    memberships: [
      { id: 'membership-1', memberId: 'crm-1', plan: 'Beyond', status: 'aktiv' },
      { id: 'membership-2', memberId: 'crm-2', plan: 'Beyond', status: 'aktiv' },
      { id: 'membership-3', memberId: 'crm-2', plan: 'Beyond', status: 'aktiv' },
      { id: 'membership-4', memberId: 'crm-3', plan: 'Beyond', status: 'aktiv' },
      { id: 'membership-5', memberId: 'crm-4', plan: 'Beyond', status: 'aktiv' },
      { id: 'membership-paused', memberId: 'crm-4', plan: 'Beyond', status: 'pausiert' }
    ]
  };
  const shopifyCustomers = [
    { id: '101', email: 'linked@example.com', firstName: 'Bereits', lastName: 'Verbunden' },
    { id: '102', email: 'READY@example.com', firstName: 'Bereit', lastName: 'Für August' },
    { id: '103', email: 'different@example.com', firstName: 'Nur', lastName: 'Name' },
    { id: '104', email: 'shopify-only@example.com', firstName: 'Nur', lastName: 'Shopify' }
  ];
  const onlineMembers = [{ id: 7, shopify_customer_id: '101' }];

  const result = buildBeyondReconciliation({ crmData, shopifyCustomers, onlineMembers });

  assert.deepEqual(result.summary, {
    crm_contracts: 5,
    crm_members: 4,
    shopify_tagged: 4,
    linked: 1,
    ready: 1,
    needs_review: 2,
    shopify_only: 1
  });
  assert.equal(result.rows.find((row) => row.crm_member_id === 'crm-1').state, 'linked');
  assert.equal(result.rows.find((row) => row.crm_member_id === 'crm-2').state, 'ready');
  assert.equal(result.rows.find((row) => row.crm_member_id === 'crm-2').membership_ids.length, 2);
  assert.equal(result.rows.find((row) => row.crm_member_id === 'crm-3').state, 'review');
  assert.equal(result.rows.find((row) => row.crm_member_id === 'crm-4').state, 'missing_shopify');
  assert.equal(result.shopify_only[0].shopify_customer_id, '104');

  const usagePlan = buildBeyondUsagePlan(result, ['crm-2']);
  assert.equal(usagePlan.length, 2);
  assert.equal(usagePlan.find((row) => row.crm_member_id === 'crm-1').imported_used_count, 1);
  assert.equal(usagePlan.find((row) => row.crm_member_id === 'crm-2').august_remaining, 1);
  assert.throws(
    () => buildBeyondUsagePlan(result, ['crm-4']),
    (error) => error instanceof MemberReconciliationError && error.code === 'AVAILABLE_MEMBER_NOT_ELIGIBLE'
  );
});

test('BEYOND usage plan creates missing members and imports zero or one used session', async () => {
  const members = new Map([['101', {
    id: 1,
    shopify_customer_id: '101',
    email: 'linked@example.com',
    first_name: 'Linked',
    last_name: 'Member',
    package_key: 'beyond'
  }]]);
  const imports = [];
  const db = {
    async query(sql, values) {
      if (sql.includes('SELECT * FROM members')) {
        return { rows: members.has(String(values[0])) ? [members.get(String(values[0]))] : [] };
      }
      if (sql.includes('INSERT INTO members')) {
        const member = {
          id: members.size + 1,
          shopify_customer_id: String(values[0]),
          email: values[1],
          first_name: values[2],
          last_name: values[3],
          package_key: values[4]
        };
        members.set(String(values[0]), member);
        return { rows: [member] };
      }
      if (sql.includes('SET\n      email = $2')) {
        const member = { ...members.get(String(values[0])), email: values[1], first_name: values[2], last_name: values[3], package_key: values[4] };
        members.set(String(values[0]), member);
        return { rows: [member] };
      }
      if (sql.includes('SET status =')) return { rows: [] };
      if (sql.includes('INSERT INTO member_monthly_usage_imports')) {
        imports.push({ memberId: values[0], month: values[1], usedCount: values[2] });
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const reconciliation = {
    month: '2026-08-01',
    rows: [
      {
        crm_member_id: 'crm-1', state: 'linked', shopify_customer_id: '101',
        shopify_email: 'linked@example.com', shopify_first_name: 'Linked', shopify_last_name: 'Member',
        name: 'Linked Member', start_date: '2026-01-01'
      },
      {
        crm_member_id: 'crm-2', state: 'ready', shopify_customer_id: '102',
        shopify_email: 'ready@example.com', shopify_first_name: 'Ready', shopify_last_name: 'Member',
        name: 'Ready Member', start_date: '2026-02-01'
      }
    ]
  };

  const result = await applyBeyondUsagePlan({
    reconciliation,
    availableCrmMemberIds: ['crm-2'],
    actor: 'admin'
  }, db);

  assert.equal(result.applied.length, 2);
  assert.equal(result.available, 1);
  assert.equal(result.exhausted, 1);
  assert.deepEqual(imports.map((entry) => entry.usedCount), [1, 0]);
  assert.equal(members.has('102'), true);
});
