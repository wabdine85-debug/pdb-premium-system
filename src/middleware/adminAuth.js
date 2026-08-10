import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function requireAdminToken(req, res, next) {
  const supplied = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expected = String(env.adminApiToken || '');

  if (!supplied || !expected) {
    return res.status(401).json({ ok: false, error: 'ADMIN_AUTH_REQUIRED' });
  }

  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ ok: false, error: 'ADMIN_AUTH_INVALID' });
  }

  next();
}
