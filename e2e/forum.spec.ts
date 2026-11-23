import { Page } from '@playwright/test';
import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow } from './fixtures';

/**
 * Phase 2.4.1 — forum and closed rooms (demo data, no database). Visitor = the new member unless noted.
 * Stored demo state is adjusted with an init script before the app starts (see patchTopics).
 */

const TOPICS_KEY = 'shanyraq_hub_app_state_v1_topics';
const openForum = (page: Page) => goTab(page, 'forum', /Форум|Forum/);
const cards = (page: Page) => page.locator('main [data-topic-card]');

/** Replace / adjust stored forum topics before the app starts, then reload. */
async function patchTopics(page: Page, script: string) {
  await page.addInitScript(([key, body]) => {
    const raw = localStorage.getItem(key as string);
    if (!raw) return;
    const topics = JSON.parse(raw);
    // eslint-disable-next-line no-new-func
    const next = new Function('topics', body as string)(topics);
    localStorage.setItem(key as string, JSON.stringify(next));
  }, [TOPICS_KEY, script] as const);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
}

/** Open a topic card (on narrow screens the thread replaces the list). */
async function openTopic(page: Page, id: string) {
  await page.locator(`main [data-topic-card="${id}"]`).click();
  await expect(page.locator('#forum-topic-title')).toBeVisible();
}

/** No native alert/confirm may appear in forum flows. */
function trackDialogs(page: Page) {
  const seen: string[] = [];
  page.on('dialog', d => seen.push(d.message()));
  return seen;
}

for (const [w, h] of [[320, 568], [360, 740], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 860]]) {
  test.describe(`${w}px forum`, () => {
    const mobile = w < 768;
    test.use({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });

    test('list, thread, reply form and rooms fit; reply button fully inside its form; touch targets ≥ 40 px', async ({ page }) => {
      await openApp(page);
      await openForum(page);
      await noHorizontalOverflow(page);
      await openTopic(page, 'topic-1');
      await noHorizontalOverflow(page);
      const fits = await page.locator('main [data-reply-form]').evaluate(f => {
        const fr = f.getBoundingClientRect();
        const b = f.querySelector('button[type="submit"]')!.getBoundingClientRect();
        return b.left >= fr.left - 1 && b.right <= fr.right + 1;
      });
      expect(fits, 'reply button inside the form').toBe(true);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('main button')]
          .filter(b => b.offsetParent && b.getBoundingClientRect().height < 39.5)
          .map(b => (b.innerText || b.getAttribute('aria-label') || '').slice(0, 30)));
      expect(small, 'small buttons').toEqual([]);
      await page.locator('main [aria-pressed]', { hasText: 'Жабық бөлмелер' }).click();
      await noHorizontalOverflow(page);
    });
  });
}

