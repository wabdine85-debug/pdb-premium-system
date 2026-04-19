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
  tokenTtlMinutes: Number(process.env.TOKEN_TTL_MINUTES || 15)
};