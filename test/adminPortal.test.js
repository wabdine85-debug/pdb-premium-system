import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin portal uses a password session without exposing credentials', async () => {
  const [appSource, page, script, styles, officeMemberships, premiumTheme, productTheme] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/admin-contracts.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/admin-assets/contracts.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/admin-assets/contracts.css', import.meta.url), 'utf8'),
    readFile(new URL('../pdb-office/components/memberships/PremiumAdministration.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../shopify-theme-premium-dummy-clean/sections/pdb-premium-membership.liquid', import.meta.url), 'utf8'),
    readFile(new URL('../shopify-theme-premium-dummy-clean/sections/main-product.liquid', import.meta.url), 'utf8')
  ]);
  assert.match(appSource, /app\.get\('\/admin\/contracts'/);
  assert.match(appSource, /Cache-Control', 'no-store'/);
  assert.match(appSource, /X-Robots-Tag', 'noindex, nofollow, noarchive'/);
  assert.match(page, /Admin-Passwort/);
  assert.match(page, /name="username"[^>]+autocomplete="username"/);
  assert.match(page, /name="password"[^>]+autocomplete="current-password"/);
  const loginForm = page.match(/<form id="login-form"[\s\S]*?<\/form>/)?.[0] || '';
  assert.doesNotMatch(loginForm, /admin-token|ADMIN_API_TOKEN/);
  assert.match(page, /<form id="recovery-form"/);
  assert.match(page, /ADMIN_API_TOKEN/);
  assert.doesNotMatch(page, /Bearer\s+[A-Za-z0-9_-]{16,}/);
  assert.match(script, /credentials: 'same-origin'/);
  assert.match(script, /window\.location\.replace\('\/admin\/contracts'\)/);
  assert.doesNotMatch(script, /passwordInput\.value = ''/);
  assert.match(script, /Authorization: `Bearer \$\{recoveryToken\}`/);
  assert.match(script, /X-PDB-Admin/);
  assert.doesNotMatch(script, /localStorage|sessionStorage/);
  assert.match(styles, /\[hidden\]\{display:none!important\}/);
  assert.match(page, /admin-action-dialog/);
  assert.match(script, /Vertragsbestätigung erneut senden/);
  assert.match(script, /Interne Vertragsübersicht senden/);
  assert.match(script, /Test-Buchung 2 Stunden freigeben/);
  assert.match(script, /statusFilter\.value = 'active'/);
  assert.match(script, /Vorzeitiger Leistungsbeginn/);
  assert.match(script, /application\.early_start_requested_at/);
  assert.match(script, /Buchungszugang sofort nach Annahme/);
  assert.match(script, /application\.treatment_available_at/);
  assert.match(officeMemberships, /Vorzeitiger Leistungsbeginn:/);
  assert.match(officeMemberships, /contract\.early_start_requested_at/);
  assert.match(officeMemberships, /Behandlung ab/);
  assert.match(premiumTheme, /\/apps\/pdb\/contracts\/early-start/);
  assert.match(premiumTheme, /confirm_wertersatz/);
  assert.match(productTheme, /TREATMENT_DATE_TOO_EARLY/);
});
