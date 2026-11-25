import { test, expect, openApp, openMore } from './fixtures';

/**
 * Club sounds (25.11.2026, owner's request): the sword "shing" at the loading screen's fill moment (only where the
 * browser allows sound), a dombyra pluck for a new achievement, the "Дыбыс" switch in the bell menu.
 * Sound is allowed here by a browser flag; with the browser's normal policy nothing plays and nothing breaks
 * (every other test runs that way and fails on any JavaScript error).
 */
test.use({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
});

/** Record every sound that really played, with the page time. */
const listen = (page: import('@playwright/test').Page) => page.addInitScript(() => {
  const list: string[] = [];
  const push = list.push.bind(list);
  list.push = (...k: string[]) => push(...k.map(x => `${x}@${Math.round(performance.now())}`));
  (window as unknown as { __shqSounds: string[] }).__shqSounds = list;
});
const sounds = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __shqSounds: string[] }).__shqSounds);

test('loading screen: one sword "shing" when the mark fills with gold', async ({ page }) => {
  await listen(page);
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#boot-splash')).toHaveCount(0, { timeout: 10_000 });
  const start = await page.evaluate(() => 0);
  const s = await sounds(page);
  expect(s.length).toBe(1);
  expect(s[0]).toMatch(/^sword@/);
  const at = Number(s[0].split('@')[1]) - start;
  expect(at).toBeGreaterThan(1000); // the fill starts 1150 ms after the splash appears
  expect(at).toBeLessThan(2400);
});

test('sound off: no sound at all, and the switch in the bell menu turns it back on', async ({ page }) => {
  await listen(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('shanyraq_sound', 'off'); } });
  await openApp(page);
  expect(await sounds(page)).toEqual([]);
  await page.locator('[data-bell]').click();
  const toggle = page.locator('[data-sound-toggle]');
  await expect(toggle).toHaveText('Дыбыс өшірулі');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveText('Дыбыс қосулы');
  expect(await page.evaluate(() => localStorage.getItem('shanyraq_sound'))).toBe('on');
  await expect.poll(() => sounds(page)).toEqual([expect.stringMatching(/^pluck@/)]); // a sample of the sound
  await toggle.click();
  await expect(toggle).toHaveText('Дыбыс өшірулі');
  expect(await page.evaluate(() => localStorage.getItem('shanyraq_sound'))).toBe('off');
});

test('a new achievement plays the dombyra pluck (once)', async ({ page }) => {
  await listen(page);
  await openApp(page); // new member
  const before = (await sounds(page)).length; // the loading screen's sword
  await openMore(page);
  await page.locator('.fixed .grid button', { hasText: /Форум/ }).click();
  await page.locator('main button', { hasText: /Тақырып/ }).first().click();
  const inputs = page.locator('.fixed input:not([type="file"]), .fixed textarea');
  await inputs.first().fill('Дыбыс тексеру тақырыбы');
  await inputs.last().fill('Жетістік дыбысын тексеру үшін жасалған демо тақырып.');
  await page.locator('.fixed button[type="submit"]').click();
  await expect(page.locator('[data-achievement-toast]')).toBeVisible();
  await expect.poll(async () => (await sounds(page)).slice(before)).toEqual([expect.stringMatching(/^pluck@/)]);
});
