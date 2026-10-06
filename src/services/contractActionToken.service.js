import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { pool } from '../config/pool.js';

const TOKEN_LIFETIME_MS = 30 * 60_000;
const MINIMUM_AGE_MS = 2_000;

function tokenSignature(payload) {
  return crypto.createHmac('sha256', env.shopifyAppSecret).update(payload).digest('hex');
}

export function issueContractActionToken(now = Date.now()) {
  const payload = `${crypto.randomBytes(16).toString('hex')}.${now}`;
  return `${payload}.${tokenSignature(payload)}`;
}

export async function consumeContractActionToken(token, db = pool, now = Date.now()) {
  const match = /^([0-9a-f]{32})\.(\d{13})\.([0-9a-f]{64})$/.exec(String(token || ''));
  if (!match) return false;
  const issuedAt = Number(match[2]);
  const age = now - issuedAt;
  if (!Number.isSafeInteger(issuedAt) || age < MINIMUM_AGE_MS || age > TOKEN_LIFETIME_MS) return false;
  const expected = tokenSignature(`${match[1]}.${match[2]}`);
  if (!crypto.timingSafeEqual(Buffer.from(match[3], 'hex'), Buffer.from(expected, 'hex'))) return false;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await db.query(
    `INSERT INTO contract_action_used_tokens (token_hash, expires_at)
     VALUES ($1, to_timestamp($2::double precision / 1000) + INTERVAL '30 minutes')
     ON CONFLICT DO NOTHING RETURNING token_hash`,
    [tokenHash, issuedAt]
  );
  return result.rows.length === 1;
}
