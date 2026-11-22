import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow } from './fixtures';

// No screen is wider than the phone/desktop, in Kazakh (default) and Russian.
const SIZES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];
const SECTIONS = [
  { tab: 'dashboard' },
  { tab: 'events' },
  { tab: 'library' },
  { tab: 'achievements', more: /Жетістік|Достижен/ },
];

for (const size of SIZES) {
  for (const lang of ['kz', 'ru'] as const) {
    if (lang === 'ru' && ![320, 1280].includes(size.width)) continue;
    test.describe(`${size.width}px ${lang}`, () => {
      const mobile = size.width < 768;
      test.use({ viewport: size, isMobile: mobile, hasTouch: mobile });
      test('main sections fit the screen', async ({ page }) => {
        await openApp(page, 'Дана Серік');
        if (lang === 'ru') await setLanguage(page, 'ru');
        for (const s of SECTIONS) {
          await goTab(page, s.tab, s.more);
          await expect(page.locator('main h1').first()).toBeVisible();
          await noHorizontalOverflow(page);
        }
      });
    });
  }
}
