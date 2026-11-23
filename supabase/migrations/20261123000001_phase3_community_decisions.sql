-- Shanyraq Hub — Phase 3 owner decisions (2026-11-23): C-5, C-13, C-14, C-15, C-21.
--
-- C-5  New event published → members are notified (respects user_preferences.notify_new_events).
-- C-13 Event cancelled / restored / moved (time or place) → registered members are notified;
--      when the start moves, unsent reminders are re-planned for the new time.
-- C-14 A wrong check-in can be undone: public.undo_check_in (moderator+, reason required): the visit is removed,
--      its XP/coins are taken back (coins never below zero), the member is told, the action is audited;
--      a later check-in rewards again. Achievements already opened stay (an admin can revoke them by hand).
-- C-15 Manual check-in by an organizer closes 24 h after the event ends (moderator+ keep correcting any time).
-- C-21 Who registered and who came is no longer readable by every member: only the member themselves,
--      the event's organizer and moderator+. Counts stay public through get_event_counts / get_member_stats.
-- Additive: no data is changed or deleted.

-- ---------------------------------------------------------------------
-- C-21: registrations and attendance — own rows, the event's organizer, moderator+
-- ---------------------------------------------------------------------
drop policy registrations_read on public.event_registrations;
create policy registrations_read on public.event_registrations for select to authenticated
  using (user_id = (select auth.uid())
         or private.has_role('moderator')
         or exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid())));

drop policy attendance_read on public.event_attendance;
create policy attendance_read on public.event_attendance for select to authenticated
  using (user_id = (select auth.uid())
         or private.has_role('moderator')
         or exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid())));

-- Public per-member numbers (no events, no dates): visits for the members list and profiles.
create function public.get_member_stats()
returns table (user_id uuid, attended int)
language sql stable security definer set search_path = '' as $$
  select p.id, (select count(*)::int from public.event_attendance a where a.user_id = p.id)
    from public.profiles p
   where private.has_role('member')
$$;
revoke all on function public.get_member_stats() from public, anon;
grant execute on function public.get_member_stats() to authenticated;

-- ---------------------------------------------------------------------
-- C-5 / C-13: event notifications
-- ---------------------------------------------------------------------
insert into private.notification_i18n (pattern, kz, en) values
  ('Новая встреча в клубе', 'Клубта жаңа кездесу', 'New club meetup'),
  ('Встреча отменена', 'Кездесу тоқтатылды', 'Meetup cancelled'),
  ('Встреча снова в расписании', 'Кездесу қайта кестеде', 'Meetup is back on'),
  ('Встреча изменена', 'Кездесу өзгертілді', 'Meetup changed'),
  ('Отметка о посещении снята', 'Қатысу белгісі алынды', 'Check-in removed'),
  ('«(.*)»\. Причина: (.*)', '«\1». Себебі: \2', '“\1”. Reason: \2')
on conflict (pattern) do nothing;

create function private.event_when(ev public.events) returns text
language sql immutable set search_path = '' as $$
  select format('«%s» — %s (Алматы)', ev.title, to_char(ev.starts_at at time zone 'Asia/Almaty', 'DD.MM HH24:MI'))
$$;

create function private.on_event_published() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- Only a newly published future event (insert, or draft → published); restoring a cancelled one is C-13.
  if new.status <> 'published' or new.starts_at <= now() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is distinct from 'draft' then
    return new;
  end if;
  for r in
    select p.id from public.profiles p
      left join public.user_preferences up on up.user_id = p.id
     where p.id is distinct from new.created_by
       and coalesce(up.notify_new_events, true)
  loop
    perform private.notify(r.id, 'new_event', 'Новая встреча в клубе', private.event_when(new), 'events',
      jsonb_build_object('event_id', new.id), 'new_event:' || new.id);
  end loop;
  return new;
end $$;

