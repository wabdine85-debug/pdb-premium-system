import assert from "node:assert/strict";
import test from "node:test";
import {
  createSession,
  parseCookies,
  sessionCookie,
  verifyPassword,
  verifySession,
} from "../server/session-auth.mjs";

test("session is signed, expires, and rejects tampering", () => {
  const secret = "a".repeat(48);
  const now = Date.UTC(2026, 7, 15);
  const token = createSession(secret, now, 60);

  assert.equal(verifySession(token, secret, now + 59_000), true);
  assert.equal(verifySession(token, secret, now + 61_000), false);
  assert.equal(verifySession(`${token}x`, secret, now), false);
  assert.equal(verifySession(token, "b".repeat(48), now), false);
});

test("password comparison and cookie flags are production safe", () => {
  assert.equal(verifyPassword("correct horse", "correct horse"), true);
  assert.equal(verifyPassword("wrong", "correct horse"), false);
  assert.match(sessionCookie("signed-token"), /HttpOnly/);
  assert.match(sessionCookie("signed-token"), /Secure/);
  assert.match(sessionCookie("signed-token"), /SameSite=Strict/);
});

test("cookie parser extracts the protected session", () => {
  assert.deepEqual(parseCookies("theme=dark; pdb_office_session=a.b"), {
    theme: "dark",
    pdb_office_session: "a.b",
  });
});
