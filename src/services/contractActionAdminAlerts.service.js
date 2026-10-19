import { pool } from '../config/pool.js';
import { env } from '../config/env.js';
import { adminContractActionNotificationHtml } from './contractDocuments.service.js';
import { sendTransactionalHtml } from './mail.service.js';

const UNMATCHED_DELAY_MS = 90_000;
const PAIR_WINDOW_MS = 60_000;
const SUMMARY_DELAY_DAYS = 7;
const RETRY_DELAY_MS = 5 * 60_000;

export function isSuspiciousActionPair(action, other) {
  if (!action || !other || action.id === other.id) return false;
  if (action.action_type === other.action_type) return false;
  if (String(action.email || '').trim().toLowerCase() !== String(other.email || '').trim().toLowerCase()) return false;
  if (action.request_metadata?.match_state !== 'unmatched' || other.request_metadata?.match_state !== 'unmatched') return false;
  const gap = Math.abs(new Date(action.created_at).getTime() - new Date(other.created_at).getTime());
  if (!Number.isFinite(gap) || gap > PAIR_WINDOW_MS) return false;
  const firstNameDiffers = String(action.first_name || '').trim().toLowerCase() !== String(other.first_name || '').trim().toLowerCase();
  const lastNameDiffers = String(action.last_name || '').trim().toLowerCase() !== String(other.last_name || '').trim().toLowerCase();
  const referenceDiffers = String(action.mandate_reference || '').trim().toLowerCase() !== String(other.mandate_reference || '').trim().toLowerCase();
  return firstNameDiffers && lastNameDiffers && referenceDiffers;
}

export async function queueUnmatchedContractActionAlert(actionId, db = pool) {
  await db.query(
    `INSERT INTO contract_action_admin_notifications (action_id, due_at)
     VALUES ($1, NOW() + ($2::bigint * INTERVAL '1 millisecond'))
     ON CONFLICT (action_id) DO NOTHING`,
    [actionId, UNMATCHED_DELAY_MS]
  );
}

async function claimDueAlert(db) {
  const result = await db.query(
    `WITH due AS (
       SELECT action_id FROM contract_action_admin_notifications
       WHERE (state = 'pending' AND due_at <= NOW())
          OR (state = 'sending' AND claimed_at < NOW() - INTERVAL '10 minutes')
       ORDER BY due_at LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     UPDATE contract_action_admin_notifications n
     SET state = 'sending', claimed_at = NOW(), updated_at = NOW()
     FROM due, contract_action_requests a
     WHERE n.action_id = due.action_id AND a.id = n.action_id
     RETURNING a.id, a.action_type, a.first_name, a.last_name, a.email,
               a.mandate_reference, a.created_at, a.request_metadata`,
  );
  return result.rows[0] || null;
}

async function findSuspiciousPair(action, db) {
  const result = await db.query(
    `SELECT id, action_type, first_name, last_name, email, mandate_reference,
            created_at, request_metadata
     FROM contract_action_requests
     WHERE id <> $1 AND LOWER(email) = LOWER($2)
       AND action_type <> $3
       AND created_at BETWEEN $4::timestamptz - INTERVAL '60 seconds'
                          AND $4::timestamptz + INTERVAL '60 seconds'
       AND request_metadata->>'match_state' = 'unmatched'
     ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - $4::timestamptz)))
     LIMIT 5`,
    [action.id, action.email, action.action_type, action.created_at]
  );
  return result.rows.some((other) => isSuspiciousActionPair(action, other));
}

async function setAlertState(actionId, state, db, retry = false) {
  await db.query(
    `UPDATE contract_action_admin_notifications
     SET state = $2, claimed_at = NULL,
         due_at = CASE WHEN $3::boolean THEN NOW() + ($4::bigint * INTERVAL '1 millisecond') ELSE due_at END,
         updated_at = NOW()
     WHERE action_id = $1 AND state = 'sending'`,
    [actionId, state, retry, RETRY_DELAY_MS]
  );
}

