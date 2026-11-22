import { Page } from '@playwright/test';
import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow, isMobile } from './fixtures';

/** Phase 2.3.1 — own profile and another member's profile (demo data, no database). */

const openProfile = (page: Page) => goTab(page, 'profile', /Жеке кабинет|Личный кабинет|My Profile/);

/** Profile text must not show raw roles, direction ids or YYYY-MM-DD dates. */
async function noTechnicalText(text: string) {
  expect(text, 'raw role code').not.toMatch(/SUPER_ADMIN|\bsuper_admin\b|\bMODERATOR\b|\bORGANIZER\b|\bMEMBER\b|\bADMIN\b/);
  expect(text, 'ISO date').not.toMatch(/\d{4}-\d{2}-\d{2}/);
  expect(text, 'direction id').not.toMatch(/·\s*(books|sport|english|arabic|art|zerde|networking)\b/);
}

/** The open member window (another member's profile). */
const memberDialog = (page: Page) => page.locator('[role="dialog"][aria-labelledby="member-profile-name"]');

async function openMember(page: Page, name: string) {
  await goTab(page, 'leaderboard');
  await page.locator('main').getByText(name, { exact: true }).first().click();
  await expect(memberDialog(page)).toBeVisible();
}

for (const [w, h] of [[320, 568], [360, 740], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 860]]) {
  test.describe(`${w}px`, () => {
    const mobile = w < 768;
    test.use({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });

    test('own profile: every tab fits, no technical text, avatars fall back to initials', async ({ page }) => {
      await openApp(page, 'Алихан Берік');
      await openProfile(page);
      const tabs = page.locator('[data-profile-tabs] [role="tab"]');
      await expect(tabs).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        await tabs.nth(i).click();
        await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
        await noHorizontalOverflow(page);
        // The chosen tab is fully visible inside the strip.
        // (the strip scrolls smoothly, so wait for it to settle)
        await expect.poll(() => tabs.nth(i).evaluate(el => {
          const s = el.parentElement!.getBoundingClientRect();
          const b = el.getBoundingClientRect();
          return b.left >= s.left - 1 && b.right <= s.right + 1;
        }), { message: `tab ${i} fully visible` }).toBe(true);
        await noTechnicalText(await page.locator('main').innerText());
      }
      // External photos are blocked in tests → every avatar shows initials, no broken image.
      const broken = await page.locator('main img').evaluateAll(imgs =>
        imgs.filter(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).length);
      expect(broken, 'broken images on the profile').toBe(0);
      await expect(page.locator('main [data-avatar-fallback]').first()).toBeVisible();
    });

    test('member window: fits, close always reachable, long content wraps', async ({ page }) => {
      await openApp(page, 'Алихан Берік');
      await openMember(page, 'Дана Серік');
      const dlg = memberDialog(page);
      await noHorizontalOverflow(page);
      await noTechnicalText(await dlg.innerText());
      // Scroll the window to the bottom: the close button stays on screen.
      await dlg.locator('.overflow-y-auto').first().evaluate(el => el.scrollTo(0, el.scrollHeight));
      const close = dlg.getByRole('button', { name: /жабу|Закрыть|Close/ });
      await expect(close).toBeInViewport();
      // The name is not cut with an ellipsis.
      const nameStyle = await page.locator('#member-profile-name').evaluate(el => getComputedStyle(el).textOverflow);
      expect(nameStyle).not.toBe('ellipsis');
      await close.click();
      await expect(dlg).toHaveCount(0);
    });
  });
}

