import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSuspiciousActionPair,
  processContractActionAdminAlerts,
  queueUnmatchedContractActionAlert
} from '../src/services/contractActionAdminAlerts.service.js';

const first = {
  id: 'first', action_type: 'withdrawal', first_name: 'Anna', last_name: 'Muster',
  email: 'family@example.com', mandate_reference: 'A-123',
  created_at: '2026-10-19T04:21:13Z', request_metadata: { match_state: 'unmatched' }
};
const second = {
  id: 'second', action_type: 'cancellation', first_name: 'Berta', last_name: 'Beispiel',
  email: 'FAMILY@example.com', mandate_reference: 'B-456',
  created_at: '2026-10-19T04:21:28Z', request_metadata: { match_state: 'unmatched' }
};

test('pairs of unmatched actions with the observed pattern are bundled', () => {
  assert.equal(isSuspiciousActionPair(first, second), true);
  assert.equal(isSuspiciousActionPair(second, first), true);
});

test('ordinary or potentially genuine actions remain individually alertable', () => {
  assert.equal(isSuspiciousActionPair(first, { ...second, first_name: 'Anna' }), false);
  assert.equal(isSuspiciousActionPair(first, { ...second, mandate_reference: 'A-123' }), false);
  assert.equal(isSuspiciousActionPair(first, { ...second, email: 'other@example.com' }), false);
  assert.equal(isSuspiciousActionPair(first, { ...second, action_type: 'withdrawal' }), false);
  assert.equal(isSuspiciousActionPair(first, { ...second, created_at: '2026-10-19T04:22:14Z' }), false);
  assert.equal(isSuspiciousActionPair(first, { ...second, request_metadata: { match_state: 'possible_match' } }), false);
});

test('unmatched action alert is queued once with a short delay', async () => {
  const calls = [];
  await queueUnmatchedContractActionAlert('action-1', {
    query: async (sql, params) => { calls.push({ sql, params }); }
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ON CONFLICT \(action_id\) DO NOTHING/);
  assert.deepEqual(calls[0].params, ['action-1', 90_000]);
});

test('observed paired submissions become one deferred review group without sending an immediate alert', async () => {
  const states = [];
  let claimed = false;
  await processContractActionAdminAlerts({
    query: async (sql, params = []) => {
      if (sql.includes('WITH due AS') && sql.includes('RETURNING a.id')) {
        if (claimed) return { rows: [] };
        claimed = true;
        return { rows: [first] };
      }
      if (sql.includes('FROM contract_action_requests') && sql.includes('ORDER BY ABS')) {
        return { rows: [second] };
      }
      if (sql.includes('SET state = $2')) {
        states.push(params[1]);
        return { rows: [] };
      }
      if (sql.includes("SET state = 'reporting'")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  });
  assert.deepEqual(states, ['batched']);
});
