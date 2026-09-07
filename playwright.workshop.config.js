import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/arc-workshop.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-workshop' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3003',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:3003/health',
    reuseExistingServer: false,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3003',
      SESSION_SECRET: 'threadbound-workshop-e2e-session-secret',
      THREADBOUND_DB_PATH: ':memory:',
      THREADBOUND_AUTH_MODE: 'local',
      THREADED_BASE_URL: '',
      THREADED_CLIENT_ID: '',
      THREADED_REDIRECT_URI: '',
    },
  },
});
