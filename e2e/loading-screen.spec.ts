import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';

/**
 * Loading screen "Shanyraq Draw" (25.11.2026): the splash in index.html is on screen from the first frame,
 * stays while the app starts, fades out and is removed when the first screen is ready, never hides an error,
 * respects reduced motion, and offers a reload if the app does not start at all.
 */

const splash = '#boot-splash';
/** Hold the main script so the splash can be looked at before the app starts. */
const holdMainScript = (page: import('@playwright/test').Page, ms: number) =>
  page.route('**/assets/index-*.js', async route => { await new Promise(r => setTimeout(r, ms)); await route.continue(); });

test('the splash uses the official mark unchanged (public/brand/shanyraq-mark.svg)', async () => {
  const file = readFileSync('public/brand/shanyraq-mark.svg', 'utf8');
  const html = readFileSync('index.html', 'utf8');
  const d = /<path[^>]* d="([^"]+)"/.exec(file)![1];
  const fill = /class="shq-mark-fill"[^>]* d="([^"]+)"/.exec(html)![1];
  expect(fill).toBe(d);
  // The drawn outline is the same path split into its sub-paths (stroke only; geometry untouched).
  const parts = [...html.matchAll(/<path pathLength="1" style="--i:\d+" d="([^"]+)"\/>/g)].map(m => m[1]);
  expect(parts.length).toBe(7);
  expect(parts.join(' ')).toBe(d);
});

test('the splash is there before the app starts, with an honest indicator, then leaves', async ({ page }) => {
  await holdMainScript(page, 1500);
  await page.goto('/');
  const el = page.locator(splash);
  await expect(el).toBeVisible();
  await expect(el.locator('.shq-name')).toHaveText('SHANYRAQ HUB');
  const bar = el.locator('[role="progressbar"]');
  await expect(bar).toHaveAttribute('aria-label', 'Жүктелуде…');
  // Indeterminate: no value, no percent anywhere.
  await expect(bar).not.toHaveAttribute('aria-valuenow', /.*/);
  await expect(el).not.toContainText('%');

  await expect(page.locator('main')).toBeVisible();
  await expect(el).toHaveCount(0); // faded out and removed
  // The app answers taps right away (nothing left on top).
  await page.locator('nav button[data-tab="events"]').click();
  await expect(page.locator('[data-view-loading]')).toHaveCount(0);
});

test('no artificial delay: the splash goes as soon as the app is ready', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  const shownAt = Date.now();
  await expect(page.locator(splash)).toHaveCount(0, { timeout: 2000 });
  expect(Date.now() - shownAt).toBeLessThan(1000); // fade is 300 ms; the drawing is not waited for
});

test('splash texts follow the saved language', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('shanyraq_lang', 'ru'));
  await holdMainScript(page, 800);
  await page.goto('/');
  await expect(page.locator(`${splash} [role="progressbar"]`)).toHaveAttribute('aria-label', 'Загрузка…');
});

test('a loading error is not hidden behind the splash', async ({ page }) => {
  await page.route('**/assets/mockData-*.js', route => route.abort());
  await page.goto('/');
  await expect(page.getByText(/Деректерді жүктеу мүмкін болмады/)).toBeVisible();
  await expect(page.locator(splash)).toHaveCount(0);
});

test('if the app never starts, the splash says so and offers a reload', async ({ page }) => {
  await page.clock.install();
  await page.route('**/assets/index-*.js', route => route.abort());
  await page.goto('/');
  const stuck = page.locator(`${splash} [data-splash-stuck]`);
  await expect(stuck).toBeHidden();
  await page.clock.fastForward(21_000);
  await expect(stuck).toBeVisible();
  await expect(stuck).toContainText('Жүктеу ұзаққа созылды');
  await expect(stuck.locator('button')).toHaveText('Жаңарту');
});

test('reduced motion: the mark is shown at once, nothing moves', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await holdMainScript(page, 1200);
  await page.goto('/');
  const el = page.locator(splash);
  await expect(el.locator('.shq-mark-fill')).toHaveCSS('opacity', '1');
  await expect(el.locator('.shq-name')).toHaveCSS('opacity', '1');
  await expect(el.locator('.shq-mark-draw')).toBeHidden();
  await expect(el.locator('.shq-bar')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();
  await expect(el).toHaveCount(0);
});

test('no horizontal scroll on a small phone while loading', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await holdMainScript(page, 800);
  await page.goto('/');
  await expect(page.locator(splash)).toBeVisible();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(wide).toBe(false);
});
