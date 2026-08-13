import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ADMIN_SESSION_COOKIE = 'pdb_admin_session';
const ADMIN_SESSION_VERSION = 1;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return cookies;
      cookies[part.slice(0, separator)] = part.slice(separator + 1);
      return cookies;
    }, {});
}

function sessionSignature(payload) {
  return crypto.createHmac('sha256', env.adminApiToken).update(payload).digest('base64url');
}

function passwordVersion() {
  return crypto.createHmac('sha256', env.adminApiToken)
    .update(`admin-password:${env.adminPassword}`)
    .digest('base64url')
    .slice(0, 22);
}

export function createAdminSession(now = Date.now()) {
  if (!env.adminApiToken) throw new Error('ADMIN_API_TOKEN is required to sign admin sessions.');
  const expiresAt = now + env.adminSessionHours * 60 * 60_000;
  const payload = Buffer.from(JSON.stringify({
    version: ADMIN_SESSION_VERSION,
    expiresAt,
    passwordVersion: passwordVersion(),
    nonce: crypto.randomBytes(16).toString('base64url')
  })).toString('base64url');
  return { token: `${payload}.${sessionSignature(payload)}`, expiresAt };
}

export function verifyAdminSession(token, now = Date.now()) {
  if (!token || !env.adminApiToken) return false;
  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra || !safeEqual(signature, sessionSignature(payload))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.version === ADMIN_SESSION_VERSION
      && Number.isFinite(session.expiresAt)
      && session.expiresAt > now
      && safeEqual(session.passwordVersion, passwordVersion());
  } catch {
    return false;
  }
}

function sessionCookie(token, maxAgeSeconds) {
  const secure = env.nodeEnv === 'production' ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/api/contracts; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function adminSessionStatus(req, res) {
  const token = parseCookies(req.get('cookie'))[ADMIN_SESSION_COOKIE];
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, authenticated: verifyAdminSession(token) });
}

export function createAdminSessionHandler(req, res) {
  const supplied = String(req.body?.password || '');
  const expected = String(env.adminPassword || '');
  res.set('Cache-Control', 'no-store');

  if (!expected || expected.length < 12 || !env.adminApiToken) {
    return res.status(503).json({ ok: false, error: 'ADMIN_PASSWORD_NOT_CONFIGURED' });
  }
  if (!safeEqual(supplied, expected)) {
    return res.status(401).json({ ok: false, error: 'ADMIN_PASSWORD_INVALID' });
  }

  const session = createAdminSession();
  res.set('Set-Cookie', sessionCookie(session.token, env.adminSessionHours * 60 * 60));
  return res.json({ ok: true, authenticated: true, expires_at: new Date(session.expiresAt).toISOString() });
}

export function deleteAdminSessionHandler(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.set('Set-Cookie', sessionCookie('', 0));
  return res.json({ ok: true, authenticated: false });
}

export function requireAdminAccess(req, res, next) {
  const supplied = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (supplied && env.adminApiToken && safeEqual(supplied, env.adminApiToken)) {
    req.adminAuthMethod = 'bearer';
    return next();
  }

  const session = parseCookies(req.get('cookie'))[ADMIN_SESSION_COOKIE];
  if (!verifyAdminSession(session)) {
    return res.status(401).json({ ok: false, error: 'ADMIN_AUTH_REQUIRED' });
  }
  if (req.method !== 'GET' && req.get('x-pdb-admin') !== '1') {
    return res.status(403).json({ ok: false, error: 'ADMIN_CSRF_REQUIRED' });
  }

  req.adminAuthMethod = 'session';
  next();
}

// Backwards-compatible export for private scripts that still use the bearer token.
export const requireAdminToken = requireAdminAccess;
