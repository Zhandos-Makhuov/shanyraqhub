import { Page } from '@playwright/test';
import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow } from './fixtures';

/**
 * Phase 2.4.2 — forum search and section filter (F-15), multi-line reply field (F-18),
 * opening a topic from a notification (F-16). Demo data, no database.
 */

const TOPICS_KEY = 'shanyraq_hub_app_state_v1_topics';
const NOTIFS_KEY = 'shanyraq_hub_app_state_v1_notifs';
const openForum = (page: Page) => goTab(page, 'forum', /Форум|Forum/);
const visibleCards = (page: Page) => page.locator('main [data-topic-card]');
const ids = (page: Page) => visibleCards(page).evaluateAll(els => els.map(e => e.getAttribute('data-topic-card')));

/** Adjust stored demo data before the app starts (key → function body that gets and returns the parsed value). */
async function patchStore(page: Page, key: string, body: string) {
  await page.addInitScript(([k, b]) => {
    const raw = localStorage.getItem(k as string);
    const value = raw ? JSON.parse(raw) : [];
    // eslint-disable-next-line no-new-func
    localStorage.setItem(k as string, JSON.stringify(new Function('value', b as string)(value)));
  }, [key, body] as const);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
}

/** A notification for the visitor (the new member) about a topic. */
const notifFor = (topicId: string, title = 'Тақырыбыңызға жаңа жауап') =>
  `return [{ id: 'n-${topicId}', userId: 'user-new-member', type: 'forum_reply', title: '${title}', message: 'Тест', timestamp: '23 қар. 2026, 10:00', read: false, linkTab: 'forum', topicId: '${topicId}' }, ...value];`;

async function openNotification(page: Page, title: string) {
  await page.locator('header button:has(.lucide-bell)').click();
  await page.locator('header').getByText(title, { exact: true }).first().click();
}

test.describe('search and filter (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('title, reply text, several words; count; no results; reset', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    expect(await ids(page)).toEqual(['topic-1', 'topic-2']);
    const search = page.getByLabel('Тақырыптардан іздеу');
    await search.fill('IDIOMS');
    expect(await ids(page)).toEqual(['topic-2']);
    await expect(page.locator('main [data-found-count]')).toHaveText('Табылды: 1 / 2');
    await search.fill('klara'); // only in a reply of topic-1
    expect(await ids(page)).toEqual(['topic-1']);
    await search.fill('klara idioms'); // every word must match the same topic
    await expect(page.locator('main [data-forum-no-results]')).toContainText('Сәйкес тақырып табылмады');
    await expect(visibleCards(page)).toHaveCount(0);
    await page.locator('main [data-forum-no-results] button').click();
    await expect(search).toHaveValue('');
    expect(await ids(page)).toEqual(['topic-1', 'topic-2']);
    await expect(page.locator('main [data-found-count]')).toHaveCount(0);
    await noHorizontalOverflow(page);
  });

  test('section filter, combined with search, kept when switching to rooms and back', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    const section = page.getByLabel('Бөлім', { exact: true });
    await section.selectOption('english');
    expect(await ids(page)).toEqual(['topic-2']);
    await page.getByLabel('Тақырыптардан іздеу').fill('книги');
    await expect(page.locator('main [data-forum-no-results]')).toBeVisible();
    await page.getByLabel('Тақырыптардан іздеу').fill('');
    await page.locator('main [aria-pressed]', { hasText: 'Жабық бөлмелер' }).click();
    await page.locator('main [aria-pressed]', { hasText: 'Ашық талқылаулар' }).click();
    await expect(section).toHaveValue('english');
    expect(await ids(page)).toEqual(['topic-2']);
    await page.locator('main [data-reset-filters]').click();
    await expect(section).toHaveValue('all');
    expect(await ids(page)).toEqual(['topic-1', 'topic-2']);
  });
});

