import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer.');
}

export const config = {
  port,
  sessionSecret: required('SESSION_SECRET'),
  threaded: {
    baseUrl: required('THREADED_BASE_URL').replace(/\/+$/, ''),
    clientId: required('THREADED_CLIENT_ID'),
    redirectUri:
      process.env.THREADED_REDIRECT_URI?.trim() ||
      `http://127.0.0.1:${port}/oauth/callback`,
  },
};
