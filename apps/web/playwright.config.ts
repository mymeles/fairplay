import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3001;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

/**
 * E2E config for the FairPlay web app.
 *
 * Two run modes:
 *   - Default (`pnpm e2e` / `npm run test:e2e`): spawns `next start` against
 *     the production build. Use this when you've run `next build` and have
 *     a real API + Postgres + Redis up (see docker-compose at the repo root
 *     and `npm run dev:api`).
 *   - `PLAYWRIGHT_USE_DEV=1`: spawns `next dev` instead, so you get hot
 *     reload while writing specs.
 *
 * Specs default to single-browser (chromium) because we test mobile + desktop
 * via emulated viewports rather than every engine. The full matrix is
 * available via `PLAYWRIGHT_FULL_MATRIX=1`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      // Helps the API debug logs trace this run back to E2E.
      'x-fairplay-test': 'e2e',
    },
  },
  webServer: {
    command: process.env.PLAYWRIGHT_USE_DEV
      ? `next dev -p ${WEB_PORT}`
      : `next start -p ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_API_BASE_URL: API_BASE_URL,
      NEXT_PUBLIC_REALTIME_URL: API_BASE_URL.replace(/\/api\/v1$/, ''),
    },
  },
  projects: process.env.PLAYWRIGHT_FULL_MATRIX
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
        { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
      ]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
      ],
});
