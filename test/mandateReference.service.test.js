import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMandateReference,
  reserveNextMandateReference
} from '../src/services/mandateReference.service.js';

test('formats the shared mandate reference', () => {
  assert.equal(formatMandateReference(2026, 80), 'PDB-M-2026-0080');
});

test('reserves the next reference atomically through the database counter', async () => {
  const calls = [];
  const db = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ last_value: 81 }] };
    }
  };

  const reference = await reserveNextMandateReference(db, new Date('2026-08-16T12:00:00Z'));

  assert.equal(reference, 'PDB-M-2026-0081');
  assert.deepEqual(calls[0].values, [2026]);
  assert.match(calls[0].sql, /ON CONFLICT/);
});
