import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: ['**/combat-skills.spec.js'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-skills-local' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3004',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:3004/health',
    reuseExistingServer: false,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3004',
      SESSION_SECRET: 'threadbound-skills-local-e2e-session-secret',
      THREADBOUND_DB_PATH: ':memory:',
      THREADBOUND_AUTH_MODE: 'local',
      THREADED_BASE_URL: '',
      THREADED_CLIENT_ID: '',
      THREADED_REDIRECT_URI: '',
    },
  },
});
