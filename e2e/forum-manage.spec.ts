import { Page } from '@playwright/test';
import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow } from './fixtures';

/**
 * Phase 2.4 (remaining scope) — edit / delete own posts (F-13), moderation in the interface (F-12),
 * topic sorting (F-15), notification items as buttons (N-6). Demo data, no database.
 * Rules: src/utils/forumPermissions.ts.
 */

const MOD = 'Дана Серік';
const openForum = (page: Page) => goTab(page, 'forum', /Форум|Forum/);
const cards = (page: Page) => page.locator('main [data-topic-card]');
const ids = (page: Page) => cards(page).evaluateAll(els => els.map(e => e.getAttribute('data-topic-card')));
const topicMenu = (page: Page) => page.locator('main [data-topic-actions] > button');
const replyMenu = (page: Page, id: string) => page.locator(`main [data-reply-id="${id}"] [data-reply-actions] > button`);
const action = (page: Page, id: string) => page.locator(`[data-post-actions-list] [data-post-action="${id}"]`);
const notice = (page: Page) => page.locator('[data-forum-notice]');

/** Adjust stored demo data before the app starts. */
async function patchTopics(page: Page, body: string) {
  await page.addInitScript(b => {
    if (sessionStorage.getItem('topics-patched')) return;
    const raw = localStorage.getItem('shanyraq_hub_app_state_v1_topics');
    if (!raw) return;
    sessionStorage.setItem('topics-patched', '1');
    // eslint-disable-next-line no-new-func
    localStorage.setItem('shanyraq_hub_app_state_v1_topics', JSON.stringify(new Function('value', b)(JSON.parse(raw))));
  }, body);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
}

