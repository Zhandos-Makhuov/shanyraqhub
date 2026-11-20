-- Shanyraq Hub — a member who signed up with Telegram has no e-mail or password: Telegram is their only
-- way in, so it cannot be unlinked (they would be locked out of their account).
create or replace function public.unlink_telegram() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('member');
begin
  if exists (select 1 from auth.users where id = uid and email like '%@telegram.invalid') then
    raise exception 'telegram_only_sign_in';
  end if;
  delete from public.telegram_accounts where user_id = uid;
  if not found then return false; end if;
  update public.profiles set telegram_notifications_enabled = false where id = uid;
  perform private.audit('TELEGRAM_UNLINK', 'user', uid::text, '{}'::jsonb);
  return true;
end $$;
