import { test, expect, openApp, goTab, openMore, setLanguage } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Phase 6 — Notifications, return paths & continuity:
 *  - N-4: Back (browser / Android / Telegram) walks sections and closes windows; a reload keeps the section;
 *  - C-16: direct links ?event= / ?topic= / ?n= (own notification), unavailable targets, copy link;
 *  - notifications: opening one marks only it read; a review opens the profile's reviews.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const home = (page: Page) => page.locator('main h1', { hasText: 'Қош келдіңіз' });
const eventsPage = (page: Page) => page.locator('[data-events-mine]');
const libraryPage = (page: Page) => page.locator('main h1', { hasText: 'Кім қандай кітап оқыды' });
const eventDialog = (page: Page) => page.locator('[data-event-dialog]');
const unread = async (page: Page) => {
  const badge = page.locator('header [data-unread-count]');
  return (await badge.count()) ? Number(await badge.innerText()) : 0;
};

test.describe('Back (N-4)', () => {
  test('sections: Back returns to the previous section, then to the home page', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'events');
    await goTab(page, 'library');
    await expect(libraryPage(page)).toBeVisible();
    await page.goBack();
    await expect(eventsPage(page)).toBeVisible();
    await page.goBack();
    await expect(home(page)).toBeVisible();
  });

  test('a window: Back closes it and stays in the section; closed with Escape it leaves no extra step', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'events');
    await page.locator('main article').first().click();
    await expect(eventDialog(page)).toBeVisible();
    await page.goBack();
    await expect(eventDialog(page)).toHaveCount(0);
    await expect(eventsPage(page)).toBeVisible();
    await page.locator('main article').first().click();
    await expect(eventDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(eventDialog(page)).toHaveCount(0);
    await page.goBack(); // no "dead" press: straight to the previous section
    await expect(home(page)).toBeVisible();
  });

  test('a window closed with its ✕ button leaves no extra step either', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'events');
    await page.locator('main article').first().click();
    await expect(eventDialog(page)).toBeVisible();
    await eventDialog(page).getByRole('button', { name: 'Жабу' }).first().click();
    await expect(eventDialog(page)).toHaveCount(0);
    await page.goBack();
    await expect(home(page)).toBeVisible();
  });

  test('forum on a phone: Back from a topic returns to the list, then home', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'forum', /Форум/);
    await page.locator('[data-topic-card]').first().click();
    await expect(page.locator('#forum-topic-title')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#forum-topic-title')).toBeHidden();
    await expect(page.locator('[data-topic-card]').first()).toBeVisible();
    await page.goBack();
    await expect(home(page)).toBeVisible();
  });

  test('the notification panel and the "More" sheet close with Back; the page stays', async ({ page }) => {
    await openApp(page);
    await page.locator('header [data-bell]').click();
    await expect(page.getByText('Жаңа хабарлама жоқ')).toBeVisible();
    await page.goBack();
    await expect(page.getByText('Жаңа хабарлама жоқ')).toHaveCount(0);
    await expect(home(page)).toBeVisible();
    await openMore(page);
    await page.goBack();
    await expect(page.locator('.fixed .grid button')).toHaveCount(0);
    await expect(home(page)).toBeVisible();
  });

  test('"More" → a section → Back returns to where you were, not to the sheet', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'events');
    await goTab(page, 'forum', /Форум/);
    await page.goBack();
    await expect(eventsPage(page)).toBeVisible();
    await expect(page.locator('.fixed .grid button')).toHaveCount(0);
  });

  test('a reload keeps the section (P4-14); Back still works after it', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'events');
    await goTab(page, 'library');
    await page.reload();
    await expect(libraryPage(page)).toBeVisible();
    await page.goBack();
    await expect(eventsPage(page)).toBeVisible();
  });

  test('desktop: browser Back works the same with the top tabs', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApp(page);
    await goTab(page, 'events');
    await goTab(page, 'achievements');
    await page.goBack();
    await expect(eventsPage(page)).toBeVisible();
    await page.goBack();
    await expect(home(page)).toBeVisible();
  });
});

