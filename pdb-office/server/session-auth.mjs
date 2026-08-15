import crypto from "node:crypto";

export const SESSION_COOKIE = "pdb_office_session";

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function equalText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSession(secret, now = Date.now(), maxAgeSeconds = 8 * 60 * 60) {
  const payload = encode(JSON.stringify({
    exp: Math.floor(now / 1000) + maxAgeSeconds,
    nonce: crypto.randomBytes(18).toString("base64url"),
  }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token, secret, now = Date.now()) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra || !secret || !equalText(signature, sign(payload, secret))) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isSafeInteger(parsed.exp) && parsed.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function verifyPassword(supplied, expected) {
  return Boolean(expected) && equalText(supplied, expected);
}

export function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map(part => {
    const index = part.indexOf("=");
    if (index < 0) return [part.trim(), ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

export function sessionCookie(token, maxAgeSeconds = 8 * 60 * 60) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
