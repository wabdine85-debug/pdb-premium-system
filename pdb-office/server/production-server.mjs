import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import nodemailer from "nodemailer";
import pg from "pg";
import { classifyStorageWrite, getStorageRevision } from "../services/storageRevision.js";
import { createPremiumAdminProxy } from "./premium-admin-proxy.mjs";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  parseCookies,
  sessionCookie,
  verifyPassword,
  verifySession,
} from "./session-auth.mjs";

const { Pool } = pg;
const root = process.cwd();
const distDir = path.resolve(root, "dist");
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.PDB_OFFICE_ADMIN_PASSWORD || "";
const sessionSecret = process.env.PDB_OFFICE_SESSION_SECRET || "";

if (!databaseUrl) throw new Error("DATABASE_URL fehlt.");
if (adminPassword.length < 12) throw new Error("PDB_OFFICE_ADMIN_PASSWORD muss mindestens 12 Zeichen haben.");
if (sessionSecret.length < 32) throw new Error("PDB_OFFICE_SESSION_SECRET muss mindestens 32 Zeichen haben.");

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
const premiumProxy = createPremiumAdminProxy({
  baseUrl: process.env.PREMIUM_API_BASE_URL,
  adminToken: process.env.PREMIUM_ADMIN_API_TOKEN,
});
const loginAttempts = new Map();

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.statusCode = 303;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isAuthenticated(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return verifySession(token, sessionSecret);
}

function isSameOrigin(req) {
  const origin = String(req.headers.origin || "");
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.headers.host || "");
  } catch {
    return false;
  }
}

function loginAllowed(ip) {
  const now = Date.now();
  const current = loginAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 10;
}

function loginPage(message = "") {
  return `<!doctype html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PDB Office · Anmeldung</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#111;color:#f5f1e9}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#28231d,#111 46%)}main{width:min(420px,100%);padding:34px;border:1px solid #443c31;border-radius:22px;background:#181715;box-shadow:0 24px 80px #0008}.mark{width:54px;height:54px;display:grid;place-items:center;border-radius:15px;background:#e5d2b2;color:#17130f;font-weight:900;letter-spacing:.06em}h1{font-size:28px;margin:24px 0 8px}p{color:#b9b1a6;line-height:1.5}.error{color:#ffc7bd}label{display:block;margin-top:22px;color:#d8d0c5;font-size:14px}input{width:100%;margin-top:8px;padding:14px 15px;border-radius:12px;border:1px solid #51483d;background:#0d0d0c;color:#fff;font:inherit}button{width:100%;margin-top:20px;padding:14px;border:0;border-radius:12px;background:#e5d2b2;color:#17130f;font-weight:800;font:inherit;cursor:pointer}</style></head>
<body><main><div class="mark">PDB</div><h1>PDB Office</h1><p>Geschützter Verwaltungszugang</p>${message ? `<p class="error">${message}</p>` : ""}<form method="post" action="/login"><label>Passwort<input name="password" type="password" autocomplete="current-password" required autofocus></label><button type="submit">Anmelden</button></form></main></body></html>`;
}

async function handleLogin(req, res) {
  if (req.method === "GET") {
    if (isAuthenticated(req)) return redirect(res, "/");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(loginPage());
  }
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  if (!isSameOrigin(req)) return sendJson(res, 403, { ok: false, error: "ORIGIN_NOT_ALLOWED" });
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  if (!loginAllowed(ip)) return sendJson(res, 429, { ok: false, error: "TOO_MANY_ATTEMPTS" });
  const form = new URLSearchParams(await readBody(req, 8_000));
  if (!verifyPassword(form.get("password"), adminPassword)) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(loginPage("Passwort nicht korrekt."));
  }
  loginAttempts.delete(ip);
  res.setHeader("Set-Cookie", sessionCookie(createSession(sessionSecret)));
  return redirect(res, "/");
}

async function getDocument(documentKey) {
  const result = await pool.query(
    "SELECT payload, revision, updated_at FROM pdb_office.documents WHERE document_key = $1",
    [documentKey],
  );
  return result.rows[0] || null;
}

