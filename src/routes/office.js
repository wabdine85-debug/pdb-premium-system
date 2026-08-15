import express from 'express';
import { pool } from '../config/pool.js';
import { requireAdminAccess, requireAdminSession } from '../middleware/adminAuth.js';
import { sendTransactionalHtml } from '../services/mail.service.js';
import { classifyStorageWrite, getStorageRevision } from '../../pdb-office/services/storageRevision.js';

const router = express.Router();
const jsonParser = express.json({ limit: '8mb' });
const pdfParser = express.urlencoded({ extended: false, limit: '18mb' });

function noStore(res) {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getDocument(documentKey, db = pool) {
  const result = await db.query(
    `SELECT payload, revision, updated_at
     FROM pdb_office.documents
     WHERE document_key = $1`,
    [documentKey]
  );
  return result.rows[0] || null;
}

router.get('/crm-data', requireAdminAccess, async (_req, res) => {
  const document = await getDocument('crm');
  noStore(res);
  if (!document) return res.status(503).json({ ok: false, error: 'CRM_NOT_INITIALIZED' });
  return res.json(document.payload);
});

router.post('/crm-data', requireAdminAccess, jsonParser, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT payload, revision
       FROM pdb_office.documents
       WHERE document_key = 'crm'
       FOR UPDATE`
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(503).json({ ok: false, error: 'CRM_NOT_INITIALIZED' });
    }

    const writeStatus = classifyStorageWrite(req.body, current.payload);
    if (writeStatus === 'duplicate') {
      await client.query('COMMIT');
      noStore(res);
      return res.json({ ok: true, duplicate: true });
    }
    if (writeStatus === 'stale' || writeStatus === 'conflict') {
      await client.query('ROLLBACK');
      noStore(res);
      return res.status(409).json({
        ok: false,
        error: writeStatus === 'stale' ? 'STALE_DATA' : 'REVISION_CONFLICT',
        currentRevision: current.revision
      });
    }

    await client.query(
      `UPDATE pdb_office.documents
       SET payload = $1::jsonb, revision = $2, updated_at = NOW()
       WHERE document_key = 'crm'`,
      [JSON.stringify(req.body), getStorageRevision(req.body)]
    );
    await client.query('COMMIT');
    noStore(res);
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PDB Office CRM save failed:', error.message);
    return res.status(500).json({ ok: false, error: 'CRM_SAVE_FAILED' });
  } finally {
    client.release();
  }
});

router.get('/member-finance', requireAdminAccess, async (_req, res) => {
  const document = await getDocument('member_finance');
  noStore(res);
  if (!document) return res.status(503).json({ ok: false, error: 'MEMBER_FINANCE_NOT_INITIALIZED' });
  return res.json(document.payload);
});

router.post('/invoice-pdf', requireAdminSession, pdfParser, (req, res) => {
  const requestedName = String(req.body?.filename || 'Rechnung.pdf');
  const fileName = requestedName
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'Rechnung.pdf';
  const encodedPdf = String(req.body?.pdf || '');
  if (!encodedPdf || !/^[A-Za-z0-9+/=]+$/.test(encodedPdf)) {
    return res.status(400).json({ ok: false, error: 'INVALID_PDF' });
  }
  const pdf = Buffer.from(encodedPdf, 'base64');
  if (pdf.length < 4 || pdf.subarray(0, 4).toString('ascii') !== '%PDF') {
    return res.status(400).json({ ok: false, error: 'INVALID_PDF' });
  }
  noStore(res);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`}"`);
  res.set('Content-Length', String(pdf.length));
  return res.send(pdf);
});

router.post('/send-cancellation-email', requireAdminAccess, jsonParser, async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const memberName = String(req.body?.memberName || '').trim().slice(0, 160);
  const note = String(req.body?.note || '').trim().slice(0, 1_000);
  const endDate = String(req.body?.endDate || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ ok: false, error: 'RECIPIENT_INVALID' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return res.status(400).json({ ok: false, error: 'END_DATE_INVALID' });

  const formattedDate = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin' })
    .format(new Date(`${endDate}T12:00:00+02:00`));
  const text = [
    memberName ? `Hallo ${memberName},` : 'Hallo,',
    '',
    `hiermit bestätigen wir deine Kündigung deiner PDB Membership zum ${formattedDate}.`,
    '',
    'Ab diesem Datum endet dein Membership-Status. Bis dahin bleibt deine Membership wie vereinbart aktiv.',
    note ? `Hinweis: ${note}` : '',
    '',
    'Vielen Dank für dein Vertrauen.',
    '',
    'Liebe Grüße',
    'PDB Aesthetic Room'
  ].filter(Boolean).join('\n');
  const html = `<p>${memberName ? `Hallo ${escapeHtml(memberName)},` : 'Hallo,'}</p><p>Hiermit bestätigen wir deine Kündigung deiner PDB Membership zum <strong>${escapeHtml(formattedDate)}</strong>.</p><p>Ab diesem Datum endet dein Membership-Status. Bis dahin bleibt deine Membership wie vereinbart aktiv.</p>${note ? `<p>Hinweis: ${escapeHtml(note)}</p>` : ''}<p>Vielen Dank für dein Vertrauen.</p><p>Liebe Grüße<br>PDB Aesthetic Room</p>`;
  const delivery = await sendTransactionalHtml({
    to: email,
    subject: 'Bestätigung deiner Kündigung – PDB Aesthetic Room',
    html,
    text
  });
  if (!delivery.sent) return res.status(503).json({ ok: false, error: delivery.reason });
  noStore(res);
  return res.json({ ok: true, sentAt: new Date().toISOString() });
});

router.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'REQUEST_TOO_LARGE' });
  if (error instanceof SyntaxError) return res.status(400).json({ ok: false, error: 'INVALID_BODY' });
  console.error('PDB Office route failed:', error.message);
  return res.status(500).json({ ok: false, error: 'OFFICE_REQUEST_FAILED' });
});

export default router;
