import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PACKAGE_CATALOG, SETUP_FEE_CENTS, getPackageOffer } from '../src/utils/packageCatalog.js';
import { memberPremiumFullHtml, memberPremiumText, memberPremiumWithdrawalHtml } from '../src/utils/memberPremiumLegal.js';
import { contractDebitSchedule, firstBankingDay, hasPrenotificationLeadTime, isValidContractStart } from '../src/utils/contractSchedule.js';
import { applicationConfirmationHtml } from '../src/services/contractDocuments.service.js';

const application = {
  id: 'review-example', first_name: '<Beispiel>', last_name: 'Mitglied',
  package_key: 'private', monthly_price_cents: 39900, setup_fee_cents: 4900,
  minimum_total_cents: 483700, starts_on: '2026-11-01', debit_day: 1,
  mandate_reference: 'PDB-PRUEFVORSCHAU', iban_last4: '0000',
  contract_version: '2026-11', status: 'active', created_at: '2026-10-28T12:00:00Z'
};

test('all four new offers retain monthly prices and add exactly 49 EUR', () => {
  assert.equal(SETUP_FEE_CENTS, 4900);
  assert.deepEqual(Object.keys(PACKAGE_CATALOG).map(key => getPackageOffer(key).minimumTotalCents), [183700, 207700, 243700, 483700]);
  assert.equal(getPackageOffer('pure').monthlyClaim, '3 Behandlungen aus PURE');
  assert.equal(getPackageOffer('beyond').monthlyPriceCents, 19900);
});

test('legal HTML preserves every nonblank source line and all 24 sections', () => {
  const plain = memberPremiumFullHtml.replace(/<[^>]*>/g, ' ').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#039;', "'").replace(/\s+/g, ' ');
  for (const line of memberPremiumText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    assert(plain.includes(line.replace(/\s+/g, ' ')), `Missing source line: ${line}`);
  }
  assert.equal((memberPremiumFullHtml.match(/<h2>§ /g) || []).length, 24);
  assert.equal((memberPremiumFullHtml.match(/<table>/g) || []).length, 4);
  assert.match(memberPremiumWithdrawalHtml, /einschließlich der Einrichtungsgebühr/);
  assert.doesNotMatch(memberPremiumFullHtml, /ec\.europa\.eu\/consumers\/odr/);
});

test('banking dates handle weekends, new year, Labour Day and Easter', () => {
  assert.equal(firstBankingDay(2026, 10), '2026-11-02');
  assert.equal(firstBankingDay(2027, 0), '2027-01-04');
  assert.equal(firstBankingDay(2026, 4), '2026-05-04');
  assert.equal(firstBankingDay(2029, 3), '2029-04-03');
  const schedule = contractDebitSchedule(application);
  assert.equal(schedule.length, 12);
  assert.deepEqual(schedule[0], { date: '2026-11-02', amountCents: 44800 });
  assert(schedule.slice(1).every(entry => entry.amountCents === 39900));
  assert.equal(schedule.at(-1).date, '2027-10-01');
});

test('notice uses Berlin calendar days, including the exact two-day boundary', () => {
  assert.equal(hasPrenotificationLeadTime(application, new Date('2026-10-31T12:00:00Z')), true);
  assert.equal(hasPrenotificationLeadTime(application, new Date('2026-10-31T23:30:00Z')), false);
});

test('new contracts start next month or later, at most six months ahead', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  for (const value of ['2026-10-01', '2026-11-02', '2027-07-01', '2026-13-01']) assert.equal(isValidContractStart(value, now), false, value);
  for (const value of ['2026-11-01', '2027-04-01']) assert.equal(isValidContractStart(value, now), true, value);
  assert.equal(isValidContractStart('2026-11-01', new Date('2026-10-31T23:30:00Z')), false);
});

test('new acceptance contains the full durable terms and concrete debit dates', () => {
  const html = applicationConfirmationHtml(application);
  assert.match(html, /PDB Aesthetic Room, Inhaberin Noureen Hussain nimmt/);
  assert.match(html, /SEPA-Vorabankündigung/);
  assert.match(html, /02\.11\.2026/);
  assert.match(html, /448,00/);
  assert.match(html, /§ 24/);
  assert.match(html, /ANLAGE 1/);
  assert.match(html, /ANLAGE 2/);
  assert.match(html, /&lt;Beispiel&gt;/);
  assert.doesNotMatch(html, /<Beispiel>|3 Kalendertage|am 1\. Kalendertag/);
  assert.match(html, /keine Injektion/);
  assert.match(html, /Vorabankündigung/);
});

test('historic confirmations keep their stored 39 EUR fee and do not acquire new terms', () => {
  const html = applicationConfirmationHtml({ ...application, contract_version: '2026-08-11-v2', setup_fee_cents: 3900, minimum_total_cents: 482700 });
  assert.match(html, /438,00/);
  assert.doesNotMatch(html, /ANLAGE 1|Version 2026-11/);
});

for (const directory of ['preview-theme-overrides', 'shopify-theme-premium-dummy-clean']) {
  test(`${directory}: unselected consent version, sums and FAQ match the backend`, () => {
    const html = readFileSync(new URL(`../${directory}/sections/pdb-premium-membership-v2.liquid`, import.meta.url), 'utf8');
    for (const value of ['1.837,00 €', '2.077,00 €', '2.437,00 €', '4.837,00 €']) assert(html.includes(value));
    assert.match(html, /name="contract_version" value="2026-11"/);
    for (const match of html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)) assert.doesNotMatch(match[0], /\bchecked\b/);
    assert.match(html, /§ 7 Abs\. 3/);
    assert.doesNotMatch(html, /einmalig 39 €|>39,00 €|PDB – AESTHETIC ROOM/);
  });
}
