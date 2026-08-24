import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminAcceptanceSummaryHtml,
  adminApplicationNotificationHtml,
  applicationConfirmationHtml,
  contractActionReceiptHtml,
  escapeHtml
} from '../src/services/contractDocuments.service.js';
import {
  ensureContractActionSchema,
  ensureMemberMonthlyUsageImportSchema,
  ensurePremiumAdminSchema
} from '../src/services/schema.service.js';
import { hasHouseNumber, hasRequiredContractConsents } from '../src/utils/contractConsent.js';
import {
  calculateBookingAccess,
  calculateBookingAccessWithTestOverride,
  isTreatmentDateAllowed
} from '../src/services/bookingAccess.service.js';
import {
  buildTransactionalMessage,
  htmlToPlainText,
  isRetryableMailError
} from '../src/services/mail.service.js';

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
  assert.match(html, /Wie geht es weiter/);
  assert.match(html, /01\.09\.2026/);
  assert.doesNotMatch(html, /Coordinated Universal Time|Tue Sep/);
  assert.doesNotMatch(html, /nimmt Ihre Bestellung ausdrücklich an/);
});

test('transactional confirmation has a complete text alternative and no HTML attachment', () => {
  const html = applicationConfirmationHtml({ ...baseApplication, status: 'sepa_pending' });
  const message = buildTransactionalMessage({
    to: 'test@example.com',
    subject: 'Ihre Bestellung ist eingegangen',
    html
  });

  assert.equal('attachments' in message, false);
  assert.match(message.text, /Eingangsbestätigung Ihrer verbindlichen Bestellung/);
  assert.match(message.text, /Mandatsreferenz/);
  assert.match(message.text, /Wie geht es weiter/);
  assert.match(message.text, /01\.09\.2026/);
  assert.doesNotMatch(message.text, /HTML-Anhang/);
  assert.equal(htmlToPlainText('<p>A &amp; B</p>'), 'A & B');
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

test('internal acceptance summary is useful and contains no bank data', () => {
  const html = adminAcceptanceSummaryHtml({
    ...baseApplication,
    email: 'test@example.com',
    status: 'active',
    activated_at: '2026-08-24T08:15:00.000Z',
    early_start_requested_at: null,
    treatment_available_at: '2026-09-07T22:00:00.000Z'
  }, { customerConfirmationSent: true });
  assert.match(html, /Vertrag angenommen/);
  assert.match(html, /PDB PREMIUM PRIVATE/);
  assert.match(html, /Vorzeitiger Leistungsbeginn/);
  assert.match(html, /Früheste Behandlung/);
  assert.match(html, /Erfolgreich per E-Mail versendet/);
  assert.doesNotMatch(html, /IBAN|1234|iban_ciphertext|iban_auth_tag|iban_iv/i);
});

test('resent internal summary explains the customer email status in plain language', () => {
  const html = adminAcceptanceSummaryHtml({
    ...baseApplication,
    email: 'test@example.com',
    status: 'active',
    activated_at: '2026-08-24T08:15:00.000Z',
    treatment_available_at: '2026-09-07T22:00:00.000Z'
  }, { customerConfirmationSent: null });
  assert.match(html, /nachträglich erstellt/);
  assert.match(html, /nicht erneut ausgelöst oder rückwirkend geprüft/);
  assert.doesNotMatch(html, /Versandstatus bei dieser nachträglichen Übersicht nicht erneut geprüft/);
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

test('member usage import schema is additive and auditable', async () => {
  const queries = [];
  await ensureMemberMonthlyUsageImportSchema({ query: async (sql) => queries.push(sql) });
  assert.equal(queries.length, 2);
  assert.match(queries[0], /CREATE TABLE IF NOT EXISTS member_monthly_usage_imports/);
  assert.match(queries[0], /UNIQUE \(member_id, booking_month, category_key\)/);
  assert.match(queries[1], /CREATE INDEX IF NOT EXISTS/);
});

test('premium admin schema is prepared idempotently at startup', async () => {
  const queries = [];
  await ensurePremiumAdminSchema({ query: async (sql) => queries.push(sql) });
  const sql = queries.join('\n');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS entitlement_multiplier/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS appointment_date/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS booking_admin_events/);
  assert.match(sql, /booking_appointment_date_added/);
  assert.match(sql, /booking_rescheduled/);
  assert.match(sql, /bookings_appointment_date_idx/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS test_record_purges/);
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

test('booking opens immediately while treatment waits when early performance was not requested', () => {
  const application = {
    starts_on: '2026-08-01',
    activated_at: '2026-08-11T10:00:00.000Z',
    early_start_requested_at: null
  };
  const access = calculateBookingAccess(application, new Date('2026-08-13T10:00:00.000Z'));
  assert.equal(access.allowed, true);
  assert.equal(access.reason, null);
  assert.equal(access.treatment_allowed, false);
  assert.equal(access.treatment_reason, 'WITHDRAWAL_PERIOD_ACTIVE');
  assert.equal(access.treatment_available_at, '2026-08-25T22:00:00.000Z');
  assert.equal(isTreatmentDateAllowed('2026-08-25', access.treatment_available_at), false);
  assert.equal(isTreatmentDateAllowed('2026-08-26', access.treatment_available_at), true);
});

test('early performance permits treatment from the contractual start date', () => {
  const application = {
    starts_on: '2026-08-01',
    activated_at: '2026-08-11T10:00:00.000Z',
    early_start_requested_at: '2026-08-11T09:00:00.000Z'
  };
  const access = calculateBookingAccess(application, new Date('2026-08-11T10:01:00.000Z'));
  assert.equal(access.allowed, true);
  assert.equal(access.treatment_allowed, true);
  assert.equal(isTreatmentDateAllowed('2026-08-11', access.treatment_available_at), true);
});

test('future contract start permits planning but blocks an earlier treatment date', () => {
  const application = {
    starts_on: '2026-09-01',
    activated_at: '2026-08-11T10:00:00.000Z',
    early_start_requested_at: '2026-08-11T09:00:00.000Z'
  };
  const access = calculateBookingAccess(application, new Date('2026-08-20T10:00:00.000Z'));
  assert.equal(access.allowed, true);
  assert.equal(access.treatment_allowed, false);
  assert.equal(access.treatment_reason, 'CONTRACT_NOT_STARTED');
  assert.equal(isTreatmentDateAllowed('2026-08-31', access.treatment_available_at), false);
  assert.equal(isTreatmentDateAllowed('2026-09-01', access.treatment_available_at), true);
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
  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'ADMIN_TEST_ACCESS');
  assert.equal(access.available_at, null);
  assert.equal(access.treatment_allowed, false);
  assert.equal(application.early_start_requested_at, null);
  assert.equal(application.starts_on, '2026-09-01');
});

test('mail delivery retries only transient connection failures', () => {
  assert.equal(isRetryableMailError({ code: 'ETIMEDOUT' }), true);
  assert.equal(isRetryableMailError(new Error('Connection timeout')), true);
  assert.equal(isRetryableMailError({ code: 'EAUTH' }), false);
});
