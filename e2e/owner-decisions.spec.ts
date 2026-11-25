import { test, expect, openApp, goTab, setLanguage } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Owner decisions 25.11.2026 (server rules are covered by supabase/tests/security_tests.sql):
 *  - S-3a (a): a finished book cannot go back to "reading" — the edit form does not offer it;
 *  - C-20 (via P5-10 (a)): admin forms pick a member with a search field;
 *  - peer review (b): 1–5 stars.
 */
const cards = (page: Page) => page.locator('main [data-books-grid] > button');
const bookDialog = (page: Page) => page.locator('[data-book-dialog]');
const form = (page: Page) => page.locator('[data-book-form]');

test.describe('S-3a: a finished book stays finished (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('editing a finished book: "reading" is disabled with an explanation; rating/review stay editable', async ({ page }) => {
    await openApp(page, 'Дана Серік');
    await goTab(page, 'library');
    await page.locator('button[aria-pressed]', { hasText: 'Менің сөрем' }).click();
    await cards(page).first().click();
    await bookDialog(page).getByRole('button', { name: 'Өзгерту' }).click();
    await expect(form(page).locator('[data-status-option="completed"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(form(page).locator('[data-status-option="reading"]')).toBeDisabled();
    await expect(form(page).locator('[data-finished-locked]')).toContainText('қайтаруға болмайды');
    await expect(form(page).locator('textarea').first()).toBeEditable();
  });

  test('a book being read can still be finished (the rule is one-way)', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await goTab(page, 'library');
    await page.locator('button[aria-pressed]', { hasText: 'Менің сөрем' }).click();
    await cards(page).filter({ hasText: 'Шумерский миф' }).first().click();
    await bookDialog(page).getByRole('button', { name: 'Өзгерту' }).click();
    await expect(form(page).locator('[data-status-option="reading"]')).toBeEnabled();
    await expect(form(page).locator('[data-status-option="completed"]')).toBeEnabled();
    await expect(form(page).locator('[data-finished-locked]')).toHaveCount(0);
  });

  test('the explanation is translated (ru)', async ({ page }) => {
    await openApp(page, 'Дана Серік');
    await setLanguage(page, 'ru');
    await goTab(page, 'library');
    await page.locator('button[aria-pressed]', { hasText: 'Моя полка' }).click();
    await cards(page).first().click();
    await bookDialog(page).getByRole('button', { name: 'Изменить' }).click();
    await expect(form(page).locator('[data-finished-locked]')).toContainText('вернуть её в «Читаю» нельзя');
  });
});

test.describe('C-20: admin forms — member search (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('coins: typing narrows the list and picks the match; nothing found is said plainly', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await goTab(page, 'admin');
    await page.locator('main [data-admin-tab="users"]').click();
    const search = page.locator('[data-member-search="adm-field-1"]');
    await search.fill('меруерт');
    await expect(page.locator('#adm-field-1 option')).toHaveCount(1);
    await expect(page.locator('#adm-field-1')).toHaveValue('user-member-3');
    await search.fill('ёжик-которого-нет');
    await expect(page.locator('#adm-field-1 option')).toHaveText(['Ешкім табылмады']);
    await search.fill('');
    expect(await page.locator('#adm-field-1 option').count()).toBeGreaterThan(3);
  });

  test('award and revoke forms have the same search', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await goTab(page, 'admin');
    await page.locator('main [data-admin-tab="users"]').click();
    for (const id of ['adm-field-7', 'adm-field-4']) {
      const search = page.locator(`[data-member-search="${id}"]`);
      await expect(search).toBeVisible();
      await search.fill('айзере');
      await expect(page.locator(`#${id}`)).toHaveValue('user-member-1');
    }
  });
});

test.describe('peer review: 1–5 stars', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the review form offers 5, 4, 3, 2 and 1 stars', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await goTab(page, 'leaderboard');
    await page.locator('main button', { hasText: 'Дана Серік' }).first().click(); // podium card -> member window
    await page.locator('button[aria-expanded]', { hasText: '+' }).last().click(); // "+ leave a review"
    const rating = page.locator('#mp-rating');
    await expect(rating).toBeVisible();
    await expect(rating.locator('option')).toHaveCount(5);
    expect(await rating.locator('option').evaluateAll(o => o.map(x => (x as HTMLOptionElement).value))).toEqual(['5', '4', '3', '2', '1']);
  });
});

test.describe('P6-18: a review rewards the member only at 4–5 stars (demo logic = server rule)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('2★ — no coins for the member; 5★ — +25 coins', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await goTab(page, 'leaderboard');
    const coinsOf = async () => Number((await page.locator('main tr', { hasText: 'Дана Серік' }).first().innerText()).match(/(\d+)\s*🪙/)?.[1]);
    const before = await coinsOf();
    const review = async (stars: string, aspect: string, text: string) => {
      await page.locator('main button', { hasText: 'Дана Серік' }).first().click();
      await page.locator('button[aria-expanded]', { hasText: '+' }).last().click();
      await page.locator('#mp-rating').selectOption(stars);
      await page.locator('#mp-aspect').selectOption(aspect);
      await page.locator('#mp-text').fill(text);
      await page.locator('form button[type="submit"]').last().click();
      await expect(page.locator('[role="status"]', { hasText: /./ }).last()).toBeVisible();
      await page.keyboard.press('Escape');
    };
    await review('2', 'knowledge', 'Әлі де жұмыс істеу керек.');
    await expect.poll(coinsOf).toBe(before);
    await review('5', 'inspiration', 'Керемет шабыт береді!');
    await expect.poll(coinsOf).toBe(before + 25);
  });
});
