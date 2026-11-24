import { Page } from '@playwright/test';
import { test, expect, openApp, goTab, setLanguage, noHorizontalOverflow } from './fixtures';

/**
 * Phase 3 — Community System & Operations (demo data, no database):
 * registration feedback, event edit / cancel / restore by its organizer or a moderator, registrants list,
 * check-in desk (roster, walk-ins, rules), attendance history, members list (real rank, read books, keyboard),
 * admin confirmations, notification → event, 8 widths, ru/en.
 */

const EVENTS_KEY = 'shanyraq_hub_app_state_v1_events';
const MOD = 'Дана Серік';          // moderator
const ORG = 'Санжар Қасымов';      // organizer (user-member-2)
const ADMIN = 'Алихан Берік';      // super_admin
const ZERDE = /Zerde/;              // event-5: Айзере, Санжар, Меруерт registered
const ARAB = /каллиграфия/;         // event-6: Айзере registered

/**
 * Put demo events at known times relative to now (club time = UTC+5) before the app starts.
 * `plan` maps event id → minutes from now (and optional host / registrations).
 */
async function planEvents(page: Page, plan: Record<string, { inMin: number; host?: string; capacity?: number }>) {
  await page.addInitScript(([key, p]) => {
    if (sessionStorage.getItem('events-planned')) return;
    const raw = localStorage.getItem(key as string);
    if (!raw) return;
    sessionStorage.setItem('events-planned', '1');
    const events = JSON.parse(raw);
    for (const e of events) {
      const cfg = (p as Record<string, { inMin: number; host?: string; capacity?: number }>)[e.id];
      if (!cfg) continue;
      const club = new Date(Date.now() + cfg.inMin * 60_000 + 5 * 3600_000).toISOString();
      e.date = club.slice(0, 10);
      e.time = club.slice(11, 16);
      if (cfg.host) e.hostId = cfg.host;
      if (cfg.capacity) e.maxCapacity = cfg.capacity;
    }
    localStorage.setItem(key as string, JSON.stringify(events));
  }, [EVENTS_KEY, plan] as const);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
}

/** Switch the demo account (header menu), as openApp does — a reload goes back to the default member. */
async function switchTo(page: Page, account: string) {
  await page.locator('header button').last().click();
  await page.locator('button', { hasText: account }).first().click();
  await expect(page.locator('header')).toContainText(account.split(' ')[0]);
}

const card = (page: Page, title: RegExp) => page.locator('main article').filter({ hasText: title }).first();
const openEvent = async (page: Page, title: RegExp) => {
  await card(page, title).locator('button').first().click(); // the picture opens the event
  return page.locator('[data-event-dialog]');
};
const FUTURE = { 'event-5': { inMin: 60 * 26 }, 'event-6': { inMin: 60 * 50 } };