test.describe('forum (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('pinned topic first; thread: localized date, translated role badge, no raw codes', async ({ page }) => {
    await openApp(page);
    await patchTopics(page, `return [...topics].reverse();`); // the pinned topic is no longer first in storage
    await openForum(page);
    await expect(cards(page).first()).toHaveAttribute('data-topic-card', 'topic-1');
    await openTopic(page, 'topic-1');
    const main = await page.locator('main').innerText();
    expect(main).not.toMatch(/\d{4}-\d{2}-\d{2}|\bMEMBER\b|\bMODERATOR\b|\bSUPER_ADMIN\b|\bORGANIZER\b/);
    await expect(page.locator('main [data-topic-date]')).toHaveText(/^\d{1,2} \S+ \d{4}, \d{2}:\d{2}$/);
    await expect(page.locator('main [data-role-badge="moderator"]').first()).toHaveText('Модератор');
  });

  test('create topic: sections are forum sections (no "networking"), success closes the dialog and shows the topic', async ({ page }) => {
    const dialogs = trackDialogs(page);
    await openApp(page);
    await openForum(page);
    await page.locator('main [data-create-topic]').click();
    const dlg = page.getByRole('dialog', { name: 'Тақырып ашу' });
    const options = await dlg.locator('#topic-section option').evaluateAll(o => o.map(x => (x as HTMLOptionElement).value));
    expect(options).toEqual(['books', 'english', 'arabic', 'sport', 'art', 'intellect', 'general']);
    await expect(dlg.locator('[data-topic-reward-hint]')).toContainText('тәулігіне алғашқы 3 тақырып');
    await expect(dlg.getByRole('button', { name: 'Жариялау', exact: true })).toBeDisabled(); // empty form
    await dlg.getByLabel(/Талқылау тақырыбы/).fill('Жаңа тақырып: қыстың кітаптары');
    await dlg.getByLabel('Форум бөлімі', { exact: true }).selectOption('general'); // N-1/F-25: label names a forum section
    await dlg.getByLabel(/Жарияланым мәтіні/).fill('Бірінші жол.\nЕкінші жол.');
    await dlg.getByRole('button', { name: 'Жариялау', exact: true }).click();
    await expect(dlg).toHaveCount(0);
    const created = cards(page).filter({ hasText: 'Жаңа тақырып: қыстың кітаптары' });
    await expect(created).toHaveCount(1);
    await expect(created).toContainText('Жалпы хабарландырулар');
    expect(dialogs).toEqual([]);
  });

  test('create topic: a rejected section keeps the dialog open with the text and shows the error inside', async ({ page }) => {
    const dialogs = trackDialogs(page);
    await openApp(page);
    await openForum(page);
    await page.locator('main [data-create-topic]').click();
    const dlg = page.getByRole('dialog', { name: 'Тақырып ашу' });
    await dlg.locator('#topic-title').fill('Сақталатын тақырып');
    await dlg.locator('#topic-content').fill('Бұл мәтін жоғалмауы керек.');
    // A section the server does not know (what used to happen with "networking").
    await dlg.locator('#topic-section').evaluate((el: HTMLSelectElement) => {
      el.add(new Option('x', 'networking'));
      el.value = 'networking';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await dlg.getByRole('button', { name: 'Жариялау', exact: true }).click();
    await expect(dlg.locator('[data-create-error]')).toHaveText('Форум бөлімін таңдаңыз.');
    await expect(dlg.locator('#topic-title')).toHaveValue('Сақталатын тақырып');
    await expect(dlg.locator('#topic-content')).toHaveValue('Бұл мәтін жоғалмауы керек.');
    expect(dialogs).toEqual([]);
    // Title shorter than 3 characters cannot be sent.
    await dlg.locator('#topic-title').fill('Ок');
    await expect(dlg.getByRole('button', { name: 'Жариялау', exact: true })).toBeDisabled();
  });

  test('reply: success clears the field and adds the reply; a rejected reply keeps the text', async ({ page }) => {
    const dialogs = trackDialogs(page);
    await openApp(page);
    await openForum(page);
    await openTopic(page, 'topic-2');
    const before = await page.locator('main [data-reply-id]').count();
    const input = page.locator('#forum-reply');
    await expect(page.locator('#forum-reply-hint')).toContainText('алғашқы 10 жауап');
    await input.fill('Рақмет, өте пайдалы!');
    await page.locator('main [data-reply-form] button[type="submit"]').click();
    await expect(page.locator('main [data-reply-id]')).toHaveCount(before + 1);
    await expect(input).toHaveValue('');
    // Longer than the database allows (10 000): rejected, text kept, error in the form.
    const tooLong = 'а'.repeat(10001);
    await input.evaluate(el => el.removeAttribute('maxlength'));
    await input.fill(tooLong);
    await page.locator('main [data-reply-form] button[type="submit"]').click();
    await expect(page.locator('main [data-reply-error]')).toHaveText('Енгізілген деректерді тексеріңіз.');
    await expect(input).toHaveValue(tooLong);
    expect(dialogs).toEqual([]);
  });

  test('votes: topic and reply toggle aria-pressed and count; own post cannot be voted', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await openTopic(page, 'topic-2');
    const topicVote = page.locator('main article button[aria-pressed]');
    await expect(topicVote).toHaveAttribute('aria-pressed', 'false');
    const n = Number(await topicVote.innerText());
    await topicVote.click();
    await expect(topicVote).toHaveAttribute('aria-pressed', 'true');
    await expect(topicVote).toHaveText(String(n + 1));
    await expect(topicVote).toHaveAttribute('aria-label', `Тақырыпты пайдалы деп белгілеу, дауыстар: ${n + 1}`);
    const replyVote = page.locator('main [data-reply-id] button[aria-pressed]').first();
    const m = Number(await replyVote.innerText());
    await replyVote.click();
    await expect(replyVote).toHaveAttribute('aria-pressed', 'true');
    await expect(replyVote).toHaveText(String(m + 1));
    // Own reply: disabled, explained, not counted.
    await page.locator('#forum-reply').fill('Менің жауабым');
    await page.locator('main [data-reply-form] button[type="submit"]').click();
    const own = page.locator('main [data-reply-id]').last().locator('button[data-vote-own]');
    await expect(own).toBeDisabled();
    await expect(own).toHaveAttribute('aria-label', /Өз жазбаңызға дауыс беруге болмайды/);
  });

  test('closed topic: badge, explanation, no reply form', async ({ page }) => {
    await openApp(page);
    await patchTopics(page, `return topics.map(t => t.id === 'topic-2' ? { ...t, isClosed: true } : t);`);
    await openForum(page);
    await expect(page.locator('main [data-topic-card="topic-2"] [data-topic-closed]')).toHaveText('Жабық');
    await openTopic(page, 'topic-2');
    await expect(page.locator('main [data-closed-notice]')).toContainText('жаңа жауаптар қабылданбайды');
    await expect(page.locator('main [data-reply-form]')).toHaveCount(0);
  });

  test('empty forum: explanation and a button to start, no reply form', async ({ page }) => {
    await openApp(page);
    await patchTopics(page, `return [];`);
    await openForum(page);
    await expect(page.locator('main [data-forum-empty]')).toContainText('Әзірге тақырып жоқ');
    await expect(page.locator('main [data-reply-form]')).toHaveCount(0);
    await page.locator('main [data-forum-empty] button').click();
    await expect(page.getByRole('dialog', { name: 'Тақырып ашу' })).toBeVisible();
  });

  test('long title, paragraphs, long link and unbroken word stay inside the card', async ({ page }) => {
    await openApp(page);
    await patchTopics(page, `return topics.map(t => t.id === 'topic-2' ? { ...t,
      title: 'Өте ұзын тақырып ' + 'Ақжарқынбекова-Сұлтанмахмұтқызы'.repeat(4),
      content: 'Бірінші абзац.\\n\\nЕкінші абзац.\\nhttps://example.com/' + 'very-long-url-segment-'.repeat(10) + '\\n' + 'сөз'.repeat(60) } : t);`);
    await openForum(page);
    await openTopic(page, 'topic-2');
    await noHorizontalOverflow(page);
    const content = page.locator('main [data-topic-content]');
    expect(await content.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('pre-line');
    expect(await content.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.locator('#forum-topic-title').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect((await content.innerText()).split('\n').length).toBeGreaterThanOrEqual(4);
  });

  test('closed rooms: toggle state, latest message visible, sent message appears at the bottom', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    const roomsToggle = page.locator('main [aria-pressed]', { hasText: 'Жабық бөлмелер' });
    await roomsToggle.click();
    await expect(roomsToggle).toHaveAttribute('aria-pressed', 'true');
    await page.locator('main [data-room-card]').first().click();
    const box = page.locator('main [data-chat-messages]');
    await expect(box).toBeVisible();
    const atEnd = () => box.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight < 2);
    expect(await atEnd()).toBe(true);
    await page.locator('#chat-message').fill('Сәлем! ' + 'Ұзын хабарлама '.repeat(30));
    await page.locator('main [data-chat-form] button[type="submit"]').click();
    await expect(page.locator('#chat-message')).toHaveValue('');
    await expect(box.locator('[data-chat-message]').last()).toContainText('Сәлем!');
    await expect.poll(atEnd).toBe(true);
    await expect(box.locator('[data-chat-day]').last()).toHaveText(/^\d{1,2} \S+ \d{4}$/);
    await noHorizontalOverflow(page);
  });
});

