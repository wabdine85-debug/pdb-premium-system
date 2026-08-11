import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminApplicationNotificationHtml,
  applicationConfirmationHtml,
  contractActionReceiptHtml,
  escapeHtml
} from '../src/services/contractDocuments.service.js';
import { ensureContractActionSchema } from '../src/services/schema.service.js';
import { hasHouseNumber, hasRequiredContractConsents } from '../src/utils/contractConsent.js';
import {
  calculateBookingAccess,
  calculateBookingAccessWithTestOverride
} from '../src/services/bookingAccess.service.js';
import { isRetryableMailError } from '../src/services/mail.service.js';

const baseApplication = {
  id: 'application-123',
  first_name: 'Test',
  last_name: 'Person',
  package_key: 'private',
  monthly_price_cents: 39900,
  setup_fee_cents: 3900,
  minimum_total_cents: 482700,
  starts_on: '2026-09-01',
  debit_day: 1,
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
  assert.match(html, /1 vollständiges PRIVATE-Protokoll/);
  assert.match(html, /438,00/);
  assert.match(html, /Gläubiger-ID DE73ZZZ00002018874/);
  assert.match(html, /12 Monate Mindestlaufzeit/);
  assert.match(html, /Widerruf/);
});

test('admin notification contains no full IBAN or decryption material', () => {
  const html = adminApplicationNotificationHtml({
    ...baseApplication,
    email: 'test@example.com',
    status: 'sepa_pending'
  });
  assert.match(html, /Neuer PDB PREMIUM Vertragsantrag/);
  assert.match(html, /PDB-2026-TEST/);
  assert.match(html, /••1234/);
  assert.doesNotMatch(html, /iban_ciphertext|iban_auth_tag|iban_iv/i);
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

test('membership application requires an explicit 18+ confirmation', () => {
  const consents = {
    confirm_age_18: true,
    accept_agb: true,
    accept_withdrawal: true,
    accept_sepa: true,
    account_holder_confirmed: true
  };
  assert.equal(hasRequiredContractConsents(consents), true);
  assert.equal(hasRequiredContractConsents({ ...consents, confirm_age_18: false }), false);
  assert.equal(hasRequiredContractConsents({ ...consents, confirm_age_18: undefined }), false);
});

test('street address requires a house number', () => {
  assert.equal(hasHouseNumber('Rheinstraße 59'), true);
  assert.equal(hasHouseNumber('Rheinstraße 59a'), true);
  assert.equal(hasHouseNumber('Rheinstraße'), false);
});

test('booking is blocked for 14 days when early performance was not requested', () => {
  const application = {
    starts_on: '2026-08-01',
    activated_at: '2026-08-11T10:00:00.000Z',
    early_start_requested_at: null
  };
  const blocked = calculateBookingAccess(application, new Date('2026-08-13T10:00:00.000Z'));
  const allowed = calculateBookingAccess(application, new Date('2026-08-26T00:00:00.000Z'));
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'WITHDRAWAL_PERIOD_ACTIVE');
  assert.equal(blocked.available_at, '2026-08-25T22:00:00.000Z');
  assert.equal(allowed.allowed, true);
});

test('early performance permits booking from the contractual start date', () => {
  const application = {
    starts_on: '2026-08-01',
    activated_at: '2026-08-11T10:00:00.000Z',
    early_start_requested_at: '2026-08-11T09:00:00.000Z'
  };
  assert.equal(calculateBookingAccess(application, new Date('2026-08-11T10:01:00.000Z')).allowed, true);
});

test('future contract start still blocks booking despite early-performance request', () => {
  const application = {
    starts_on: '2026-09-01',
    activated_at: '2026-08-11T10:00:00.000Z',
    early_start_requested_at: '2026-08-11T09:00:00.000Z'
  };
  const access = calculateBookingAccess(application, new Date('2026-08-20T10:00:00.000Z'));
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'CONTRACT_NOT_STARTED');
});

test('logged admin test access temporarily overrides booking timing without changing the contract', () => {
  const application = {
    starts_on: '2026-09-01',
    activated_at: '2026-08-11T10:00:00.000Z',
    early_start_requested_at: null
  };
  const access = calculateBookingAccessWithTestOverride(
    application,
    true,
    new Date('2026-08-11T12:00:00.000Z')
  );
  assert.deepEqual(access, { allowed: true, reason: 'ADMIN_TEST_ACCESS', available_at: null });
  assert.equal(application.early_start_requested_at, null);
  assert.equal(application.starts_on, '2026-09-01');
});

test('mail delivery retries only transient connection failures', () => {
  assert.equal(isRetryableMailError({ code: 'ETIMEDOUT' }), true);
  assert.equal(isRetryableMailError(new Error('Connection timeout')), true);
  assert.equal(isRetryableMailError({ code: 'EAUTH' }), false);
});
