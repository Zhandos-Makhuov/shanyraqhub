// Supabase Edge Function "telegram-bot" (owner decision 2026-11-20: Mini App + sign-in + notifications).
//
//   POST (from Telegram, webhook)  header X-Telegram-Bot-Api-Secret-Token  -> handle /start, linking, /help
//   POST ?dispatch=1               header x-shq-secret (pg_cron, every minute) -> deliver pending notifications
//   POST ?setup=1                  header x-shq-secret (once, after deploy)    -> webhook, commands, menu button
//
// WHO gets WHAT is decided in SQL (public.claim_telegram_batch). Linking needs a one-time code made by the
// signed-in member on the site (public.create_telegram_link_code), so nobody can attach someone else's account.
//
// Secrets: TELEGRAM_BOT_TOKEN (owner, dashboard), SHQ_PUSH_CRON_SECRET (shared with send-push),
// SHQ_SITE_URL (the site opened as the Mini App). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
};
const api = async (method: string, body: unknown) => {
  const r = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) as { ok?: boolean; result?: unknown; description?: string } };
};
const db = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const sha256hex = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
/** Webhook secret derived from the internal secret: Telegram sends it back with every update. */
const webhookSecret = () => sha256hex(`tg-webhook:${env('SHQ_PUSH_CRON_SECRET')}`);
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Lang = 'ru' | 'kz' | 'en';
const T: Record<string, Record<Lang, string>> = {
  open: { ru: 'Открыть клуб', kz: 'Клубты ашу', en: 'Open the club' },
  welcome: {
    ru: 'Добро пожаловать в <b>Shanyraq Hub</b> — клуб чтения, языков и живого общения.\n\nНажмите «Открыть клуб»: вход через Telegram, без почты и пароля. Уведомления о встречах, ответах и рассылках будут приходить сюда.',
    kz: '<b>Shanyraq Hub</b> клубына қош келдіңіз — кітап, тіл және жанды қарым-қатынас клубы.\n\n«Клубты ашу» түймесін басыңыз: Telegram арқылы кіру, поштасыз және құпиясөзсіз. Кездесулер, жауаптар мен хабарламалар осында келеді.',
    en: 'Welcome to <b>Shanyraq Hub</b> — a club for reading, languages and real conversations.\n\nTap “Open the club”: sign in with Telegram, no e-mail or password. Event reminders, replies and announcements will arrive here.',
  },
  back: {
    ru: 'С возвращением, {name}! Клуб открывается кнопкой ниже.',
    kz: 'Қайта оралуыңызбен, {name}! Клуб төмендегі түймемен ашылады.',
    en: 'Welcome back, {name}! Open the club with the button below.',
  },
  linked: {
    ru: '✅ Telegram привязан к аккаунту «{name}». Уведомления клуба будут приходить сюда; выключить можно на сайте (колокольчик).',
    kz: '✅ Telegram «{name}» аккаунтына байланыстырылды. Клуб хабарламалары осында келеді; сайтта (қоңырауша) өшіруге болады.',
    en: '✅ Telegram is linked to “{name}”. Club notifications will arrive here; you can switch them off on the site (bell icon).',
  },
  link_bad: {
    ru: 'Ссылка для привязки недействительна или устарела (действует 10 минут). Откройте сайт → колокольчик → «Привязать Telegram» ещё раз.',
    kz: 'Байланыстыру сілтемесі жарамсыз немесе ескірген (10 минут жарамды). Сайтта қоңырауша → «Telegram байланыстыру» қайта басыңыз.',
    en: 'This link is invalid or expired (valid for 10 minutes). On the site: bell icon → “Link Telegram” again.',
  },
  link_taken: {
    ru: 'Этот Telegram уже привязан к другому аккаунту клуба. Сначала отвяжите его там.',
    kz: 'Бұл Telegram клубтың басқа аккаунтына байланысқан. Алдымен сонда ажыратыңыз.',
    en: 'This Telegram is already linked to another club account. Unlink it there first.',
  },
  help: {
    ru: 'Shanyraq Hub: «Открыть клуб» — встречи, книги, форум, достижения. Уведомления приходят сюда автоматически.',
    kz: 'Shanyraq Hub: «Клубты ашу» — кездесулер, кітаптар, форум, жетістіктер. Хабарламалар осында автоматты түрде келеді.',
    en: 'Shanyraq Hub: “Open the club” — events, books, forum, achievements. Notifications arrive here automatically.',
  },
};
const lang = (code?: string): Lang => (code === 'kk' ? 'kz' : code?.startsWith('ru') ? 'ru' : code ? 'en' : 'ru');
const t = (key: string, l: Lang, vars: Record<string, string> = {}) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, escapeHtml(v)), T[key][l]);
const openButton = (l: Lang) => ({ inline_keyboard: [[{ text: t('open', l), web_app: { url: env('SHQ_SITE_URL') } }]] });
const say = (chatId: number, text: string, l: Lang) =>
  api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: openButton(l), link_preview_options: { is_disabled: true } });