create function private.on_event_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  v_moved boolean := new.starts_at is distinct from old.starts_at;
  v_place boolean := new.format is distinct from old.format
                     or new.location_address is distinct from old.location_address
                     or new.online_url is distinct from old.online_url;
  r record;
begin
  if old.status = 'published' and new.status = 'cancelled' then
    v_title := 'Встреча отменена';
  elsif old.status = 'cancelled' and new.status = 'published' then
    v_title := 'Встреча снова в расписании';
  elsif new.status = 'published' and (v_moved or v_place) then
    v_title := 'Встреча изменена';
  end if;

  -- Reminders follow the new start (and a restored event gets them back); a cancelled event sends none
  -- (dispatch_due_reminders already skips it).
  if new.status = 'published' and (v_moved or old.status = 'cancelled') then
    delete from public.scheduled_notifications
     where event_id = new.id and sent_at is null;
    insert into public.scheduled_notifications (user_id, event_id, kind, send_at)
    select g.user_id, new.id, k.kind, k.send_at
      from public.event_registrations g
     cross join (values ('event_24h', new.starts_at - interval '24 hours'),
                        ('event_2h',  new.starts_at - interval '2 hours')) as k(kind, send_at)
     where g.event_id = new.id and g.status = 'registered' and k.send_at > now()
    on conflict (user_id, event_id, kind) do update
      set send_at = excluded.send_at, sent_at = null, attempts = 0, last_error = null;
  end if;

  if v_title is not null then
    for r in
      select g.user_id from public.event_registrations g
       where g.event_id = new.id and g.status = 'registered' and g.user_id is distinct from auth.uid()
    loop
      perform private.notify(r.user_id, 'system', v_title, private.event_when(new), 'events',
        jsonb_build_object('event_id', new.id),
        -- one notice per change: the kind of change + the moment (to the microsecond)
        'event_change:' || new.id || ':' || md5(v_title) || ':' || floor(extract(epoch from clock_timestamp()) * 1000000)::bigint);
    end loop;
  end if;
  return new;
end $$;

create trigger events_new_notify after insert or update of status on public.events
  for each row execute function private.on_event_published();
create trigger events_change_notify after update on public.events
  for each row execute function private.on_event_changed();

-- ---------------------------------------------------------------------
-- C-14: undo a wrong check-in; re-check-in rewards again
-- ---------------------------------------------------------------------
-- The n-th check-in of the same member at the same event (after n undos) uses its own reward key.
create or replace function private.record_attendance(p_event uuid, p_user uuid, p_method public.checkin_method)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  ev public.events;
  v_coins int;
  v_undos int;
  v_key text;
begin
  select * into ev from public.events where id = p_event;

  insert into public.event_attendance (event_id, user_id, checked_in_by, method)
  values (p_event, p_user, auth.uid(), p_method)
  on conflict do nothing;
  if not found then
    return false;                   -- already checked in: no second reward
  end if;

  select count(*) into v_undos from public.reward_ledger
   where idempotency_key like 'attendance-undo:' || p_event || ':' || p_user || ':%';
  v_key := 'attendance:' || p_event || ':' || p_user || case when v_undos > 0 then ':r' || v_undos else '' end;

  v_coins := round(ev.attendance_coins * private.coin_multiplier(p_user));
  perform private.grant_reward(p_user, ev.attendance_xp, v_coins, 'event_attendance', p_event::text,
    format('Подтверждение визита на «%s»', ev.title), v_key);
  perform private.notify(p_user, 'coin_reward', 'Визит подтверждён',
    format('+%s XP и +%s коинов за «%s»', ev.attendance_xp, v_coins, ev.title), 'attendance',
    jsonb_build_object('event_id', p_event), 'attendance:' || p_event || case when v_undos > 0 then ':r' || v_undos else '' end);
  perform private.evaluate_achievements(p_user);
  if ev.created_by is not null and ev.created_by <> p_user then
    perform private.evaluate_achievements(ev.created_by);   -- host achievements
  end if;
  return true;
end $$;

