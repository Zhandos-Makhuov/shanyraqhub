import { Page } from '@playwright/test';
import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow } from './fixtures';
import { tierProgress, recentAchievements } from '../src/utils/profileProgress';
import { TIERS } from '../src/data/gamification';
import { Achievement } from '../src/types';
import { ALL_ACHIEVEMENTS } from '../src/data/achievements';

/** Phase 2.3.2 — profile overview: level progress and the latest achievements (own profile and member window). */

// --- Rules of the two helpers, checked directly (no browser) ---

test.describe('tierProgress (existing TIERS only)', () => {
  test('progress inside a tier, at thresholds and on the top tier', () => {
    const p0 = tierProgress(0, 'bronze');
    expect([p0.next?.tier, p0.percent, p0.toNext]).toEqual(['silver', 0, TIERS.silver.minXp]);
    const p1 = tierProgress(150, 'bronze');
    expect([p1.percent, p1.toNext]).toEqual([50, 150]);
    const p2 = tierProgress(299, 'bronze');
    expect([p2.percent, p2.toNext]).toEqual([99, 1]); // never rounds up to a false 100 %
    const p3 = tierProgress(TIERS.silver.minXp, 'silver');
    expect([p3.next?.tier, p3.percent]).toEqual(['gold', 0]);
    const top = tierProgress(TIERS.tengri.minXp + 5000, 'tengri');
    expect([top.next, top.percent, top.toNext]).toEqual([null, 100, 0]);
  });
  test('odd input never gives a bar below 0 % or above 100 %', () => {
    for (const [xp, tier] of [[-50, 'bronze'], [NaN, 'bronze'], [99999, 'gold'], [10, 'platinum']] as const) {
      const p = tierProgress(xp, tier);
      expect(p.percent).toBeGreaterThanOrEqual(0);
      expect(p.percent).toBeLessThanOrEqual(100);
      expect(p.toNext).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('recentAchievements', () => {
  const a = (id: string, unlockedAt?: string) => ({ id, unlockedAt } as Achievement);
  test('newest first, at most 3, same-day ties by the order earned, revoked never shown', () => {
    const user = {
      achievements: [a('a', '2026-10-01'), a('b', '2026-11-20'), a('c', '2026-11-22'), a('d', '2026-11-22'), a('e', '2026-11-21')],
      revokedAchievementIds: ['e'],
    };
    expect(recentAchievements(user).map(x => x.id)).toEqual(['d', 'c', 'b']);
    expect(recentAchievements({ achievements: [] }).length).toBe(0);
    expect(recentAchievements({ achievements: [a('x', '2026-01-01')] }).map(x => x.id)).toEqual(['x']);
  });
});

// --- In the interface (demo data; a member's stored state is adjusted in localStorage, then the page reloads) ---

const USERS_KEY = 'shanyraq_hub_app_state_v1_users';

/**
 * Changes one demo member in the stored state and reloads (the visitor is the new member after a reload).
 * The change is applied by an init script before the app starts, so the running app cannot overwrite it
 * with its own save (e.g. after demo auto-unlocks) between our write and the reload.
 */
async function patchUser(page: Page, id: string, patch: Record<string, unknown>) {
  await page.addInitScript(([key, uid, p]) => {
    const raw = localStorage.getItem(key as string);
    if (!raw) return;
    const users = JSON.parse(raw);
    const u = users.find((x: { id: string }) => x.id === uid);
    if (!u) return;
    Object.assign(u, p);
    localStorage.setItem(key as string, JSON.stringify(users));
  }, [USERS_KEY, id, patch] as const);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
}

const openProfile = (page: Page) => goTab(page, 'profile', /Жеке кабинет|Личный кабинет|My Profile/);
const memberDialog = (page: Page) => page.locator('[role="dialog"][aria-labelledby="member-profile-name"]');
async function openMember(page: Page, name: string, exact = true) {
  await goTab(page, 'leaderboard');
  // The visitor's own row shows the name with a "you" mark, so it is matched loosely.
  await page.locator('main').getByText(name, { exact }).filter({ visible: true }).first().click();
  await expect(memberDialog(page)).toBeVisible();
}
/** A full achievement record as the app stores it, earned on `date`. */
const ach = (id: string, date: string) => ({ ...ALL_ACHIEVEMENTS.find(a => a.id === id)!, isUnlocked: true, unlockedAt: date });

for (const [w, h] of [[320, 640], [360, 740], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 860]]) {
  test.describe(`${w}px overview`, () => {
    const mobile = w < 768;
    test.use({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });

    test('own and member overview: progress, recent achievements, coins only in own, no overflow', async ({ page }) => {
      await openApp(page, 'Алихан Берік');
      await openProfile(page);
      const own = page.locator('main [data-profile-overview]');
      await expect(own.locator('[data-tier-progress]')).toBeVisible();
      await expect(own.locator('[data-own-coins]')).toBeVisible();
      const items = own.locator('[data-recent-item]');
      expect(await items.count()).toBeGreaterThan(0);
      expect(await items.count()).toBeLessThanOrEqual(3);
      await noHorizontalOverflow(page);
      await openMember(page, 'Дана Серік');
      const dlg = memberDialog(page);
      await expect(dlg.locator('[data-tier-progress]')).toBeVisible();
      await expect(dlg.locator('[data-own-coins]')).toHaveCount(0);
      expect(await dlg.innerText()).not.toMatch(/🪙|Коиндар|Коины|Coins/);
      await noHorizontalOverflow(page);
    });
  });
}

test.describe('overview details', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('new member: bronze, 0 XP, bar 0 %, XP left to silver, empty achievements state', async ({ page }) => {
    await openApp(page);
    await openProfile(page);
    const tp = page.locator('main [data-tier-progress]');
    await expect(tp.locator('[data-tier-name]')).toHaveText('Қола деңгей');
    await expect(tp.locator('[data-tier-xp]')).toHaveText(`0 / ${TIERS.silver.minXp} XP`);
    await expect(tp.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '0');
    await expect(tp.locator('[data-tier-next]')).toHaveText(`«Күміс деңгей» деңгейіне дейін ${TIERS.silver.minXp} XP қалды`);
    await expect(page.locator('main [data-recent-empty]')).toBeVisible();
    await expect(page.locator('main [data-recent-item]')).toHaveCount(0);
  });

  test('progress to the next tier is computed from TIERS', async ({ page }) => {
    await openApp(page);
    await patchUser(page, 'user-new-member', { xp: 1600, tier: 'gold' });
    await openProfile(page);
    const tp = page.locator('main [data-tier-progress]');
    const pct = Math.floor(((1600 - TIERS.gold.minXp) / (TIERS.platinum.minXp - TIERS.gold.minXp)) * 100);
    await expect(tp.locator('[data-tier-xp]')).toHaveText(`1600 / ${TIERS.platinum.minXp} XP`);
    await expect(tp.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', String(pct));
    await expect(tp.locator('[data-tier-next]')).toContainText(String(TIERS.platinum.minXp - 1600));
    const width = await tp.locator('[role="progressbar"] > div').evaluate(el => (el as HTMLElement).style.width);
    expect(width).toBe(`${pct}%`);
  });

  test('top tier: full bar, no next tier, "top tier reached"', async ({ page }) => {
    await openApp(page);
    await patchUser(page, 'user-new-member', { xp: 12000, tier: 'tengri' });
    await openProfile(page);
    const tp = page.locator('main [data-tier-progress]');
    await expect(tp.locator('[data-tier-xp]')).toHaveText('12000 XP');
    await expect(tp.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '100');
    await expect(tp.locator('[data-tier-next]')).toHaveText('Ең жоғары деңгейге жеттіңіз 👑');
  });

  test('one achievement; more than 3 → newest 3 in order; revoked one is not shown; link to the Achievements screen', async ({ page }) => {
    await openApp(page);
    await patchUser(page, 'user-new-member', { achievements: [ach('ach-first-event', '2026-11-10')] });
    await openProfile(page);
    await expect(page.locator('main [data-recent-item]')).toHaveCount(1);
    await expect(page.locator('main [data-recent-item]')).toContainText('10 қар. 2026');

    await patchUser(page, 'user-new-member', {
      achievements: [
        ach('ach-first-event', '2026-11-10'),
        ach('ach-first-book', '2026-11-12'),
        ach('ach-kind-word', '2026-11-15'),
        ach('ach-first-topic', '2026-11-14'),
        ach('ach-knowledge-seeker', '2026-11-20'),
      ],
      revokedAchievementIds: ['ach-knowledge-seeker'],
    });
    await openProfile(page);
    const ids = await page.locator('main [data-recent-item]').evaluateAll(els => els.map(e => e.getAttribute('data-recent-item')));
    expect(ids).toEqual(['ach-kind-word', 'ach-first-topic', 'ach-first-book']);
    await page.locator('main [data-recent-all]').click();
    await expect(page.locator('nav button[aria-current="page"], nav[aria-label] button[aria-current="page"]').first()).toBeVisible();
    await expect(page.locator('main [data-profile-overview]')).toHaveCount(0); // left the profile for the Achievements screen
  });

  test('member window: 3 newest + "All (n)" opens the full list; joined date shown', async ({ page }) => {
    await openApp(page);
    // Target is the new member opened from the leaderboard: demo auto-unlocks add nothing for them, so dates are exact.
    await patchUser(page, 'user-new-member', {
      achievements: [
        ach('ach-speaking-pro', '2026-10-01'),
        ach('ach-first-event', '2026-11-18'),
        ach('ach-first-book', '2026-11-19'),
        ach('ach-kind-word', '2026-11-21'),
      ],
    });
    await openMember(page, 'Новый участник', false);
    const dlg = memberDialog(page);
    const items = dlg.locator('[data-recent-item]');
    await expect(items).toHaveCount(3);
    const dates = await items.allInnerTexts();
    expect(dates[0]).toContain('21 қар. 2026');
    const toggle = dlg.locator('[data-recent-all]');
    const n = Number((await toggle.innerText()).match(/\d+/)![0]);
    expect(n).toBeGreaterThan(3);
    await toggle.click();
    await expect(dlg.locator('[data-member-all-achievements] span.inline-flex')).toHaveCount(n);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(dlg.locator('[data-member-joined]')).toContainText('Қауымдастыққа қосылды');
    await noHorizontalOverflow(page);
  });

  test('member window: with a revoked achievement among 5, short list, counter and full list show only the 4 in force', async ({ page }) => {
    await openApp(page);
    await patchUser(page, 'user-new-member', {
      achievements: [
        ach('ach-speaking-pro', '2026-10-01'),
        ach('ach-first-event', '2026-11-18'),
        ach('ach-first-book', '2026-11-19'),
        ach('ach-kind-word', '2026-11-21'),
        ach('ach-knowledge-seeker', '2026-11-22'), // newest, but revoked
      ],
      revokedAchievementIds: ['ach-knowledge-seeker'],
    });
    await openMember(page, 'Новый участник', false);
    const dlg = memberDialog(page);
    const shortIds = await dlg.locator('[data-recent-item]').evaluateAll(els => els.map(e => e.getAttribute('data-recent-item')));
    expect(shortIds).toEqual(['ach-kind-word', 'ach-first-book', 'ach-first-event']);
    const toggle = dlg.locator('[data-recent-all]');
    await expect(toggle).toHaveText('Барлығы (4)');
    await toggle.click();
    const full = dlg.locator('[data-member-all-achievements]');
    const fullIds = await full.locator('[data-member-achievement]').evaluateAll(els => els.map(e => e.getAttribute('data-member-achievement')));
    expect(fullIds.sort()).toEqual(['ach-first-book', 'ach-first-event', 'ach-kind-word', 'ach-speaking-pro']);
    await expect(full.locator('h3')).toContainText('(4)');
    await expect(dlg.locator('[data-member-achievement="ach-knowledge-seeker"], [data-recent-item="ach-knowledge-seeker"]')).toHaveCount(0);
    await noHorizontalOverflow(page);
  });

  test('long name and long bio do not break the card or the window', async ({ page }) => {
    await openApp(page);
    const name = 'Ақжарқынбекова-Сұлтанмахмұтқызы Әлиманұр Жанкелдіқызы Тарбағатайлық';
    const bio = 'Ұзын өмірбаян '.repeat(40) + 'Сөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөзсөз';
    await patchUser(page, 'user-new-member', { name, bio });
    await openProfile(page);
    await expect(page.locator('main h1')).toHaveText(name);
    await noHorizontalOverflow(page);
    await openMember(page, name, false);
    expect(await page.locator('#member-profile-name').evaluate(el => getComputedStyle(el).textOverflow)).not.toBe('ellipsis');
    const fits = await memberDialog(page).evaluate(el => el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
    await noHorizontalOverflow(page);
  });

  for (const lang of ['ru', 'en'] as const) {
    test(`${lang}: overview texts are translated`, async ({ page }) => {
      await openApp(page);
      await setLanguage(page, lang);
      await openProfile(page);
      const ov = page.locator('main [data-profile-overview]');
      await expect(ov).toContainText(lang === 'ru' ? 'Прогресс уровня' : 'Level progress');
      await expect(ov).toContainText(lang === 'ru' ? 'Последние достижения' : 'Recent achievements');
      await expect(ov.locator('[data-tier-next]')).toContainText(lang === 'ru' ? 'до уровня' : 'XP to');
    });
  }
});
