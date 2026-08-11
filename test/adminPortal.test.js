import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin portal is no-store and ships its script without exposing a token', async () => {
  const [appSource, page, script] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/admin-contracts.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/admin-assets/contracts.js', import.meta.url), 'utf8')
  ]);
  assert.match(appSource, /app\.get\('\/admin\/contracts'/);
  assert.match(appSource, /Cache-Control', 'no-store'/);
  assert.match(appSource, /X-Robots-Tag', 'noindex, nofollow, noarchive'/);
  assert.match(page, /ADMIN_API_TOKEN/);
  assert.doesNotMatch(page, /Bearer\s+[A-Za-z0-9_-]{16,}/);
  assert.match(script, /Authorization: `Bearer \$\{adminToken\}`/);
  assert.doesNotMatch(script, /localStorage|sessionStorage/);
});
