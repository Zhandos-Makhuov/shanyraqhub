import { test, expect, openApp, goTab } from './fixtures';

/** Residual findings 26.11.2026: B-12 (focus), N-2 (demo section names), header avatar fallback, dashboard level bar. */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('B-12: a form opened from a book window returns focus to that book card when closed', async ({ page }) => {
  await openApp(page, 'Дана Серік');
  await goTab(page, 'library');
  await page.locator('button[aria-pressed]', { hasText: 'Менің сөрем' }).click();
  const card = page.locator('main [data-books-grid] > button').first();
  const key = await card.getAttribute('data-book-key');
  await card.click();
  await page.locator('[data-book-dialog]').getByRole('button', { name: 'Өзгерту' }).click();
  await expect(page.locator('[data-book-form]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-book-form]')).toHaveCount(0);
  await expect(page.locator(`main [data-books-grid] > button[data-book-key="${key}"]`)).toBeFocused();
});

test('N-2: demo topics use the section names of the section list', async ({ page }) => {
  await openApp(page);
  await goTab(page, 'forum', /Форум/);
  await expect(page.locator('[data-topic-card="topic-2"]')).toContainText('Speaking English Club');
  await expect(page.locator('[data-topic-card="topic-2"]')).not.toContainText('Ағылшын тілі дебаттары');
});

test('header: a photo that cannot load shows initials, not a broken image', async ({ page }) => {
  await openApp(page, 'Алихан Берік'); // demo photos are external and blocked in tests
  await expect(page.locator('header [data-avatar-fallback]').first()).toHaveText('АБ');
  const broken = await page.locator('header img').evaluateAll(imgs => imgs.filter(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).length);
  expect(broken).toBe(0);
});

test('home level bar = profile level bar (one rule)', async ({ page }) => {
  await openApp(page, 'Дана Серік');
  const home = await page.locator('main [role="progressbar"]').first().getAttribute('aria-valuenow');
  await goTab(page, 'profile', /Жеке кабинет/);
  const prof = await page.locator('main [role="progressbar"]').first().getAttribute('aria-valuenow');
  expect(home).toBe(prof);
});
