import { Page } from '@playwright/test';
import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow } from './fixtures';

/**
 * Phase 2.5 — Books & Knowledge: dialogs (keyboard, labels), the form keeps the text on error,
 * "already in the club?" suggestions (no near-duplicates), removing a "reading" entry, book → forum discussions,
 * empty club, long titles, whole cover in the book window, 8 widths, ru/en. Demo data, no database.
 */

const USERS_KEY = 'shanyraq_hub_app_state_v1_users';
const cards = (page: Page) => page.locator('main [data-books-grid] > button');
const bookDialog = (page: Page) => page.locator('[data-book-dialog]');
const form = (page: Page) => page.locator('[data-book-form]');
const card = (page: Page, title: RegExp | string) => cards(page).filter({ hasText: title }).first();

/** Change stored demo members before the app starts (body gets `value` = users array and returns it). */
async function patchUsers(page: Page, body: string) {
  await page.addInitScript(([k, b]) => {
    if (sessionStorage.getItem('users-patched')) return;
    const raw = localStorage.getItem(k);
    if (!raw) return;
    sessionStorage.setItem('users-patched', '1');
    // eslint-disable-next-line no-new-func
    localStorage.setItem(k, JSON.stringify(new Function('value', b)(JSON.parse(raw))));
  }, [USERS_KEY, body] as const);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
}

