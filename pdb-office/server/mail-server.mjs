import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

const root = process.cwd();
const envPath = path.join(root, ".env");

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#") && line.includes("="))
      .map(line => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
        return [key, value];
      })
  );
}

const env = { ...process.env, ...loadEnv(envPath) };
const port = Number(env.MAIL_API_PORT || 8787);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function requiredConfig() {
  return ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]
    .filter(key => !env[key] || String(env[key]).includes("HIER_DEIN"));
}

function buildCancellationEmail({ memberName, email, endDate, note }) {
  const subject = "Bestätigung deiner Kündigung – PDB Aesthetic Room";
  const greeting = memberName ? `Hallo ${memberName},` : "Hallo,";
  const formattedDate = endDate
    ? new Date(endDate).toLocaleDateString("de-DE")
    : "dem vereinbarten Austrittsdatum";

  const text = [
    greeting,
    "",
    `hiermit bestätigen wir deine Kündigung deiner PDB Membership zum ${formattedDate}.`,
    "",
    "Ab diesem Datum endet dein Membership-Status. Bis dahin bleibt deine Membership wie vereinbart aktiv.",
    note ? `\nHinweis: ${note}` : "",
    "",
    "Vielen Dank für dein Vertrauen.",
    "",
    "Liebe Grüße",
    "PDB Aesthetic Room",
  ].filter(Boolean).join("\n");

  return { to: email, subject, text };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  if (req.url !== "/api/send-cancellation-email" || req.method !== "POST") {
    return sendJson(res, 404, { ok: false, error: "Not found" });
  }

  const missing = requiredConfig();
  if (missing.length) {
    return sendJson(res, 500, {
      ok: false,
      error: `Mail-Konfiguration fehlt: ${missing.join(", ")}`,
    });
  }

  try {
    const payload = await readBody(req);
    if (!payload.email) return sendJson(res, 400, { ok: false, error: "Empfänger-E-Mail fehlt." });
    if (!payload.endDate) return sendJson(res, 400, { ok: false, error: "Austrittsdatum fehlt." });

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: String(env.SMTP_SECURE || "false") === "true",
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });

    const mail = buildCancellationEmail(payload);
    await transporter.sendMail({
      from: env.MAIL_FROM,
      replyTo: env.MAIL_REPLY_TO || env.MAIL_FROM,
      bcc: env.MAIL_BCC || "",
      ...mail,
    });

    sendJson(res, 200, { ok: true, sentAt: new Date().toISOString() });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "E-Mail konnte nicht gesendet werden." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`PDB Mail API läuft auf http://127.0.0.1:${port}`);
});
