import crypto from 'node:crypto';
import express from 'express';
import { env } from '../config/env.js';
import { pool } from '../config/pool.js';
import {
  adminSessionStatus,
  createAdminSessionHandler,
  deleteAdminSessionHandler,
  requireAdminAccess
} from '../middleware/adminAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  requireShopifyCustomer,
  verifyShopifyAppProxy
} from '../middleware/shopifyAppProxy.js';
import {
  activateApplication,
  addContractEvent,
  createContractActionRequest,
  createApplication,
  findApplicationForPublicAction,
  findApplicationByPublicTokenHash,
  findApplicationForAdmin,
  findContractActionByReceiptTokenHash,
  findLatestApplicationByCustomer,
  hasActiveBookingTestAccess,
  listContractActionRequests,
  listApplications,
  requestCancellation
} from '../repositories/contract.repository.js';
import { createMember, findMemberByShopifyId, updateMemberByShopifyId } from '../repositories/member.repository.js';
import { setPremiumCustomerTag } from '../services/shopifyAdmin.service.js';
import {
  adminApplicationNotificationHtml,
  applicationConfirmationHtml,
  contractActionReceiptHtml
} from '../services/contractDocuments.service.js';
import { sendTransactionalHtml } from '../services/mail.service.js';
import { getPackageOffer, SETUP_FEE_CENTS } from '../utils/packageCatalog.js';
import {
  decryptIban,
  encryptIban,
  hashPublicToken,
  maskIban
} from '../utils/sepaCrypto.js';
import { hasHouseNumber, hasRequiredContractConsents } from '../utils/contractConsent.js';

const router = express.Router();
const applicationLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5 });
const contractActionLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5 });
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 8 });

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

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cancellationConfirmationHtml(application) {
  return contractActionReceiptHtml({
    id: application.id,
    action_type: 'cancellation',
    first_name: application.first_name,
    last_name: application.last_name,
    mandate_reference: application.mandate_reference,
    communication_email: application.email,
    cancellation_type: 'ordinary',
    requested_end_on: application.cancellation_effective_on,
    created_at: application.cancellation_requested_at
  });
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
      if (!firstName || !lastName || !isEmail(email) || !addressLine1 || !hasHouseNumber(addressLine1) || !postalCode || !city) {
        return res.status(400).json({ ok: false, error: 'INVALID_CONTACT_DATA' });
      }
      if (!isValidStartDate(startsOn)) {
        return res.status(400).json({ ok: false, error: 'INVALID_START_DATE' });
      }
      if (!Number.isInteger(debitDay) || debitDay < 1 || debitDay > 28) {
        return res.status(400).json({ ok: false, error: 'INVALID_DEBIT_DAY' });
      }
      if (!hasRequiredContractConsents(req.body)) {
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
        contractVersion: env.contractVersion,
        accountHolderConfirmed: true,
        age18Confirmed: true
      });

      const confirmation = applicationConfirmationHtml(application);
      sendTransactionalHtml({
        to: application.email,
        subject: `Ihre PDB PREMIUM Bestellung ist eingegangen · ${application.mandate_reference}`,
        html: confirmation
      })
        .then((mailDelivery) => addContractEvent(id, 'application_confirmation_delivery', 'system', {
          emailSent: mailDelivery.sent,
          reason: mailDelivery.reason || null
        }))
        .catch((mailError) => {
          console.error('Contract application confirmation email failed:', mailError.message);
          return addContractEvent(id, 'application_confirmation_delivery', 'system', {
            emailSent: false,
            reason: 'DELIVERY_FAILED'
          }).catch((eventError) => console.error('Contract mail event failed:', eventError.message));
        });

      if (env.contractAdminEmail) {
        sendTransactionalHtml({
          to: env.contractAdminEmail,
          subject: `Neuer PREMIUM-Antrag · ${application.package_key.toUpperCase()} · ${application.mandate_reference}`,
          html: adminApplicationNotificationHtml(application)
        })
          .then((mailDelivery) => addContractEvent(id, 'admin_application_notification', 'system', {
            emailSent: mailDelivery.sent,
            reason: mailDelivery.reason || null
          }))
          .catch((mailError) => {
            console.error('Contract admin notification failed:', mailError.message);
            return addContractEvent(id, 'admin_application_notification', 'system', {
              emailSent: false,
              reason: 'DELIVERY_FAILED'
            }).catch((eventError) => console.error('Contract admin mail event failed:', eventError.message));
          });
      }

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
        confirmation_url: `/apps/pdb/contracts/confirmation?token=${encodeURIComponent(publicToken)}`,
        confirmation_email_sent: false,
        confirmation_email_queued: true
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
  return res.type('html').send(applicationConfirmationHtml(application));
});

