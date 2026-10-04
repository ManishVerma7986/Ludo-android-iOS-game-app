import dotenv from 'dotenv';

dotenv.config();

const port = Number(process.env.PORT ?? 4000);
const clientOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const chatBlockedTerms = (process.env.CHAT_BLOCKED_TERMS ?? '')
  .split(',')
  .map((term) => term.trim().toLocaleLowerCase())
  .filter(Boolean);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

if (clientOrigins.length === 0) {
  throw new Error('CLIENT_ORIGIN must contain at least one allowed origin');
}

if (process.env.NODE_ENV === 'production') {
  if (!process.env.CLIENT_ORIGIN) {
    throw new Error('CLIENT_ORIGIN is required in production');
  }
  for (const origin of clientOrigins) {
    if (new URL(origin).protocol !== 'https:') {
      throw new Error('CLIENT_ORIGIN values must use HTTPS in production');
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }
}

export const config = {
  port,
  clientOrigins,
  databaseUrl: process.env.DATABASE_URL ?? null,
  chatBlockedTerms,
};