async function handleCrmData(req, res) {
  if (req.method === "GET") {
    const document = await getDocument("crm");
    if (!document) return sendJson(res, 503, { ok: false, error: "CRM_NOT_INITIALIZED" });
    return sendJson(res, 200, document.payload);
  }
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  if (!isSameOrigin(req)) return sendJson(res, 403, { ok: false, error: "ORIGIN_NOT_ALLOWED" });
  const incoming = JSON.parse(await readBody(req, 8_000_000) || "{}");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      "SELECT payload, revision FROM pdb_office.documents WHERE document_key = 'crm' FOR UPDATE",
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("CRM_NOT_INITIALIZED");
    const status = classifyStorageWrite(incoming, current.payload);
    if (status === "duplicate") {
      await client.query("COMMIT");
      return sendJson(res, 200, { ok: true, duplicate: true });
    }
    if (status === "stale" || status === "conflict") {
      await client.query("ROLLBACK");
      return sendJson(res, 409, {
        ok: false,
        error: status === "stale" ? "STALE_DATA" : "REVISION_CONFLICT",
        currentRevision: current.revision,
      });
    }
    await client.query(
      "UPDATE pdb_office.documents SET payload = $1::jsonb, revision = $2, updated_at = NOW() WHERE document_key = 'crm'",
      [JSON.stringify(incoming), getStorageRevision(incoming)],
    );
    await client.query("COMMIT");
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function handleMemberFinance(res) {
  const document = await getDocument("member_finance");
  if (!document) return sendJson(res, 503, { ok: false, error: "MEMBER_FINANCE_NOT_INITIALIZED" });
  return sendJson(res, 200, document.payload);
}

async function handleInvoicePdf(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  const params = new URLSearchParams(await readBody(req, 17_000_000));
  const requestedName = String(params.get("filename") || "Rechnung.pdf");
  const fileName = requestedName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "Rechnung.pdf";
  const encodedPdf = String(params.get("pdf") || "");
  if (!encodedPdf || !/^[A-Za-z0-9+/=]+$/.test(encodedPdf)) return sendJson(res, 400, { ok: false, error: "INVALID_PDF" });
  const pdf = Buffer.from(encodedPdf, "base64");
  if (pdf.length < 4 || pdf.subarray(0, 4).toString("ascii") !== "%PDF") return sendJson(res, 400, { ok: false, error: "INVALID_PDF" });
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`}"`);
  res.setHeader("Content-Length", pdf.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(pdf);
}

async function handleCancellationEmail(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  const payload = JSON.parse(await readBody(req, 32_000) || "{}");
  if (!payload.email || !/^\S+@\S+\.\S+$/.test(String(payload.email))) return sendJson(res, 400, { ok: false, error: "Empfänger-E-Mail fehlt." });
  if (!payload.endDate) return sendJson(res, 400, { ok: false, error: "Austrittsdatum fehlt." });
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"].filter(key => !process.env[key]);
  if (required.length) return sendJson(res, 503, { ok: false, error: "MAIL_NOT_CONFIGURED" });
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const memberName = String(payload.memberName || "").trim();
  const formattedDate = new Date(payload.endDate).toLocaleDateString("de-DE");
  const text = [
    memberName ? `Hallo ${memberName},` : "Hallo,", "",
    `hiermit bestätigen wir deine Kündigung deiner PDB Membership zum ${formattedDate}.`, "",
    "Ab diesem Datum endet dein Membership-Status. Bis dahin bleibt deine Membership wie vereinbart aktiv.",
    payload.note ? `Hinweis: ${String(payload.note).slice(0, 1_000)}` : "", "",
    "Vielen Dank für dein Vertrauen.", "", "Liebe Grüße", "PDB Aesthetic Room",
  ].filter(Boolean).join("\n");
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    replyTo: process.env.MAIL_REPLY_TO || process.env.MAIL_FROM,
    bcc: process.env.MAIL_BCC || "",
    to: payload.email,
    subject: "Bestätigung deiner Kündigung – PDB Aesthetic Room",
    text,
  });
  return sendJson(res, 200, { ok: true, sentAt: new Date().toISOString() });
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function serveStatic(urlPath, res) {
  const decoded = decodeURIComponent(urlPath);
  const requested = decoded === "/" ? "/index.html" : decoded;
  let file = path.resolve(distDir, `.${requested}`);
  if (!file.startsWith(`${distDir}${path.sep}`)) return sendJson(res, 400, { ok: false, error: "INVALID_PATH" });
  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = path.join(file, "index.html");
    const content = await fs.readFile(file);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeTypes[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", file.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable");
    return res.end(content);
  } catch {
    if (path.extname(requested)) return sendJson(res, 404, { ok: false, error: "NOT_FOUND" });
    const content = await fs.readFile(path.join(distDir, "index.html"));
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(content);
  }
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url || "/", "http://pdb-office.local");
  try {
    if (url.pathname === "/health") return sendJson(res, 200, { ok: true, service: "pdb-office" });
    if (url.pathname === "/login") return await handleLogin(req, res);
    if (!isAuthenticated(req)) {
      if (url.pathname.startsWith("/api/") || url.pathname.endsWith(".json")) return sendJson(res, 401, { ok: false, error: "AUTH_REQUIRED" });
      return redirect(res, "/login");
    }
    if (req.method === "POST" && !isSameOrigin(req)) return sendJson(res, 403, { ok: false, error: "ORIGIN_NOT_ALLOWED" });
    if (url.pathname === "/logout" && req.method === "POST") {
      res.setHeader("Set-Cookie", clearSessionCookie());
      return redirect(res, "/login");
    }
    if (url.pathname === "/api/crm-data") return await handleCrmData(req, res);
    if (url.pathname === "/member-finance-data.json" && req.method === "GET") return await handleMemberFinance(res);
    if (url.pathname === "/api/invoice-pdf") return await handleInvoicePdf(req, res);
    if (url.pathname === "/api/send-cancellation-email") return await handleCancellationEmail(req, res);
    if (url.pathname.startsWith("/api/premium-admin")) {
      req.url = `${url.pathname.slice("/api/premium-admin".length) || "/"}${url.search}`;
      return await premiumProxy(req, res);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    return await serveStatic(url.pathname, res);
  } catch (error) {
    const status = error.message === "REQUEST_TOO_LARGE" ? 413 : error instanceof SyntaxError ? 400 : 500;
    console.error("Request failed:", error.message);
    if (!res.headersSent) return sendJson(res, status, { ok: false, error: status === 500 ? "INTERNAL_SERVER_ERROR" : error.message });
    res.end();
  }
});

await pool.query("SELECT 1");
server.listen(port, "0.0.0.0", () => {
  console.log(`PDB Office läuft auf Port ${port}`);
});
