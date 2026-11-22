import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow } from './fixtures';

// New member (default demo account), phone size, Kazakh.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const cards = (page: import('@playwright/test').Page) => page.locator('main article');

test('register and cancel from an event card', async ({ page }) => {
  await openApp(page);
  await goTab(page, 'events');
  const card = cards(page).filter({ has: page.locator('button', { hasText: /^Жазылу$/ }) }).first();
  const title = await card.locator('h3').innerText();
  await card.locator('button', { hasText: /^Жазылу$/ }).click();
  const same = cards(page).filter({ hasText: title }).first();
  await expect(same).toContainText('Сіз жазылдыңыз');
  await same.locator('button', { hasText: 'Жазылудан бас тарту' }).click();
  await expect(cards(page).filter({ hasText: title }).first().locator('button', { hasText: /^Жазылу$/ })).toBeVisible();
});

test('filters: direction chip, count, reset', async ({ page }) => {
  await openApp(page);
  await goTab(page, 'events');
  const all = await cards(page).count();
  await page.locator('button.chip').nth(1).click();
  expect(await cards(page).count()).toBeLessThanOrEqual(all);
  await page.locator('button:visible', { hasText: 'Тазарту' }).click();
  await expect(cards(page)).toHaveCount(all);
  await expect(page.locator('button.chip.chip-active')).toHaveText('Барлық бағыттар');
});

test('event details: localized date, close by × and by backdrop, actions stay visible', async ({ page }) => {
  await openApp(page);
  await setLanguage(page, 'ru');
  await goTab(page, 'events');
  await cards(page).first().locator('button').first().click();
  const modal = page.locator('.fixed.inset-0').first();
  await expect(modal).toContainText(/(Вс|Пн|Вт|Ср|Чт|Пт|Сб), \d{1,2} [а-я.]+ · \d\d:\d\d/);
  await expect(modal).not.toContainText(/\d{4}-\d\d-\d\d/);
  await modal.locator('.overflow-y-auto').first().evaluate(el => { el.scrollTop = 1e5; });
  await expect(modal.locator('button[aria-label]').first()).toBeInViewport();
  await expect(modal.locator('.btn-primary')).toBeInViewport();
  await modal.locator('button[aria-label]').first().click();
  await expect(page.locator('.fixed.inset-0')).toHaveCount(0);
  await cards(page).first().locator('button').first().click();
  await page.mouse.click(5, 5);
  await expect(page.locator('.fixed.inset-0')).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test('home: next step follows registration; direction tile opens filtered events', async ({ page }) => {
  await openApp(page);
  const step = page.locator('main section').nth(1);
  await expect(step).toContainText('Ең жақын кездесу');
  await step.locator('button', { hasText: /^Жазылу$/ }).click();
  await expect(step).toContainText('Сіз жазылдыңыз');
  await step.locator('button', { hasText: 'Толығырақ' }).click();
  await expect(page.locator('.fixed.inset-0 h2')).toBeVisible(); // details open on the events page
  await page.locator('.fixed.inset-0 button[aria-label]').first().click();
  await goTab(page, 'dashboard');
  await page.locator('main section', { hasText: 'Клуб бағыттары' }).locator('button').first().click();
  await expect(page.locator('button.chip.chip-active')).not.toHaveText('Барлық бағыттар');
});
