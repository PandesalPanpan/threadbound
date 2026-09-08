import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: ['**/local-auth.spec.js', '**/adventure-stream.spec.js', '**/encounter-mechanics.local.spec.js'],
  fullyParallel: false,
  workers: 1,
  // The local project intentionally uses one in-memory server for realistic persistence.
  // Retrying a failed stateful journey against that same database is not isolated and can
  // hide the original failure behind leftover party/run state, so CI runs it once cleanly.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-local' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3002',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:3002/health',
    reuseExistingServer: false,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3002',
      SESSION_SECRET: 'threadbound-local-e2e-session-secret',
      THREADBOUND_DB_PATH: ':memory:',
      THREADBOUND_AUTH_MODE: 'local',
      THREADED_BASE_URL: '',
      THREADED_CLIENT_ID: '',
      THREADED_REDIRECT_URI: '',
    },
  },
});
