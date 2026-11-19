-- Shanyraq Hub — Stage 7b: Web Push (additive only).
--
-- Flow: every in-app notification (public.notifications) is also offered as a push message.
--   pg_cron (every minute) -> private.trigger_push_dispatch() -> pg_net POST to the Edge Function
--   "send-push" (shared secret from Vault) -> public.claim_push_batch() decides WHAT goes to WHOM
--   (rules below, testable in SQL) -> the function encrypts and sends with the VAPID key
--   (Edge Function secret, never in the repository) and removes dead subscriptions.
--
-- Push rules (claim_push_batch):
--   * the member switched push on (profiles.push_notifications_enabled) and has a subscription;
--   * the notification type is allowed by user_preferences (reminders / new events / forum replies /
--     achievements and level-ups / broadcasts); other types are always allowed;
--   * not during the member's quiet hours (Asia/Almaty); such a push is skipped (in-app stays);
--   * only fresh notifications (last hour); each notification is claimed once (push_sent_at).
--
-- Guards keep this file runnable on a plain local PostgreSQL (tests): pg_net, Vault and pg_cron
-- exist only on Supabase.

alter table public.notifications add column push_sent_at timestamptz;
-- Notifications created before push existed are never pushed.
update public.notifications set push_sent_at = created_at where push_sent_at is null;
create index notifications_push_pending_idx on public.notifications (created_at) where push_sent_at is null;

-- Members may register their own browser for push (RLS already limits rows to their own).
grant select, insert, delete on public.push_subscriptions to authenticated;

create function public.claim_push_batch(p_limit int default 200)
returns table (notification_id uuid, user_id uuid, title text, body text, link_tab text,
               endpoint text, p256dh text, auth_key text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with batch as (
    select n.id from public.notifications n
     where n.push_sent_at is null
     order by n.created_at
     limit greatest(1, least(p_limit, 1000))
     for update skip locked
  ),
  claimed as (
    update public.notifications n set push_sent_at = now()
      from batch where n.id = batch.id
    returning n.id, n.user_id, n.type, n.title, n.body, n.link_tab, n.created_at
  )
  select c.id, c.user_id, c.title, c.body, c.link_tab, s.endpoint, s.p256dh, s.auth_key
    from claimed c
    join public.profiles p on p.id = c.user_id and p.push_notifications_enabled
    join public.push_subscriptions s on s.user_id = c.user_id
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

-- Only the Edge Function (service role) may claim; members and visitors never can.
revoke all on function public.claim_push_batch(int) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_push_batch(int) to service_role;
  end if;
end $$;

-- Is anything waiting to be pushed? (keeps the per-minute job from calling the function for nothing)
create function private.push_pending() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.notifications n
      join public.push_subscriptions s on s.user_id = n.user_id
     where n.push_sent_at is null and n.created_at > now() - interval '1 hour')
$$;
revoke all on function private.push_pending() from public, anon, authenticated;

-- Supabase only: call the Edge Function with the shared secret kept in Vault
-- (secrets "shq_push_function_url" and "shq_push_cron_secret" are created outside the repository).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net;
    execute $f$
      create function private.trigger_push_dispatch() returns bigint
      language plpgsql security definer set search_path = '' as $b$
      declare v_url text; v_secret text;
      begin
        if not private.push_pending() then
          -- Nothing to push: still mark stale/unsubscribed rows so the queue stays small.
          update public.notifications set push_sent_at = now()
           where push_sent_at is null and created_at <= now() - interval '1 hour';
          return null;
        end if;
        select decrypted_secret into v_url from vault.decrypted_secrets where name = 'shq_push_function_url';
        select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'shq_push_cron_secret';
        if v_url is null or v_secret is null then return null; end if;
        return net.http_post(url := v_url,
                             headers := jsonb_build_object('Content-Type', 'application/json', 'x-shq-secret', v_secret),
                             body := '{}'::jsonb, timeout_milliseconds := 30000);
      end $b$;
    $f$;
    execute 'revoke all on function private.trigger_push_dispatch() from public, anon, authenticated';
    perform cron.schedule('shq-push-dispatch', '* * * * *', 'select private.trigger_push_dispatch()');
  end if;
end $$;