test.describe('own profile details', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('roles are translated; an ordinary member has no role badge', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await openProfile(page);
    await expect(page.locator('main [data-role-badge="super_admin"]').first()).toHaveText('Бас әкімші');
    await openApp(page, 'Айзере Мұрат');
    await openProfile(page);
    await expect(page.locator('main h1 ~ [data-role-badge]')).toHaveCount(0);
    await expect(page.locator('main [data-contact="handle"]')).toBeVisible();
  });

  test('handle and Telegram look different and are labelled', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await openProfile(page);
    const handle = page.locator('main [data-contact="handle"]');
    const tg = page.locator('main [data-contact="telegram"]');
    await expect(handle).toContainText('Клубтағы есім');
    await expect(tg).toContainText('Telegram');
    await expect(tg).toContainText('@alikhan_berik');
    const colors = await Promise.all([handle, tg].map(l => l.locator('span.font-mono').evaluate(el => getComputedStyle(el).color)));
    expect(colors[0]).not.toBe(colors[1]);
  });

  test('a book being read shows "reading", not stars; dates and directions are localized', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await openProfile(page);
    const reading = page.locator('main [data-profile-book="reading"]').first();
    await expect(reading).toContainText('Оқып жатырмын');
    await expect(reading.locator('[data-book-rating]')).toHaveCount(0);
    await expect(page.locator('main [data-profile-book="completed"] [data-book-rating]').first()).toBeVisible();
    await expect(page.locator('main')).toContainText(/Қауымдастыққа қосылды 15 қаң\. 2024/);
    await page.locator('[data-profile-tabs] [role="tab"]').nth(1).click();
    const meta = await page.locator('main [data-event-meta]').allInnerTexts();
    expect(meta.length).toBeGreaterThan(0);
    for (const m of meta) expect(m).toMatch(/^\d{1,2} [^\s]+ \d{4} · \S/);
  });

  for (const lang of ['ru', 'en'] as const) {
    test(`${lang}: roles, dates and directions are translated`, async ({ page }) => {
      await openApp(page, 'Алихан Берік');
      await setLanguage(page, lang);
      await openProfile(page);
      await expect(page.locator('main [data-role-badge="super_admin"]').first())
        .toHaveText(lang === 'ru' ? 'Главный администратор' : 'Super administrator');
      for (let i = 0; i < 4; i++) {
        await page.locator('[data-profile-tabs] [role="tab"]').nth(i).click();
        await noTechnicalText(await page.locator('main').innerText());
      }
    });
  }

  test('edit form: current data, keyboard, Escape, save', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await openProfile(page);
    const edit = page.locator('main button', { hasText: 'Профильді өңдеу' });
    await edit.click();
    const dlg = page.locator('[role="dialog"][aria-labelledby="profile-edit-title"]');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('#prf-name')).toHaveValue('Алихан Берік');
    await expect(dlg.locator('#prf-telegram-hint')).toHaveText('Бұл байланысты клубтың басқа қатысушылары көреді.');
    await expect(dlg.locator('input[type="tel"]')).toHaveCount(0);
    // Escape closes and focus returns to the button that opened the form.
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(edit).toBeFocused();
    // Save a new (long) name: the card shows it, and the form opens with it next time.
    const long = 'Алихан Берікұлы Кенжеғалиұлы Сарыарқа-Жетісу Тарбағатайұлы';
    await edit.click();
    await dlg.locator('#prf-name').fill(long);
    await dlg.locator('button[type="submit"]').click();
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('main h1')).toHaveText(long);
    await noHorizontalOverflow(page);
    await edit.click();
    await expect(dlg.locator('#prf-name')).toHaveValue(long);
    await expect(dlg.getByRole('button', { name: 'Өңдеу терезесін жабу' })).toBeVisible();
  });

  test('edit form on 320×568: save button reachable, fields scroll between title and buttons', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openApp(page, 'Алихан Берік');
    await openProfile(page);
    await page.locator('main button', { hasText: 'Профильді өңдеу' }).click();
    const dlg = page.locator('[role="dialog"][aria-labelledby="profile-edit-title"]');
    await expect(dlg.locator('button[type="submit"]')).toBeInViewport();
    await expect(dlg.getByRole('button', { name: 'Өңдеу терезесін жабу' })).toBeInViewport();
    const box = await dlg.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  });
});

test.describe('member window', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('dialog semantics, Escape, backdrop, click inside keeps it open, focus stays inside', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await openMember(page, 'Дана Серік');
    const dlg = memberDialog(page);
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#member-profile-name')).toHaveText('Дана Серік');
    await expect(dlg.locator('[data-role-badge="moderator"]')).toHaveText('Модератор');
    // Click inside → stays open.
    await page.locator('#member-profile-name').click();
    await expect(dlg).toBeVisible();
    // Tab many times → focus never leaves the window.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await dlg.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    // Backdrop click closes.
    await openMember(page, 'Дана Серік');
    await page.mouse.click(5, 5);
    await expect(memberDialog(page)).toHaveCount(0);
  });

  test('a new review appears at once; the reward rule and duplicate aspect are explained', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await openMember(page, 'Айзере Мұрат');
    const dlg = memberDialog(page);
    const count = Number(await dlg.locator('[data-member-reviews-count]').getAttribute('data-member-reviews-count'));
    await dlg.getByRole('button', { name: /Пікір қалдыру/ }).click();
    await expect(dlg.locator('[data-review-reward-hint]')).toContainText('24 сағаттағы алғашқы 3 пікір');
    await expect(dlg.locator('button[type="submit"]')).toHaveText('Пікір жіберу');
    await dlg.locator('#mp-aspect').selectOption('teamwork');
    await dlg.locator('#mp-text').fill('Командада жұмыс істеуге өте ыңғайлы адам, рақмет!');
    await dlg.locator('button[type="submit"]').click();
    await expect(dlg.locator('[data-member-reviews-count]')).toHaveAttribute('data-member-reviews-count', String(count + 1));
    await expect(dlg.locator('[data-review-card]').first()).toContainText('Командада жұмыс істеуге');
    await expect(dlg.locator('[role="status"]')).toHaveText('Пікір жарияланды.');
    // Same aspect again → explained before sending, button disabled.
    await dlg.getByRole('button', { name: /Пікір қалдыру/ }).click();
    await dlg.locator('#mp-aspect').selectOption('teamwork');
    await expect(dlg.locator('[data-review-duplicate]')).toBeVisible();
    await expect(dlg.locator('button[type="submit"]')).toBeDisabled();
  });

  test('own entry in the leaderboard has no review form', async ({ page }) => {
    await openApp(page, 'Алихан Берік');
    await openMember(page, 'Алихан Берік');
    await expect(memberDialog(page).getByRole('button', { name: /Пікір қалдыру/ })).toHaveCount(0);
  });
});

test('desktop: member window keyboard focus starts inside', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await openApp(page, 'Алихан Берік');
  if (isMobile(page)) return;
  await openMember(page, 'Дана Серік');
  expect(await memberDialog(page).evaluate(el => el.contains(document.activeElement))).toBe(true);
});
