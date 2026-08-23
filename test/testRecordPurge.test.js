import assert from 'node:assert/strict';
import test from 'node:test';
import { removeOnlineApplicationFromCrm } from '../src/services/testRecordPurge.service.js';

test('test cleanup removes the synced membership and its generated CRM person', () => {
  const applicationId = '08ba97a2-45c8-4738-8d44-85ac4386c5e4';
  const generatedPersonId = `online-${applicationId}`;
  const crmData = {
    members: [
      { id: generatedPersonId, name: 'Test Person' },
      { id: 'real-person', name: 'Real Person' }
    ],
    memberships: [
      { id: generatedPersonId, memberId: generatedPersonId, onlineApplicationId: applicationId },
      { id: 'real-membership', memberId: 'real-person' }
    ]
  };

  const result = removeOnlineApplicationFromCrm(crmData, applicationId);

  assert.equal(result.removedMembershipCount, 1);
  assert.equal(result.removedPersonCount, 1);
  assert.deepEqual(result.crmData.members.map((person) => person.id), ['real-person']);
  assert.deepEqual(result.crmData.memberships.map((membership) => membership.id), ['real-membership']);
});

test('test cleanup preserves an existing CRM person and unrelated memberships', () => {
  const crmData = {
    members: [{ id: 'existing-person', name: 'Existing Person' }],
    memberships: [
      { id: 'online-contract', memberId: 'existing-person', onlineApplicationId: 'test-application' },
      { id: 'studio-contract', memberId: 'existing-person' }
    ]
  };

  const result = removeOnlineApplicationFromCrm(crmData, 'test-application');

  assert.equal(result.removedMembershipCount, 1);
  assert.equal(result.removedPersonCount, 0);
  assert.equal(result.crmData.members.length, 1);
  assert.deepEqual(result.crmData.memberships.map((membership) => membership.id), ['studio-contract']);
});
