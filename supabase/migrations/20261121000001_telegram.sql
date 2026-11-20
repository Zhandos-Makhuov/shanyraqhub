-- Shanyraq Hub — Telegram bot & Mini App (additive only). Owner decision 2026-11-20:
-- v1 = Mini App ("Открыть клуб" opens the site inside Telegram) + sign-in with Telegram
-- (no e-mail needed) + linking an existing account + club notifications as bot messages.
--
-- Trust model: only the Edge Functions (service role, holding TELEGRAM_BOT_TOKEN) may link a
-- Telegram account or read the delivery queue; they verify Telegram's signatures first.
-- Members can only create a one-time link code for themselves, see and remove their own link.

-- ---------------------------------------------------------------------
-- Linked Telegram accounts (one per member, one member per Telegram user)
-- ---------------------------------------------------------------------
create table public.telegram_accounts (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  telegram_id    bigint not null unique,
  username       text check (char_length(username) <= 64),
  first_name     text check (char_length(first_name) <= 128),
  chat_id        bigint,                 -- private chat with the bot; null until the bot may write
  bot_blocked_at timestamptz,            -- the member blocked the bot (sending returned 403)
  linked_at      timestamptz not null default now()
);
alter table public.telegram_accounts enable row level security;
grant select (user_id, username, first_name, chat_id, bot_blocked_at, linked_at) on public.telegram_accounts to authenticated;
create policy telegram_accounts_own on public.telegram_accounts for select to authenticated
  using (user_id = (select auth.uid()));

