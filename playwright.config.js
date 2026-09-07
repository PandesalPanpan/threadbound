import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testIgnore: ['**/local-auth.spec.js', '**/adventure-stream.spec.js', '**/arc-workshop.spec.js'],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-threaded' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node test/e2e/fake-threaded.js',
      url: 'http://127.0.0.1:4100/health',
      reuseExistingServer: false,
      env: { ...process.env, FAKE_THREADED_PORT: '4100' },
    },
    {
      command: 'node src/server.js',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: false,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3001',
        SESSION_SECRET: 'threadbound-e2e-session-secret',
        THREADBOUND_DB_PATH: ':memory:',
        THREADBOUND_AUTH_MODE: 'threaded',
        THREADED_BASE_URL: 'http://127.0.0.1:4100',
        THREADED_CLIENT_ID: 'threadbound-e2e',
        THREADED_REDIRECT_URI: 'http://127.0.0.1:3001/oauth/callback',
      },
    },
  ],
});