async function sendAdminAlert(actionType) {
  if (!env.contractAdminEmail) throw new Error('ADMIN_EMAIL_NOT_CONFIGURED');
  const delivery = await sendTransactionalHtml({
    to: env.contractAdminEmail,
    subject: actionType === 'withdrawal' ? 'Widerruf eingegangen' : 'Kündigung eingegangen',
    html: adminContractActionNotificationHtml(actionType)
  });
  if (!delivery.sent) throw new Error(delivery.reason || 'DELIVERY_FAILED');
}

async function sendSuspiciousSummary(db) {
  const result = await db.query(
    `WITH due AS (
       SELECT EXISTS (
         SELECT 1 FROM contract_action_admin_notifications
         WHERE (state = 'batched' AND due_at <= NOW() - ($1::integer * INTERVAL '1 day'))
            OR (state = 'reporting' AND claimed_at < NOW() - INTERVAL '10 minutes')
       ) AS ready
     )
     UPDATE contract_action_admin_notifications n
     SET state = 'reporting', claimed_at = NOW(), updated_at = NOW()
     WHERE (n.state = 'batched' OR (n.state = 'reporting' AND n.claimed_at < NOW() - INTERVAL '10 minutes'))
       AND (SELECT ready FROM due)
     RETURNING n.action_id`,
    [SUMMARY_DELAY_DAYS]
  );
  if (!result.rows.length) return;
  const ids = result.rows.map((row) => row.action_id);
  try {
    if (!env.contractAdminEmail) throw new Error('ADMIN_EMAIL_NOT_CONFIGURED');
    const delivery = await sendTransactionalHtml({
      to: env.contractAdminEmail,
      subject: 'Auffällige Vertrags-Eingänge · Zusammenfassung',
      html: `<p>${ids.length} Kündigungs- oder Widerrufseingänge wurden wegen eines auffälligen Paarmusters gebündelt. Alle Erklärungen sind weiterhin gespeichert und müssen im <a href="https://pdb-premium-system.onrender.com/admin/contracts">Vertrags-Admin</a> geprüft werden.</p>`,
      text: `${ids.length} Kündigungs- oder Widerrufseingänge wurden wegen eines auffälligen Paarmusters gebündelt. Alle Erklärungen sind weiterhin gespeichert und müssen im Vertrags-Admin geprüft werden: https://pdb-premium-system.onrender.com/admin/contracts`
    });
    if (!delivery.sent) throw new Error(delivery.reason || 'DELIVERY_FAILED');
    await db.query(
      `UPDATE contract_action_admin_notifications
       SET state = 'reported', claimed_at = NULL, updated_at = NOW()
       WHERE action_id = ANY($1::uuid[]) AND state = 'reporting'`,
      [ids]
    );
  } catch (error) {
    // Keep the claim until its lease expires to avoid retrying SMTP every tick.
    throw error;
  }
}

export async function processContractActionAdminAlerts(db = pool) {
  for (let index = 0; index < 20; index += 1) {
    const action = await claimDueAlert(db);
    if (!action) break;
    try {
      if (await findSuspiciousPair(action, db)) {
        await setAlertState(action.id, 'batched', db);
      } else {
        await sendAdminAlert(action.action_type);
        await setAlertState(action.id, 'sent', db);
      }
    } catch (error) {
      await setAlertState(action.id, 'pending', db, true);
      console.error('Contract action admin alert failed:', error.message);
    }
  }
  await sendSuspiciousSummary(db);
}

export function startContractActionAdminAlerts() {
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      await processContractActionAdminAlerts();
    } catch (error) {
      console.error('Contract action admin alert worker failed:', error.message);
    } finally {
      running = false;
    }
  }
  setTimeout(tick, 5_000).unref();
  setInterval(tick, 30_000).unref();
}