router.get('/confirmation-latest', verifyShopifyAppProxy, requireShopifyCustomer, async (req, res) => {
  const application = await findLatestApplicationByCustomer(req.shopifyProxy.customerId);
  if (!application) return res.status(404).send('Bestätigung nicht gefunden.');
  const prefix = application.status === 'active' ? 'PDB-Vertragsbestaetigung' : 'PDB-Eingangsbestaetigung';
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Disposition', `attachment; filename="${prefix}-${application.mandate_reference}.html"`);
  return res.type('html').send(applicationConfirmationHtml(application));
});

router.post('/action', verifyShopifyAppProxy, contractActionLimiter, async (req, res) => {
  try {
    const actionType = req.body?.action_type === 'withdrawal' ? 'withdrawal' : req.body?.action_type === 'cancellation' ? 'cancellation' : '';
    const firstName = cleanText(req.body?.first_name, 80);
    const lastName = cleanText(req.body?.last_name, 80);
    const email = cleanText(req.body?.email, 160).toLowerCase();
    const communicationEmail = cleanText(req.body?.communication_email || email, 160).toLowerCase();
    const mandateReference = cleanText(req.body?.mandate_reference, 80).toUpperCase();
    const cancellationType = actionType === 'cancellation'
      ? (req.body?.cancellation_type === 'extraordinary' ? 'extraordinary' : 'ordinary')
      : null;
    const cancellationReason = cancellationType === 'extraordinary'
      ? cleanText(req.body?.cancellation_reason, 500)
      : null;
    const requestedEndOn = cleanText(req.body?.requested_end_on, 10) || null;

    if (!actionType || !firstName || !lastName || !isEmail(email) || !isEmail(communicationEmail)) {
      return res.status(400).json({ ok: false, error: 'INVALID_ACTION_DATA' });
    }
    if (cancellationType === 'extraordinary' && !cancellationReason) {
      return res.status(400).json({ ok: false, error: 'CANCELLATION_REASON_REQUIRED' });
    }
    if (requestedEndOn && !isValidIsoDate(requestedEndOn)) {
      return res.status(400).json({ ok: false, error: 'INVALID_END_DATE' });
    }

    const application = mandateReference
      ? await findApplicationForPublicAction({ mandateReference, email, firstName, lastName })
      : null;
    const receiptToken = crypto.randomBytes(32).toString('base64url');
    const action = await createContractActionRequest({
      id: crypto.randomUUID(),
      actionType,
      firstName,
      lastName,
      email,
      mandateReference,
      communicationEmail,
      cancellationType,
      cancellationReason,
      requestedEndOn,
      matchedApplicationId: application?.id || null,
      receiptTokenHash: hashPublicToken(receiptToken),
      metadata: { shop: req.shopifyProxy.shop || null }
    });
    if (application) {
      await addContractEvent(application.id, `${actionType}_received`, 'customer', {
        actionRequestId: action.id,
        cancellationType,
        requestedEndOn
      });
    }

    const receipt = contractActionReceiptHtml(action);
    let mailDelivery = { sent: false, reason: 'DELIVERY_FAILED' };
    try {
      mailDelivery = await sendTransactionalHtml({
        to: communicationEmail,
        subject: actionType === 'withdrawal' ? 'Eingangsbestätigung Ihres Widerrufs' : 'Eingangsbestätigung Ihrer Kündigung',
        html: receipt
      });
    } catch (mailError) {
      console.error('Contract action confirmation email failed:', mailError.message);
    }

    res.set('Cache-Control', 'no-store');
    return res.status(201).json({
      ok: true,
      request: {
        id: action.id,
        action_type: action.action_type,
        received_at: action.created_at,
        status: action.status
      },
      receipt_url: `/apps/pdb/contracts/action-confirmation?token=${encodeURIComponent(receiptToken)}`,
      confirmation_email_sent: mailDelivery.sent
    });
  } catch (error) {
    console.error('POST /api/contracts/action failed:', error.message);
    return res.status(500).json({ ok: false, error: 'CONTRACT_ACTION_FAILED' });
  }
});

