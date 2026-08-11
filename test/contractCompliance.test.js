import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationConfirmationHtml,
  contractActionReceiptHtml,
  escapeHtml
} from '../src/services/contractDocuments.service.js';
import { ensureContractActionSchema } from '../src/services/schema.service.js';

const baseApplication = {
  first_name: 'Test',
  last_name: 'Person',
  package_key: 'private',
  monthly_price_cents: 39900,
  setup_fee_cents: 3900,
  minimum_total_cents: 482700,
  starts_on: '2026-09-01',
  mandate_reference: 'PDB-2026-TEST',
  iban_last4: '1234',
  contract_version: '2026-08-11-v2',
  created_at: '2026-08-11T10:00:00.000Z',
  updated_at: '2026-08-11T10:00:00.000Z'
};

test('pending order confirmation does not claim that the contract is already formed', () => {
  const html = applicationConfirmationHtml({ ...baseApplication, status: 'sepa_pending' });
  assert.match(html, /verbindlichen Bestellung/);
  assert.match(html, /erst mit der ausdrücklichen Annahme/);
  assert.doesNotMatch(html, /nimmt Ihre Bestellung ausdrücklich an/);
});

test('active confirmation explicitly records PDB acceptance', () => {
  const html = applicationConfirmationHtml({ ...baseApplication, status: 'active' });
  assert.match(html, /Annahme- und Vertragsbestätigung/);
  assert.match(html, /nimmt Ihre Bestellung ausdrücklich an/);
  assert.match(html, /Vertrag angenommen und Mitgliedschaft aktiv/);
});

test('withdrawal receipt contains durable receipt identifiers and escapes input', () => {
  const html = contractActionReceiptHtml({
    id: 'request-123',
    action_type: 'withdrawal',
    first_name: '<Test>',
    last_name: 'Person',
    mandate_reference: 'PDB-2026-TEST',
    communication_email: 'test@example.com',
    created_at: '2026-08-11T10:30:00.000Z'
  });
  assert.match(html, /Eingangsbestätigung Ihres Widerrufs/);
  assert.match(html, /request-123/);
  assert.match(html, /&lt;Test&gt;/);
  assert.doesNotMatch(html, /<Test>/);
});

test('contract document escaping covers all HTML control characters', () => {
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#039;');
});

test('contract action schema bootstrap is additive and idempotent SQL', async () => {
  const queries = [];
  await ensureContractActionSchema({ query: async (sql) => queries.push(sql) });
  assert.equal(queries.length, 3);
  assert.match(queries[0], /CREATE TABLE IF NOT EXISTS contract_action_requests/);
  assert.match(queries[1], /CREATE INDEX IF NOT EXISTS/);
  assert.match(queries[2], /CREATE INDEX IF NOT EXISTS/);
});
