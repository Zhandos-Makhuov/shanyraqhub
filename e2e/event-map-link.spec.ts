import { Page } from '@playwright/test';
import { test, expect, openApp, goTab } from './fixtures';
import { parse2gisLink } from '../src/utils/mapLink';

/**
 * 2GIS link of an in-person event (25.11.2026, owner's request): the organizer pastes the link from the 2GIS app,
 * members open the place from the event window ("2GIS-те ашу"). Only 2GIS links are accepted and shown.
 */

const MOD = 'Дана Серік'; // moderator: may create and edit any event
const LINK = 'https://go.2gis.com/abc123';

const card = (page: Page, title: RegExp) => page.locator('main article').filter({ hasText: title }).first();
async function openEvent(page: Page, title: RegExp) {
  await card(page, title).locator('button').first().click();
  return page.locator('[data-event-dialog]');
}
async function createEvent(page: Page, title: string, mapLink: string) {
  await page.locator('main button', { hasText: 'Іс-шара құру' }).click();
  const form = page.getByRole('dialog', { name: 'Іс-шара құру' });
  await form.locator('#ev-title').fill(title);
  await form.locator('[data-event-map-input]').fill(mapLink);
  await form.locator('button[type="submit"]').click();
  return form;
}

test('only 2GIS links are accepted (https, any 2GIS domain), everything else is refused', () => {
  expect(parse2gisLink('https://go.2gis.com/abc123')).toBe('https://go.2gis.com/abc123');
  expect(parse2gisLink('  2gis.kz/almaty/firm/70000001  ')).toBe('https://2gis.kz/almaty/firm/70000001');
  expect(parse2gisLink('http://2gis.ru/moscow')).toBe('https://2gis.ru/moscow');
  expect(parse2gisLink('')).toBeNull();
  expect(parse2gisLink('javascript:alert(1)')).toBeNull();
  expect(parse2gisLink('https://maps.google.com/?q=Almaty')).toBeNull();
  expect(parse2gisLink('https://2gis.kz.evil.com/x')).toBeNull();
  expect(parse2gisLink('https://evil2gis.kz/x')).toBeNull();
  expect(parse2gisLink('https://user:pw@2gis.kz/x')).toBeNull();
});

test('create an in-person event with a 2GIS link → the event window offers "2GIS-те ашу"', async ({ page }) => {
  await openApp(page, MOD);
  await goTab(page, 'events');
  const form = await createEvent(page, '2GIS тексеру кездесуі', LINK);
  await expect(form).toHaveCount(0);
  const dlg = await openEvent(page, /2GIS тексеру кездесуі/);
  const link = dlg.locator('[data-event-map-link]');
  await expect(link).toHaveText('2GIS-те ашу');
  await expect(link).toHaveAttribute('href', LINK);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
});

test('a link that is not 2GIS is refused inside the form, with everything typed kept', async ({ page }) => {
  await openApp(page, MOD);
  await goTab(page, 'events');
  const form = await createEvent(page, 'Қате сілтеме', 'https://maps.google.com/?q=Almaty');
  await expect(form.locator('[data-event-form-error]')).toContainText('2GIS сілтемесі емес');
  await expect(form.locator('#ev-title')).toHaveValue('Қате сілтеме');
  await expect(form.locator('[data-event-map-input]')).toHaveValue('https://maps.google.com/?q=Almaty');
});

test('no link → no button; online events have no 2GIS field', async ({ page }) => {
  await openApp(page, MOD);
  await goTab(page, 'events');
  const form = await createEvent(page, 'Сілтемесіз кездесу', '');
  await expect(form).toHaveCount(0);
  const dlg = await openEvent(page, /Сілтемесіз кездесу/);
  await expect(dlg.locator('[data-event-map-link]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('main button', { hasText: 'Іс-шара құру' }).click();
  const f2 = page.getByRole('dialog', { name: 'Іс-шара құру' });
  await expect(f2.locator('[data-event-map-input]')).toBeVisible();
  await f2.locator('#ev-format').selectOption('online');
  await expect(f2.locator('[data-event-map-input]')).toHaveCount(0);
});

test('edit: the organizer adds the link later; it is kept when the window is reopened', async ({ page }) => {
  await openApp(page, MOD);
  await goTab(page, 'events');
  await createEvent(page, 'Кейін қосылатын сілтеме', '');
  let dlg = await openEvent(page, /Кейін қосылатын сілтеме/);
  await dlg.locator('[data-event-edit]').click();
  const form = page.getByRole('dialog', { name: 'Кездесуді өзгерту' });
  await form.locator('[data-event-map-input]').fill('2gis.kz/almaty/firm/70000001');
  await form.locator('button[type="submit"]').click();
  await expect(form).toHaveCount(0);
  dlg = page.locator('[data-event-dialog]');
  await expect(dlg.locator('[data-event-map-link]')).toHaveAttribute('href', 'https://2gis.kz/almaty/firm/70000001');
  await dlg.locator('[data-event-edit]').click();
  await expect(form.locator('[data-event-map-input]')).toHaveValue('https://2gis.kz/almaty/firm/70000001');
});

test('Telegram Mini App: the link is handed to Telegram to open outside (2GIS app), not inside the Mini App', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('shq_tg_init_data', 'user=%7B%22id%22%3A1%7D');
    (window as unknown as { __tg: string[][] }).__tg = [];
    (window as unknown as { TelegramWebviewProxy: unknown }).TelegramWebviewProxy = {
      postEvent: (t: string, d: string) => (window as unknown as { __tg: string[][] }).__tg.push([t, d]),
    };
  });
  await openApp(page, MOD);
  await goTab(page, 'events');
  await createEvent(page, 'Telegram 2GIS', LINK);
  const dlg = await openEvent(page, /Telegram 2GIS/);
  await dlg.locator('[data-event-map-link]').click();
  const sent = await page.evaluate(() => (window as unknown as { __tg: string[][] }).__tg.filter(e => e[0] === 'web_app_open_link'));
  expect(sent).toEqual([['web_app_open_link', JSON.stringify({ url: LINK })]]);
  expect(page.url()).not.toContain('2gis');
});
