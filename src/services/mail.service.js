import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;

export function isTransactionalMailConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.smtpFrom);
}

function getTransporter() {
  if (!isTransactionalMailConfigured()) return null;
  transporter ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true
  });
  return transporter;
}

export function isRetryableMailError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET'].includes(code)
    || message.includes('connection timeout')
    || message.includes('socket timeout');
}

export function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/(?:h[1-6]|p|div|tr|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildTransactionalMessage({ to, subject, html, text }) {
  return {
    from: env.smtpFrom,
    to,
    subject,
    text: text || htmlToPlainText(html),
    html
  };
}

async function deliverHtmlMail(transport, message) {
  await transport.sendMail(buildTransactionalMessage(message));
}

export async function sendTransactionalHtml({ to, subject, html, text }) {
  let transport = getTransporter();
  if (!transport) return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };

  try {
    await deliverHtmlMail(transport, { to, subject, html, text });
  } catch (error) {
    if (!isRetryableMailError(error)) throw error;
    transporter = undefined;
    transport = getTransporter();
    await deliverHtmlMail(transport, { to, subject, html, text });
  }

  return { sent: true };
}
