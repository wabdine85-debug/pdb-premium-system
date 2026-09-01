import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('PDB Office production client uses protected same-origin endpoints', async () => {
  const [storage, premiumAdmin, premiumView, crm, revenue, directDebits] = await Promise.all([
    fs.readFile(new URL('../pdb-office/services/crmStorage.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../pdb-office/services/premiumAdmin.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../pdb-office/components/memberships/PremiumAdministration.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../pdb-office/crm-system.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../pdb-office/modules/revenue/revenueUtils.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../pdb-office/components/direct-debits/DirectDebitWorkspace.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(storage, /\/api\/office\/crm-data/);
  assert.doesNotMatch(storage, /compareDataFreshness/);
  assert.match(storage, /X-PDB-Admin/);
  assert.match(premiumAdmin, /\/api\/admin/);
  assert.match(premiumAdmin, /\/reconciliation\/beyond/);
  assert.match(premiumAdmin, /apply-month/);
  assert.match(premiumAdmin, /\/api\/contracts\/admin/);
  assert.match(premiumAdmin, /X-PDB-Admin/);
  assert.match(premiumView, /Konten im Online-System/);
  assert.match(premiumView, /technische Online-Buchungskonten/);
  assert.match(premiumView, /aktive Member stehen insgesamt im CRM/);
  assert.match(premiumView, /Aktueller August-Stand/);
  assert.match(premiumView, /BEYOND-Abgleich/);
  assert.match(premiumView, /Änderungen speichern/);
  assert.match(crm, /\/api\/office\/send-cancellation-email/);
  assert.match(crm, /\/api\/contracts\/admin\/session/);
  assert.match(crm, /Vertragsverwaltung/);
  assert.match(crm, /Abmelden/);
  assert.match(crm, /Seitenleiste ausklappen/);
  assert.match(revenue, /cashBusiness/);
  assert.match(directDebits, /\/api\/office\/member-finance\/import-sepa/);
  assert.doesNotMatch(crm, /Alle Daten werden lokal in deinem Browser gespeichert/);
  assert.doesNotMatch(premiumAdmin, /ADMIN_API_TOKEN|localStorage|sessionStorage/);
});

test('repository excludes private CRM and banking source data', async () => {
  const ignore = await fs.readFile(new URL('../pdb-office/.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /data\/crm-data-v1\.json/);
  assert.match(ignore, /data\/backups\//);
  assert.match(ignore, /kontoauszüge\//);
  assert.match(ignore, /public\/member-finance-data\.json/);
});