test.describe('direct links (C-16)', () => {
  test('/?event=<id> opens that event, the address is cleaned; Back → events → home', async ({ page }) => {
    await openApp(page);
    await page.goto('/?event=event-1');
    await expect(eventDialog(page)).toBeVisible();
    expect(page.url()).not.toContain('event=');
    await page.goBack();
    await expect(eventDialog(page)).toHaveCount(0);
    await expect(eventsPage(page)).toBeVisible();
    await page.goBack();
    await expect(home(page)).toBeVisible();
  });

  test('an event that does not exist: an honest message, no crash', async ({ page }) => {
    await openApp(page);
    await page.goto('/?event=no-such-event');
    await expect(page.locator('[data-event-not-found]')).toContainText('Бұл кездесу енді қолжетімсіз');
    await expect(eventDialog(page)).toHaveCount(0);
  });

  test('a malformed link is ignored (home page, address cleaned)', async ({ page }) => {
    await openApp(page);
    await page.goto('/?event=' + encodeURIComponent('<script>'));
    await expect(home(page)).toBeVisible();
    expect(page.url()).not.toContain('event=');
  });

  test('/?topic=<id> opens the topic; an unknown topic shows a message', async ({ page }) => {
    await openApp(page);
    await page.goto('/?topic=topic-1');
    await expect(page.locator('#forum-topic-title')).toContainText('Какие 3 книги');
    await page.goto('/?topic=gone-topic');
    await expect(page.locator('[data-topic-not-found]')).toBeVisible();
  });

  test('a tapped push while the site is open (?n=<own notification>): opens what it is about, marks only it read', async ({ page }) => {
    // Demo accounts do not survive a reload, so the "site already open" path is used: the service worker
    // posts { type: 'shq-open', url: '/?n=…' } to the open tab (public/sw.js, notificationclick).
    await openApp(page, 'Алихан Берік');
    const before = await unread(page);
    expect(before).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'shq-open', url: '/?n=notif-2' } })));
    await expect(page.locator('#prf-tab-reviews')).toHaveAttribute('aria-selected', 'true'); // "new review" -> reviews
    await expect.poll(() => unread(page)).toBe(before - 1);
    await page.goBack(); // Back returns to where the member was
    await expect(home(page)).toBeVisible();
  });

  test("someone else's notification id finds nothing: a message, nothing opens", async ({ page }) => {
    await openApp(page); // the new member; notif-2 belongs to another member
    await page.goto('/?n=notif-2');
    await expect(page.locator('[data-app-error]')).toContainText('Бұл хабарлама енді қолжетімсіз');
    await expect(home(page)).toBeVisible();
  });

  test('copy link in the event window → the link opens the same event', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page);
    await goTab(page, 'events');
    await page.locator('main article').first().click();
    const title = await eventDialog(page).locator('#event-detail-title').innerText();
    await eventDialog(page).locator('[data-event-copy-link]').click();
    await expect(page.locator('[data-link-copied]')).toContainText('Сілтеме көшірілді');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/^http:\/\/localhost:\d+\/\?event=[\w-]+$/);
    await page.goto(link);
    await expect(eventDialog(page).locator('#event-detail-title')).toHaveText(title);
  });

  test('copy link button is labelled in ru and en', async ({ page }) => {
    await openApp(page);
    await setLanguage(page, 'en');
    await goTab(page, 'events');
    await page.locator('main article').first().click();
    await expect(eventDialog(page).locator('[data-event-copy-link]')).toHaveAttribute('aria-label', 'Copy the link to this event');
  });
});

test.describe('notifications', () => {
  test('the bell: opening one notification marks only that one read and opens its section', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    const before = await unread(page);
    await page.locator('header [data-bell]').click();
    await page.locator('[data-notif-item="notif-1"]').click();
    await expect(eventsPage(page)).toBeVisible();
    await expect.poll(() => unread(page)).toBe(before - 1);
  });
});

test.describe('Telegram Mini App (simulated bridge)', () => {
  test('Telegram Back button appears with history, its press goes back, hides at the start', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('shq_tg_init_data', 'test');
      (window as any).__tg = [];
      (window as any).TelegramWebviewProxy = { postEvent: (t: string, d: string) => (window as any).__tg.push([t, JSON.parse(d)]) };
    });
    await openApp(page);
    const backCalls = () => page.evaluate(() => (window as any).__tg.filter((e: any) => e[0] === 'web_app_setup_back_button').map((e: any) => e[1].is_visible));
    await goTab(page, 'events');
    await expect.poll(async () => (await backCalls()).at(-1)).toBe(true);
    await page.evaluate(() => (window as any).Telegram.WebView.receiveEvent('back_button_pressed', null));
    await expect(home(page)).toBeVisible();
    await expect.poll(async () => (await backCalls()).at(-1)).toBe(false);
  });
});
