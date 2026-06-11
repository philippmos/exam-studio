import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the Angular client E2E tests.
 *
 * By default the suite builds nothing: it serves the *production* bundle from
 * client/dist via server.mjs (which also proxies /graphql to the API, like
 * nginx does in the shipped image) and drives it with Chromium.
 *
 *   API_URL   where the GraphQL API runs   (default http://localhost:8000)
 *   BASE_URL  test an already running app instead of starting server.mjs
 *             (e.g. http://localhost:4200 for `ng serve`,
 *              http://localhost:8080 for the docker compose stack)
 *
 * Local quickstart:
 *   docker compose up -d db api      (repo root)
 *   npm run build                    (client/)
 *   npx playwright test              (client/e2e/)
 */
const PORT = Number(process.env.PORT ?? 4173);
const API_URL = process.env.API_URL ?? 'http://localhost:8000';
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const DIST_DIR = '../dist/exam-studio/browser';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ['list'],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['html', { open: 'never' }],
      ]
    : [['list'], ['html', { open: 'never' }]],
  // Waits for the API and seeds the sample exam.
  globalSetup: './global-setup',
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `node server.mjs --port ${PORT} --dist ${DIST_DIR} --api ${API_URL}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