async function createTopic(page: Page, title: string, text = 'Бірінші жол.') {
  await page.locator('main [data-create-topic]').click();
  const dlg = page.getByRole('dialog', { name: 'Тақырып ашу' });
  await dlg.getByLabel(/Талқылау тақырыбы/).fill(title);
  await dlg.getByLabel(/Жарияланым мәтіні/).fill(text);
  await dlg.getByRole('button', { name: 'Жариялау', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await cards(page).filter({ hasText: title }).click();
}

async function reply(page: Page, text: string) {
  await page.locator('#forum-reply').fill(text);
  await page.locator('main [data-reply-form] button[type="submit"]').click();
  await expect(page.locator('#forum-reply')).toHaveValue('');
}

test.describe('member: own posts (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('edit own topic: dialog, keyboard, saved; nothing changed → Save off', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await createTopic(page, 'Менің тақырыбым', 'Бастапқы мәтін.');
    await expect(topicMenu(page)).toHaveAttribute('aria-expanded', 'false');
    await topicMenu(page).click();
    await expect(topicMenu(page)).toHaveAttribute('aria-expanded', 'true');
    // own topic without replies: edit and delete, no moderation
    await expect(page.locator('[data-post-actions-list] [data-post-action]')).toHaveText(['Өзгерту', 'Жою']);
    await action(page, 'edit').click();
    const dlg = page.getByRole('dialog', { name: 'Тақырыпты өзгерту' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Сақтау' })).toBeDisabled(); // nothing changed yet
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(topicMenu(page)).toBeFocused(); // focus back on "⋯"
    await topicMenu(page).click();
    await action(page, 'edit').click();
    await dlg.getByLabel(/Талқылау тақырыбы/).fill('Ме'); // shorter than 3
    await expect(dlg.getByRole('button', { name: 'Сақтау' })).toBeDisabled();
    await dlg.getByLabel(/Талқылау тақырыбы/).fill('Менің тақырыбым (түзетілді)');
    await dlg.getByLabel(/Жарияланым мәтіні/).fill('Жаңа мәтін.\nЕкінші жол.');
    await dlg.getByRole('button', { name: 'Сақтау' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(notice(page)).toHaveText('Сақталды.');
    await expect(page.locator('#forum-topic-title')).toHaveText('Менің тақырыбым (түзетілді)');
    await expect(page.locator('main [data-topic-content]')).toHaveText('Жаңа мәтін.\nЕкінші жол.');
    await noHorizontalOverflow(page);
  });

  test('delete own topic: confirm (Cancel / Escape keep it), then deleted, focus on the list', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await createTopic(page, 'Жойылатын тақырып');
    await topicMenu(page).click();
    await action(page, 'delete').click();
    const confirm = page.getByRole('alertdialog', { name: 'Тақырыпты жою керек пе?' });
    await expect(confirm).toContainText('Мұны қайтару мүмкін емес');
    await confirm.getByRole('button', { name: 'Болдырмау' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.locator('#forum-topic-title')).toHaveText('Жойылатын тақырып');
    await topicMenu(page).click();
    await action(page, 'delete').click();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(topicMenu(page)).toBeFocused();
    await topicMenu(page).click();
    await action(page, 'delete').click();
    await confirm.getByRole('button', { name: 'Жою' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(notice(page)).toHaveText('Тақырып жойылды.');
    await expect(cards(page).filter({ hasText: 'Жойылатын тақырып' })).toHaveCount(0);
    await expect(page.locator('main [data-list-heading]')).toBeFocused();
    await noHorizontalOverflow(page);
  });

  test('own topic after someone else replied: no edit or delete, an explanation instead', async ({ page }) => {
    await openApp(page);
    await patchTopics(page, `
      value[1].authorId = 'user-new-member';
      return value;`); // topic-2 now "mine", with a reply from Санжар
    await openForum(page);
    await cards(page).filter({ hasText: 'Idioms' }).click();
    await topicMenu(page).click();
    await expect(page.locator('[data-post-actions-list] [data-post-action]')).toHaveCount(0);
    await expect(page.locator('[data-post-actions-list] [data-post-actions-note]')).toContainText('Басқалар жауап берді');
    await page.keyboard.press('Escape');
    await expect(topicMenu(page)).toBeFocused();
  });

  test('own reply: edit in place (Escape cancels, Ctrl+Enter saves, marked edited), delete with confirm', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await cards(page).filter({ hasText: 'Idioms' }).click();
    await reply(page, 'Менің жауабым');
    const mine = page.locator('main [data-reply-id]').filter({ hasText: 'Менің жауабым' });
    const id = await mine.getAttribute('data-reply-id');
    await replyMenu(page, id!).click();
    await expect(page.locator('[data-post-actions-list] [data-post-action]')).toHaveText(['Өзгерту', 'Жою']);
    await action(page, 'edit').click();
    const field = page.getByLabel('Жауапты өзгерту');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('Менің жауабым');
    await field.fill('Өзгертілген');
    await page.keyboard.press('Escape'); // cancel: text unchanged
    await expect(field).toHaveCount(0);
    await expect(mine).toContainText('Менің жауабым');
    await expect(replyMenu(page, id!)).toBeFocused();
    await replyMenu(page, id!).click();
    await action(page, 'edit').click();
    await field.fill('');
    await expect(page.locator(`main [data-reply-id="${id}"]`).getByRole('button', { name: 'Сақтау' })).toBeDisabled(); // empty
    await field.fill('Түзетілген жауап\nекінші жол');
    await page.keyboard.press('Control+Enter');
    await expect(field).toHaveCount(0);
    const edited = page.locator(`main [data-reply-id="${id}"]`);
    await expect(edited).toContainText('Түзетілген жауап');
    await expect(edited.locator('[data-reply-edited]')).toHaveText('(өзгертілді)');
    await expect(notice(page)).toHaveText('Сақталды.');
    await replyMenu(page, id!).click();
    await action(page, 'delete').click();
    const confirm = page.getByRole('alertdialog', { name: 'Жауапты жою керек пе?' });
    await confirm.getByRole('button', { name: 'Жою' }).click();
    await expect(edited).toHaveCount(0);
    await expect(notice(page)).toHaveText('Жауап жойылды.');
    await expect(page.locator('#forum-replies-title')).toBeFocused();
  });

  test('other people’s posts: no actions at all for a member', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await cards(page).filter({ hasText: 'Idioms' }).click();
    await expect(page.locator('main [data-topic-actions]')).toHaveCount(0);
    await expect(page.locator('main [data-reply-actions]')).toHaveCount(0);
  });

  test('closed topic: own reply cannot be edited or deleted by a member', async ({ page }) => {
    await openApp(page);
    await patchTopics(page, `
      value[1].isClosed = true;
      value[1].replies.push({ id: 'reply-mine', authorId: 'user-new-member', authorName: 'Мен', authorAvatar: '', authorRole: 'member', content: 'Менің ескі жауабым', createdAt: '2024-11-10 14:00', upvotes: [] });
      return value;`);
    await openForum(page);
    await cards(page).filter({ hasText: 'Idioms' }).click();
    await expect(page.locator('main [data-reply-id="reply-mine"]')).toBeVisible();
    await expect(page.locator('main [data-reply-id="reply-mine"] [data-reply-actions]')).toHaveCount(0);
  });
});

test.describe('moderator', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('pin, close/reopen, hide topic — and the member no longer sees it', async ({ page }) => {
    await openApp(page, MOD);
    await openForum(page);
    expect(await ids(page)).toEqual(['topic-1', 'topic-2']);
    await cards(page).filter({ hasText: 'Idioms' }).click();
    await topicMenu(page).click();
    // Дана is the author of topic-2 with a reply from someone else: moderation group only
    await expect(page.locator('[data-post-actions-list] [role="group"]')).toHaveAttribute('aria-label', 'Модерация');
    await expect(page.locator('[data-post-actions-list] [data-post-action]')).toHaveText(['Бекіту', 'Тақырыпты жабу', 'Жасыру', 'Жою']);
    await action(page, 'pin').click();
    await expect(notice(page)).toHaveText('Сақталды.');
    await page.locator('main').getByRole('button', { name: /Барлық тақырыптарға оралу/ }).click();
    // both pinned now: newest first
    expect(await ids(page)).toEqual(['topic-2', 'topic-1']);
    await cards(page).filter({ hasText: 'Idioms' }).click();
    await topicMenu(page).click();
    await expect(action(page, 'pin')).toHaveText('Бекітуден алу');
    await action(page, 'close').click();
    await expect(page.locator('main [data-closed-notice]')).toContainText('модератор жапты');
    await expect(page.locator('#forum-reply')).toHaveCount(0);
    await topicMenu(page).click();
    await action(page, 'close').click(); // reopen
    await expect(page.locator('#forum-reply')).toBeVisible();
    await topicMenu(page).click();
    await action(page, 'hide').click();
    await expect(page.locator('main [data-hidden-notice]')).toContainText('тек авторы мен модераторлар');
    await expect(page.locator('main [data-closed-notice]')).toContainText('жасырылған');

    await openApp(page, 'Айзере Мұрат'); // a member
    await openForum(page);
    expect(await ids(page)).toEqual(['topic-1']);
  });

  test('hide and delete a reply; delete a topic with replies (count in the confirmation)', async ({ page }) => {
    await openApp(page, MOD);
    await openForum(page);
    await cards(page).filter({ hasText: '3 книги' }).click(); // topic-1 by the admin, replies by Дана and Айзере
    await replyMenu(page, 'reply-2').click();
    await expect(page.locator('[data-post-actions-list] [data-post-action]')).toHaveText(['Жасыру', 'Жою']);
    await action(page, 'hide').click();
    await expect(page.locator('main [data-reply-id="reply-2"] [data-hidden-badge]')).toHaveText('Жасырылған');
    // own reply of the moderator: own edit + moderation
    await replyMenu(page, 'reply-1').click();
    await expect(page.locator('[data-post-actions-list] [data-post-action]')).toHaveText(['Өзгерту', 'Жасыру', 'Жою']);
    await page.keyboard.press('Escape');
    await replyMenu(page, 'reply-1').click();
    await action(page, 'delete').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Жою' }).click();
    await expect(page.locator('main [data-reply-id="reply-1"]')).toHaveCount(0);
    await topicMenu(page).click();
    await action(page, 'delete').click();
    const confirm = page.getByRole('alertdialog', { name: 'Тақырыпты жою керек пе?' });
    await expect(confirm).toContainText('жауаптар (1)');
    await expect(confirm).toContainText('«Жасыру»');
    await confirm.getByRole('button', { name: 'Жою' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(notice(page)).toHaveText('Тақырып жойылды.');

    await openApp(page, 'Айзере Мұрат');
    await openForum(page);
    expect(await ids(page)).toEqual(['topic-2']);
  });

  test('the member sees a hidden reply only if it is theirs', async ({ page }) => {
    await openApp(page);
    await patchTopics(page, `
      value[0].replies[1].isHidden = true;            // Айзере's reply in topic-1
      value[1].replies.push({ id: 'reply-mine', authorId: 'user-new-member', authorName: 'Мен', authorAvatar: '', authorRole: 'member', content: 'Жасырылған менікі', createdAt: '2024-11-10 14:00', upvotes: [], isHidden: true });
      return value;`);
    await openForum(page);
    await cards(page).filter({ hasText: '3 книги' }).click();
    await expect(page.locator('main [data-reply-id="reply-2"]')).toHaveCount(0);
    await page.locator('main').getByRole('button', { name: /Барлық тақырыптарға оралу/ }).click();
    await cards(page).filter({ hasText: 'Idioms' }).click();
    await expect(page.locator('main [data-reply-id="reply-mine"] [data-hidden-badge]')).toBeVisible();
  });
});

test.describe('sorting (F-15)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('newest, latest activity, most liked; pinned stays first', async ({ page }) => {
    await openApp(page);
    await patchTopics(page, `
      value[0].isPinned = false;
      value[0].replies[1].createdAt = '2024-11-12 09:00'; // topic-1: latest activity
      value[0].upvotes.push('user-member-3');              // topic-1: 4 likes vs 3
      return value;`);
    await openForum(page);
    const sort = page.getByLabel('Сұрыптау');
    await expect(sort).toHaveValue('new');
    expect(await ids(page)).toEqual(['topic-2', 'topic-1']);
    await sort.selectOption('active');
    expect(await ids(page)).toEqual(['topic-1', 'topic-2']);
    await sort.selectOption('popular');
    expect(await ids(page)).toEqual(['topic-1', 'topic-2']);
    await sort.selectOption('new');
    expect(await ids(page)).toEqual(['topic-2', 'topic-1']);
    // the sort is kept when filters are reset
    await sort.selectOption('popular');
    await page.getByLabel('Тақырыптардан іздеу').fill('zzz');
    await page.locator('main [data-forum-no-results] button').click();
    await expect(sort).toHaveValue('popular');
  });
});

test.describe('keyboard (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('actions menu: Enter opens and focuses the first action, Escape closes and returns focus', async ({ page }) => {
    await openApp(page, MOD);
    await openForum(page);
    await topicMenu(page).focus();
    await page.keyboard.press('Enter');
    await expect(action(page, 'pin')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(action(page, 'close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-post-actions-list]')).toHaveCount(0);
    await expect(topicMenu(page)).toBeFocused();
    // click outside closes too
    await topicMenu(page).click();
    await page.locator('#forum-topic-title').click();
    await expect(page.locator('[data-post-actions-list]')).toHaveCount(0);
  });

  test('notification items are buttons: Tab + Enter opens the topic (N-6)', async ({ page }) => {
    await openApp(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('n-patched')) return;
      const raw = localStorage.getItem('shanyraq_hub_app_state_v1_notifs');
      if (!raw) return;
      sessionStorage.setItem('n-patched', '1');
      const v = JSON.parse(raw);
      v.unshift({ id: 'n-kb', userId: 'user-new-member', type: 'forum_reply', title: 'Пернетақта хабарламасы', message: 'Тест', timestamp: '23 қар. 2026, 10:00', read: false, linkTab: 'forum', topicId: 'topic-2' });
      localStorage.setItem('shanyraq_hub_app_state_v1_notifs', JSON.stringify(v));
    });
    await page.reload();
    await page.locator('header button:has(.lucide-bell)').click();
    const item = page.getByRole('button', { name: /Пернетақта хабарламасы/ });
    await item.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#forum-topic-title')).toContainText('Idioms');
  });
});

