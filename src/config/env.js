import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  frontendOrigin: requireEnv('FRONTEND_ORIGIN'),
  tokenTtlMinutes: Number(process.env.TOKEN_TTL_MINUTES || 15),
  shopifyAppSecret: process.env.SHOPIFY_APP_SECRET || process.env.SHOPIFY_CLIENT_SECRET || '',
  contractEncryptionKey: process.env.CONTRACT_ENCRYPTION_KEY || '',
  adminApiToken: process.env.ADMIN_API_TOKEN || '',
  contractVersion: process.env.CONTRACT_VERSION || '2026-08-10-v1',
  shopifyShop: process.env.SHOPIFY_SHOP || '',
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID || '',
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET || ''
};