test.describe('events (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('register from the window: named dialog, notice, the card shows the status; cancel from the card', async ({ page }) => {
    await openApp(page);
    await planEvents(page, FUTURE);
    await goTab(page, 'events');
    const dlg = await openEvent(page, ARAB);
    await expect(page.getByRole('dialog', { name: /каллиграфия/ })).toBeVisible();
    await expect(dlg.locator('[data-event-manage]')).toHaveCount(0); // a member does not manage events
    await dlg.locator('[data-event-register]').click();
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('[data-events-notice]')).toContainText('тіркелдіңіз');
    const c = card(page, ARAB);
    await expect(c).toContainText('Сіз жазылдыңыз');
    await c.locator('[data-event-action="cancel"]').click();
    await expect(c.locator('[data-event-action="register"]')).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test('every member sees who signed up (owner decision C-21, Phase 4); no organizer tools, no "came" marks', async ({ page }) => {
    await openApp(page);
    await planEvents(page, FUTURE);
    await goTab(page, 'events');
    const dlg = await openEvent(page, ARAB);
    const who = dlg.locator('[data-event-who-coming]');
    await expect(who).toContainText('Кім тіркелді');
    await expect(who).toContainText('Айзере Мұрат');
    await expect(dlg.locator('[data-event-manage]')).toHaveCount(0);
    await expect(dlg.locator('[data-event-registrants]')).toHaveCount(0);
    await expect(who.locator('svg')).toHaveCount(0); // no check marks of who came
    await noHorizontalOverflow(page);
  });

  test('organizer manages only the events they host; a moderator manages any', async ({ page }) => {
    await openApp(page);
    await planEvents(page, { 'event-5': { inMin: 60 * 26 }, 'event-6': { inMin: 60 * 50, host: 'user-member-2' } });
    await switchTo(page, ORG);
    await goTab(page, 'events');
    let dlg = await openEvent(page, ARAB);
    await expect(dlg.locator('[data-event-manage]')).toBeVisible();
    await expect(dlg.locator('[data-event-registrants]')).toContainText('Айзере Мұрат');
    await page.keyboard.press('Escape');
    dlg = await openEvent(page, ZERDE); // hosted by Меруерт
    await expect(dlg.locator('[data-event-manage]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await openApp(page, MOD);
    await goTab(page, 'events');
    dlg = await openEvent(page, ZERDE);
    await expect(dlg.locator('[data-event-manage]')).toContainText('Тіркелгендер: 3 / 40');
  });

  test('edit: data kept on error (capacity below registered), saved otherwise; warning about registrants', async ({ page }) => {
    await openApp(page);
    await planEvents(page, FUTURE);
    await switchTo(page, MOD);
    await goTab(page, 'events');
    const dlg = await openEvent(page, ZERDE);
    await dlg.locator('[data-event-edit]').click();
    const form = page.getByRole('dialog', { name: 'Кездесуді өзгерту' });
    await expect(form.locator('[data-event-edit-warning]')).toContainText('3');
    await form.getByLabel('Атауы', { exact: false }).first().fill('Zerde: финал сезона');
    const cap = form.locator('#ev-capacity');
    await cap.evaluate(el => el.removeAttribute('min'));
    await cap.fill('2');
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('[data-event-form-error]')).toContainText('тіркелгендерден аз');
    await expect(form.locator('#ev-title')).toHaveValue('Zerde: финал сезона');
    await cap.fill('30');
    await form.locator('button[type="submit"]').click();
    await expect(form).toHaveCount(0);
    await expect(page.locator('[data-events-notice]')).toContainText('Zerde: финал сезона');
    await expect(page.locator('[data-event-dialog] #event-detail-title')).toHaveText('Zerde: финал сезона');
    await expect(page.locator('[data-event-dialog] [data-event-manage]')).toContainText('/ 30');
  });

  test('cancel an event (confirmation names the registrants), members cannot register, home does not offer it; restore', async ({ page }) => {
    await openApp(page);
    await planEvents(page, FUTURE);
    await switchTo(page, MOD);
    await goTab(page, 'events');
    const dlg = await openEvent(page, ZERDE);
    await dlg.locator('[data-event-cancel]').click();
    const confirm = page.getByRole('alertdialog', { name: 'Кездесуді тоқтату керек пе?' });
    await expect(confirm).toContainText('(3)');
    await confirm.getByRole('button', { name: 'Тоқтатпау' }).click();
    await expect(confirm).toHaveCount(0);
    await dlg.locator('[data-event-cancel]').click();
    await confirm.getByRole('button', { name: 'Кездесуді тоқтату' }).click();
    await expect(page.locator('[data-events-notice]')).toContainText('тоқтатылды');
    await expect(dlg.locator('[data-event-cancelled-note]')).toBeVisible();
    await expect(dlg.locator('[data-event-register]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(card(page, ZERDE)).toContainText('Тоқтатылды');
    // a member: no registration, and the home page does not suggest it
    await openApp(page);
    await goTab(page, 'events');
    await expect(card(page, ZERDE).locator('[data-event-action="register"]')).toHaveCount(0);
    await goTab(page, 'dashboard');
    await expect(page.locator('main')).not.toContainText('Zerde');
    // restore
    await openApp(page, MOD);
    await goTab(page, 'events');
    const again = await openEvent(page, ZERDE);
    await again.locator('[data-event-restore]').click();
    await expect(page.locator('[data-events-notice]')).toContainText('қайта ашылды');
    await expect(again.locator('[data-event-cancelled-note]')).toHaveCount(0);
  });

  test('create: a past date is refused inside the form with the data kept; the default date is in the future', async ({ page }) => {
    await openApp(page, MOD);
    await goTab(page, 'events');
    await page.locator('main button', { hasText: 'Іс-шара құру' }).click();
    const form = page.getByRole('dialog', { name: 'Іс-шара құру' });
    const today = await page.evaluate(() => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10));
    expect((await form.locator('#ev-date').inputValue()) > today).toBe(true);
    await form.locator('#ev-title').fill('Өткен кездесу');
    await form.locator('#ev-date').evaluate(el => el.removeAttribute('min'));
    await form.locator('#ev-date').fill('2020-01-01');
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('[data-event-form-error]')).toContainText('өтіп кеткен');
    await expect(form.locator('#ev-title')).toHaveValue('Өткен кездесу');
    await expect(form.getByRole('button', { name: 'Жариялау' })).toBeVisible(); // no false "and notify"
    await page.keyboard.press('Escape');
    await expect(form).toHaveCount(0);
  });

  test('notification about an event opens it; a missing event is explained', async ({ page }) => {
    await openApp(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('n')) return;
      const k = 'shanyraq_hub_app_state_v1_notifs';
      const raw = localStorage.getItem(k);
      if (!raw) return;
      sessionStorage.setItem('n', '1');
      const v = JSON.parse(raw);
      v.unshift({ id: 'n-ev', userId: 'user-new-member', type: 'event_reminder', title: 'Еске салу: кездесу', message: 'Тест', timestamp: '—', read: false, linkTab: 'events', eventId: 'event-6' });
      v.unshift({ id: 'n-att', userId: 'user-new-member', type: 'review', title: 'Қатысу расталды (тест)', message: 'Тест', timestamp: '—', read: false, linkTab: 'attendance', eventId: 'event-6' });
      v.unshift({ id: 'n-gone', userId: 'user-new-member', type: 'event_reminder', title: 'Жойылған кездесу', message: 'Тест', timestamp: '—', read: false, linkTab: 'events', eventId: 'gone' });
      localStorage.setItem(k, JSON.stringify(v));
    });
    await page.reload();
    await page.locator('header button:has(.lucide-bell)').click();
    await page.getByRole('button', { name: /Еске салу: кездесу/ }).click();
    await expect(page.getByRole('dialog', { name: /каллиграфия/ })).toBeVisible();
    await page.keyboard.press('Escape');
    // already on the events page: the next notification still opens / explains
    await page.locator('header button:has(.lucide-bell)').click();
    await page.getByRole('button', { name: /Жойылған кездесу/ }).click();
    await expect(page.locator('[data-event-not-found]')).toContainText('қолжетімсіз');
    // a notification that leads elsewhere (attendance) does not leave an event to pop up later
    await page.locator('header button:has(.lucide-bell)').click();
    await page.getByRole('button', { name: /Қатысу расталды \(тест\)/ }).click();
    await goTab(page, 'events');
    await expect(page.locator('[data-event-dialog]')).toHaveCount(0);
  });
});