for (const [w, h] of [[320, 568], [360, 740], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 860]]) {
  test.describe(`${w}px management`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 768 });

    test('menus and dialogs fit the screen, buttons ≥ 40 px', async ({ page }) => {
      await openApp(page, MOD);
      await openForum(page);
      await page.getByLabel('Сұрыптау').selectOption('active');
      await cards(page).filter({ hasText: 'Idioms' }).click();
      await topicMenu(page).click();
      const list = page.locator('[data-post-actions-list]');
      const box = (await list.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(w);
      for (const b of await list.locator('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      expect((await topicMenu(page).boundingBox())!.height).toBeGreaterThanOrEqual(40);
      await noHorizontalOverflow(page);
      await action(page, 'delete').click();
      const confirm = page.getByRole('alertdialog');
      const cb = (await confirm.boundingBox())!;
      expect(cb.x).toBeGreaterThanOrEqual(0);
      expect(cb.x + cb.width).toBeLessThanOrEqual(w);
      expect(cb.y + cb.height).toBeLessThanOrEqual(h);
      await confirm.getByRole('button', { name: 'Болдырмау' }).click();
      // reply menu of the last reply opens inside the screen width
      await replyMenu(page, 'reply-3').click();
      const rb = (await page.locator('[data-post-actions-list]').boundingBox())!;
      expect(rb.x).toBeGreaterThanOrEqual(0);
      expect(rb.x + rb.width).toBeLessThanOrEqual(w);
      await noHorizontalOverflow(page);
    });
  });
}

test.describe('languages', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const [lang, items, sortLabel] of [
    ['ru', ['Закрепить', 'Закрыть тему', 'Скрыть', 'Удалить'], 'Сортировка'],
    ['en', ['Pin', 'Close topic', 'Hide', 'Delete'], 'Sort'],
  ] as const) {
    test(`${lang}: moderation menu and sort`, async ({ page }) => {
      await openApp(page, MOD);
      await setLanguage(page, lang);
      await openForum(page);
      await expect(page.getByLabel(sortLabel, { exact: true })).toBeVisible();
      await cards(page).nth(1).click();
      await topicMenu(page).click();
      await expect(page.locator('[data-post-actions-list] [data-post-action]')).toHaveText([...items]);
    });
  }
});
