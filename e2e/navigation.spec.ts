import { test, expect, openApp, goTab, openMore, noHorizontalOverflow } from './fixtures';

// Every section opens for every role; staff see "Management", members do not.
const ROLES = [
  { account: 'Алихан Берік', staff: true },   // super admin
  { account: 'Дана Серік', staff: true },     // moderator
  { account: 'Санжар Қасымов', staff: true }, // organizer
  { account: 'Меруерт Ғаниқызы', staff: false },
];

for (const r of ROLES) {
  test(`all sections open — ${r.account}`, async ({ page }) => {
    await openApp(page, r.account);
    const tabs = await page.locator('nav button[data-tab]').evaluateAll(bs => bs.map(b => (b as HTMLElement).dataset.tab!));
    expect(tabs.includes('admin')).toBe(r.staff);
    expect(tabs.length).toBe(r.staff ? 10 : 9);
    for (const tab of tabs) {
      await goTab(page, tab);
      await expect(page.locator('main h1').first()).toBeVisible();
    }
  });
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('bottom bar: 5 buttons, "More" holds the other sections and lights up', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    const bar = page.locator('nav[aria-label] button');
    await expect(bar).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const h = await bar.nth(i).evaluate(el => el.getBoundingClientRect().height);
      expect(h, 'touch target height').toBeGreaterThanOrEqual(48);
    }
    await openMore(page);
    const tiles = page.locator('.fixed .grid button');
    await expect(tiles).toHaveCount(6); // achievements, attendance, forum, shop, profile, admin
    await tiles.first().click();
    await expect(bar.nth(4)).toHaveAttribute('aria-current', 'page');
    await noHorizontalOverflow(page);
  });
});

test.describe('phone, More sheet heading', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('"More" sheet is titled "other sections", not "all sections"', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    await expect(page.locator('div.fixed.top-0')).toContainText('Басқа бөлімдер');
    await expect(page.locator('div.fixed.top-0')).not.toContainText('барлық бөлімдері');
  });
});