test.describe('forum keyboard and dialog (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('topic cards: Tab + Enter / Space open a topic', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await page.locator('main [data-topic-card="topic-1"]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('main [data-topic-card="topic-2"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main [data-topic-card="topic-2"]')).toHaveAttribute('aria-current', 'true');
    await page.locator('main [data-topic-card="topic-1"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('main [data-topic-card="topic-1"]')).toHaveAttribute('aria-current', 'true');
  });

  test('new topic dialog: role, labels, focus inside and trapped, Escape closes and returns focus', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    const opener = page.locator('main [data-create-topic]');
    await opener.click();
    const dlg = page.getByRole('dialog', { name: 'Тақырып ашу' });
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(await dlg.evaluate(el => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await dlg.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    await expect(dlg.getByRole('button', { name: 'Жаңа тақырып терезесін жабу' })).toBeVisible();
    await dlg.getByLabel(/Талқылау тақырыбы/).fill('Қалатын мәтін');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(page.getByRole('dialog', { name: 'Тақырып ашу' }).locator('#topic-title')).toHaveValue('Қалатын мәтін');
  });
});

test.describe('forum on narrow screens: keyboard back to the list', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('Enter opens the thread (heading focused), back returns focus to the card', async ({ page }) => {
    await openApp(page);
    await openForum(page);
    await page.locator('main [data-topic-card="topic-2"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#forum-topic-title')).toBeFocused();
    await page.getByRole('button', { name: 'Барлық тақырыптарға оралу' }).click();
    await expect(page.locator('main [data-topic-card="topic-2"]')).toBeFocused();
  });
});

test.describe('forum languages', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const lang of ['ru', 'en'] as const) {
  test(`${lang}: forum texts, empty state and hints are translated`, async ({ page }) => {
    await openApp(page);
    await setLanguage(page, lang);
    await patchTopics(page, `return [];`);
    await openForum(page);
    await expect(page.locator('main [data-forum-empty]')).toContainText(lang === 'ru' ? 'Пока нет тем' : 'No topics yet');
    await expect(page.locator('main [role="group"] button').first()).toHaveAttribute('aria-pressed', 'true');
    await page.locator('main [data-forum-empty] button').click();
    const hint = page.getByRole('dialog').locator('[data-topic-reward-hint]');
    await expect(hint).toContainText(lang === 'ru' ? 'первые 3 темы в сутки' : 'first 3 topics a day');
  });
}
});