test.describe('check-in desk (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const openAttendance = (page: Page) => goTab(page, 'attendance', /Қатысу|Посещ|Attendance/);

  test('moderator: event starting soon first; mark from the roster; walk-in by name; not oneself; counts', async ({ page }) => {
    await openApp(page);
    await planEvents(page, { 'event-5': { inMin: 60 }, 'event-6': { inMin: 60 * 50 } });
    await switchTo(page, MOD);
    await openAttendance(page);
    const desk = page.locator('main [data-checkin-desk]');
    await expect(desk.locator('#checkin-event option:checked')).toContainText('Zerde');
    // a future event outside the window is not offered
    await expect(desk.locator('#checkin-event option', { hasText: 'каллиграфия' })).toHaveCount(0);
    await expect(desk.locator('[data-checkin-counts]')).toHaveText('Тіркелгендер: 3 · келгендер: 0');
    await desk.locator('[data-roster-user="user-member-1"] [data-roster-checkin]').click();
    await expect(desk.locator('[data-checkin-result="ok"]')).toContainText('Айзере Мұрат');
    await expect(desk.locator('[data-roster-user="user-member-1"] [data-roster-came]')).toBeVisible();
    await expect(desk.locator('[data-checkin-counts]')).toHaveText('Тіркелгендер: 3 · келгендер: 1');
    await desk.locator('#checkin-walkin').fill('Алих');
    await desk.locator('[data-walkin-list] [data-walkin-checkin]').click();
    await expect(desk.locator('[data-roster-user="user-admin-1"] [data-roster-came]')).toBeVisible();
    await desk.locator('#checkin-walkin').fill('Дана');
    await expect(desk.locator('[data-walkin-list]')).toContainText('өзіңізді белгілеуге болмайды');
    await desk.locator('#checkin-walkin').fill('Жоқ адам');
    await expect(desk.locator('[data-walkin-empty]')).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test('organizer sees only own events in the window; a member has no desk', async ({ page }) => {
    await openApp(page);
    await planEvents(page, { 'event-4': { inMin: -30, host: 'user-member-2' }, 'event-5': { inMin: 60 } });
    await switchTo(page, ORG);
    await openAttendance(page);
    const options = await page.locator('#checkin-event option').allInnerTexts();
    expect(options.length).toBe(1);
    expect(options[0]).toContain('Tarlan');
    await openApp(page);
    await openAttendance(page);
    await expect(page.locator('main [data-checkin-desk]')).toHaveCount(0);
  });

  test('moderator removes a wrong check-in with a reason (owner decision C-14); an organizer cannot', async ({ page }) => {
    await openApp(page);
    await planEvents(page, { 'event-5': { inMin: 60, host: 'user-member-2' } });
    await switchTo(page, MOD);
    await openAttendance(page);
    const desk = page.locator('main [data-checkin-desk]');
    await desk.locator('[data-roster-user="user-member-1"] [data-roster-checkin]').click();
    await desk.locator('[data-roster-user="user-member-1"] [data-roster-undo]').click();
    const dlg = page.getByRole('alertdialog', { name: 'Қатысу белгісін алу керек пе?' });
    await expect(dlg).toContainText('Айзере Мұрат');
    await expect(dlg.getByRole('button', { name: 'Белгіні алу' })).toBeDisabled(); // reason required
    await dlg.getByLabel('Себебі *').fill('Қате белгіленді');
    await dlg.getByRole('button', { name: 'Белгіні алу' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(desk.locator('[data-checkin-result="ok"]')).toContainText('Белгі алынды');
    await expect(desk.locator('[data-roster-user="user-member-1"] [data-roster-checkin]')).toBeVisible();
    await expect(desk.locator('[data-checkin-counts]')).toHaveText('Тіркелгендер: 3 · келгендер: 0');
    // the organizer of this event marks, but has no "remove"
    await desk.locator('[data-roster-user="user-member-3"] [data-roster-checkin]').click();
    await switchTo(page, ORG);
    await openAttendance(page);
    await expect(page.locator('main [data-roster-user="user-member-3"] [data-roster-came]')).toBeVisible();
    await expect(page.locator('main [data-roster-undo]')).toHaveCount(0);
  });

  test('organizer: manual check-in closes 24 h after the event ended (owner decision C-15)', async ({ page }) => {
    await openApp(page);
    await planEvents(page, { 'event-4': { inMin: -60 * 30, host: 'user-member-2' }, 'event-5': { inMin: -60 * 3, host: 'user-member-2' } });
    await switchTo(page, ORG);
    await openAttendance(page);
    const options = await page.locator('#checkin-event option').allInnerTexts();
    expect(options.some(o => o.includes('Zerde'))).toBe(true);     // ended 1 h ago
    expect(options.some(o => o.includes('Tarlan'))).toBe(false);   // ended > 24 h ago
    await switchTo(page, MOD);                                      // a moderator can still correct it
    await openAttendance(page);
    expect((await page.locator('#checkin-event option').allInnerTexts()).some(o => o.includes('Tarlan'))).toBe(true);
  });

  test('a member sees only own visits (owner decision C-21): no "everyone" switch', async ({ page }) => {
    await openApp(page, 'Айзере Мұрат');
    await openAttendance(page);
    await expect(page.locator('main [data-att-history] button[aria-pressed]')).toHaveCount(0);
    const names = await page.locator('main [data-visit-name]').allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(new Set(['Айзере Мұрат']));
  });

  test('organizer without an event in the window gets an explanation', async ({ page }) => {
    await openApp(page);
    await planEvents(page, { 'event-4': { inMin: -60 * 24 * 3, host: 'user-mod-1' } });
    await switchTo(page, ORG);
    await openAttendance(page);
    await expect(page.locator('main [data-checkin-empty]')).toContainText('2 сағат');
  });

  test('history: newest first, "mine", localized level, names open the profile', async ({ page }) => {
    await openApp(page, MOD);
    await openAttendance(page);
    const dates = await page.locator('main [data-visit]').evaluateAll(els => els.length);
    expect(dates).toBeGreaterThan(1);
    await expect(page.locator('main [data-att-history]')).not.toContainText(/\b(BRONZE|SILVER|GOLD|PLATINUM)\b/);
    await page.locator('main [data-att-history] button[aria-pressed]', { hasText: 'Менікі' }).click();
    const names = await page.locator('main [data-visit-name]').allInnerTexts();
    expect(new Set(names)).toEqual(new Set(['Дана Серік']));
    await page.locator('main [data-visit] button').first().click();
    await expect(page.getByRole('dialog', { name: /Дана Серік/ })).toBeVisible();
  });
});

test.describe('members list', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('search keeps the real place; books = finished books; keyboard opens the profile', async ({ page }) => {
    await openApp(page);
    await goTab(page, 'leaderboard');
    const rows = page.locator('main [data-member-row]').filter({ visible: true });
    const all = await rows.allInnerTexts();
    const idx = all.findIndex(r => r.includes('Меруерт'));
    expect(idx).toBeGreaterThan(0);
    await page.getByLabel('Қатысушыны іздеу...').fill('меруерт');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(`#${idx + 1}`);
    await page.getByLabel('Қатысушыны іздеу...').fill('');
    // books: Айзере has finished and "reading" entries in the demo — only finished ones are counted
    const aizere = await page.evaluate(() => JSON.parse(localStorage.getItem('shanyraq_hub_app_state_v1_users')!)
      .find((u: { id: string }) => u.id === 'user-member-1').readBooks.filter((b: { status: string }) => b.status === 'completed').length);
    const aizereRow = page.locator('main [data-member-row="user-member-1"]').filter({ visible: true });
    await expect(aizereRow).toContainText(new RegExp(`\\b${aizere}\\b`));
    await aizereRow.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /Айзере Мұрат/ })).toBeVisible();
  });
});