test.describe('reply field (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('multi-line: grows, stops growing and scrolls; paragraphs kept after sending', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await page.locator('main [data-topic-card="topic-2"]').click();
    const field = page.locator('#forum-reply');
    expect(await field.evaluate(el => el.tagName)).toBe('TEXTAREA');
    const h1 = await field.evaluate(el => el.getBoundingClientRect().height);
    await field.fill('Бірінші жол\nЕкінші жол\nҮшінші жол');
    const h3 = await field.evaluate(el => el.getBoundingClientRect().height);
    expect(h3).toBeGreaterThan(h1);
    await field.fill(Array.from({ length: 20 }, (_, i) => `Жол ${i + 1}`).join('\n'));
    const hMax = await field.evaluate(el => el.getBoundingClientRect().height);
    expect(hMax).toBeLessThanOrEqual(170);
    expect(await field.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    // The send button is still inside the form.
    const inside = await page.locator('main [data-reply-form]').evaluate(f => {
      const fr = f.getBoundingClientRect();
      const b = f.querySelector('button[type="submit"]')!.getBoundingClientRect();
      return b.left >= fr.left - 1 && b.right <= fr.right + 1;
    });
    expect(inside).toBe(true);
    await field.fill('Бірінші абзац.\n\nЕкінші абзац.');
    await page.locator('main [data-reply-form] button[type="submit"]').click();
    const last = page.locator('main [data-reply-id]').last().locator('p');
    expect((await last.innerText()).split('\n').filter(Boolean)).toEqual(['Бірінші абзац.', 'Екінші абзац.']);
    await expect(field).toHaveValue('');
    await noHorizontalOverflow(page);
  });

  test('a fast double tap sends one reply', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await page.locator('main [data-topic-card="topic-2"]').click();
    const before = await page.locator('main [data-reply-id]').count();
    await page.locator('#forum-reply').fill('Бір рет қана');
    await page.locator('main [data-reply-form] button[type="submit"]').evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
    await expect(page.locator('main [data-reply-id]')).toHaveCount(before + 1);
    await page.waitForTimeout(300);
    await expect(page.locator('main [data-reply-id]')).toHaveCount(before + 1);
  });

  test('a rejected reply keeps the multi-line text', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await page.locator('main [data-topic-card="topic-2"]').click();
    const field = page.locator('#forum-reply');
    const tooLong = 'жол\n'.repeat(2600); // > 10 000 characters (database limit)
    await field.evaluate(el => el.removeAttribute('maxlength'));
    await field.fill(tooLong);
    await expect(page.locator('main [data-reply-counter]')).toBeVisible();
    await page.locator('main [data-reply-form] button[type="submit"]').click();
    await expect(page.locator('main [data-reply-error]')).toBeVisible();
    await expect(field).toHaveValue(tooLong);
  });
});

test.describe('reply field (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 860 } });
  test('Enter = new line, Ctrl+Enter = send', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await page.locator('main [data-topic-card="topic-2"]').click();
    const field = page.locator('#forum-reply');
    await field.click();
    await page.keyboard.type('Бір');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Екі');
    await expect(field).toHaveValue('Бір\nЕкі');
    const before = await page.locator('main [data-reply-id]').count();
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('main [data-reply-id]')).toHaveCount(before + 1);
    await expect(field).toHaveValue('');
    await expect(page.locator('#forum-reply-hint')).toContainText('Ctrl+Enter — жіберу');
  });
});

