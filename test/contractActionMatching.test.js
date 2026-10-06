import assert from 'node:assert/strict';
import test from 'node:test';
import { findContractActionMatch } from '../src/services/contractActionMatching.service.js';

const declaration = {
  firstName: 'Anna',
  lastName: 'Müller',
  email: 'anna@example.com',
  mandateReference: ''
};

function database({ online = [], members = [], crm = null, officeError = false } = {}) {
  return {
    async query(sql) {
      if (sql.includes('FROM membership_applications')) return { rows: online };
      if (sql.includes('FROM members')) return { rows: members };
      if (officeError) throw new Error('office unavailable');
      return { rows: crm ? [{ payload: crm }] : [] };
    }
  };
}

test('a unique mandate reference identifies an online application', async () => {
  const match = await findContractActionMatch(
    { ...declaration, mandateReference: 'PDB-123' },
    database({ online: [{ id: 'application-1', mandate_reference: 'PDB-123' }] })
  );
  assert.deepEqual(match, {
    state: 'reference_match',
    sources: ['online'],
    matchedApplicationId: 'application-1'
  });
});

test('a name and email match is only a possible match', async () => {
  const match = await findContractActionMatch(declaration, database({
    members: [{ id: 1, first_name: 'Anna', last_name: 'Müller', email: 'anna@example.com' }],
    crm: { members: [], memberships: [] }
  }));
  assert.equal(match.state, 'possible_match');
  assert.deepEqual(match.sources, ['member']);
  assert.equal(match.matchedApplicationId, null);
});

test('a wrong reference does not identify an existing contract', async () => {
  const match = await findContractActionMatch(
    { ...declaration, mandateReference: 'PDB-WRONG' },
    database({ online: [{ id: 'application-1', mandate_reference: 'PDB-123' }] })
  );
  assert.equal(match.state, 'possible_match');
  assert.equal(match.matchedApplicationId, null);
});

test('Office memberships can be identified without an online application', async () => {
  const match = await findContractActionMatch(
    { ...declaration, mandateReference: 'PDB-123' },
    database({ crm: {
      members: [{ id: 'person-1', name: 'Anna Müller', email: 'anna@example.com' }],
      memberships: [{ id: 'membership-1', memberId: 'person-1', plan: 'Beyond', mandateReference: 'PDB-123' }]
    } })
  );
  assert.equal(match.state, 'reference_match');
  assert.deepEqual(match.sources, ['office']);
  assert.equal(match.matchedApplicationId, null);
});

test('missing Office data leaves an unmatched declaration open for review', async () => {
  const match = await findContractActionMatch(declaration, database({ officeError: true }));
  assert.equal(match.state, 'review_required');
  assert.deepEqual(match.sources, []);
});
