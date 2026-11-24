import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow } from './fixtures';

/**
 * Phase 5 — Member Experience & Engagement:
 *  - home: "first steps" for a new member (real done-state, can be hidden) and "continue" (reading, my discussions, my sign-ups);
 *  - events: "my events" filter; forum: "my discussions" filter and "replies since yours";
 *  - profile: "my contribution" (all time and this month).
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const steps = (page: import('@playwright/test').Page) => page.locator('[data-first-steps]');

test.describe('first steps (new member)', () => {
  test('five steps, none done; hidden steps stay hidden after reload', async ({ page }) => {
    await openApp(page);
    await expect(steps(page)).toBeVisible();
    await expect(steps(page).locator('[data-first-step]')).toHaveCount(5);
    await expect(steps(page).locator('[data-done="true"]')).toHaveCount(0);
    await expect(steps(page).locator('[data-first-steps-count]')).toHaveText('5 қадамның 0 орындалды');
    await steps(page).locator('[data-first-steps-hide]').click();
    await expect(steps(page)).toHaveCount(0);
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    await expect(steps(page)).toHaveCount(0);
  });

  test('"sign up for an event" becomes done after a real registration', async ({ page }) => {
    await openApp(page);
    await steps(page).locator('[data-first-step="event"]').click();
    await expect(page.locator('main [data-view-loading]')).toHaveCount(0);
    const card = page.locator('main article').filter({ has: page.locator('button', { hasText: /^Жазылу$/ }) }).first();
    await card.locator('button', { hasText: /^Жазылу$/ }).click();
    await expect(page.locator('main article').filter({ hasText: 'Сіз жазылдыңыз' }).first()).toBeVisible();
    await goTab(page, 'dashboard');
    await expect(steps(page).locator('[data-first-step="event"]')).toHaveAttribute('data-done', 'true');
    await expect(steps(page).locator('[data-first-steps-count]')).toHaveText('5 қадамның 1 орындалды');
    // ...and "continue" now offers "my sign-ups", which opens the events page filtered to mine
    await page.locator('[data-continue-my-events]').click();
    await expect(page.locator('main [data-view-loading]')).toHaveCount(0);
    await expect(page.locator('[data-events-mine]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('main article')).toHaveCount(1);
  });

  test('profile and book steps open the right screens; "continue" is absent with nothing to continue', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('[data-continue]')).toHaveCount(0);
    await steps(page).locator('[data-first-step="book"]').click();
    await expect(page.locator('main [data-view-loading]')).toHaveCount(0);
    await expect(page.locator('main')).toContainText('Оқылған кітапты қосу');
    await goTab(page, 'dashboard');
    await steps(page).locator('[data-first-step="profile"]').click();
    await expect(page.locator('main [data-view-loading]')).toHaveCount(0);
    await expect(page.locator('[data-my-contribution]')).toBeVisible();
  });

  test('ru and en texts', async ({ page }) => {
    await openApp(page);
    await setLanguage(page, 'ru');
    await expect(steps(page)).toContainText('Первые шаги в клубе');
    await expect(steps(page)).toContainText('Запишитесь на встречу');
    await setLanguage(page, 'en');
    await expect(steps(page)).toContainText('First steps in the club');
    await expect(steps(page)).toContainText('Post in the forum');
  });
});

test.describe('continue (member with activity)', () => {
  test('a member with every step done does not see "first steps"', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await expect(steps(page)).toHaveCount(0);
  });

  test('"first steps" are for newcomers only: hidden for members who already have a confirmed visit', async ({ page }) => {
    for (const name of ['Айзере Мұрат', 'Дана Серік']) {
      await openApp(page, name);
      await expect(steps(page)).toHaveCount(0);
    }
  });

  test('"reading now" opens the book window in Books', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    const book = page.locator('[data-continue-book]').first();
    await expect(book).toContainText('Шумерский миф');
    await book.click();
    const dlg = page.locator('[data-book-dialog]');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('#book-detail-title')).toContainText('Шумерский миф');
  });

  test('a discussion with replies after my last post opens that topic', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    const topic = page.locator('[data-continue-topic="topic-1"]');
    await expect(topic).toContainText('Сізден кейін 2 жауап');
    await topic.click();
    await expect(page.locator('#forum-topic-title')).toContainText('Какие 3 книги');
  });

  test('"my discussions" opens the forum filtered to topics I took part in', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await page.locator('[data-continue-my-topics]').click();
    await expect(page.locator('main [data-view-loading]')).toHaveCount(0);
    await expect(page.locator('#forum-section-filter')).toHaveValue('__mine');
    await expect(page.locator('[data-topic-card]')).toHaveCount(1);
    await expect(page.locator('[data-topic-card="topic-1"] [data-topic-new-replies]')).toHaveText('Сізден кейін 2 жауап');
    await page.locator('[data-reset-filters]').first().click();
    await expect(page.locator('#forum-section-filter')).toHaveValue('all');
    expect(await page.locator('[data-topic-card]').count()).toBeGreaterThan(1);
  });

  test('a replier sees only replies written after their own reply', async ({ page }) => {
    // Айзере replied last in topic-1 → nothing new for her there; the topic is still in "my discussions".
    await openApp(page, 'Айзере Мұрат');
    await goTab(page, 'forum', /Форум/);
    await page.locator('#forum-section-filter').selectOption('__mine');
    await expect(page.locator('[data-topic-card="topic-1"]')).toBeVisible();
    await expect(page.locator('[data-topic-card="topic-1"] [data-topic-new-replies]')).toHaveCount(0);
  });
});

test.describe('events: my events', () => {
  test('empty for a new member, with an honest hint; the chip toggles', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'events');
    const chip = page.locator('[data-events-mine]');
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('main article')).toHaveCount(0);
    await expect(page.locator('main')).toContainText('Сіз әлі ешбір кездесуге жазылмағансыз');
    await chip.click();
    expect(await page.locator('main article').count()).toBeGreaterThan(0);
  });

  test('a member with visits sees their past events under "mine"', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await goTab(page, 'events');
    await page.locator('[data-events-mine]').click();
    const n = await page.locator('main article').count();
    expect(n).toBeGreaterThan(0);
    await noHorizontalOverflow(page);
  });
});

test.describe('profile: my contribution', () => {
  test('a new member sees an empty-state line, no zero tiles', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'profile', /Жеке кабинет|Профиль/);
    const box = page.locator('[data-my-contribution]');
    await expect(box).toContainText('Клубқа қосқан үлесім');
    await expect(box.locator('[data-contribution]')).toHaveCount(0);
  });

  test('counts come from real records (visits = confirmed attendances, topics = own topics)', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await goTab(page, 'profile', /Жеке кабинет|Профиль/);
    const box = page.locator('[data-my-contribution]');
    await expect(box.locator('[data-contribution]')).toHaveCount(6);
    await expect(box.locator('[data-contribution="topics"] [data-total]')).toHaveText('1');
    // Home "visits" tile and the contribution use the same rule (confirmed attendance on loaded events).
    const visits = await box.locator('[data-contribution="visits"] [data-total]').innerText();
    await goTab(page, 'dashboard');
    await expect(page.locator('main').getByText(visits, { exact: true }).first()).toBeVisible();
  });
});

test.describe('layout', () => {
  for (const width of [320, 768, 1280]) {
    test(`no horizontal scroll at ${width}px (home with both blocks, profile, forum filter)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openApp(page);
      await expect(steps(page)).toBeVisible();
      await noHorizontalOverflow(page);
      await openApp(page, 'Алихан Берік');
      await expect(page.locator('[data-continue]')).toBeVisible();
      await noHorizontalOverflow(page);
      await goTab(page, 'profile', /Жеке кабинет|Профиль/);
      await noHorizontalOverflow(page);
    });
  }
});