for (const [w, h] of [[320, 568], [360, 740], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 860]]) {
  test.describe(`${w}px discovery`, () => {
    const mobile = w < 768;
    test.use({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    test('filters and reply field fit; notification opens the topic', async ({ page }) => {
      await openApp(page);
      await patchStore(page, NOTIFS_KEY, notifFor('topic-2'));
      await openForum(page);
      await page.getByLabel('Тақырыптардан іздеу').fill('Ұзын іздеу сөзі '.repeat(6));
      await noHorizontalOverflow(page);
      await page.locator('main [data-forum-no-results] button').click();
      await page.locator('main [data-topic-card="topic-2"]').click();
      await page.locator('#forum-reply').fill('Жол\n'.repeat(10));
      await noHorizontalOverflow(page);
      // Another section, then the notification → the topic opens.
      await goTab(page, 'library');
      await openNotification(page, 'Тақырыбыңызға жаңа жауап');
      await expect(page.locator('#forum-topic-title')).toContainText('Top 10 Idioms');
      await expect(page.locator('#forum-topic-title')).toBeVisible();
      await noHorizontalOverflow(page);
    });
  });
}

test.describe('notifications → topic (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('while the forum is open, filters are cleared and the topic opens', async ({ page }) => {
    await openApp(page);
    await patchStore(page, NOTIFS_KEY, notifFor('topic-1'));
    await openForum(page);
    await page.getByLabel('Бөлім', { exact: true }).selectOption('english'); // topic-1 is filtered out
    await openNotification(page, 'Тақырыбыңызға жаңа жауап');
    await expect(page.locator('#forum-topic-title')).toContainText('Какие 3 книги');
    await expect(page.locator('#forum-topic-title')).toBeFocused();
    await page.getByRole('button', { name: 'Барлық тақырыптарға оралу' }).click();
    await expect(page.getByLabel('Бөлім', { exact: true })).toHaveValue('all');
  });

  test('a closed topic opens with its notice; a missing topic shows a clear message', async ({ page }) => {
    await openApp(page);
    await patchStore(page, TOPICS_KEY, `return value.map(t => t.id === 'topic-2' ? { ...t, isClosed: true } : t);`);
    await patchStore(page, NOTIFS_KEY, notifFor('topic-2') + '');
    await openNotification(page, 'Тақырыбыңызға жаңа жауап');
    await expect(page.locator('main [data-closed-notice]')).toBeVisible();
    await expect(page.locator('main [data-reply-form]')).toHaveCount(0);
    await patchStore(page, NOTIFS_KEY, `return [{ id: 'n-gone', userId: 'user-new-member', type: 'forum_reply', title: 'Жойылған тақырып', message: 'Тест', timestamp: '23 қар. 2026, 10:00', read: false, linkTab: 'forum', topicId: 'topic-deleted' }];`);
    await openNotification(page, 'Жойылған тақырып');
    await expect(page.locator('main [data-topic-not-found]')).toContainText('Тақырып табылмады');
    await expect(page.locator('main [data-topic-card]')).toHaveCount(2); // the list is shown
    await page.locator('main [data-topic-not-found] button').click();
    await expect(page.locator('main [data-topic-not-found]')).toHaveCount(0);
  });

  test('demo, like the server: the topic author gets a notification about a reply and it opens the topic', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await page.locator('main [data-topic-card="topic-2"]').click(); // author: Дана Серік
    await page.locator('#forum-reply').fill('Жаңа жауап');
    await page.locator('main [data-reply-form] button[type="submit"]').click();
    await page.locator('header button').last().click();
    await page.locator('button', { hasText: 'Дана Серік' }).first().click();
    await expect(page.locator('header')).toContainText('Дана');
    await openNotification(page, 'Тақырыбыңызға жаңа жауап');
    await expect(page.locator('#forum-topic-title')).toContainText('Top 10 Idioms');
  });
});

test.describe('discovery languages', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const lang of ['ru', 'en'] as const) {
    test(`${lang}: search, filter and messages are translated`, async ({ page }) => {
      await openApp(page);
      await setLanguage(page, lang);
      await openForum(page);
      await page.getByLabel(lang === 'ru' ? 'Поиск по темам' : 'Search topics').fill('zzzz');
      await expect(page.locator('main [data-forum-no-results]')).toContainText(lang === 'ru' ? 'Подходящих тем не найдено' : 'No matching topics');
      await expect(page.locator('main [data-found-count]')).toHaveText(lang === 'ru' ? 'Найдено: 0 из 2' : 'Found: 0 of 2');
      await expect(page.locator('#forum-section-filter option').first()).toHaveText(lang === 'ru' ? 'Все разделы' : 'All sections');
    });
  }
});
