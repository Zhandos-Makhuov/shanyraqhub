import { test, expect, openApp, goTab, setLanguage } from './fixtures';

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
      // The file is "gone" until the page has reloaded (= picked up the new version), whatever the timing.
      let loads = 0;
      page.on('load', () => { loads++; });
      await page.route(/EventsView-[^/]+\.js$/, route => (loads < 2 ? route.abort() : route.continue()));
      await openApp(page);
      const reloaded = page.waitForEvent('load');
      await goTab(page, 'events');
      await reloaded; // the page reloaded by itself
      await expect(page.locator('main h1')).toBeVisible();
      await goTab(page, 'events');
      await expect(page.locator('main article').first()).toBeVisible();
      await expect(page.locator('main [data-view-failed]')).toHaveCount(0);
    });

    test('if the file still cannot be loaded: a message with a reload button, no crash, no reload loop', async ({ page }) => {
      let loads = 0;
      page.on('load', () => { loads++; });
      await page.route(/EventsView-[^/]+\.js$/, route => route.abort()); // never available
      await openApp(page);
      const reloaded = page.waitForEvent('load');
      await goTab(page, 'events');
      await reloaded;
      // Phase 6 (N-4, closes P4-14): after the reload the same section is restored, so the message shows at once.
      const failed = page.locator('main [data-view-failed]');
      await expect(failed).toBeVisible();
      await expect(failed).toHaveAttribute('role', 'alert');
      await expect(failed.getByRole('button', { name: 'Жаңарту' })).toBeVisible();
      await page.waitForTimeout(500);
      expect(loads).toBe(2); // one automatic reload only
      await page.locator('nav[aria-label] button').nth(0).click(); // the rest of the site works
      await expect(page.locator('main h1')).toBeVisible();
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

/* ---------------- Phase 4.1 ---------------- */

const STATUS_TITLE = { kz: 'Деректер күйі және архитектура', ru: 'Статус данных и архитектура', en: 'Data status and architecture' };

test.describe('data status window in three languages (P4-8b)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  for (const lang of ['kz', 'ru', 'en'] as const) {
    test(`${lang}: translated, a dialog (Escape), reset asks in the site's own window`, async ({ page }) => {
      const alerts: string[] = [];
      page.on('dialog', d => { alerts.push(d.message()); void d.dismiss(); });
      await openApp(page);
      if (lang !== 'kz') await setLanguage(page, lang);
      await page.locator('header button:has(.lucide-database)').click(); // the "Demo" badge
      const dlg = page.getByRole('dialog', { name: STATUS_TITLE[lang] });
      await expect(dlg).toBeVisible();
      const text = (await dlg.innerText()).replace(/Supabase PostgreSQL & Auth|PWA & Service Worker|Shanyraq Hub|Supabase RLS|Supabase/g, '');
      if (lang === 'en') expect(text).not.toMatch(/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/); // no Russian/Kazakh left
      if (lang === 'kz') expect(text).not.toMatch(/Внимание|Загружено|Понятно|Сбросить/);
      await dlg.locator('button', { hasText: { kz: 'Демо деректерді бастапқы күйге қайтару', ru: 'Сбросить демо-данные', en: 'Reset demo data' }[lang] }).click();
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: { kz: 'Болдырмау', ru: 'Отмена', en: 'Cancel' }[lang] }).click();
      await expect(confirm).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(dlg).toHaveCount(0);
      expect(alerts).toEqual([]);
    });
  }

  test('phone 320: the window fits without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openApp(page);
    await page.locator('header button').last().click();
    await page.locator('header button.font-mono').filter({ visible: true }).last().click(); // user menu → "data status"
    const dlg = page.locator('[data-status-dialog]');
    await expect(dlg).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBe(0);
    const box = await dlg.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  });
});

test.describe('demo notifications follow the language (P4-8a)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  for (const [lang, title] of [['kz', 'Іс-шараға сәтті жазылдыңыз'], ['ru', 'Успешная регистрация на мероприятие'], ['en', 'You are signed up']] as const) {
    test(`${lang}: the sign-up notice is in ${lang}`, async ({ page }) => {
      await openApp(page);
      if (lang !== 'kz') await setLanguage(page, lang);
      await goTab(page, 'events');
      await page.locator('main article [data-event-action="register"]').first().click();
      await page.locator('header button:has(.lucide-bell)').click();
      await expect(page.locator('header').getByText(title).first()).toBeVisible();
      await expect(page.locator('header').getByText({ kz: 'Жаңа ғана', ru: 'Только что', en: 'Just now' }[lang]).first()).toBeVisible();
    });
  }
});

test.describe('bronze level on the highlighted "you" row (P4-7)', () => {
  const YOU = '(Сіз)';
  for (const [w, h] of [[390, 844], [1280, 900]] as const) {
    test(`${w}px: lighter bronze on your own row only`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openApp(page); // the newcomer is bronze
      await goTab(page, 'leaderboard');
      const row = w < 768
        ? page.locator('main button[data-member-row]').filter({ visible: true }).filter({ hasText: YOU })
        : page.locator('main tr').filter({ hasText: YOU });
      await expect(row).toHaveCount(1);
      await expect(row.locator('.text-amber-500')).toHaveCount(1); // lighter bronze on the highlighted row
      await expect(row.locator('.text-amber-600')).toHaveCount(0);
      // other bronze members keep the tier colour
      const others = w < 768 ? page.locator('main button[data-member-row]').filter({ visible: true }) : page.locator('main tr');
      await expect(others.filter({ hasNotText: YOU }).locator('.text-amber-500')).toHaveCount(0);
    });
  }
});