test.describe('book window and form (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('book window: named dialog, focus inside, Escape closes and returns focus to the card', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'library');
    const abai = card(page, /Абай жолы/);
    await abai.focus();
    await page.keyboard.press('Enter');
    const dlg = page.getByRole('dialog', { name: /Абай жолы/ });
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-book-dialog]'))).toBe(true);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab'); // focus stays inside
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-book-dialog]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(abai).toBeFocused();
    await noHorizontalOverflow(page);
  });

  test('form: fields have labels; rating only for a finished book; Escape closes', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'library');
    await page.locator('main button', { hasText: 'Оқылған кітапты қосу' }).first().click();
    const f = page.getByRole('dialog', { name: 'Оқылған кітапты қосу' });
    await expect(f.getByLabel('Кітап атауы *')).toBeVisible();
    await expect(f.getByLabel('Кітап авторы *')).toBeVisible();
    await expect(f.getByLabel('Жанр')).toBeVisible();
    await expect(f.getByRole('radiogroup', { name: 'Баға' })).toBeVisible();
    await f.getByRole('button', { name: 'Қазір оқып жүрмін' }).click();
    await expect(f.getByRole('radiogroup', { name: 'Баға' })).toHaveCount(0); // "reading" has no rating
    await f.getByRole('button', { name: 'Оқылды' }).click();
    await expect(f.getByRole('radiogroup', { name: 'Баға' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(f).toHaveCount(0);
  });

  test('a rejected save keeps the form open with everything typed', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'library');
    await page.locator('main button', { hasText: 'Оқылған кітапты қосу' }).first().click();
    const title = form(page).getByLabel('Кітап атауы *');
    await title.evaluate(el => el.removeAttribute('maxlength'));
    const long = 'Ұ'.repeat(301); // the database allows 300
    await title.fill(long);
    await form(page).getByLabel('Кітап авторы *').fill('Автор');
    await form(page).getByLabel(/Рецензияңыз/).fill('Менің ойым\nекінші жол');
    await form(page).locator('button[type="submit"]').click();
    await expect(form(page).locator('[data-book-form-error]')).toBeVisible();
    await expect(form(page)).toBeVisible();
    await expect(title).toHaveValue(long);
    await expect(form(page).getByLabel(/Рецензияңыз/)).toHaveValue('Менің ойым\nекінші жол');
  });

  test('typing a book that is already in the club suggests it; picking it adds no duplicate', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'library');
    const before = await cards(page).count();
    await page.locator('main button', { hasText: 'Оқылған кітапты қосу' }).first().click();
    await form(page).getByLabel('Кітап атауы *').fill('абай ЖОЛЫ');
    const similar = form(page).locator('[data-book-similar]');
    await expect(similar).toContainText('Абай жолы (Путь Абая)');
    await expect(similar).toContainText('Мухтар Ауэзов');
    await similar.locator('[data-book-similar-pick]').first().click();
    await expect(form(page).getByLabel('Кітап атауы *')).toHaveValue('Абай жолы (Путь Абая)');
    await expect(form(page).getByLabel('Кітап авторы *')).toHaveValue('Мухтар Ауэзов');
    await expect(form(page).getByLabel('Кітап атауы *')).toHaveAttribute('readonly', '');
    await expect(similar).toHaveCount(0);
    await form(page).getByRole('button', { name: 'Қазір оқып жүрмін' }).click();
    await form(page).locator('button[type="submit"]').click();
    await expect(form(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(before); // same book, not a new card
    await page.locator('button[aria-pressed]', { hasText: 'Менің сөрем' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Абай жолы');
  });

  test('the same title with the same author is called out as already in the club', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'library');
    await page.locator('main button', { hasText: 'Оқылған кітапты қосу' }).first().click();
    await form(page).getByLabel('Кітап атауы *').fill('Атомные привычки');
    await expect(form(page).locator('[data-book-similar]')).toBeVisible();
    await form(page).getByLabel('Кітап авторы *').fill('джеймс клир'); // case does not matter
    await expect(form(page).locator('[data-book-similar]')).toContainText('Бұл кітап клубта бар');
  });

  test('a "reading" entry can be removed from the shelf (confirmation); a finished one cannot', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'library');
    await card(page, /Абай жолы/).click();
    await bookDialog(page).getByRole('button', { name: 'Оқып жатырмын' }).click();
    await form(page).locator('button[type="submit"]').click();
    await expect(form(page)).toHaveCount(0);
    await page.locator('button[aria-pressed]', { hasText: 'Менің сөрем' }).click();
    await cards(page).first().click();
    await bookDialog(page).getByRole('button', { name: 'Өзгерту' }).click();
    await form(page).locator('[data-book-remove]').click();
    const confirm = page.getByRole('alertdialog', { name: 'Кітапты сөреден алу керек пе?' });
    await confirm.getByRole('button', { name: 'Болдырмау' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(form(page)).toBeVisible();
    await form(page).locator('[data-book-remove]').click();
    await confirm.getByRole('button', { name: 'Сөреден алу' }).click();
    await expect(form(page)).toHaveCount(0);
    await expect(page.locator('[data-lib-notice]')).toContainText('сөреден алынды');
    await expect(cards(page)).toHaveCount(0);
    // finished books: no remove button
    await openApp(page, 'Дана Серік');
    await goTab(page, 'library');
    await page.locator('button[aria-pressed]', { hasText: 'Менің сөрем' }).click();
    await cards(page).first().click();
    await bookDialog(page).getByRole('button', { name: 'Өзгерту' }).click();
    await expect(form(page).getByRole('button', { name: 'Оқылды' })).toHaveAttribute('aria-pressed', 'true');
    await expect(form(page).locator('[data-book-remove]')).toHaveCount(0);
  });

  test('book → forum: discussions of the book, a prefilled topic; the second time it is found', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'library');
    await card(page, /Атомные привычки/).click();
    await bookDialog(page).locator('[data-book-discuss]').click();
    await expect(page.locator('main [data-book-context]')).toContainText('Атомные привычки');
    await expect(page.locator('#forum-search')).toHaveValue('Атомные привычки');
    await expect(page.locator('main [data-forum-no-results]')).toBeVisible();
    await page.locator('main [data-book-new-topic]').click();
    const dlg = page.getByRole('dialog', { name: 'Тақырып ашу' });
    await expect(dlg.locator('#topic-title')).toHaveValue(/^«Атомные привычки» — /);
    await expect(dlg.locator('#topic-section')).toHaveValue('books');
    await dlg.locator('#topic-content').fill('Кім оқыды? Пікір алмасайық.');
    await dlg.getByRole('button', { name: 'Жариялау', exact: true }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('main [data-book-context]')).toHaveCount(0);
    // back to the book: the discussion is found now (no need for a second topic)
    await goTab(page, 'library');
    await card(page, /Атомные привычки/).click();
    await bookDialog(page).locator('[data-book-discuss]').click();
    await expect(page.locator('main [data-topic-card]')).toHaveCount(1);
    await expect(page.locator('main [data-topic-card]')).toContainText('«Атомные привычки»');
    await page.locator('main [data-book-context] button[aria-label]').click(); // close = reset
    await expect(page.locator('#forum-search')).toHaveValue('');
  });

  test('empty club: a real empty state with "add", not "nothing found"', async ({ page }) => {
    await openApp(page);
    await patchUsers(page, 'return value.map(u => ({ ...u, readBooks: [] }));');
    await goTab(page, 'library');
    await expect(page.locator('main [data-lib-empty-club]')).toContainText('Клубта әзірге кітап жоқ');
    await expect(page.locator('main')).not.toContainText('Ештеңе табылмады');
    await page.locator('main [data-lib-empty-club] button').click();
    await expect(form(page)).toBeVisible();
  });
});

