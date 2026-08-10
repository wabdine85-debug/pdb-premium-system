import crypto from 'node:crypto';
import express from 'express';
import { env } from '../config/env.js';
import { pool } from '../config/pool.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  requireShopifyCustomer,
  verifyShopifyAppProxy
} from '../middleware/shopifyAppProxy.js';
import {
  activateApplication,
  addContractEvent,
  createApplication,
  findApplicationByPublicTokenHash,
  findApplicationForAdmin,
  findLatestApplicationByCustomer,
  listApplications,
  requestCancellation
} from '../repositories/contract.repository.js';
import { createMember, findMemberByShopifyId, updateMemberByShopifyId } from '../repositories/member.repository.js';
import { setPremiumCustomerTag } from '../services/shopifyAdmin.service.js';
import { getPackageOffer, SETUP_FEE_CENTS } from '../utils/packageCatalog.js';
import {
  decryptIban,
  encryptIban,
  hashPublicToken,
  maskIban
} from '../utils/sepaCrypto.js';

const router = express.Router();
const applicationLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5 });

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidStartDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== 1) return false;
  const today = new Date();
  const earliest = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const latest = earliest + 180 * 24 * 60 * 60 * 1000;
  return date.getTime() >= earliest && date.getTime() <= latest;
}

function money(cents) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function confirmationHtml(application) {
  const offer = getPackageOffer(application.package_key);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Vertragsbestätigung ${escapeHtml(application.mandate_reference)}</title><style>body{font:16px/1.55 Arial,sans-serif;color:#171717;max-width:760px;margin:40px auto;padding:0 24px}h1,h2{line-height:1.15}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:10px;border-bottom:1px solid #ddd}td:first-child{font-weight:700;width:42%}.note{background:#f7f2ed;padding:18px;border-radius:12px}@media print{body{margin:0}.note{border:1px solid #ddd}}</style></head><body><h1>Bestätigung Ihrer Premium-Mitgliedschaft</h1><p>Ihr Antrag ist bei PDB – AESTHETIC ROOM eingegangen. Die Mitgliedschaft wird aktiviert, sobald das SEPA-Mandat im Naspa-Onlinebanking eingerichtet wurde.</p><table><tr><td>Name</td><td>${escapeHtml(application.first_name)} ${escapeHtml(application.last_name)}</td></tr><tr><td>Paket</td><td>${escapeHtml(offer?.name)}</td></tr><tr><td>Monatsbeitrag</td><td>${money(application.monthly_price_cents)}</td></tr><tr><td>Einrichtungsgebühr</td><td>${money(application.setup_fee_cents)}</td></tr><tr><td>Gesamtkosten Mindestlaufzeit</td><td>${money(application.minimum_total_cents)}</td></tr><tr><td>Vertragsbeginn</td><td>${escapeHtml(application.starts_on)}</td></tr><tr><td>Laufzeit</td><td>12 Monate, danach unbefristet; Kündigungsfrist 1 Monat</td></tr><tr><td>SEPA-Mandat</td><td>${escapeHtml(application.mandate_reference)} · ${escapeHtml(maskIban(application.iban_last4))}</td></tr><tr><td>Status</td><td>SEPA-Einrichtung ausstehend</td></tr></table><div class="note"><strong>Widerruf:</strong> Sie können den online geschlossenen Vertrag grundsätzlich innerhalb von 14 Tagen widerrufen. Verwenden Sie hierfür info@palaisdebeaute.de oder das bereitgestellte Widerrufsformular.</div><p>PDB – AESTHETIC ROOM · Rheinstraße 59 · 65185 Wiesbaden · info@palaisdebeaute.de</p></body></html>`;
}

function cancellationConfirmationHtml(application) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kündigungsbestätigung</title><style>body{font:16px/1.55 Arial,sans-serif;color:#171717;max-width:720px;margin:40px auto;padding:0 24px}h1{line-height:1.15}.box{padding:18px;border:1px solid #ddd;border-radius:12px;background:#f8f4ef}</style></head><body><h1>Bestätigung Ihrer Kündigungserklärung</h1><div class="box"><p><strong>Vertrag:</strong> ${escapeHtml(application.mandate_reference)}</p><p><strong>Eingang:</strong> ${escapeHtml(application.cancellation_requested_at)}</p><p><strong>Vorgesehenes Vertragsende:</strong> ${escapeHtml(application.cancellation_effective_on)}</p></div><p>Wir prüfen die Erklärung unverzüglich. Bitte beachten Sie: Der zugehörige SEPA-Einzug wird bei der Naspa zum wirksamen Vertragsende beendet.</p><p>PDB – AESTHETIC ROOM · Rheinstraße 59 · 65185 Wiesbaden · info@palaisdebeaute.de</p></body></html>`;
}

router.post(
  '/apply',
  verifyShopifyAppProxy,
  requireShopifyCustomer,
  applicationLimiter,
  async (req, res) => {
    try {
      const packageKey = cleanText(req.body.package_key, 20).toLowerCase();
      const offer = getPackageOffer(packageKey);
      const firstName = cleanText(req.body.first_name, 80);
      const lastName = cleanText(req.body.last_name, 80);
      const email = cleanText(req.body.email, 160).toLowerCase();
      const addressLine1 = cleanText(req.body.address_line1, 180);
      const postalCode = cleanText(req.body.postal_code, 12);
      const city = cleanText(req.body.city, 100);
      const startsOn = cleanText(req.body.starts_on, 10);
      const debitDay = Number(req.body.debit_day);

      if (!offer) return res.status(400).json({ ok: false, error: 'INVALID_PACKAGE' });
      if (!firstName || !lastName || !isEmail(email) || !addressLine1 || !postalCode || !city) {
        return res.status(400).json({ ok: false, error: 'INVALID_CONTACT_DATA' });
      }
      if (!isValidStartDate(startsOn)) {
        return res.status(400).json({ ok: false, error: 'INVALID_START_DATE' });
      }
      if (!Number.isInteger(debitDay) || debitDay < 1 || debitDay > 28) {
        return res.status(400).json({ ok: false, error: 'INVALID_DEBIT_DAY' });
      }
      if (req.body.accept_agb !== true || req.body.accept_withdrawal !== true || req.body.accept_sepa !== true) {
        return res.status(400).json({ ok: false, error: 'REQUIRED_CONSENT_MISSING' });
      }

      const encryptedIban = encryptIban(req.body.iban, env.contractEncryptionKey);
      const id = crypto.randomUUID();
      const publicToken = crypto.randomBytes(32).toString('base64url');
      const mandateReference = `PDB-${new Date().getUTCFullYear()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const acceptedAt = new Date();
      const application = await createApplication({
        id,
        shopifyCustomerId: req.shopifyProxy.customerId,
        shopDomain: req.shopifyProxy.shop,
        email,
        firstName,
        lastName,
        addressLine1,
        postalCode,
        city,
        packageKey,
        monthlyPriceCents: offer.monthlyPriceCents,
        setupFeeCents: SETUP_FEE_CENTS,
        minimumTotalCents: offer.minimumTotalCents,
        startsOn,
        debitDay,
        mandateReference,
        ibanCiphertext: encryptedIban.ciphertext,
        ibanIv: encryptedIban.iv,
        ibanAuthTag: encryptedIban.authTag,
        ibanLast4: encryptedIban.last4,
        contractVersion: env.contractVersion,
        acceptedAt,
        earlyStartRequestedAt: req.body.request_early_start === true ? acceptedAt : null,
        publicTokenHash: hashPublicToken(publicToken)
      });
      await addContractEvent(id, 'application_submitted', 'customer', {
        packageKey,
        contractVersion: env.contractVersion
      });

      res.set('Cache-Control', 'no-store');
      return res.status(201).json({
        ok: true,
        application: {
          id: application.id,
          status: application.status,
          mandate_reference: application.mandate_reference,
          package_key: application.package_key,
          masked_iban: maskIban(application.iban_last4)
        },
        public_token: publicToken,
        confirmation_url: `/apps/pdb/contracts/confirmation?token=${encodeURIComponent(publicToken)}`
      });
    } catch (error) {
      if (error.message === 'INVALID_IBAN') {
        return res.status(400).json({ ok: false, error: 'INVALID_IBAN' });
      }
      console.error('POST /api/contracts/apply failed:', error.message);
      return res.status(500).json({ ok: false, error: 'CONTRACT_SUBMISSION_FAILED' });
    }
  }
);

router.get('/status', verifyShopifyAppProxy, requireShopifyCustomer, async (req, res) => {
  const token = String(req.query.token || '');
  const application = await findApplicationByPublicTokenHash(
    hashPublicToken(token),
    req.shopifyProxy.customerId
  );
  if (!application) return res.status(404).json({ ok: false, error: 'APPLICATION_NOT_FOUND' });
  res.set('Cache-Control', 'private, no-store');
  return res.json({ ok: true, application: { ...application, masked_iban: maskIban(application.iban_last4) } });
});

router.get('/mine', verifyShopifyAppProxy, requireShopifyCustomer, async (req, res) => {
  const application = await findLatestApplicationByCustomer(req.shopifyProxy.customerId);
  res.set('Cache-Control', 'private, no-store');
  if (!application) return res.json({ ok: true, application: null });
  return res.json({
    ok: true,
    application: { ...application, masked_iban: maskIban(application.iban_last4) }
  });
});

router.get('/confirmation', verifyShopifyAppProxy, requireShopifyCustomer, async (req, res) => {
  const application = await findApplicationByPublicTokenHash(
    hashPublicToken(String(req.query.token || '')),
    req.shopifyProxy.customerId
  );
  if (!application) return res.status(404).send('Vertragsbestätigung nicht gefunden.');
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Disposition', `attachment; filename="PDB-Vertragsbestaetigung-${application.mandate_reference}.html"`);
  return res.type('html').send(confirmationHtml(application));
});

router.post('/cancel', verifyShopifyAppProxy, requireShopifyCustomer, async (req, res) => {
  const id = String(req.body?.application_id || '');
  const cancellationType = req.body?.cancellation_type === 'extraordinary' ? 'extraordinary' : 'ordinary';
  const reason = cleanText(req.body?.reason, 500);
  if (cancellationType === 'extraordinary' && !reason) {
    return res.status(400).json({ ok: false, error: 'CANCELLATION_REASON_REQUIRED' });
  }
  const application = await requestCancellation(id, req.shopifyProxy.customerId);
  if (!application) return res.status(404).json({ ok: false, error: 'ACTIVE_CONTRACT_NOT_FOUND' });
  await addContractEvent(id, 'cancellation_requested', 'customer', { cancellationType, reason });
  res.set('Cache-Control', 'no-store');
  return res.json({
    ok: true,
    application,
    confirmation: {
      received_at: application.cancellation_requested_at,
      effective_on: application.cancellation_effective_on,
      instruction: 'SEPA-Einzug bei Naspa zum Vertragsende beenden'
    },
    confirmation_url: `/apps/pdb/contracts/cancellation-confirmation?id=${encodeURIComponent(application.id)}`
  });
});

router.get('/cancellation-confirmation', verifyShopifyAppProxy, requireShopifyCustomer, async (req, res) => {
  const application = await findApplicationForAdmin(String(req.query.id || ''));
  if (
    !application ||
    String(application.shopify_customer_id) !== req.shopifyProxy.customerId ||
    application.status !== 'cancel_requested'
  ) {
    return res.status(404).send('Kündigungsbestätigung nicht gefunden.');
  }
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Disposition', `attachment; filename="PDB-Kuendigungsbestaetigung-${application.mandate_reference}.html"`);
  return res.type('html').send(cancellationConfirmationHtml(application));
});

router.get('/admin', requireAdminToken, async (req, res) => {
  const applications = await listApplications({ status: req.query.status, limit: req.query.limit });
  return res.json({ ok: true, applications: applications.map((item) => ({ ...item, masked_iban: maskIban(item.iban_last4) })) });
});

router.get('/admin/:id/sepa', requireAdminToken, async (req, res) => {
  const application = await findApplicationForAdmin(req.params.id);
  if (!application) return res.status(404).json({ ok: false, error: 'APPLICATION_NOT_FOUND' });
  const iban = decryptIban({
    ciphertext: application.iban_ciphertext,
    iv: application.iban_iv,
    authTag: application.iban_auth_tag
  }, env.contractEncryptionKey);
  await addContractEvent(application.id, 'sepa_data_revealed', 'admin');
  res.set('Cache-Control', 'no-store');
  return res.json({
    ok: true,
    sepa: {
      iban,
      account_holder: `${application.first_name} ${application.last_name}`,
      mandate_reference: application.mandate_reference,
      monthly_price_cents: application.monthly_price_cents,
      setup_fee_cents: application.setup_fee_cents,
      starts_on: application.starts_on,
      debit_day: application.debit_day
    }
  });
});

router.post('/admin/:id/activate', requireAdminToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const application = await findApplicationForAdmin(req.params.id, client);
    if (!application || application.status !== 'sepa_pending') {
      return res.status(409).json({ ok: false, error: 'APPLICATION_NOT_ACTIVATABLE' });
    }

    await setPremiumCustomerTag(application.shopify_customer_id, application.package_key);
    await client.query('BEGIN');
    let member = await findMemberByShopifyId(application.shopify_customer_id, client);
    if (member) {
      member = await updateMemberByShopifyId(application.shopify_customer_id, {
        email: application.email,
        firstName: application.first_name,
        lastName: application.last_name,
        packageKey: application.package_key
      }, client);
      await client.query(`UPDATE members SET status = 'active', started_at = $2, updated_at = NOW() WHERE id = $1`, [member.id, application.starts_on]);
    } else {
      member = await createMember({
        shopifyCustomerId: application.shopify_customer_id,
        email: application.email,
        firstName: application.first_name,
        lastName: application.last_name,
        packageKey: application.package_key
      }, client);
      await client.query(`UPDATE members SET started_at = $2 WHERE id = $1`, [member.id, application.starts_on]);
    }
    const activated = await activateApplication(application.id, member.id, client);
    await addContractEvent(application.id, 'membership_activated', 'admin', { memberId: member.id }, client);
    await client.query('COMMIT');
    return res.json({ ok: true, application: activated, member_id: member.id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST /api/contracts/admin/:id/activate failed:', error.message);
    return res.status(500).json({ ok: false, error: 'ACTIVATION_FAILED' });
  } finally {
    client.release();
  }
});

export default router;
