import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  frontendOrigin: process.env.FRONTEND_ORIGIN || '',
  tokenTtlMinutes: Number(process.env.TOKEN_TTL_MINUTES || 15),
  shopifyAppSecret: process.env.SHOPIFY_APP_SECRET || process.env.SHOPIFY_CLIENT_SECRET || '',
  contractEncryptionKey: process.env.CONTRACT_ENCRYPTION_KEY || '',
  adminApiToken: process.env.ADMIN_API_TOKEN || '',
  contractVersion: process.env.CONTRACT_VERSION || '2026-08-11-v2',
  shopifyShop: process.env.SHOPIFY_SHOP || '',
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID || '',
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || ''
};

export function assertRuntimeEnv() {
  for (const name of ['DATABASE_URL', 'FRONTEND_ORIGIN']) {
    if (!process.env[name]) {
      throw new Error(`Missing env variable: ${name}`);
    }
  }
}