create function public.undo_check_in(p_event uuid, p_user uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  staff uuid := private.require_role('moderator');
  ev public.events;
  v_undos int;
  v_key text;
  v_xp int := 0;
  v_coins int := 0;
  v_balance int;
begin
  if p_user = staff and not private.has_role('superadmin') then raise exception 'cannot_check_in_yourself' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into ev from public.events where id = p_event;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;

  delete from public.event_attendance where event_id = p_event and user_id = p_user;
  if not found then
    return false;                   -- nothing to undo
  end if;

  -- Take back what this visit gave (the latest attendance reward of this member at this event).
  select count(*) into v_undos from public.reward_ledger
   where idempotency_key like 'attendance-undo:' || p_event || ':' || p_user || ':%';
  v_key := 'attendance:' || p_event || ':' || p_user || case when v_undos > 0 then ':r' || v_undos else '' end;
  select xp_delta, coin_delta into v_xp, v_coins from public.reward_ledger where idempotency_key = v_key;
  select coins into v_balance from public.user_balances where user_id = p_user;
  perform private.grant_reward(p_user, -coalesce(v_xp, 0), -least(coalesce(v_coins, 0), greatest(coalesce(v_balance, 0), 0)),
    'event_attendance', p_event::text, format('Отметка снята: «%s». Причина: %s', ev.title, trim(p_reason)),
    'attendance-undo:' || p_event || ':' || p_user || ':' || (v_undos + 1));
  if coalesce(v_xp, 0) = 0 and coalesce(v_coins, 0) = 0 then
    -- No reward to take back (e.g. it was 0): still mark the undo so a new check-in gets a new key.
    insert into public.reward_ledger (user_id, xp_delta, coin_delta, source, source_id, reason, idempotency_key, created_by)
    values (p_user, 0, 0, 'event_attendance', p_event::text, format('Отметка снята: «%s»', ev.title),
            'attendance-undo:' || p_event || ':' || p_user || ':' || (v_undos + 1), staff)
    on conflict (idempotency_key) do nothing;
  end if;

  perform private.notify(p_user, 'system', 'Отметка о посещении снята',
    format('«%s». Причина: %s', ev.title, trim(p_reason)), 'attendance',
    jsonb_build_object('event_id', p_event), 'attendance-undo:' || p_event || ':' || (v_undos + 1));
  perform private.audit('CHECKIN_UNDO', 'event', p_event::text,
    jsonb_build_object('user_id', p_user, 'reason', trim(p_reason), 'xp', coalesce(v_xp, 0), 'coins', coalesce(v_coins, 0)));
  return true;
end $$;
revoke all on function public.undo_check_in(uuid, uuid, text) from public, anon;
grant execute on function public.undo_check_in(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- C-15: an organizer's manual check-in closes 24 h after the event ends
-- ---------------------------------------------------------------------
create or replace function public.manual_check_in(p_event uuid, p_user uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  staff uuid := private.require_role('organizer');
  ev public.events;
  v_new boolean;
begin
  if p_user = staff and not private.has_role('superadmin') then raise exception 'cannot_check_in_yourself' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into ev from public.events where id = p_event;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if not private.has_role('moderator') and ev.created_by is distinct from staff then
    raise exception 'forbidden: not an organizer of this event' using errcode = '42501';
  end if;
  if now() < ev.starts_at - interval '2 hours' then raise exception 'checkin_window_closed'; end if;
  if not private.has_role('moderator')
     and now() > ev.starts_at + make_interval(mins => ev.duration_minutes) + interval '24 hours' then
    raise exception 'checkin_window_closed';
  end if;
  if ev.status = 'cancelled' then raise exception 'event_not_available' using errcode = 'P0002'; end if;

  v_new := private.record_attendance(p_event, p_user, 'manual');
  perform private.audit('MANUAL_CHECKIN', 'event', p_event::text,
    jsonb_build_object('user_id', p_user, 'reason', p_reason, 'newly_checked_in', v_new));
  return v_new;
end $$;
