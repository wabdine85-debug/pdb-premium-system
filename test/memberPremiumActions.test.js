import assert from 'node:assert/strict';
import test from 'node:test';
import nodemailer from 'nodemailer';
import router from '../src/routes/contracts.js';
import { env } from '../src/config/env.js';
import { pool } from '../src/config/pool.js';
import { issueContractActionToken } from '../src/services/contractActionToken.service.js';

function response() {
  return { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; },
    type() { return this; }, send(value) { this.body = value; return this; } };
}

const sent = [];
for (const actionType of ['withdrawal', 'cancellation']) {
  test(`public ${actionType} stores the declaration and emails a durable dated receipt without login`, async () => {
    const oldQuery = pool.query;
    const oldTransport = nodemailer.createTransport;
    const oldEnv = { ...env };
    sent.length = 0;
    let saved;
    Object.assign(env, { shopifyAppSecret: 'unit-test-only', contractActionTokenRequired: true,
      smtpHost: 'unit-test.invalid', smtpUser: 'test', smtpPass: 'test', smtpFrom: 'test@example.com', contractAdminEmail: '' });
    nodemailer.createTransport = () => ({ sendMail: async mail => { sent.push(mail); } });
    pool.query = async (sql, params = []) => {
      if (sql.includes('INSERT INTO contract_action_used_tokens')) return { rows: [{ token_hash: params[0] }] };
      if (sql.includes('INSERT INTO contract_action_requests')) {
        saved = { id: params[0], action_type: params[1], first_name: params[2], last_name: params[3],
          email: params[4], mandate_reference: params[5], communication_email: params[6],
          cancellation_type: params[7], cancellation_reason: params[8], requested_end_on: params[9],
          request_metadata: JSON.parse(params[12]), receipt_token_hash: params[11], status: 'received',
          created_at: '2026-10-28T12:34:00Z' };
        return { rows: [saved] };
      }
      if (sql.includes('FROM contract_action_requests') && sql.includes('receipt_token_hash')) {
        return { rows: saved && params[0] === saved.receipt_token_hash ? [saved] : [] };
      }
      if (/^\s*SELECT/.test(sql)) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    };
    try {
      const route = router.stack.find(layer => layer.route?.path === '/action').route;
      assert(!route.stack.some(layer => layer.handle.name === 'requireShopifyCustomer'));
      const res = response();
      await route.stack.at(-1).handle({ shopifyProxy: { shop: 'test.myshopify.com', customerId: '' }, body: {
        action_type: actionType, first_name: 'Test', last_name: 'Mitglied', email: 'test@example.com',
        communication_email: 'receipt@example.com', contract_description: 'PDB PURE ab November',
        cancellation_type: 'ordinary', action_token: issueContractActionToken(Date.now() - 2100)
      } }, res);
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.confirmation_email_sent, true);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, 'receipt@example.com');
      assert.match(sent[0].html, /28\.10\.2026/);
      assert.match(sent[0].html, /13:34/);
      assert.match(sent[0].text, /PDB PURE ab November/);
      assert.equal(res.headers['Cache-Control'], 'no-store');
      const receipt = response();
      const receiptRoute = router.stack.find(layer => layer.route?.path === '/action-confirmation').route;
      await receiptRoute.stack.at(-1).handle({ query: { token: new URL(res.body.receipt_url, 'https://test.invalid').searchParams.get('token') } }, receipt);
      assert.equal(receipt.statusCode, 200);
      assert.match(receipt.headers['Content-Disposition'], /attachment/);
      assert.match(receipt.body, /Eingangsbestätigung/);
      const forbiddenReceipt = response();
      await receiptRoute.stack.at(-1).handle({ query: { token: 'invalid-token' } }, forbiddenReceipt);
      assert.equal(forbiddenReceipt.statusCode, 404);
    } finally {
      pool.query = oldQuery;
      nodemailer.createTransport = oldTransport;
      Object.assign(env, oldEnv);
    }
  });
}

test('cached contract forms cannot submit consent for a previous version', async () => {
  const res = response();
  const handler = router.stack.find(layer => layer.route?.path === '/apply').route.stack.at(-1).handle;
  await handler({ body: { package_key: 'pure', contract_version: '2026-08-11-v2' } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'CONTRACT_VERSION_CHANGED');
});

test('new-version activation refuses a first debit with insufficient notice before external writes', async () => {
  const oldConnect = pool.connect;
  const statements = [];
  pool.connect = async () => ({
    query: async sql => {
      statements.push(sql);
      return { rows: [{ id: 'test', status: 'sepa_pending', contract_version: '2026-11',
        starts_on: '2020-01-01', monthly_price_cents: 14900, setup_fee_cents: 4900 }] };
    }, release() {}
  });
  try {
    const res = response();
    const handler = router.stack.find(layer => layer.route?.path === '/admin/:id/activate').route.stack.at(-1).handle;
    await handler({ params: { id: 'test' } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'PRENOTIFICATION_TOO_LATE');
    assert.equal(statements.length, 1);
    assert.match(statements[0], /SELECT/);
  } finally { pool.connect = oldConnect; }
});
