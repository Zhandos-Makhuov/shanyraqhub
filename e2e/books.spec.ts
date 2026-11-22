import { test, expect, openApp, goTab, setLanguage, coins, noHorizontalOverflow } from './fixtures';

const grid = (page: import('@playwright/test').Page) => page.locator('main [data-books-grid] > button');

test.describe('desktop', () => {
  test('catalogue: one card per book, search, my shelf', async ({ page }) => {
    await openApp(page, 'Дана Серік');
    await setLanguage(page, 'ru');
    await goTab(page, 'library');
    const n = await grid(page).count();
    const counter = await page.locator('button[aria-pressed]', { hasText: 'Книги клуба' }).innerText();
    expect(Number(counter.replace(/\D/g, ''))).toBe(n);
    const titles = (await grid(page).locator('> span > span.font-display').allInnerTexts()).map(t => t.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    await page.locator('input[type="search"]').fill('Абай');
    await expect(grid(page)).toHaveCount(1);
    await page.locator('input[type="search"]').fill('zzzz');
    await expect(page.locator('main')).toContainText('Ничего не найдено');
    await page.locator('input[type="search"]').fill('');
    await page.locator('button[aria-pressed]', { hasText: 'Моя полка' }).click();
    await expect(grid(page)).toHaveCount(2);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('reading → read with a 100+ review is counted by the existing rule', async ({ page }) => {
    await openApp(page); // new member, 0 coins
    await setLanguage(page, 'ru');
    await goTab(page, 'library');
    const before = await coins(page);
    await grid(page).first().click();
    const dlg = page.locator('[role="dialog"]');
    await expect(dlg.locator('.btn-primary')).toBeInViewport();
    await dlg.locator('button', { hasText: 'Читаю' }).click();
    const form = page.locator('form');
    await expect(form.locator('input').first()).toHaveAttribute('readonly', '');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('main')).toContainText('Сохранено на вашей полке');
    await page.locator('button[aria-pressed]', { hasText: 'Моя полка' }).click();
    await expect(grid(page)).toHaveCount(1);
    await grid(page).first().click();
    await page.locator('[role="dialog"] .btn-primary').click();
    await form.locator('button[aria-pressed]', { hasText: 'Прочитано' }).click();
    await form.locator('textarea').fill('Книга помогла мне по-новому взглянуть на историю степи и на то, как язык хранит память народа. Рекомендую клубу.');
    await expect(form).toContainText('Засчитается');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('main')).toContainText('Сохранено и засчитано');
    expect(await coins(page)).toBeGreaterThanOrEqual(before + 30);
    await expect(page.locator('main section').first()).toContainText('уже засчитана'); // one book per week
  });

  test('phone covers are 3:4 in the grid, 2:3 in the detail', async ({ page }) => {
    await openApp(page, 'Дана Серік');
    await goTab(page, 'library');
    const ratio = (loc: import('@playwright/test').Locator) => loc.evaluate(el => { const r = el.getBoundingClientRect(); return r.height / r.width; });
    expect(await ratio(grid(page).first().locator('[class*="aspect-"]').first())).toBeCloseTo(4 / 3, 1);
    await grid(page).first().click();
    expect(await ratio(page.locator('[role="dialog"] [class*="aspect-"]').first())).toBeCloseTo(1.5, 1);
  });
});

test.describe('short phone 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  test('add form scrolls, Save and close stay visible', async ({ page }) => {
    await openApp(page, 'Дана Серік');
    await goTab(page, 'library');
    await page.locator('main button.btn-primary').first().click();
    const form = page.locator('form');
    await expect(form.locator('button[type="submit"]')).toBeInViewport();
    await form.locator('.overflow-y-auto').evaluate(el => { el.scrollTop = 1e5; });
    await expect(form.locator('button[type="submit"]')).toBeInViewport();
    await expect(form.locator('button[aria-label]').first()).toBeInViewport();
    await noHorizontalOverflow(page);
  });
});
