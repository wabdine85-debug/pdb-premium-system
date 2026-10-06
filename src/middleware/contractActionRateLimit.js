import crypto from 'node:crypto';
import net from 'node:net';
import { env } from '../config/env.js';
import { pool } from '../config/pool.js';

let lastCleanupAt = 0;

export function contractActionClientIp(req) {
  // Shopify sets X-Forwarded-For to the storefront visitor's IP. Render may
  // append another hop, so req.ip alone can represent the Shopify proxy.
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return net.isIP(forwarded) ? forwarded : String(req.ip || 'unknown');
}

export async function recordContractActionAttempt(clientIp, db = pool) {
  if (Date.now() - lastCleanupAt > 60 * 60_000) {
    lastCleanupAt = Date.now();
    await db.query(`DELETE FROM contract_action_rate_limits WHERE reset_at < NOW() - INTERVAL '2 days'`);
    await db.query(`DELETE FROM contract_action_used_tokens WHERE expires_at < NOW() - INTERVAL '2 days'`);
  }
  const sourceHash = crypto.createHmac('sha256', env.shopifyAppSecret)
    .update(clientIp)
    .digest('hex');
  const windows = [
    { name: 'quarter_hour', milliseconds: 15 * 60_000, max: 10 },
    { name: 'day', milliseconds: 24 * 60 * 60_000, max: 30 }
  ];
  for (const window of windows) {
    const result = await db.query(
      `INSERT INTO contract_action_rate_limits (source_hash, window_name, attempts, reset_at)
       VALUES ($1, $2, 1, NOW() + ($3::bigint * INTERVAL '1 millisecond'))
       ON CONFLICT (source_hash, window_name) DO UPDATE SET
         attempts = CASE WHEN contract_action_rate_limits.reset_at <= NOW()
           THEN 1 ELSE contract_action_rate_limits.attempts + 1 END,
         reset_at = CASE WHEN contract_action_rate_limits.reset_at <= NOW()
           THEN NOW() + ($3::bigint * INTERVAL '1 millisecond')
           ELSE contract_action_rate_limits.reset_at END
       RETURNING attempts, reset_at`,
      [sourceHash, window.name, window.milliseconds]
    );
    if (Number(result.rows[0].attempts) > window.max) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((new Date(result.rows[0].reset_at).getTime() - Date.now()) / 1000))
      };
    }
  }
  return { allowed: true };
}

export async function contractActionRateLimit(req, res, next) {
  try {
    const result = await recordContractActionAttempt(contractActionClientIp(req));
    if (result.allowed) return next();
    res.set('Retry-After', String(result.retryAfter));
    return res.status(429).json({ ok: false, error: 'TOO_MANY_REQUESTS' });
  } catch (error) {
    console.error('Contract action rate limit failed:', error.message);
    return res.status(503).json({ ok: false, error: 'CONTRACT_ACTION_UNAVAILABLE' });
  }
}
