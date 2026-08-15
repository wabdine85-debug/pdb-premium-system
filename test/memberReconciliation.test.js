import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBeyondReconciliation } from '../src/services/memberReconciliation.service.js';

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
});
