import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('PDB Office production client uses protected same-origin endpoints', async () => {
  const [storage, premiumAdmin, crm] = await Promise.all([
    fs.readFile(new URL('../pdb-office/services/crmStorage.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../pdb-office/services/premiumAdmin.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../pdb-office/crm-system.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(storage, /\/api\/office\/crm-data/);
  assert.match(storage, /X-PDB-Admin/);
  assert.match(premiumAdmin, /\/api\/admin/);
  assert.match(premiumAdmin, /\/api\/contracts\/admin/);
  assert.match(premiumAdmin, /X-PDB-Admin/);
  assert.match(crm, /\/api\/office\/send-cancellation-email/);
  assert.doesNotMatch(premiumAdmin, /ADMIN_API_TOKEN|localStorage|sessionStorage/);
});

test('repository excludes private CRM and banking source data', async () => {
  const ignore = await fs.readFile(new URL('../pdb-office/.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /data\/crm-data-v1\.json/);
  assert.match(ignore, /data\/backups\//);
  assert.match(ignore, /kontoauszüge\//);
  assert.match(ignore, /public\/member-finance-data\.json/);
});