router.get('/action-confirmation', verifyShopifyAppProxy, async (req, res) => {
  const action = await findContractActionByReceiptTokenHash(hashPublicToken(String(req.query.token || '')));
  if (!action) return res.status(404).send('Eingangsbestätigung nicht gefunden.');
  const filename = action.action_type === 'withdrawal' ? 'PDB-Widerruf' : 'PDB-Kuendigung';
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Disposition', `attachment; filename="${filename}-${action.id}.html"`);
  return res.type('html').send(contractActionReceiptHtml(action));
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
  const confirmationDocument = cancellationConfirmationHtml(application);
  let mailDelivery = { sent: false, reason: 'DELIVERY_FAILED' };
  try {
    mailDelivery = await sendTransactionalHtml({
      to: application.email,
      subject: 'Eingangsbestätigung Ihrer Kündigung',
      html: confirmationDocument
    });
  } catch (mailError) {
    console.error('Member cancellation confirmation email failed:', mailError.message);
  }
  res.set('Cache-Control', 'no-store');
  return res.json({
    ok: true,
    application,
    confirmation: {
      received_at: application.cancellation_requested_at,
      effective_on: application.cancellation_effective_on,
      instruction: 'SEPA-Einzug bei Naspa zum Vertragsende beenden'
    },
    confirmation_url: `/apps/pdb/contracts/cancellation-confirmation?id=${encodeURIComponent(application.id)}`,
    confirmation_email_sent: mailDelivery.sent
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

router.get('/admin/session', adminSessionStatus);
router.post('/admin/session', adminLoginLimiter, createAdminSessionHandler);
router.delete('/admin/session', deleteAdminSessionHandler);

router.get('/admin', requireAdminAccess, async (req, res) => {
  const applications = await listApplications({ status: req.query.status, limit: req.query.limit });
  return res.json({ ok: true, applications: applications.map((item) => ({ ...item, masked_iban: maskIban(item.iban_last4) })) });
});

router.get('/admin-actions', requireAdminAccess, async (req, res) => {
  const actions = await listContractActionRequests({ status: req.query.status, limit: req.query.limit });
  return res.json({ ok: true, actions });
});

router.get('/admin/:id/sepa', requireAdminAccess, async (req, res) => {
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

router.post('/admin/:id/activate', requireAdminAccess, async (req, res) => {
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
    const confirmation = applicationConfirmationHtml(activated);
    let mailDelivery = { sent: false, reason: 'DELIVERY_FAILED' };
    try {
      mailDelivery = await sendTransactionalHtml({
        to: activated.email,
        subject: `Ihre PDB PREMIUM Mitgliedschaft ist bestätigt · ${activated.mandate_reference}`,
        html: confirmation
      });
      await addContractEvent(application.id, 'acceptance_confirmation_delivery', 'system', {
        emailSent: mailDelivery.sent,
        reason: mailDelivery.reason || null
      });
    } catch (mailError) {
      console.error('Contract acceptance confirmation email failed:', mailError.message);
      await addContractEvent(application.id, 'acceptance_confirmation_delivery', 'system', {
        emailSent: false,
        reason: 'DELIVERY_FAILED'
      });
    }
    return res.json({
      ok: true,
      application: activated,
      member_id: member.id,
      confirmation_email_sent: mailDelivery.sent,
      customer_confirmation_url: '/apps/pdb/contracts/confirmation-latest'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST /api/contracts/admin/:id/activate failed:', error.message);
    return res.status(500).json({ ok: false, error: 'ACTIVATION_FAILED' });
  } finally {
    client.release();
  }
});

router.post('/admin/:id/resend-confirmation', requireAdminAccess, async (req, res) => {
  const application = await findApplicationForAdmin(req.params.id);
  if (!application) return res.status(404).json({ ok: false, error: 'APPLICATION_NOT_FOUND' });
  if (application.status !== 'active') {
    return res.status(409).json({ ok: false, error: 'APPLICATION_NOT_ACTIVE' });
  }

  try {
    const mailDelivery = await sendTransactionalHtml({
      to: application.email,
      subject: `Ihre PDB PREMIUM Mitgliedschaft ist bestätigt · ${application.mandate_reference}`,
      html: applicationConfirmationHtml(application)
    });
    await addContractEvent(application.id, 'acceptance_confirmation_resent', 'admin', {
      emailSent: mailDelivery.sent,
      reason: mailDelivery.reason || null
    });
    if (!mailDelivery.sent) {
      return res.status(503).json({ ok: false, error: 'CONFIRMATION_EMAIL_NOT_SENT' });
    }
    return res.json({ ok: true, confirmation_email_sent: true });
  } catch (error) {
    console.error('Contract confirmation resend failed:', error.message);
    try {
      await addContractEvent(application.id, 'acceptance_confirmation_resent', 'admin', {
        emailSent: false,
        reason: 'DELIVERY_FAILED'
      });
    } catch (eventError) {
      console.error('Contract confirmation failure event could not be stored:', eventError.message);
    }
    return res.status(502).json({ ok: false, error: 'CONFIRMATION_EMAIL_NOT_SENT' });
  }
});

router.post('/admin/:id/test-booking-access', requireAdminAccess, async (req, res) => {
  try {
    const application = await findApplicationForAdmin(req.params.id);
    if (!application) return res.status(404).json({ ok: false, error: 'APPLICATION_NOT_FOUND' });
    if (application.status !== 'active') {
      return res.status(409).json({ ok: false, error: 'APPLICATION_NOT_ACTIVE' });
    }

    const expiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    await addContractEvent(application.id, 'booking_test_access_granted', 'admin', {
      expiresAt,
      purpose: 'live_system_test'
    });
    const active = await hasActiveBookingTestAccess(application.id);
    return res.json({ ok: true, active, expires_at: expiresAt });
  } catch (error) {
    console.error('POST /api/contracts/admin/:id/test-booking-access failed:', error.message);
    return res.status(500).json({ ok: false, error: 'TEST_BOOKING_ACCESS_FAILED' });
  }
});

export default router;
