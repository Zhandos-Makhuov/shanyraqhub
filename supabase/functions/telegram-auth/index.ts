// Supabase Edge Function "telegram-auth": sign in with Telegram from the Mini App.
//
// POST { initData } (the string Telegram gives the Mini App). The signature is verified with the bot
// token; then the linked member is found (or a new member is created for this Telegram user) and a normal
// Supabase session is returned. Nothing else is trusted from the browser.
//
// Secrets: TELEGRAM_BOT_TOKEN (owner adds it in the dashboard; never in the repository or chat).
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyInitData } from './init-data.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
};
const reply = (status: number, body: unknown) => Response.json(body, { status, headers: cors });

const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
};

/** Members created by Telegram sign-in get an internal address on a reserved domain: never mailed. */
const telegramEmail = (id: number) => `tg-${id}@telegram.invalid`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  try {
    const { initData } = await req.json().catch(() => ({ initData: '' }));
    if (typeof initData !== 'string' || initData.length > 4096) return reply(400, { error: 'init_data_invalid' });

    let tg;
    try {
      tg = await verifyInitData(initData, env('TELEGRAM_BOT_TOKEN'));
    } catch (e) {
      return reply(401, { error: (e as Error).message });
    }

    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const found = await admin.rpc('telegram_member', { p_telegram_id: tg.id });
    if (found.error) return reply(500, { error: 'lookup_failed' });

    let userId = found.data as string | null;
    let email: string;
    if (userId) {
      const u = await admin.auth.admin.getUserById(userId);
      if (u.error || !u.data.user?.email) return reply(500, { error: 'user_lookup_failed' });
      email = u.data.user.email;
    } else {
      // New member from Telegram: same start as every visitor (member, bronze, 0 XP) — created by the DB trigger.
      email = telegramEmail(tg.id);
      const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ').trim() || tg.username || 'Участник';
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { display_name: name.slice(0, 80), handle: tg.username ?? '', signup_via: 'telegram' },
      });
      if (created.error || !created.data.user) return reply(500, { error: 'create_failed' });
      userId = created.data.user.id;
    }

    const attached = await admin.rpc('attach_telegram', {
      p_user: userId, p_telegram_id: tg.id, p_username: tg.username ?? null,
      p_first_name: tg.first_name ?? null, p_chat_id: tg.allows_write_to_pm ? tg.id : null,
    });
    if (attached.error) return reply(409, { error: attached.error.message.includes('linked_to_another') ? 'telegram_linked_to_another_account' : 'attach_failed' });

    // Mint a normal session: a one-time magic-link token (no e-mail is sent) exchanged right here.
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error || !link.data.properties?.hashed_token) return reply(500, { error: 'session_failed' });
    // A separate client, so the admin client never carries the member's session.
    const exchange = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const verified = await exchange.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
    if (verified.error || !verified.data.session) return reply(500, { error: 'session_failed' });

    return reply(200, {
      access_token: verified.data.session.access_token,
      refresh_token: verified.data.session.refresh_token,
      new_member: !found.data,
    });
  } catch {
    return reply(500, { error: 'internal' });
  }
});