-- Public app settings written by the bot setup (e.g. the bot's @username for deep links).
create table public.app_settings (
  key        text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  value      text not null check (char_length(value) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
grant select on public.app_settings to authenticated;
create policy app_settings_read on public.app_settings for select to authenticated using (true);

-- One-time link codes (only their hash is stored), 10 minutes, single use.
create table private.telegram_link_codes (
  code_hash  bytea primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz
);

-- Notifications are also delivered as bot messages.
alter table public.notifications add column telegram_sent_at timestamptz;
update public.notifications set telegram_sent_at = created_at where telegram_sent_at is null;
create index notifications_telegram_pending_idx on public.notifications (created_at) where telegram_sent_at is null;

-- ---------------------------------------------------------------------
-- Member-facing RPCs
-- ---------------------------------------------------------------------
-- Code for https://t.me/<bot>?start=link_<code>
create function public.create_telegram_link_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  v_code text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  delete from private.telegram_link_codes where user_id = uid and used_at is null;
  insert into private.telegram_link_codes (code_hash, user_id, expires_at)
  values (extensions.digest(v_code, 'sha256'), uid, now() + interval '10 minutes');
  return v_code;
end $$;

create function public.unlink_telegram() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('member');
begin
  delete from public.telegram_accounts where user_id = uid;
  if not found then return false; end if;
  update public.profiles set telegram_notifications_enabled = false where id = uid;
  perform private.audit('TELEGRAM_UNLINK', 'user', uid::text, '{}'::jsonb);
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Service-role RPCs (Edge Functions only, after verifying Telegram's signature)
-- ---------------------------------------------------------------------
-- Link by code (bot /start link_<code>). Returns the member's display name.
create function public.link_telegram_by_code(p_code text, p_telegram_id bigint, p_username text,
                                             p_first_name text, p_chat_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare
  c private.telegram_link_codes;
  v_owner uuid;
begin
  select * into c from private.telegram_link_codes
   where code_hash = extensions.digest(coalesce(p_code, ''), 'sha256') for update;
  if not found then raise exception 'link_code_invalid'; end if;
  if c.used_at is not null then raise exception 'link_code_used'; end if;
  if c.expires_at < now() then raise exception 'link_code_expired'; end if;

  select user_id into v_owner from public.telegram_accounts where telegram_id = p_telegram_id;
  if v_owner is not null and v_owner <> c.user_id then raise exception 'telegram_linked_to_another_account'; end if;

  update private.telegram_link_codes set used_at = now() where code_hash = c.code_hash;
  insert into public.telegram_accounts (user_id, telegram_id, username, first_name, chat_id)
  values (c.user_id, p_telegram_id, p_username, p_first_name, p_chat_id)
  on conflict (user_id) do update
    set telegram_id = excluded.telegram_id, username = excluded.username, first_name = excluded.first_name,
        chat_id = excluded.chat_id, bot_blocked_at = null, linked_at = now();
  update public.profiles set telegram_notifications_enabled = true where id = c.user_id;
  perform private.audit('TELEGRAM_LINK', 'user', c.user_id::text, jsonb_build_object('telegram_id', p_telegram_id));
  return (select display_name from public.profiles where id = c.user_id);
end $$;

-- Mini App sign-in: the member linked to this Telegram user (null = not linked yet).
create function public.telegram_member(p_telegram_id bigint) returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.telegram_accounts where telegram_id = p_telegram_id
$$;

-- Attach Telegram to a member created by sign-in with Telegram (or refresh name/chat on each sign-in).
create function public.attach_telegram(p_user uuid, p_telegram_id bigint, p_username text,
                                       p_first_name text, p_chat_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.telegram_accounts where telegram_id = p_telegram_id and user_id <> p_user) then
    raise exception 'telegram_linked_to_another_account';
  end if;
  insert into public.telegram_accounts (user_id, telegram_id, username, first_name, chat_id)
  values (p_user, p_telegram_id, p_username, p_first_name, p_chat_id)
  on conflict (user_id) do update
    set username = excluded.username, first_name = excluded.first_name,
        chat_id = coalesce(excluded.chat_id, public.telegram_accounts.chat_id),
        bot_blocked_at = case when excluded.chat_id is not null then null else public.telegram_accounts.bot_blocked_at end;
end $$;

-- The member wrote to the bot (/start): the bot may now message them.
create function public.telegram_chat_started(p_telegram_id bigint, p_chat_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.telegram_accounts set chat_id = p_chat_id, bot_blocked_at = null where telegram_id = p_telegram_id;
  return found;
end $$;

create function public.set_app_setting(p_key text, p_value text) returns void
language sql security definer set search_path = '' as $$
  insert into public.app_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;

-- Delivery queue: same rules as Web Push (telegram switched on, linked chat, type allowed,
-- not during quiet hours in Almaty, fresh ≤ 1 h); each notification is claimed once.
create function public.claim_telegram_batch(p_limit int default 200)
returns table (notification_id uuid, chat_id bigint, title text, body text, link_tab text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with batch as (
    select n.id from public.notifications n
     where n.telegram_sent_at is null
     order by n.created_at
     limit greatest(1, least(p_limit, 1000))
     for update skip locked
  ),
  claimed as (
    update public.notifications n set telegram_sent_at = now()
      from batch where n.id = batch.id
    returning n.id, n.user_id, n.type, n.title, n.body, n.link_tab, n.created_at
  )
  select c.id, t.chat_id, c.title, c.body, c.link_tab
    from claimed c
    join public.profiles p on p.id = c.user_id and p.telegram_notifications_enabled
    join public.telegram_accounts t on t.user_id = c.user_id and t.chat_id is not null and t.bot_blocked_at is null
    left join public.user_preferences up on up.user_id = c.user_id
   where c.created_at > now() - interval '1 hour'
     and case c.type
           when 'event_reminder' then coalesce(up.notify_event_reminders, true)
           when 'new_event'      then coalesce(up.notify_new_events, true)
           when 'registration'   then coalesce(up.notify_new_events, true)
           when 'forum_reply'    then coalesce(up.notify_forum_replies, true)
           when 'achievement'    then coalesce(up.notify_achievements, true)
           when 'level_up'       then coalesce(up.notify_achievements, true)
           when 'broadcast'      then coalesce(up.notify_broadcasts, true)
           else true
         end
     and not (
       up.quiet_hours_start is not null and (
         case when up.quiet_hours_start <= up.quiet_hours_end
              then (now() at time zone 'Asia/Almaty')::time >= up.quiet_hours_start
                   and (now() at time zone 'Asia/Almaty')::time < up.quiet_hours_end
              else (now() at time zone 'Asia/Almaty')::time >= up.quiet_hours_start
                   or (now() at time zone 'Asia/Almaty')::time < up.quiet_hours_end
         end));
end $$;

-- The bot reports chats where Telegram answered 403 (the member blocked the bot).
create function public.telegram_mark_blocked(p_chat_ids bigint[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  update public.telegram_accounts set bot_blocked_at = now() where chat_id = any (coalesce(p_chat_ids, '{}'));
  get diagnostics v = row_count;
  return v;
end $$;

create function private.telegram_pending() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.notifications n
      join public.telegram_accounts t on t.user_id = n.user_id and t.chat_id is not null and t.bot_blocked_at is null
     where n.telegram_sent_at is null and n.created_at > now() - interval '1 hour')
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke all on function public.create_telegram_link_code(), public.unlink_telegram(),
  public.link_telegram_by_code(text, bigint, text, text, bigint), public.telegram_member(bigint),
  public.attach_telegram(uuid, bigint, text, text, bigint), public.telegram_chat_started(bigint, bigint),
  public.set_app_setting(text, text), public.claim_telegram_batch(int), public.telegram_mark_blocked(bigint[]),
  private.telegram_pending()
  from public, anon, authenticated;
grant execute on function public.create_telegram_link_code(), public.unlink_telegram() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.link_telegram_by_code(text, bigint, text, text, bigint), public.telegram_member(bigint),
      public.attach_telegram(uuid, bigint, text, text, bigint), public.telegram_chat_started(bigint, bigint),
      public.set_app_setting(text, text), public.claim_telegram_batch(int), public.telegram_mark_blocked(bigint[])
      to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Supabase only: every minute, call the bot function to deliver pending notifications
-- (URL in Vault "shq_telegram_function_url", shared secret = "shq_push_cron_secret").
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net;
    execute $f$
      create function private.trigger_telegram_dispatch() returns bigint
      language plpgsql security definer set search_path = '' as $b$
      declare v_url text; v_secret text;
      begin
        if not private.telegram_pending() then
          update public.notifications set telegram_sent_at = now()
           where telegram_sent_at is null and created_at <= now() - interval '1 hour';
          return null;
        end if;
        select decrypted_secret into v_url from vault.decrypted_secrets where name = 'shq_telegram_function_url';
        select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'shq_push_cron_secret';
        if v_url is null or v_secret is null then return null; end if;
        return net.http_post(url := v_url || '?dispatch=1',
                             headers := jsonb_build_object('Content-Type', 'application/json', 'x-shq-secret', v_secret),
                             body := '{}'::jsonb, timeout_milliseconds := 30000);
      end $b$;
    $f$;
    execute 'revoke all on function private.trigger_telegram_dispatch() from public, anon, authenticated';
    perform cron.schedule('shq-telegram-dispatch', '* * * * *', 'select private.trigger_telegram_dispatch()');
  end if;
end $$;
