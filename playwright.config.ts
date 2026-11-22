import { defineConfig, devices } from '@playwright/test';

/**
 * Browser checks of the site in DEMO mode (made-up data, no database).
 * The site is built with demo data and empty Supabase settings, so these tests can never
 * reach a real database. Every request outside localhost is blocked (see e2e/fixtures.ts).
 *
 *   bun run test:e2e            — run everything
 *   bunx playwright test books  — one file
 */
const PORT = 4180;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: isCI ? 2 : 3,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bunx vite build --outDir dist-e2e --emptyOutDir && bunx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: {
      VITE_DATA_SOURCE: 'demo',
      VITE_DEMO_MODE: 'true',
      // Empty on purpose: the demo build must never know a database address or key.
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_VAPID_PUBLIC_KEY: '',
    },
  },
});
