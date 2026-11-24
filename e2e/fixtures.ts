import { test as base, expect, Page } from '@playwright/test';

/**
 * Shared setup for every check:
 *  - only localhost is reachable (fonts and stock photos are blocked; no database exists in demo);
 *  - any JavaScript error on the page fails the test.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: async ({}, use) => { await use([]); },
  page: async ({ page, pageErrors }, use) => {
    await page.route('**/*', route => {
      const host = new URL(route.request().url()).hostname;
      return host === 'localhost' || host === '127.0.0.1' ? route.continue() : route.abort();
    });
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => d.accept());
    await use(page);
    expect(pageErrors, 'JavaScript errors on the page').toEqual([]);
  },
});
export { expect };

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** Open the site; optionally switch to a demo member (header menu → name). */
export async function openApp(page: Page, account?: string) {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  if (account) {
    await page.locator('header button').last().click();
    await page.locator('button', { hasText: account }).first().click();
    await expect(page.locator('header')).toContainText(account.split(' ')[0]);
  }
}

/** Switch the interface language (default is Kazakh). */
export async function setLanguage(page: Page, lang: 'ru' | 'en') {
  if (isMobile(page)) {
    await openMore(page);
    await page.locator('button', { hasText: new RegExp(`^${lang}$`, 'i') }).click();
    await page.locator('.fixed [role="dialog"] button[aria-label]').first().click(); // close the menu
  } else {
    await page.locator('header button', { hasText: /^\s*kz\s*$/i }).first().click();
    await page.getByText(lang === 'ru' ? 'Русский' : 'English', { exact: true }).click();
  }
}

const BAR_INDEX: Record<string, number> = { dashboard: 0, events: 1, library: 2, leaderboard: 3 };

export async function openMore(page: Page) {
  await page.locator('nav[aria-label] button').nth(4).click();
  await expect(page.locator('.fixed .grid button').first()).toBeVisible();
}

/** Go to a section on desktop (top tabs) or phone (bottom bar or the "More" sheet). */
export async function goTab(page: Page, tab: string, moreLabel?: RegExp) {
  if (!isMobile(page)) {
    await page.locator(`nav button[data-tab="${tab}"]`).click();
  } else if (tab in BAR_INDEX) {
    await page.locator('nav[aria-label] button').nth(BAR_INDEX[tab]).click();
  } else {
    await openMore(page);
    await page.locator('.fixed .grid button', { hasText: moreLabel }).first().click();
  }
  await expect(page.locator('main [data-view-loading]')).toHaveCount(0); // screens load as separate files (Phase 4)
  await page.waitForTimeout(150);
}

export async function noHorizontalOverflow(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, 'page is wider than the screen').toBeLessThanOrEqual(0);
}

/** Header coin counter (the first header button that is a number). */
export async function coins(page: Page): Promise<number> {
  const txt = await page.locator('header button').filter({ hasText: /^\s*\d+/ }).first().innerText();
  return Number(txt.replace(/\D/g, ''));
}
