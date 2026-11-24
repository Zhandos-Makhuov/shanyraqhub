import { test, expect, openApp, goTab } from './fixtures';

/**
 * Phase 4 — platform reliability: screens load as separate files.
 *  - the home page does not wait for the other screens; they arrive in the background;
 *  - if a screen file is missing (an open page after a new version was published), opening it reloads the page once
 *    instead of leaving a blank screen; after that the screen opens normally.
 */
test.describe('screens as separate files', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('home loads without the other screens; they are fetched in the background', async ({ page }) => {
    const js: string[] = [];
    page.on('requestfinished', r => { if (r.url().endsWith('.js')) js.push(r.url()); });
    await openApp(page);
    await expect(page.locator('main h1')).toBeVisible();
    await expect.poll(() => js.some(u => /EventsView/.test(u)), { timeout: 10000 }).toBe(true);
    await goTab(page, 'events');
    await expect(page.locator('main article').first()).toBeVisible();
  });

  test.describe('missing file', () => {
    // The site's service worker would fetch the file itself, out of the test's reach — so it is off here.
    test.use({ serviceWorkers: 'block' });
    test('a missing screen file reloads the page once, then the screen opens', async ({ page }) => {
      let blocked = 0;
      await page.route(/EventsView-[^/]+\.js$/, route => {
        if (blocked < 2) { blocked++; return route.abort(); } // background fetch + the open attempt (old version gone)
        return route.continue();
      });
      await openApp(page);
      await expect.poll(() => blocked, { timeout: 10000 }).toBeGreaterThan(0);
      const reloaded = page.waitForEvent('load');
      await goTab(page, 'events');
      await reloaded; // the page picked up the "new version"
      await expect(page.locator('main h1')).toBeVisible();
      await goTab(page, 'events');
      await expect(page.locator('main article').first()).toBeVisible();
    });
  });
});

test.describe('errors inside the page (no browser alerts)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a refused action shows a message in the page; it can be closed; no browser dialog', async ({ page }) => {
    const alerts: string[] = [];
    page.on('dialog', d => { alerts.push(d.message()); void d.dismiss(); });
    await openApp(page, 'Алихан Берік'); // super_admin
    await goTab(page, 'admin');
    await page.locator('main [data-admin-tab="users"]').click();
    const box = page.locator('main form').filter({ has: page.locator('input[type="number"]') }).first();
    await box.locator('select').selectOption('user-member-3');
    await box.locator('input[type="number"]').fill('-999999'); // more than the member has: balance never goes below zero
    await box.locator('input[type="text"]').fill('Тексеру');
    await box.locator('button[type="submit"]').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Растау' }).click();
    const msg = page.locator('[data-app-error]');
    await expect(msg).toBeVisible();
    await expect(msg).toHaveAttribute('role', 'alert');
    await msg.getByRole('button').click();
    await expect(msg).toHaveCount(0);
    expect(alerts).toEqual([]);
  });
});

test.describe('phone menu "More" is a dialog', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('named dialog; Escape closes it and focus returns to the menu button; the page scrolls again', async ({ page }) => {
    await openApp(page);
    const more = page.locator('nav[aria-label] button').nth(4);
    await more.click();
    const sheet = page.getByRole('dialog', { name: 'Тағы' });
    await expect(sheet).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  });
});
