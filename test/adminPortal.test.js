import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin portal uses a password session without exposing credentials', async () => {
  const [appSource, page, script] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/admin-contracts.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/admin-assets/contracts.js', import.meta.url), 'utf8')
  ]);
  assert.match(appSource, /app\.get\('\/admin\/contracts'/);
  assert.match(appSource, /Cache-Control', 'no-store'/);
  assert.match(appSource, /X-Robots-Tag', 'noindex, nofollow, noarchive'/);
  assert.match(page, /Admin-Passwort/);
  assert.match(page, /ADMIN_API_TOKEN/);
  assert.doesNotMatch(page, /Bearer\s+[A-Za-z0-9_-]{16,}/);
  assert.match(script, /credentials: 'same-origin'/);
  assert.match(script, /Authorization: `Bearer \$\{recoveryToken\}`/);
  assert.match(script, /X-PDB-Admin/);
  assert.doesNotMatch(script, /localStorage|sessionStorage/);
  assert.match(page, /admin-action-dialog/);
  assert.match(script, /Vertragsbestätigung erneut senden/);
  assert.match(script, /Test-Buchung 2 Stunden freigeben/);
  assert.match(script, /statusFilter\.value = 'active'/);
});