test.describe('admin (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('role change needs confirmation; cancel keeps the role; confirm changes it with a notice; search; levels by name', async ({ page }) => {
    const alerts: string[] = [];
    page.on('dialog', d => { alerts.push(d.message()); void d.dismiss(); });
    await openApp(page, ADMIN);
    await goTab(page, 'admin');
    await page.locator('main [data-admin-tab="users"]').click();
    await expect(page.locator('main table')).not.toContainText(/\b(BRONZE|SILVER|GOLD|PLATINUM|SUPER_ADMIN)\b/);
    await page.getByLabel('Аты не @никнейм бойынша іздеу').fill('Меруерт');
    await expect(page.locator('main tbody tr')).toHaveCount(1);
    const select = page.getByLabel('Рөл тағайындау: Меруерт Ғаниқызы').filter({ visible: true });
    await select.selectOption('organizer');
    const confirm = page.getByRole('alertdialog', { name: 'Рөлді өзгерту керек пе?' });
    await expect(confirm).toContainText('«Қатысушы» → «Ұйымдастырушы»');
    await confirm.getByRole('button', { name: 'Болдырмау' }).click();
    await expect(select).toHaveValue('member');
    await select.selectOption('organizer');
    await confirm.getByRole('button', { name: 'Растау' }).click();
    await expect(page.locator('[data-admin-notice]')).toContainText('Ұйымдастырушы');
    await expect(select).toHaveValue('organizer');
    await page.getByLabel('Рөл бойынша сүзгі').selectOption('moderator');
    await expect(page.locator('main [data-admin-users-empty]')).toBeVisible(); // "Меруерт" + moderator
    expect(alerts).toEqual([]);
  });

  test('coin adjustment is confirmed, result shown on the page (no browser alert)', async ({ page }) => {
    const alerts: string[] = [];
    page.on('dialog', d => { alerts.push(d.message()); void d.dismiss(); });
    await openApp(page, ADMIN);
    await goTab(page, 'admin');
    await page.locator('main [data-admin-tab="users"]').click();
    const box = page.locator('main form').filter({ has: page.locator('input[type="number"]') }).first();
    await box.locator('select').selectOption('user-member-3');
    await box.locator('input[type="number"]').fill('25');
    await box.locator('input[type="text"]').fill('Турнирдегі көмек');
    await box.locator('button[type="submit"]').click();
    const confirm = page.getByRole('alertdialog', { name: 'Коин балансын өзгерту керек пе?' });
    await expect(confirm).toContainText('+25');
    await confirm.getByRole('button', { name: 'Растау' }).click();
    await expect(page.locator('[data-admin-notice]')).toContainText('+25');
    expect(alerts).toEqual([]);
  });
});

