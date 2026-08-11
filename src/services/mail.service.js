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

export async function sendTransactionalHtml({ to, subject, html, filename }) {
  const transport = getTransporter();
  if (!transport) return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };

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

  return { sent: true };
}
