import { test, expect, openApp, goTab, setLanguage, openMore } from './fixtures';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const MORE_ACH = /Жетістік|Достижен/;
const cards = (page: import('@playwright/test').Page) => page.locator('main div.grid > button');

test('overview matches the filters (Dana: earned + not yet = all)', async ({ page }) => {
  await openApp(page, 'Дана Серік');
  await setLanguage(page, 'ru');
  await goTab(page, 'achievements', MORE_ACH);
  const overview = await page.locator('main section').first().innerText();
  const m = overview.match(/Получено (\d+) из (\d+)/)!;
  expect(m).toBeTruthy();
  const [earned, total] = [Number(m[1]), Number(m[2])];
  expect(total).toBe(34);
  await expect(cards(page)).toHaveCount(total);
  await page.locator('button[aria-pressed]', { hasText: /^Получены/ }).click();
  await expect(cards(page)).toHaveCount(earned);
  await page.locator('button[aria-pressed]', { hasText: /^Ещё не получены/ }).click();
  await expect(cards(page)).toHaveCount(total - earned);
  // automatic ones show value/target; moderator ones say so and have no bar
  const texts = await cards(page).allInnerTexts();
  for (const t of texts) expect(/\d+\/\d+/.test(t) || /Выдаёт модератор/.test(t), t).toBeTruthy();
});

test('achievement detail opens and closes', async ({ page }) => {
  await openApp(page, 'Дана Серік');
  await setLanguage(page, 'ru');
  await goTab(page, 'achievements', MORE_ACH);
  await cards(page).first().click();
  const dlg = page.locator('[role="dialog"]');
  await expect(dlg).toContainText(/как получить/i);
  await expect(dlg).toContainText(/награда/i);
  await expect(dlg.locator('button[aria-label]')).toBeInViewport();
  await dlg.locator('button[aria-label]').click();
  await expect(dlg).toHaveCount(0);
});

test('new achievement shows a quiet toast that leads to achievements', async ({ page }) => {
  await openApp(page); // new member
  await openMore(page);
  await page.locator('.fixed .grid button', { hasText: /Форум/ }).click();
  await page.locator('main button', { hasText: /Тақырып/ }).first().click();
  const inputs = page.locator('.fixed input:not([type="file"]), .fixed textarea');
  await inputs.first().fill('Автотест тақырыбы');
  await inputs.last().fill('Жетістік хабарламасын тексеру үшін жасалған демо тақырып.');
  await page.locator('.fixed button[type="submit"]').click();
  const toast = page.locator('[role="status"]');
  await expect(toast).toBeVisible();
  await toast.locator('button').first().click();
  await expect(page.locator('main h1')).toContainText('Жетістіктер');
});