for (const [w, h] of [[320, 568], [360, 740], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 860]]) {
  test.describe(`${w}px community`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 768 });

    test('event window with organizer tools, edit form and check-in desk fit; buttons ≥ 40 px', async ({ page }) => {
      await openApp(page);
      await planEvents(page, { 'event-5': { inMin: 60 }, 'event-6': { inMin: 60 * 50 } });
      await switchTo(page, MOD);
      await goTab(page, 'events');
      const dlg = await openEvent(page, ZERDE);
      const db = (await dlg.boundingBox())!;
      expect(db.x).toBeGreaterThanOrEqual(0);
      expect(db.x + db.width).toBeLessThanOrEqual(w);
      expect(db.y + db.height).toBeLessThanOrEqual(h);
      for (const b of await dlg.locator('[data-event-edit], [data-event-cancel], [data-event-register]').all()) {
        expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      }
      await dlg.locator('[data-event-edit]').click();
      const form = page.locator('[data-event-form]');
      const fb = (await form.boundingBox())!;
      expect(fb.x + fb.width).toBeLessThanOrEqual(w);
      expect(fb.y + fb.height).toBeLessThanOrEqual(h);
      await expect(form.locator('button[type="submit"]')).toBeInViewport();
      await noHorizontalOverflow(page);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await goTab(page, 'attendance', /Қатысу/);
      const desk = page.locator('main [data-checkin-desk]');
      await expect(desk).toBeVisible();
      for (const b of await desk.locator('[data-roster-checkin]').all()) {
        const bb = (await b.boundingBox())!;
        expect(bb.height).toBeGreaterThanOrEqual(40);
        expect(bb.x + bb.width).toBeLessThanOrEqual(w);
      }
      await noHorizontalOverflow(page);
      await goTab(page, 'leaderboard');
      await noHorizontalOverflow(page);
    });
  });
}

test.describe('languages', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const [lang, desk, manage] of [
    ['ru', 'Записались: 3 · пришли: 0', 'Для организатора'],
    ['en', 'Registered: 3 · came: 0', 'For the organizer'],
  ] as const) {
    test(`${lang}: check-in desk and organizer tools`, async ({ page }) => {
      await openApp(page);
      await planEvents(page, { 'event-5': { inMin: 60 } });
      await switchTo(page, MOD);
      await setLanguage(page, lang);
      await goTab(page, 'attendance', /Посещ|Attendance/);
      await expect(page.locator('main [data-checkin-counts]')).toHaveText(desk);
      await goTab(page, 'events');
      const dlg = await openEvent(page, ZERDE);
      await expect(dlg.locator('[data-event-manage]')).toContainText(manage);
    });
  }
});
