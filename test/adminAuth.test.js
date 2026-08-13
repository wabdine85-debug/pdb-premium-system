import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../src/config/env.js';
import {
  createAdminSession,
  createAdminSessionHandler,
  verifyAdminSession
} from '../src/middleware/adminAuth.js';

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('admin session is signed, expires, and rejects tampering', () => {
  const originalToken = env.adminApiToken;
  const originalHours = env.adminSessionHours;
  const originalPassword = env.adminPassword;
  env.adminApiToken = 'test-api-token-with-enough-entropy';
  env.adminPassword = 'initial-admin-password-for-session';
  env.adminSessionHours = 8;
  try {
    const now = Date.now();
    const session = createAdminSession(now);
    assert.equal(verifyAdminSession(session.token, now + 1_000), true);
    assert.equal(verifyAdminSession(`${session.token}tampered`, now + 1_000), false);
    assert.equal(verifyAdminSession(session.token, session.expiresAt + 1), false);
    env.adminPassword = 'a-changed-password-invalidates-sessions';
    assert.equal(verifyAdminSession(session.token, now + 1_000), false);
  } finally {
    env.adminApiToken = originalToken;
    env.adminSessionHours = originalHours;
    env.adminPassword = originalPassword;
  }
});

test('password login creates a protected cookie and rejects a wrong password', () => {
  const original = {
    token: env.adminApiToken,
    password: env.adminPassword,
    hours: env.adminSessionHours,
    nodeEnv: env.nodeEnv
  };
  Object.assign(env, {
    adminApiToken: 'test-api-token-with-enough-entropy',
    adminPassword: 'A-unique-test-password-2026!',
    adminSessionHours: 8,
    nodeEnv: 'production'
  });
  try {
    const wrong = responseRecorder();
    createAdminSessionHandler({ body: { password: 'wrong-password' } }, wrong);
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.body.error, 'ADMIN_PASSWORD_INVALID');

    const success = responseRecorder();
    createAdminSessionHandler({ body: { password: env.adminPassword } }, success);
    assert.equal(success.statusCode, 200);
    assert.match(success.headers['Set-Cookie'], /HttpOnly/);
    assert.match(success.headers['Set-Cookie'], /SameSite=Strict/);
    assert.match(success.headers['Set-Cookie'], /Secure/);
    assert.match(success.headers['Set-Cookie'], /Path=\/api\/contracts/);
    assert.doesNotMatch(success.headers['Set-Cookie'], new RegExp(env.adminPassword));
  } finally {
    Object.assign(env, {
      adminApiToken: original.token,
      adminPassword: original.password,
      adminSessionHours: original.hours,
      nodeEnv: original.nodeEnv
    });
  }
});