interface Update {
  message?: { chat: { id: number; type: string }; from?: { id: number; username?: string; first_name?: string; language_code?: string }; text?: string };
  my_chat_member?: { chat: { id: number; type: string }; from: { id: number }; new_chat_member: { status: string } };
}

const handleUpdate = async (u: Update) => {
  const supa = db();
  if (u.my_chat_member && u.my_chat_member.chat.type === 'private') {
    const status = u.my_chat_member.new_chat_member.status;
    if (status === 'kicked') await supa.rpc('telegram_mark_blocked', { p_chat_ids: [u.my_chat_member.chat.id] });
    if (status === 'member') await supa.rpc('telegram_chat_started', { p_telegram_id: u.my_chat_member.from.id, p_chat_id: u.my_chat_member.chat.id });
    return;
  }
  const m = u.message;
  if (!m || m.chat.type !== 'private' || !m.from) return; // the bot works in private chats only
  const l = lang(m.from.language_code);
  const text = (m.text ?? '').trim();
  const known = await supa.rpc('telegram_chat_started', { p_telegram_id: m.from.id, p_chat_id: m.chat.id });

  const linkMatch = /^\/start\s+link_([0-9a-f]{32})$/.exec(text);
  if (linkMatch) {
    const r = await supa.rpc('link_telegram_by_code', {
      p_code: linkMatch[1], p_telegram_id: m.from.id, p_username: m.from.username ?? null,
      p_first_name: m.from.first_name ?? null, p_chat_id: m.chat.id,
    });
    if (r.error) await say(m.chat.id, t(/linked_to_another/.test(r.error.message) ? 'link_taken' : 'link_bad', l), l);
    else await say(m.chat.id, t('linked', l, { name: String(r.data ?? '') }), l);
    return;
  }
  if (text.startsWith('/start')) {
    await say(m.chat.id, known.data ? t('back', l, { name: m.from.first_name ?? '' }) : t('welcome', l), l);
    return;
  }
  await say(m.chat.id, t('help', l), l);
};

const dispatch = async () => {
  const supa = db();
  const { data, error } = await supa.rpc('claim_telegram_batch', { p_limit: 200 });
  if (error) return { error: error.message };
  const rows = (data ?? []) as { notification_id: string; chat_id: number; title: string; body: string }[];
  let sent = 0, failed = 0;
  const blocked: number[] = [];
  for (const r of rows) { // sequential: stays far below Telegram's 30 messages/second
    const res = await say(r.chat_id, `<b>${escapeHtml(r.title)}</b>\n${escapeHtml(r.body)}`, 'ru');
    if (res.json.ok) sent++;
    else if (res.status === 403) blocked.push(r.chat_id);
    else failed++;
  }
  if (blocked.length) await supa.rpc('telegram_mark_blocked', { p_chat_ids: blocked });
  return { claimed: rows.length, sent, failed, blocked: blocked.length };
};

const setup = async (functionUrl: string) => {
  const me = await api('getMe', {});
  const username = (me.json.result as { username?: string } | undefined)?.username;
  if (!username) return { error: 'bad_bot_token' };
  const hook = await api('setWebhook', {
    url: functionUrl, secret_token: await webhookSecret(), allowed_updates: ['message', 'my_chat_member'], drop_pending_updates: true,
  });
  const commands = await api('setMyCommands', { commands: [{ command: 'start', description: 'Открыть клуб' }, { command: 'help', description: 'Помощь' }] });
  const menu = await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Клуб', web_app: { url: env('SHQ_SITE_URL') } } });
  const saved = await db().rpc('set_app_setting', { p_key: 'telegram_bot_username', p_value: username });
  return { username, webhook: hook.json.ok, commands: commands.json.ok, menu: menu.json.ok, saved: !saved.error };
};

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const url = new URL(req.url);
  try {
    if (url.searchParams.has('dispatch') || url.searchParams.has('setup')) {
      if (req.headers.get('x-shq-secret') !== env('SHQ_PUSH_CRON_SECRET')) return new Response('forbidden', { status: 403 });
      if (url.searchParams.has('setup')) {
        const functionUrl = `${env('SUPABASE_URL')}/functions/v1/telegram-bot`;
        return Response.json(await setup(functionUrl));
      }
      return Response.json(await dispatch());
    }
    if (req.headers.get('x-telegram-bot-api-secret-token') !== await webhookSecret()) return new Response('forbidden', { status: 403 });
    await handleUpdate(await req.json());
    return new Response('ok'); // always 200 to Telegram so it does not retry forever
  } catch (e) {
    console.error('telegram-bot', (e as Error).message);
    return new Response('ok');
  }
});
