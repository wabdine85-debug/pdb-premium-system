import express from 'express';
import { pool } from '../config/pool.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  findAdminMemberById,
  listAdminMemberBookings,
  listAdminMemberEvents,
  listAdminMembers,
  listAdminTreatmentsForPackage
} from '../repositories/adminMember.repository.js';
import {
  AdminUsageError,
  cancelManualUsage,
  getFollowingAdminBookingMonth,
  normalizeAdminBookingMonth,
  recordManualUsage
} from '../services/adminUsage.service.js';
import { getEntitlementsForMonth } from '../services/entitlement.service.js';
import { getBookingMonth } from '../utils/dates.js';
import {
  applyBeyondUsagePlan,
  getBeyondReconciliation,
  MemberReconciliationError
} from '../services/memberReconciliation.service.js';

const router = express.Router();
const adminWriteLimiter = rateLimit({ windowMs: 60_000, max: 30 });

router.use(requireAdminToken);

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sendAdminError(res, error, operation) {
  if (error instanceof AdminUsageError || error instanceof MemberReconciliationError) {
    return res.status(error.status).json({ ok: false, error: error.code });
  }
  console.error(`${operation} failed:`, error.message);
  return res.status(500).json({ ok: false, error: 'INTERNAL_SERVER_ERROR' });
}

async function inTransaction(operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

router.get('/members', async (req, res) => {
  try {
    const members = await listAdminMembers({
      query: req.query.q,
      status: req.query.status,
      limit: req.query.limit
    });
    return res.json({ ok: true, members });
  } catch (error) {
    return sendAdminError(res, error, 'GET /api/admin/members');
  }
});

router.get('/reconciliation/beyond', async (_req, res) => {
  try {
    const reconciliation = await getBeyondReconciliation();
    return res.json({ ok: true, ...reconciliation });
  } catch (error) {
    return sendAdminError(res, error, 'GET /api/admin/reconciliation/beyond');
  }
});

router.post('/reconciliation/beyond/apply-month', adminWriteLimiter, async (req, res) => {
  try {
    const availableCrmMemberIds = Array.isArray(req.body?.available_crm_member_ids)
      ? req.body.available_crm_member_ids.slice(0, 100)
      : [];
    const reconciliation = await getBeyondReconciliation();
    const result = await inTransaction((client) => applyBeyondUsagePlan({
      reconciliation,
      availableCrmMemberIds,
      actor: 'admin'
    }, client));
    return res.json({ ok: true, ...result });
  } catch (error) {
    return sendAdminError(res, error, 'POST /api/admin/reconciliation/beyond/apply-month');
  }
});

router.get('/members/:id', async (req, res) => {
  try {
    const memberId = parsePositiveId(req.params.id);
    if (!memberId) return res.status(400).json({ ok: false, error: 'MEMBER_ID_INVALID' });

    const member = await findAdminMemberById(memberId);
    if (!member) return res.status(404).json({ ok: false, error: 'MEMBER_NOT_FOUND' });

    const requestedMonth = req.query.month
      ? normalizeAdminBookingMonth(req.query.month)
      : getBookingMonth();
    if (!requestedMonth) {
      return res.status(400).json({ ok: false, error: 'BOOKING_MONTH_INVALID' });
    }

    const months = [requestedMonth, getFollowingAdminBookingMonth(requestedMonth)];
    const [entitlements, bookings, treatments, events] = await Promise.all([
      Promise.all(months.map((month) => getEntitlementsForMonth(member, month))),
      listAdminMemberBookings(member.id, months),
      listAdminTreatmentsForPackage(member.package_key),
      listAdminMemberEvents(member.id)
    ]);

    return res.json({ ok: true, member, months: entitlements, bookings, treatments, events });
  } catch (error) {
    return sendAdminError(res, error, 'GET /api/admin/members/:id');
  }
});

router.post('/members/:id/manual-usage', adminWriteLimiter, async (req, res) => {
  try {
    const result = await inTransaction((client) =>
      recordManualUsage(req.params.id, req.body, client)
    );
    return res.status(201).json({ ok: true, ...result });
  } catch (error) {
    return sendAdminError(res, error, 'POST /api/admin/members/:id/manual-usage');
  }
});

router.post('/bookings/:id/cancel-manual', adminWriteLimiter, async (req, res) => {
  try {
    const result = await inTransaction((client) =>
      cancelManualUsage(req.params.id, req.body, client)
    );
    return res.json({ ok: true, ...result });
  } catch (error) {
    return sendAdminError(res, error, 'POST /api/admin/bookings/:id/cancel-manual');
  }
});

export default router;
