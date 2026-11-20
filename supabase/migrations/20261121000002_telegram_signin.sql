-- Shanyraq Hub — Telegram sign-in details (additive only).
-- 1. A member created by "sign in with Telegram" gets Telegram notifications switched on when the bot
--    may write to them (they came from Telegram; they can switch it off in the notifications menu).
-- 2. The bot's public @username is readable before sign-in (sign-in screen: "Войти через Telegram").

create or replace function public.attach_telegram(p_user uuid, p_telegram_id bigint, p_username text,
                                                  p_first_name text, p_chat_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_new boolean;
begin
  if exists (select 1 from public.telegram_accounts where telegram_id = p_telegram_id and user_id <> p_user) then
    raise exception 'telegram_linked_to_another_account';
  end if;
  v_new := not exists (select 1 from public.telegram_accounts where user_id = p_user);
  insert into public.telegram_accounts (user_id, telegram_id, username, first_name, chat_id)
  values (p_user, p_telegram_id, p_username, p_first_name, p_chat_id)
  on conflict (user_id) do update
    set username = excluded.username, first_name = excluded.first_name,
        chat_id = coalesce(excluded.chat_id, public.telegram_accounts.chat_id),
        bot_blocked_at = case when excluded.chat_id is not null then null else public.telegram_accounts.bot_blocked_at end;
  if v_new and p_chat_id is not null then
    update public.profiles set telegram_notifications_enabled = true where id = p_user;
  end if;
end $$;

revoke all on function public.attach_telegram(uuid, bigint, text, text, bigint) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.attach_telegram(uuid, bigint, text, text, bigint) to service_role;
  end if;
end $$;

-- Only public settings live in app_settings (e.g. telegram_bot_username).
grant select on public.app_settings to anon;
create policy app_settings_read_anon on public.app_settings for select to anon using (true);