for (const [w, h] of [[320, 568], [360, 740], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 860]]) {
  test.describe(`${w}px books`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 768 });

    test('long title and author, whole cover in the window, dialogs fit, no overflow', async ({ page }) => {
      await openApp(page);
      // a long real-looking title/author and a cover of 432×600 (like a real uploaded cover, not 2:3)
      const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="432" height="600"><rect width="432" height="600" fill="#b03050"/><text x="10" y="590" font-size="40" fill="#fff">EDGE</text></svg>');
      await patchUsers(page, `
        const b = value.find(u => u.readBooks && u.readBooks.length).readBooks[0];
        b.title = 'Ұзақ атау: ' + 'Абай жолы — қазақ даласының өмірі туралы роман-эпопея '.repeat(3);
        b.author = 'Мұхтар Омарханұлы Әуезов-Ұзынтегіаты-Тексеру';
        b.coverUrl = 'data:image/svg+xml,${svg}';
        return value;`);
      await goTab(page, 'library');
      const c = card(page, /Ұзақ атау/);
      await expect(c).toBeVisible();
      const cb = (await c.boundingBox())!;
      expect(cb.x + cb.width).toBeLessThanOrEqual(w);
      await noHorizontalOverflow(page);
      await c.click();
      const dlg = bookDialog(page);
      const db = (await dlg.boundingBox())!;
      expect(db.x).toBeGreaterThanOrEqual(0);
      expect(db.x + db.width).toBeLessThanOrEqual(w);
      expect(db.y + db.height).toBeLessThanOrEqual(h);
      // the whole cover at its own proportions (600/432), not cropped to 2:3
      const img = dlg.locator('[data-cover-natural]');
      const ib = (await img.boundingBox())!;
      expect(ib.height / ib.width).toBeCloseTo(600 / 432, 1);
      for (const b of await dlg.locator('[data-book-discuss], .btn-primary, .btn-secondary').all()) {
        expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      }
      await noHorizontalOverflow(page);
      await page.keyboard.press('Escape');
      await page.locator('main button.btn-primary').first().click(); // "add" (icon only below 400 px)
      const fb = (await form(page).boundingBox())!;
      expect(fb.x).toBeGreaterThanOrEqual(0);
      expect(fb.x + fb.width).toBeLessThanOrEqual(w);
      expect(fb.y + fb.height).toBeLessThanOrEqual(h);
      await expect(form(page).locator('button[type="submit"]')).toBeInViewport();
      await noHorizontalOverflow(page);
    });
  });
}

test.describe('languages', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const [lang, discuss, search, sort] of [
    ['ru', 'Обсуждения на форуме', 'Поиск книг', 'Сортировка книг'],
    ['en', 'Forum discussions', 'Search books', 'Sort books'],
  ] as const) {
    test(`${lang}: labels of search, sort and "discuss"`, async ({ page }) => {
      await openApp(page);
      await setLanguage(page, lang);
      await goTab(page, 'library');
      await expect(page.getByLabel(search, { exact: true })).toBeVisible();
      await expect(page.getByLabel(sort, { exact: true })).toBeVisible();
      await cards(page).first().click();
      await expect(bookDialog(page).locator('[data-book-discuss]')).toHaveText(discuss);
    });
  }
});
