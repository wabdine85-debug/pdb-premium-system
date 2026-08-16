import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAcceptedContractToCrm } from '../src/services/crmContractSync.service.js';

const application = {
  id: '08ba97a2-45c8-4738-8d44-85ac4386c5e4',
  shopify_customer_id: '11004793192712',
  email: 'yusabd131214@gmail.com',
  first_name: 'Joseph',
  last_name: 'Adami',
  package_key: 'beyond',
  mandate_reference: 'PDB-2026-08C75CD2F82C',
  monthly_price_cents: 19900,
  setup_fee_cents: 3900,
  debit_day: 1,
  starts_on: '2026-09-01',
  created_at: '2026-08-13T18:49:52.699Z'
};

test('accepted online contract is attached to the existing CRM person', () => {
  const crmData = {
    members: [{ id: 'joseph-crm', name: 'Joseph Adami', email: 'yusabd131214@gmail.com', status: 'aktiv' }],
    memberships: []
  };

  const result = applyAcceptedContractToCrm(crmData, application, new Date('2026-08-16T12:00:00Z'));
  const membership = crmData.memberships[0];

  assert.equal(result.memberId, 'joseph-crm');
  assert.equal(result.createdPerson, false);
  assert.equal(membership.plan, 'Beyond');
  assert.equal(membership.status, 'aktiv');
  assert.equal(membership.startDate, '2026-09-01');
  assert.equal(membership.endDate, '2027-08-31');
  assert.equal(membership.mandateReference, 'PDB-2026-08C75CD2F82C');
  assert.equal(membership.monthlyAmount, 199);
  assert.equal(membership.onlineApplicationId, application.id);
});

test('keeps PostgreSQL date objects on their local calendar day', () => {
  const crmData = { members: [], memberships: [] };
  const dateApplication = {
    ...application,
    id: 'date-object-application',
    starts_on: new Date(2026, 8, 1)
  };

  applyAcceptedContractToCrm(crmData, dateApplication, new Date('2026-08-16T12:00:00Z'));

  assert.equal(crmData.memberships[0].startDate, '2026-09-01');
  assert.equal(crmData.memberships[0].endDate, '2027-08-31');
});

test('accepted online contract creates a CRM person when none exists', () => {
  const crmData = { members: [], memberships: [] };
  const result = applyAcceptedContractToCrm(crmData, application, new Date('2026-08-16T12:00:00Z'));

  assert.equal(result.createdPerson, true);
  assert.equal(crmData.members[0].name, 'Joseph Adami');
  assert.equal(crmData.members[0].membershipTier, 'Beyond');
  assert.equal(crmData.memberships[0].memberId, crmData.members[0].id);
});

test('CRM sync is idempotent for the same online application', () => {
  const crmData = { members: [], memberships: [] };
  applyAcceptedContractToCrm(crmData, application, new Date('2026-08-16T12:00:00Z'));
  const second = applyAcceptedContractToCrm(crmData, application, new Date('2026-08-16T12:05:00Z'));

  assert.equal(second.createdMembership, false);
  assert.equal(crmData.members.length, 1);
  assert.equal(crmData.memberships.length, 1);
});

test('CRM sync refuses an ambiguous email match', () => {
  const crmData = {
    members: [
      { id: 'one', name: 'Joseph A', email: application.email },
      { id: 'two', name: 'Joseph B', email: application.email }
    ],
    memberships: []
  };

  assert.throws(
    () => applyAcceptedContractToCrm(crmData, application),
    /CRM_MEMBER_AMBIGUOUS/
  );
});
