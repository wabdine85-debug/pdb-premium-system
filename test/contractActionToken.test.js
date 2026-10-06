import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeContractActionToken,
  issueContractActionToken
} from '../src/services/contractActionToken.service.js';

test('form token is signed, time-bound and accepted only once', async () => {
  const now = Date.now();
  const token = issueContractActionToken(now);
  const used = new Set();
  const db = {
    async query(_sql, [hash]) {
      if (used.has(hash)) return { rows: [] };
      used.add(hash);
      return { rows: [{ token_hash: hash }] };
    }
  };
  assert.equal(await consumeContractActionToken(token, db, now + 1_000), false);
  assert.equal(await consumeContractActionToken(token, db, now + 3_000), true);
  assert.equal(await consumeContractActionToken(token, db, now + 4_000), false);
  assert.equal(await consumeContractActionToken(issueContractActionToken(now), db, now + 31 * 60_000), false);
});

test('modified form tokens are rejected before database access', async () => {
  const token = issueContractActionToken(Date.now() - 3_000);
  const db = { query: async () => { throw new Error('should not be called'); } };
  const changed = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
  assert.equal(await consumeContractActionToken(changed, db), false);
  assert.equal(await consumeContractActionToken('', db), false);
});
