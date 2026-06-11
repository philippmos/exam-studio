import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for the GraphQL API tests.
 *
 * The tests are pure HTTP tests (no browser): they talk to a running API
 * instance via Playwright's APIRequestContext. Point them at an instance
 * with the API_URL environment variable.
 *
 *   Local:  docker compose up -d db api   (API on http://localhost:8000)
 *   CI:     the API image runs as a GitLab service, API_URL=http://api:8000
 */
const API_URL = process.env.API_URL ?? 'http://localhost:8000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Fail the CI run when test.only is accidentally committed.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ['list'],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['html', { open: 'never' }],
      ]
    : [['list'], ['html', { open: 'never' }]],
  // Waits for the API to come up and seeds the sample exam.
  globalSetup: './global-setup',
  use: {
    baseURL: API_URL,
  },
  projects: [{ name: 'api' }],
});
