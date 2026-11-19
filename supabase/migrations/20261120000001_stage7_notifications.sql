-- Shanyraq Hub — Stage 7: notifications (additive only).
--
-- 1. Realtime: new in-app notifications, chat messages and forum replies are published to
--    Supabase Realtime, so open pages update without a reload. RLS still decides who receives
--    which row (a member never receives another member's notifications or a moderators' room).
-- 2. Event reminders: rows queued in scheduled_notifications by register_for_event (24 h and 2 h
--    before the start) are turned into in-app notifications by private.dispatch_due_reminders(),
--    run every 5 minutes by pg_cron. Respects user_preferences.notify_event_reminders, cancelled
--    registrations and cancelled / already started events. Idempotent (dedupe key per event+kind).
--
-- Guards keep this file runnable on a plain local PostgreSQL (tests): the Realtime publication and
-- pg_cron exist only on Supabase.

-- ---------------------------------------------------------------------
-- 1. Realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['notifications', 'chat_messages', 'forum_replies'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Event reminders
-- ---------------------------------------------------------------------
create function private.dispatch_due_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_sent int := 0;
  v_skip text;
begin
  for r in
    select s.id, s.user_id, s.kind, s.event_id, e.title, e.starts_at, e.status,
           coalesce(p.notify_event_reminders, true) as wants,
           exists (select 1 from public.event_registrations g
                    where g.event_id = s.event_id and g.user_id = s.user_id and g.status = 'registered') as registered
      from public.scheduled_notifications s
      join public.events e on e.id = s.event_id
      left join public.user_preferences p on p.user_id = s.user_id
     where s.sent_at is null and s.send_at <= now()
     order by s.send_at
     limit 500
     for update of s skip locked
  loop
    v_skip := case
      when not r.registered then 'skipped: not registered'
      when r.status <> 'published' then 'skipped: event ' || r.status
      when r.starts_at <= now() then 'skipped: event already started'
      when not r.wants then 'skipped: reminders disabled by the member'
    end;
    if v_skip is null then
      perform private.notify(
        r.user_id, 'event_reminder',
        case r.kind when 'event_24h' then 'Напоминание: встреча завтра' else 'Напоминание: встреча через 2 часа' end,
        format('«%s» — %s (Алматы)', r.title, to_char(r.starts_at at time zone 'Asia/Almaty', 'DD.MM HH24:MI')),
        'events', jsonb_build_object('event_id', r.event_id, 'kind', r.kind),
        'reminder:' || r.kind || ':' || r.event_id);
      v_sent := v_sent + 1;
    end if;
    update public.scheduled_notifications
       set sent_at = now(), attempts = attempts + 1, last_error = v_skip
     where id = r.id;
  end loop;
  return v_sent;
end $$;

revoke all on function private.dispatch_due_reminders() from public, anon, authenticated;

-- Every 5 minutes on Supabase (pg_cron). cron.schedule with the same name updates the job.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('shq-event-reminders', '*/5 * * * *', 'select private.dispatch_due_reminders()');
  end if;
end $$;
