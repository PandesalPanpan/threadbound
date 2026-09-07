import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port <= 0) throw new Error('PORT must be a positive integer.');

const authMode = (process.env.THREADBOUND_AUTH_MODE?.trim() || 'threaded').toLowerCase();
if (!['threaded', 'local'].includes(authMode)) throw new Error('THREADBOUND_AUTH_MODE must be threaded or local.');
if (authMode === 'local' && process.env.NODE_ENV === 'production') {
  throw new Error('Local auth mode is disabled in production.');
}

export const config = {
  port,
  authMode,
  sessionSecret: required('SESSION_SECRET'),
  databasePath: process.env.THREADBOUND_DB_PATH?.trim() || './data/threadbound.sqlite',
  threaded: authMode === 'threaded' ? {
    baseUrl: required('THREADED_BASE_URL').replace(/\/+$/, ''),
    clientId: required('THREADED_CLIENT_ID'),
    redirectUri: process.env.THREADED_REDIRECT_URI?.trim() || `http://127.0.0.1:${port}/oauth/callback`,
  } : null,
};
