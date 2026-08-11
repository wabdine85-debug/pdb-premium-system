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

async function deliverHtmlMail(transport, { to, subject, html, filename }) {
  await transport.sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text: 'Die Bestätigung befindet sich im HTML-Anhang dieser E-Mail.',
    html,
    attachments: [{
      filename,
      content: html,
      contentType: 'text/html; charset=utf-8'
    }]
  });
}

export async function sendTransactionalHtml({ to, subject, html, filename }) {
  let transport = getTransporter();
  if (!transport) return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };

  try {
    await deliverHtmlMail(transport, { to, subject, html, filename });
  } catch (error) {
    if (!isRetryableMailError(error)) throw error;
    transporter = undefined;
    transport = getTransporter();
    await deliverHtmlMail(transport, { to, subject, html, filename });
  }

  return { sent: true };
}
